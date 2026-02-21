/**
 * @module Service/Promotion
 *
 * Gère la création, la mise à jour et le calcul des promotions produit.
 */
import { promotionsRepo } from '../repositories/promotions.repo.js';
import { productsRepo } from '../repositories/products.repo.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { pgPool } from '../config/database.js';
import { cacheService } from './cache.service.js';
import { logInfo, logError } from '../utils/logger.js';

class PromotionService {
    constructor() {
        if (PromotionService.instance) return PromotionService.instance;
        PromotionService.instance = this;
        Object.freeze(this);
    }

    // ─── HELPERS PRIVÉS ────────────────────────────────────────────────────────

    /**
     * Construit les clés de cache d'un produit (par id ET par slug).
     * Doit correspondre exactement au schéma utilisé dans ProductService.
     */
    async #buildProductCacheKeys(productId) {
        const product = await productsRepo.findById(productId);
        if (!product) return [];

        return [
            `product:details:${product.id}`,
            `product:details:${product.slug}`,
        ];
    }

    /**
     * Invalide le cache de tous les produits affectés par un changement de promotion.
     * Purge à la fois les entrées individuelles (details) et le catalogue global (list).
     *
     * @param {string[]} productIds - UUIDs des produits dont le cache doit être purgé.
     */
    async #invalidateProductsCache(productIds) {
        if (!productIds?.length) return;

        try {
            // Résolution des clés individuelles (id + slug) pour chaque produit
            const perProductKeys = await Promise.all(
                productIds.map((id) => this.#buildProductCacheKeys(id))
            );

            // Aplatissement + ajout du wildcard catalogue → deleteMany gère les patterns glob
            const allKeys = [
                ...perProductKeys.flat(),
                'catalog:list:*',
            ];

            await cacheService.deleteMany(allKeys);
            logInfo(`Cache invalidé pour les produits : ${productIds.join(', ')}`);
        } catch (error) {
            logError('Erreur invalidation cache promotion', error);
        }
    }

    #validateDates(startDate, endDate) {
        if (new Date(endDate) <= new Date(startDate)) {
            throw new AppError(
                'La date de fin doit être après la date de début',
                HTTP_STATUS.BAD_REQUEST
            );
        }
    }

    #validatePercentage(discountType, discountValue) {
        if (discountType === 'PERCENTAGE' && discountValue > 100) {
            throw new AppError(
                'Le pourcentage ne peut pas dépasser 100%',
                HTTP_STATUS.BAD_REQUEST
            );
        }
    }

    // ─── MÉTHODES PUBLIQUES ────────────────────────────────────────────────────

    async createPromotion(promotionData, linkedItems = {}) {
        const { productIds = [], variantIds = [] } = linkedItems;

        this.#validateDates(promotionData.startDate, promotionData.endDate);
        this.#validatePercentage(promotionData.discountType, promotionData.discountValue);

        const client = await pgPool.connect();
        try {
            await client.query('BEGIN');

            const promotion = await promotionsRepo.create(promotionData, client);

            if (productIds.length > 0) {
                await Promise.all(
                    productIds.map((productId) =>
                        promotionsRepo.addToProduct(promotion.id, productId, client)
                    )
                );
            }

            if (variantIds.length > 0) {
                await Promise.all(
                    variantIds.map((variantId) =>
                        promotionsRepo.addToVariant(promotion.id, variantId, client)
                    )
                );
            }

            await client.query('COMMIT');

            await this.#invalidateProductsCache(productIds);

            return { ...promotion, linkedProducts: productIds, linkedVariants: variantIds };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async listPromotions(filters) {
        return promotionsRepo.list(filters);
    }

    async getPromotionDetails(id) {
        const promotion = await promotionsRepo.findById(id);
        if (!promotion) throw new AppError('Promotion introuvable', HTTP_STATUS.NOT_FOUND);

        const [linkedProducts, linkedVariants] = await Promise.all([
            promotionsRepo.getLinkedProducts(id),
            promotionsRepo.getLinkedVariants(id),
        ]);

        return { ...promotion, linkedProducts, linkedVariants };
    }

    async updatePromotion(id, updateData, linkedItems) {
        const existingPromo = await promotionsRepo.findById(id);
        if (!existingPromo) throw new AppError('Promotion introuvable', HTTP_STATUS.NOT_FOUND);

        if (updateData.startDate && updateData.endDate) {
            this.#validateDates(updateData.startDate, updateData.endDate);
        }

        const client = await pgPool.connect();
        let allAffectedProductIds = [];

        try {
            await client.query('BEGIN');

            const promotion = await promotionsRepo.update(id, updateData, client);

            if (linkedItems) {
                const { productIds, variantIds } = linkedItems;

                if (productIds) {
                    const currentProducts = await promotionsRepo.getLinkedProducts(id, client);

                    allAffectedProductIds = [
                        ...new Set([...currentProducts.map((p) => p.id), ...productIds]),
                    ];

                    await Promise.all(
                        currentProducts.map((p) => promotionsRepo.removeFromProduct(id, p.id, client))
                    );
                    await Promise.all(
                        productIds.map((productId) =>
                            promotionsRepo.addToProduct(id, productId, client)
                        )
                    );
                }

                if (variantIds) {
                    const currentVariants = await promotionsRepo.getLinkedVariants(id, client);
                    await Promise.all(
                        currentVariants.map((v) => promotionsRepo.removeFromVariant(id, v.id, client))
                    );
                    await Promise.all(
                        variantIds.map((variantId) =>
                            promotionsRepo.addToVariant(id, variantId, client)
                        )
                    );
                }
            } else {
                const currentProducts = await promotionsRepo.getLinkedProducts(id, client);
                allAffectedProductIds = currentProducts.map((p) => p.id);
            }

            await client.query('COMMIT');

            await this.#invalidateProductsCache(allAffectedProductIds);

            return promotion;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async deletePromotion(id) {
        const promotion = await promotionsRepo.findById(id);
        if (!promotion) throw new AppError('Promotion introuvable', HTTP_STATUS.NOT_FOUND);

        const linkedProducts = await promotionsRepo.getLinkedProducts(id);
        const result = await promotionsRepo.delete(id);

        await this.#invalidateProductsCache(linkedProducts.map((p) => p.id));

        return result;
    }

    calculateDiscountedPrice(originalPrice, promotion) {
        if (!promotion) return originalPrice;

        const price =
            promotion.discountType === 'PERCENTAGE'
                ? originalPrice * (1 - promotion.discountValue / 100)
                : Math.max(0, originalPrice - promotion.discountValue);

        return Math.round(price * 100) / 100;
    }

    async togglePromotionStatus(id) {
        const promotion = await promotionsRepo.findById(id);
        if (!promotion) throw new AppError('Promotion introuvable', HTTP_STATUS.NOT_FOUND);

        const currentStatus = (promotion.status ?? '').toUpperCase();
        const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

        const result = await promotionsRepo.update(id, { status: newStatus });

        const linkedProducts = await promotionsRepo.getLinkedProducts(id);
        await this.#invalidateProductsCache(linkedProducts.map((p) => p.id));

        return result;
    }
}

export const promotionService = new PromotionService();