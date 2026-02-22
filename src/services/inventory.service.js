/**
 * @module Service/Inventory
 *
 * Gère les niveaux de stock, les alertes de réapprovisionnement
 * et le nettoyage des réservations expirées.
 */
import { inventoryRepo, productsRepo, ordersRepo } from '../repositories/index.js';
import { AppError, ValidationError, BusinessError } from '../utils/appError.js';
import { cacheService } from './cache.service.js';
import { logError } from '../utils/logger.js';
import { pgPool } from '../config/database.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ORDER_STATUS } from '../constants/enums.js';

class InventoryService {
    /**
     * Fenêtre d'expiration des commandes PENDING non payées.
     *
     * Doit être supérieure au délai d'expiration d'une session Stripe (~30 min)
     * pour éviter d'annuler une commande dont le paiement est encore en cours.
     * Le cron inventory-cleanup s'exécute toutes les 15 minutes.
     */
    #ORDER_EXPIRATION_MINUTES = 30;

    /** Seuil centralisé ici pour qu'un seul changement impacte alertes et dashboard. */
    #LOW_STOCK_THRESHOLD = 5;

    #CACHE_PREFIX = 'stock:variant:';
    #CACHE_TTL = 3600;

    constructor() {
        if (InventoryService.instance) return InventoryService.instance;
        InventoryService.instance = this;
        Object.freeze(this);
    }

