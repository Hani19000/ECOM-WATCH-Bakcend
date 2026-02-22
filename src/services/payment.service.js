/**
 * @module Service/Payment
 *
 * Gère la création des sessions de paiement Stripe et le traitement des webhooks.
 * Supporte le paiement en mode guest (sans compte) et authentifié.
 *
 * Responsabilités :
 * - Création de sessions Stripe Checkout
 * - Traitement des webhooks (paiement réussi, session expirée, échec)
 * - Vérification du statut de paiement
 *
 * Hors-scope (délégué à OrderService) :
 * - Annulation de commande et libération de stock
 */
import { ordersRepo, inventoryRepo, paymentsRepo, usersRepo } from '../repositories/index.js';
import { productsRepo } from '../repositories/index.js';
import { orderService } from './orders.service.js';
import { notificationService } from './notifications/notification.service.js';
import { AppError } from '../utils/appError.js';
import { cacheService } from './cache.service.js';
import { pgPool } from '../config/database.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import Stripe from 'stripe';
import { ENV } from '../config/environment.js';
import { logError, logInfo } from '../utils/logger.js';

class PaymentService {
    constructor() {
        if (PaymentService.instance) return PaymentService.instance;

        if (!ENV.stripe?.secretKey) {
            throw new Error('CRITICAL: STRIPE_SECRET_KEY manquant dans la configuration.');
        }

        this.stripe = new Stripe(ENV.stripe.secretKey);
        PaymentService.instance = this;
        Object.freeze(this);
    }

