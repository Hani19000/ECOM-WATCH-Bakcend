/**
 * @module Service/Order
 */
import { ordersRepo, inventoryRepo, cartsRepo, shipmentsRepo } from '../repositories/index.js';
import { productsRepo } from '../repositories/index.js';
import { shippingService } from './shipping.service.js';
import { taxService } from './tax.service.js';
import { notificationService } from './notifications/notification.service.js';
import { cacheService } from './cache.service.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { pgPool } from '../config/database.js';
import { logInfo, logError } from '../utils/logger.js';
import crypto from 'crypto';

class OrderService {
    constructor() {
        if (OrderService.instance) return OrderService.instance;
        OrderService.instance = this;
        Object.freeze(this);
    }

    // ─────────────────────────────────────────────────────────────────────
    // HELPERS PRIVÉS
    // ─────────────────────────────────────────────────────────────────────

    #calculateTotals(itemsWithRealPrices, shippingCountry, shippingMethod, taxCategory) {
        const subtotal = itemsWithRealPrices.reduce(
            (sum, item) => sum + Number(item.price) * item.quantity,
            0
        );
        const totalWeight = itemsWithRealPrices.reduce(
            (sum, item) => sum + Number(item.weight || 0.5) * item.quantity,
            0
        );
        const shippingCost = shippingService.calculateShippingCost(
            shippingCountry, totalWeight, shippingMethod, subtotal
        );
        const taxableAmount = subtotal + shippingCost.cost;
        const taxCalculation = taxService.calculateTax(taxableAmount, shippingCountry, taxCategory);