    // ─────────────────────────────────────────────────────────────────────
    // HELPERS PRIVÉS
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Invalide le cache Redis d'une variante et du produit parent associé.
     * Fire-and-forget : ne bloque jamais le flux principal.
     */
    async #invalidateCache(variantId) {
        try {
            await cacheService.delete(`${this.#CACHE_PREFIX}${variantId}`);

            const variant = await productsRepo.findVariantById(variantId);
            if (variant?.productId) {
                const product = await productsRepo.findById(variant.productId);
                if (product) {
                    await cacheService.deleteMany([
                        `product:details:${product.id}`,
                        `product:details:${product.slug}`,
                        'catalog:list:*',
                    ]);
                }
            }
        } catch (error) {
            logError(error, { context: 'InventoryService.invalidateCache', variantId });
        }
    }

    /**
     * Annule une commande et libère atomiquement tout son stock réservé.
     * Toutes les mutations s'exécutent dans une seule transaction pour garantir
     * la cohérence en cas d'erreur partielle (ROLLBACK automatique).
     * L'invalidation de cache se fait hors transaction (fire-and-forget).
     *
     * @param {string} orderId - UUID de la commande à annuler
     */
    async #cancelOrderAndReleaseStock(orderId) {
        const client = await pgPool.connect();

        try {
            await client.query('BEGIN');

            const items = await ordersRepo.listItems(orderId, client);

            for (const item of items) {
                await inventoryRepo.release(item.variantId, item.quantity, client);
            }

            await client.query(
                `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
                [ORDER_STATUS.CANCELLED, orderId]
            );

            await client.query('COMMIT');

            // Invalidation hors transaction pour ne pas bloquer la DB.
            for (const item of items) {
                this.#invalidateCache(item.variantId).catch(() => { });
            }

        } catch (error) {
            await client.query('ROLLBACK');
            logError(error, { context: 'InventoryService.cancelOrderAndReleaseStock', orderId });
            throw error;
        } finally {
            client.release();
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // MÉTHODES PUBLIQUES
    // ─────────────────────────────────────────────────────────────────────

    async getAllInventory(params) {
        const { items, total } = await inventoryRepo.findAll(params);
        return {
            items,
            pagination: {
                page: parseInt(params.page, 10) || 1,
                limit: parseInt(params.limit, 10) || 15,
                total,
                totalPages: Math.ceil(total / (params.limit || 15)),
            },
        };
    }

    async getStockLevel(variantId) {
        const cacheKey = `${this.#CACHE_PREFIX}${variantId}`;

        try {
            const cached = await cacheService.get(cacheKey);
            if (cached) return cached;
        } catch (error) {
            // Si Redis est indisponible, on continue vers la DB — résilience prioritaire.
            logError(error, { context: 'InventoryService.getStockLevel', variantId });
        }

        const inventory = await inventoryRepo.findByVariantId(variantId);
        if (!inventory) throw new AppError('Inventaire introuvable', HTTP_STATUS.NOT_FOUND);

        const result = {
            ...inventory,
            isLowStock: inventory.availableStock <= this.#LOW_STOCK_THRESHOLD,
        };

        cacheService.set(cacheKey, result, this.#CACHE_TTL).catch(() => { });
        return result;
    }

    async adjustStock(variantId, quantity, reason = 'ADJUSTMENT') {
        const currentStock = await inventoryRepo.findByVariantId(variantId);
        if (!currentStock) throw new AppError('Variante introuvable', HTTP_STATUS.NOT_FOUND);

        const newTotal = currentStock.availableStock + quantity;
        if (newTotal < 0) throw new BusinessError('Le stock total ne peut pas être négatif');

        const result = await inventoryRepo.upsert({
            variantId,
            availableStock: newTotal,
            reservedStock: currentStock.reservedStock,
        });

        await this.#invalidateCache(variantId);
        return result;
    }

    /**
     * Enrichit les données d'inventaire avec les détails de la variante
     * pour que le dashboard affiche le SKU et le nom du produit directement.
     */
    async getLowStockAlerts() {
        const items = await inventoryRepo.findLowStock(this.#LOW_STOCK_THRESHOLD);

        return await Promise.all(
            items.map(async (item) => {
                const variant = await productsRepo.findVariantById(item.variantId);
                return {
                    ...item,
                    sku: variant?.sku,
                    productName: variant?.name || 'Inconnu',
                };
            })
        );
    }

    async reserveStock(variantId, quantity, client = null) {
        // Vérification en DB (source de vérité) avant toute mutation de stock.
        const inventory = await inventoryRepo.findByVariantId(variantId);
        if (!inventory || inventory.availableStock < quantity) {
            throw new BusinessError('Stock insuffisant');
        }

        const result = await inventoryRepo.reserve(variantId, quantity, client);
        await this.#invalidateCache(variantId);
        return result;
    }

    /**
     * Libère le stock réservé par des commandes PENDING expirées.
     *
     * Appelé par le cron inventory-cleanup (toutes les 15 minutes).
     * Cherche les commandes PENDING de plus de #ORDER_EXPIRATION_MINUTES (30 min).
     * Promise.allSettled garantit que l'échec sur une commande n'empêche pas
     * le traitement des autres.
     *
     * @returns {{ processed: number }} Nombre de commandes annulées avec succès
     */
    async cleanupExpiredReservations() {
        const expiredOrders = await ordersRepo.findExpiredPendingOrders(
            this.#ORDER_EXPIRATION_MINUTES
        );

        if (!expiredOrders?.length) return { processed: 0 };

        const results = await Promise.allSettled(
            expiredOrders.map((order) => this.#cancelOrderAndReleaseStock(order.id))
        );

        const failed = results.filter((r) => r.status === 'rejected');
        if (failed.length > 0) {
            failed.forEach(({ reason }) =>
                logError(reason, { context: 'InventoryService.cleanupExpiredReservations' })
            );
        }

        return { processed: expiredOrders.length - failed.length };
    }

    async restockVariant(variantId, quantity) {
        if (quantity <= 0) {
            throw new ValidationError('La quantité à ajouter doit être supérieure à 0');
        }

        const updatedStock = await inventoryRepo.addStock(variantId, quantity);
        if (!updatedStock) {
            throw new AppError("Variante introuvable dans l'inventaire", HTTP_STATUS.NOT_FOUND);
        }

        await this.#invalidateCache(variantId);
        return updatedStock;
    }
}

export const inventoryService = new InventoryService();