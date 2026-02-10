/**
 * @module Service/Inventory
 *
 * Gère les niveaux de stock, les alertes de réapprovisionnement
 * et le nettoyage des réservations expirées.
 */
import { inventoryRepo, productsRepo, ordersRepo } from '../repositories/index.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class InventoryService {
    // Seuil centralisé ici pour qu'un seul changement impacte alertes et dashboard.
    #LOW_STOCK_THRESHOLD = 5;

    constructor() {
        if (InventoryService.instance) return InventoryService.instance;
        InventoryService.instance = this;
        Object.freeze(this);
    }

    async getStockLevel(variantId) {
        const inventory = await inventoryRepo.findByVariantId(variantId);
        if (!inventory) throw new AppError('Inventaire introuvable', HTTP_STATUS.NOT_FOUND);

        return {
            ...inventory,
            isLowStock: inventory.availableStock <= this.#LOW_STOCK_THRESHOLD,
        };
    }

    async adjustStock(variantId, quantity, reason = 'ADJUSTMENT') {
        const variant = await productsRepo.findVariantById(variantId);
        if (!variant) throw new AppError('Variante introuvable', HTTP_STATUS.NOT_FOUND);

        const currentStock = await inventoryRepo.findByVariantId(variantId);
        const newTotal = (currentStock?.availableStock || 0) + quantity;

        if (newTotal < 0) throw new AppError('Stock insuffisant', HTTP_STATUS.BAD_REQUEST);

        return await inventoryRepo.upsert({ variantId, availableStock: newTotal });
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
        const inventory = await inventoryRepo.findByVariantId(variantId);
        if (!inventory || inventory.availableStock < quantity) {
            throw new AppError('Stock insuffisant', HTTP_STATUS.CONFLICT);
        }

        return await inventoryRepo.reserve(variantId, quantity, client);
    }

    /**
     * Libère le stock réservé par des commandes PENDING trop anciennes.
     * Promise.allSettled garantit que l'échec sur une commande n'empêche pas
     * le traitement des autres (une DB lente ne bloque pas tout le cron).
     */
    async cleanupExpiredReservations() {
        const EXPIRATION_HOURS = 24;
        const expiredOrders = await ordersRepo.findExpiredPendingOrders(EXPIRATION_HOURS);

        if (!expiredOrders?.length) return;

        await Promise.allSettled(
            expiredOrders.map(async (order) => {
                const items = order.items?.filter((item) => item !== null) || [];

                for (const item of items) {
                    await inventoryRepo.release(item.variantId, item.quantity);
                }

                await ordersRepo.setStatus(order.id, 'CANCELLED');
            })
        );
    }

    async restockVariant(variantId, quantity) {
        if (quantity <= 0) {
            throw new AppError('La quantité à ajouter doit être supérieure à 0', HTTP_STATUS.BAD_REQUEST);
        }

        const updatedStock = await inventoryRepo.addStock(variantId, quantity);
        if (!updatedStock) throw new AppError("Variante introuvable dans l'inventaire", HTTP_STATUS.NOT_FOUND);

        return updatedStock;
    }
}

export const inventoryService = new InventoryService();