        return {
            subtotal: Math.round(subtotal * 100) / 100,
            shipping: {
                cost: shippingCost.cost,
                method: shippingMethod,
                isFree: shippingCost.isFree,
                estimatedDays: shippingCost.estimatedDays,
            },
            tax: {
                amount: taxCalculation.taxAmount,
                rate: taxCalculation.taxRate,
                category: taxCategory,
            },
            totalAmount: Math.round((taxableAmount + taxCalculation.taxAmount) * 100) / 100,
        };
    }

    async #artificialDelay() {
        const delayMs = 200 + Math.random() * 300;
        return new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    async #timingSafeEmailCompare(storedEmail, providedEmail) {
        try {
            const storedBuffer = Buffer.from(storedEmail, 'utf8');
            const providedBuffer = Buffer.from(providedEmail, 'utf8');
            const maxLength = Math.max(storedBuffer.length, providedBuffer.length);
            const paddedStored = Buffer.alloc(maxLength);
            const paddedProvided = Buffer.alloc(maxLength);
            storedBuffer.copy(paddedStored);
            providedBuffer.copy(paddedProvided);
            return crypto.timingSafeEqual(paddedStored, paddedProvided);
        } catch {
            return false;
        }
    }

    async #resolveEffectivePrice(variantId, basePrice, client) {
        const promotionData = await productsRepo.findActivePromotionPrice(variantId, client);

        if (!promotionData || !promotionData.hasPromotion) {
            return basePrice;
        }

        return promotionData.effectivePrice;
    }

    /**
     * Invalide le cache Redis d'un produit à partir d'un variantId.
     * Fire-and-forget : ne bloque jamais le flux principal.
     *
     * FIX : Appelé après chaque réservation/libération de stock pour que la prochaine
     * requête produit retourne le stock réel depuis la DB et non le cache périmé.
     */
    async #invalidateVariantCache(variantId) {
        try {
            await cacheService.delete(`stock:variant:${variantId}`);

            const variant = await productsRepo.findVariantById(variantId);
            if (variant?.productId) {
                const product = await productsRepo.findById(variant.productId);
                if (product) {
                    await cacheService.deleteMany([
                        `product:details:${product.id}`,
                        `product:details:${product.slug}`,
                    ]);
                }
            }
        } catch (error) {
            // Silencieux : l'invalidation de cache ne doit jamais bloquer la commande
            logError(error, { context: 'OrderService invalidateVariantCache', variantId });
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // CRÉATION & PRÉVISUALISATION
    // ─────────────────────────────────────────────────────────────────────

    async createOrderFromCart(userId = null, checkoutData) {
        const {
            items,
            shippingAddress,
            shippingMethod = 'STANDARD',
            shippingCountry = 'France',
            taxCategory = 'standard',
        } = checkoutData;

        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new AppError('Le panier est vide', HTTP_STATUS.BAD_REQUEST);
        }

        const client = await pgPool.connect();
        try {
            await client.query('BEGIN');

            const itemsWithRealPrices = [];

            for (const item of items) {
                const inventoryEntry = await inventoryRepo.reserve(item.variantId, item.quantity, client);

                const effectivePrice = await this.#resolveEffectivePrice(
                    item.variantId,
                    inventoryEntry.price,
                    client
                );

                itemsWithRealPrices.push({
                    ...item,
                    price: effectivePrice,
                    basePrice: inventoryEntry.price,
                    weight: inventoryEntry.weight || 0.5,
                });
            }

            const totals = this.#calculateTotals(
                itemsWithRealPrices, shippingCountry, shippingMethod, taxCategory
            );

            const order = await ordersRepo.createOrder(client, {
                userId: userId || null,
                subtotalAmount: totals.subtotal,
                shippingCost: totals.shipping.cost,
                shippingMethod: totals.shipping.method,
                taxAmount: totals.tax.amount,
                taxRate: totals.tax.rate,
                totalAmount: totals.totalAmount,
                shippingAddress,
                status: 'PENDING',
            });

            for (const item of itemsWithRealPrices) {
                await ordersRepo.addItem(client, {
                    orderId: order.id,
                    variantId: item.variantId,
                    productName: item.productName,
                    variantAttributes: item.variantAttributes,
                    unitPrice: item.price,
                    quantity: item.quantity,
                });
            }

            await client.query('COMMIT');

            // FIX : Invalider le cache produit après réservation de stock.
            // Le available_stock vient d'être décrémenté en DB — le cache Redis
            // doit l'être aussi pour que la prochaine lecture soit cohérente.
            for (const item of itemsWithRealPrices) {
                this.#invalidateVariantCache(item.variantId).catch(() => { });
            }

            return { ...order, pricing: totals };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async previewOrderTotal(userId = null, checkoutData) {
        const {
            items,
            shippingMethod = 'STANDARD',
            shippingCountry = 'France',
            taxCategory = 'standard',
        } = checkoutData;

        let cartItems = items;
        if (userId && !items) {
            const cart = await cartsRepo.findByUserId(userId);
            if (!cart) throw new AppError('Panier introuvable', HTTP_STATUS.NOT_FOUND);
            cartItems = await cartsRepo.listItems(cart.id);
        }
        if (!cartItems || cartItems.length === 0) {
            throw new AppError('Le panier est vide', HTTP_STATUS.BAD_REQUEST);
        }

        const itemsWithRealPrices = await Promise.all(
            cartItems.map(async (item) => {
                const variant = await inventoryRepo.findByVariantId(item.variantId);
                if (!variant) throw new AppError('Produit introuvable', HTTP_STATUS.NOT_FOUND);

                const effectivePrice = await this.#resolveEffectivePrice(
                    item.variantId,
                    variant.price,
                    pgPool
                );

                return { ...item, price: effectivePrice, weight: variant.weight || 0.5 };
            })
        );

        return {
            ...this.#calculateTotals(itemsWithRealPrices, shippingCountry, shippingMethod, taxCategory),
            currency: 'EUR',
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // LECTURE — MODE AUTHENTIFIÉ
    // ─────────────────────────────────────────────────────────────────────

    async getUserOrders(userId) {
        const orders = await ordersRepo.listByUserId(userId);
        return await Promise.all(
            orders.map(async (order) => ({
                ...order,
                items: await ordersRepo.listItems(order.id),
            }))
        );
    }

    async getOrderDetails(orderId, user) {
        const order = await ordersRepo.findById(orderId);
        if (!order) throw new AppError('Commande introuvable', HTTP_STATUS.NOT_FOUND);

        const isAdmin = user.roles?.some((r) => r.toUpperCase() === 'ADMIN');
        if (order.userId !== user.id && !isAdmin) {
            throw new AppError('Accès non autorisé', HTTP_STATUS.FORBIDDEN);
        }

        const items = await ordersRepo.listItems(orderId);
        return { ...order, items };
    }

    async getOrderHistory(userId, options = {}) {
        const { page = 1, limit = 10, status = null } = options;
        const allOrders = await ordersRepo.listByUserId(userId);
        const filtered = status ? allOrders.filter((o) => o.status === status) : allOrders;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const paginated = filtered.slice(offset, offset + parseInt(limit));

        return {
            orders: await Promise.all(
                paginated.map(async (order) => ({
                    ...order,
                    items: await ordersRepo.listItems(order.id),
                }))
            ),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: filtered.length,
                totalPages: Math.ceil(filtered.length / parseInt(limit)),
            },
        };
    }


    /**
 * Annule une commande PENDING et délègue la libération du stock au PaymentService.
 *
 * Sécurité :
 * - Mode authentifié : vérifie que la commande appartient bien à l'utilisateur.
 * - Mode guest : vérifie l'email de la commande comme second facteur.
 * - Seules les commandes PENDING peuvent être annulées ici (PAID est protégé).
 *
 * @param {string} orderId      - UUID de la commande
 * @param {Object|null} user    - Utilisateur connecté (null si guest)
 * @param {string|null} email   - Email de vérification (requis si guest)
 */
    async cancelPendingOrder(orderId, user = null, email = null) {
        const order = await ordersRepo.findById(orderId);

        if (!order) {
            throw new AppError('Commande introuvable', HTTP_STATUS.NOT_FOUND);
        }

        // Une commande déjà payée ou annulée ne peut pas être annulée à nouveau
        if (order.status === 'PAID') {
            throw new AppError('Impossible d\'annuler une commande déjà payée', HTTP_STATUS.BAD_REQUEST);
        }

        if (order.status === 'CANCELLED') {
            // Idempotence : on retourne sans erreur si déjà annulée
            return { message: 'Commande déjà annulée' };
        }

        // Vérification de propriété selon le mode (authentifié vs guest)
        await this._assertOrderAccess(order, user, email);

        // Délégation à PaymentService pour la logique stock + statut (SRP)
        await paymentService._cancelOrderAndReleaseStock(orderId, 'user_cancel');

        return { message: 'Commande annulée avec succès' };
    }

    /**
     * Vérifie que l'appelant est bien autorisé à accéder à la commande.
     * Centralise la logique d'autorisation guest/authentifié pour la réutiliser.
     *
     * @param {Object} order        - Commande récupérée en base
     * @param {Object|null} user    - Utilisateur connecté
     * @param {string|null} email   - Email fourni par un guest
     * @throws {AppError}           - 403 si l'accès est non autorisé
     */
    async _assertOrderAccess(order, user, email) {
        if (user) {
            if (order.userId && order.userId !== user.id) {
                throw new AppError('Cette commande ne vous appartient pas', HTTP_STATUS.FORBIDDEN);
            }
            return;
        }

        // Vérification email pour les guests (timing-safe via normalisation)
        const orderEmail = order.shippingAddress?.email?.trim().toLowerCase();
        const providedEmail = email?.trim().toLowerCase();

        if (!providedEmail || !orderEmail || providedEmail !== orderEmail) {
            throw new AppError('Email requis ou incorrect pour accéder à cette commande', HTTP_STATUS.FORBIDDEN);
        }
    }


    // ─────────────────────────────────────────────────────────────────────
    // LECTURE — MODE GUEST (suivi public)
    // ─────────────────────────────────────────────────────────────────────

    async getOrderDetailsGuest(orderId, email) {
        if (!email || typeof email !== 'string' || email.trim() === '') {
            throw new AppError(
                'Email requis pour accéder aux détails de la commande',
                HTTP_STATUS.BAD_REQUEST
            );
        }

        const order = await ordersRepo.findGuestOnlyById(orderId);
        if (!order) {
            await this.#artificialDelay();
            throw new AppError('Commande introuvable', HTTP_STATUS.NOT_FOUND);
        }

        const storedEmail = order.shippingAddress?.email?.trim().toLowerCase();
        const isEmailMatch = await this.#timingSafeEmailCompare(
            storedEmail,
            email.trim().toLowerCase()
        );

        if (!isEmailMatch) {
            await this.#artificialDelay();
            throw new AppError('Commande introuvable', HTTP_STATUS.NOT_FOUND);
        }

        return order;
    }

    async trackOrderGuest(orderNumber, email) {
        const order = await ordersRepo.findByOrderNumberAndEmail(
            orderNumber.trim().toUpperCase(),
            email.trim().toLowerCase()
        );
        if (!order) {
            await this.#artificialDelay();
            throw new AppError('Commande introuvable', HTTP_STATUS.NOT_FOUND);
        }
        return order;
    }

    // ─────────────────────────────────────────────────────────────────────
    // CLAIM & ADMIN
    // ─────────────────────────────────────────────────────────────────────

    async claimGuestOrder(orderId, newUserId, verificationEmail) {
        try {
            return await ordersRepo.transferOwnership(orderId, newUserId, verificationEmail);
        } catch {
            throw new AppError('Impossible de rattacher cette commande', HTTP_STATUS.BAD_REQUEST);
        }
    }

    async autoClaimGuestOrders(newUserId, email) {
        try {
            const guestOrders = await ordersRepo.findGuestOrdersByEmail(email);
            if (!guestOrders || guestOrders.length === 0) {
                return { claimed: 0, orders: [], claimedOrderNumbers: [] };
            }

            const claimedOrders = [];
            const claimedOrderNumbers = [];

            for (const order of guestOrders) {
                try {
                    const claimed = await ordersRepo.transferOwnership(order.id, newUserId, email);
                    claimedOrders.push(claimed);
                    claimedOrderNumbers.push(order.orderNumber || order.order_number);
                } catch (e) {
                    logError(e);
                }
            }

            return {
                claimed: claimedOrders.length,
                orders: claimedOrders,
                claimedOrderNumbers,
            };
        } catch (error) {
            return { claimed: 0, error: error.message };
        }
    }

    async updateOrderStatus(orderId, newStatus) {
        const order = await ordersRepo.findById(orderId);
        if (!order) throw new AppError('Commande introuvable', HTTP_STATUS.NOT_FOUND);

        const previousStatus = order.status;

        if (order.status === 'SHIPPED' && newStatus === 'CANCELLED') {
            throw new AppError(
                "Impossible d'annuler une commande déjà expédiée",
                HTTP_STATUS.BAD_REQUEST
            );
        }

        const updatedOrder = await ordersRepo.updateStatus(orderId, newStatus);
        let shipmentData = null;

        if (newStatus === 'SHIPPED') {
            const shipment = await shipmentsRepo.create({ orderId });
            shipmentData = shipment;
        }

        if (newStatus === 'CANCELLED') {
            const items = await ordersRepo.listItems(orderId);
            for (const item of items) {
                await inventoryRepo.release(item.variantId, item.quantity);
                // FIX : Invalider le cache après libération du stock (annulation)
                this.#invalidateVariantCache(item.variantId).catch(() => { });
            }
        }

        this.#sendOrderStatusNotification(previousStatus, newStatus, updatedOrder.userId, updatedOrder, { shipment: shipmentData });
        return updatedOrder;
    }

    async listAllOrders(params) {
        return await ordersRepo.findAll(params);
    }

    #sendOrderStatusNotification(previousStatus, newStatus, userId, order, metadata) {
        try {
            notificationService
                .notifyOrderStatusChange(previousStatus, newStatus, userId, order, metadata)
                .catch((e) => logError(e));
        } catch (e) {
            logError(e);
        }
    }
}

export const orderService = new OrderService();