    /**
     * Crée une session Stripe Checkout avec le montant global de la commande.
     * Supporte les paiements guest et authentifiés.
     */
    async createSession(orderId, user = null) {
        const order = await ordersRepo.findById(orderId);

        if (!order) {
            throw new AppError('Commande introuvable', HTTP_STATUS.NOT_FOUND);
        }

        order.items = await ordersRepo.listItems(orderId);

        if (user && order.userId && order.userId !== user.id) {
            throw new AppError(
                'Vous ne pouvez pas payer une commande qui ne vous appartient pas',
                HTTP_STATUS.FORBIDDEN
            );
        }

        if (order.status === 'PAID') {
            throw new AppError('Cette commande a déjà été payée', HTTP_STATUS.BAD_REQUEST);
        }

        if (order.status === 'CANCELLED') {
            throw new AppError('Cette commande a été annulée', HTTP_STATUS.BAD_REQUEST);
        }

        const sessionConfig = {
            payment_method_types: ['card'],
            mode: 'payment',
            metadata: {
                orderId: order.id.toString(),
                orderNumber: order.orderNumber?.toString() || order.id.toString(),
                isGuestCheckout: user ? 'false' : 'true',
            },
            success_url: `${ENV.clientUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${ENV.clientUrl}/checkout/cancel?orderId=${order.id}`,
            line_items: [
                {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: `Commande #${order.orderNumber || order.id}`,
                            description: `${order.items?.length || 0} article(s)`,
                        },
                        unit_amount: Math.round(order.totalAmount * 100),
                    },
                    quantity: 1,
                },
            ],
        };

        if (!user) {
            sessionConfig.customer_creation = 'always';
            sessionConfig.customer_email = order.shippingAddress?.email || null;
        } else {
            const userData = await usersRepo.findById(user.id);
            if (userData?.email) {
                sessionConfig.customer_email = userData.email;
            }
        }

        const session = await this.stripe.checkout.sessions.create(sessionConfig);

        await paymentsRepo.create({
            orderId: order.id,
            provider: 'STRIPE',
            paymentIntentId: session.id,
            status: 'PENDING',
            amount: order.totalAmount,
        });

        return session;
    }

    /**
     * Traite les événements Stripe de façon sécurisée via vérification de signature HMAC.
     */
    async processStripeWebhook(rawBody, signature) {
        let event;

        try {
            event = this.stripe.webhooks.constructEvent(
                rawBody,
                signature,
                ENV.stripe?.webhookSecret
            );
        } catch (err) {
            throw new AppError(
                `Webhook signature verification failed: ${err.message}`,
                HTTP_STATUS.BAD_REQUEST
            );
        }

        switch (event.type) {
            case 'checkout.session.completed':
                await this._handleCheckoutCompleted(event.data.object);
                break;

            case 'checkout.session.expired':
                await this._handleCheckoutExpired(event.data.object);
                break;

            case 'payment_intent.payment_failed':
                await this._handlePaymentFailed(event.data.object);
                break;

            default:
                break;
        }

        return { received: true };
    }

    /**
     * Gère la finalisation d'une session de paiement réussie.
     * Toutes les mutations (commande + stock) sont dans une seule transaction SQL
     * pour garantir la cohérence en cas d'erreur partielle.
     */
    async _handleCheckoutCompleted(session) {
        const orderId = session.metadata.orderId;
        if (!orderId) return;

        const client = await pgPool.connect();

        try {
            await client.query('BEGIN');

            await ordersRepo.updateStatus(
                orderId,
                'PAID',
                {
                    provider: 'STRIPE',
                    paymentIntentId: session.payment_intent,
                    amount: session.amount_total / 100,
                },
                client
            );

            const items = await ordersRepo.listItems(orderId, client);

            for (const item of items) {
                await inventoryRepo.confirmSale(item.variantId, item.quantity, client);
                cacheService.delete(`stock:variant:${item.variantId}`).catch(() => { });
            }

            await client.query('COMMIT');
            logInfo(`Paiement validé et stock confirmé pour commande : ${orderId}`);

            for (const item of items) {
                this._invalidateProductCache(item.variantId).catch(() => { });
            }

            // Notifications hors transaction pour ne pas bloquer la DB
            this._triggerPostPaymentNotifications(session, orderId).catch((err) =>
                logError(err, { context: 'notification post-paiement', orderId })
            );

        } catch (error) {
            await client.query('ROLLBACK');
            logError(error, { context: 'handleCheckoutCompleted', orderId });
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Libère le stock réservé lorsqu'une session Stripe expire sans paiement.
     *
     * Déclencheurs :
     * - Stripe expire automatiquement la session après ~30 minutes d'inactivité
     * - L'utilisateur ferme l'onglet sans payer
     *
     * @param {Object} session - Objet session Stripe (checkout.session.expired)
     */
    async _handleCheckoutExpired(session) {
        const orderId = session.metadata?.orderId;
        if (!orderId) return;

        const order = await ordersRepo.findById(orderId);

        // Idempotence : si la commande est déjà traitée, on ignore l'événement
        if (!order || order.status === 'PAID' || order.status === 'CANCELLED') {
            logInfo(
                `[Webhook] Session expirée ignorée — commande ${orderId} déjà en statut ${order?.status}`
            );
            return;
        }

        // Délégation à OrderService : responsable du cycle de vie de la commande
        await orderService.cancelOrderAndReleaseStock(orderId, 'checkout.session.expired');
    }

    /**
     * Invalide le cache Redis d'un produit à partir d'un variantId.
     * Récupère l'id et le slug du produit parent pour cibler les deux clés de cache.
     *
     * @param {string} variantId - UUID de la variante achetée
     */
    async _invalidateProductCache(variantId) {
        try {
            const variant = await productsRepo.findVariantById(variantId);
            if (variant?.productId) {
                const product = await productsRepo.findById(variant.productId);
                if (product) {
                    await cacheService.deleteMany([
                        `product:details:${product.id}`,
                        `product:details:${product.slug}`,
                    ]);
                    logInfo(`Cache produit invalidé après paiement : ${product.slug}`);
                }
            }
        } catch (error) {
            logError(error, { context: 'PaymentService invalidateProductCache', variantId });
        }
    }

    /**
     * Envoie un email de confirmation pour un paiement guest.
     */
    async _sendGuestOrderConfirmation(email, orderData) {
        try {
            const { emailService } = await import('./notifications/email.service.js');
            const service = emailService?.sendOrderConfirmation ? emailService : emailService.default;
            await service.sendOrderConfirmation(email, orderData);
            logInfo(`Email de confirmation envoyé - orderId: ${orderData.id}`);
        } catch (error) {
            logError(error, { action: 'sendGuestOrderConfirmation', orderId: orderData.id });
        }
    }

    /**
     * Gère l'échec d'un paiement.
     */
    async _handlePaymentFailed(paymentIntent) {
        const orderId = paymentIntent.metadata?.orderId;
        if (!orderId) return;
    }

    /**
     * Récupère le statut de paiement d'une commande.
     * L'email est requis en mode guest comme second facteur d'authentification.
     */
    async getPaymentStatus(orderId, user = null, guestEmail = null) {
        const order = await ordersRepo.findById(orderId);

        if (!order) {
            throw new AppError('Commande introuvable', HTTP_STATUS.NOT_FOUND);
        }

        if (user) {
            if (order.userId && order.userId !== user.id) {
                logError(new Error("Tentative d'accès non autorisé"), { orderId, userId: user.id });
                throw new AppError(
                    'Accès interdit : Cette commande ne vous appartient pas',
                    HTTP_STATUS.FORBIDDEN
                );
            }
            return order.status || 'PENDING';
        }

        const orderEmail = order.shippingAddress?.email;

        if (!guestEmail || guestEmail.trim() === '') {
            logError(new Error('Tentative accès guest sans email'), { orderId });
            throw new AppError(
                'Accès interdit : Email requis pour vérifier le statut',
                HTTP_STATUS.FORBIDDEN
            );
        }

        if (!orderEmail || orderEmail.trim() === '') {
            logError(new Error('Commande sans email dans shippingAddress'), { orderId });
            throw new AppError(
                'Erreur système : Email de commande introuvable',
                HTTP_STATUS.INTERNAL_SERVER_ERROR
            );
        }

        const normalizedGuestEmail = guestEmail.trim().toLowerCase();
        const normalizedOrderEmail = orderEmail.trim().toLowerCase();

        if (normalizedGuestEmail !== normalizedOrderEmail) {
            logError(new Error('Tentative accès guest avec email incorrect'), {
                orderId,
                attemptedEmailLength: guestEmail.length,
                orderEmailLength: orderEmail.length,
            });
            throw new AppError(
                'Accès interdit : Email ne correspond pas',
                HTTP_STATUS.FORBIDDEN
            );
        }

        logInfo(`Vérification statut guest autorisée - orderId: ${orderId}`);
        return order.status || 'PENDING';
    }

    async getPaymentHistory(orderId) {
        return await paymentsRepo.listByOrderId(orderId);
    }

    async _triggerPostPaymentNotifications(session, orderId) {
        const order = await ordersRepo.findById(orderId);
        const isGuestCheckout = session.metadata.isGuestCheckout === 'true';

        if (isGuestCheckout) {
            const customerEmail = session.customer_details?.email || session.customer_email;
            if (customerEmail) await this._sendGuestOrderConfirmation(customerEmail, order);
        } else if (order.userId) {
            const user = await usersRepo.findById(order.userId);

            if (user && user.email) {
                await notificationService.notifyOrderPaid(user.email, order);
            } else {
                logError(
                    new Error('Email introuvable pour la notification utilisateur'),
                    { orderId, userId: order.userId }
                );
            }
        }
    }
}

export const paymentService = new PaymentService();