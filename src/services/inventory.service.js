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
    // Seuil centralisé ici pour qu'un seul changement impacte alertes et dashboard.
    #LOW_STOCK_THRESHOLD = 5;
    #CACHE_PREFIX = 'stock:variant:';
    #CACHE_TTL = 3600;

    constructor() {
        if (InventoryService.instance) return InventoryService.instance;
        InventoryService.instance = this;
        Object.freeze(this);
    }

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
     * Libère le stock réservé par des commandes PENDING trop anciennes.
     * Promise.allSettled garantit que l'échec sur une commande n'empêche pas
     * le traitement des autres.
     */
    async cleanupExpiredReservations() {
        const EXPIRATION_MINUTES = 24 * 60;
        const expiredOrders = await ordersRepo.findExpiredPendingOrders(EXPIRATION_MINUTES);

        if (!expiredOrders?.length) return { processed: 0 };

        const client = await pgPool.connect();
        try {
            await client.query('BEGIN');
            for (const order of expiredOrders) {
                const items = await ordersRepo.listItems(order.id);
                for (const item of items) {
                    await inventoryRepo.release(item.variantId, item.quantity, client);
                    await this.#invalidateCache(item.variantId);
                }
                await client.query(
                    `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
                    [ORDER_STATUS.CANCELLED, order.id]
                );
            }
            await client.query('COMMIT');
            return { processed: expiredOrders.length };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
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