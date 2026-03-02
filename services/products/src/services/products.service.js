/**
 * @module Service/Product
 *
 * Gère le catalogue, les variantes et l'intégration avec l'inventaire.
 * Optimisé avec Redis pour les performances de lecture (cache-aside).
 */
import { productsRepo, inventoryRepo, categoriesRepo } from '../repositories/index.js';
import { AppError, ConflictError, BusinessError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { PRODUCT_STATUS } from '../constants/enums.js';
import { pgPool } from '../config/database.js';
import { cacheService } from './cache.service.js';
import { logInfo } from '../utils/logger.js';

class ProductService {
    constructor() {
        if (ProductService.instance) return ProductService.instance;
        ProductService.instance = this;
        Object.freeze(this);
    }

    // ─── UTILS : LOGIQUE DE CACHE ───────────────────────────────────────────────

    #getCacheKey(type, identifier) {
        return `product:${type}:${identifier}`;
    }

    async #invalidateProductCache(productId, slug) {
        const keys = [
            this.#getCacheKey('details', productId),
            this.#getCacheKey('details', slug),
            'catalog:list:*',
        ];
        await cacheService.deleteMany(keys);
        logInfo(`Cache nettoyé pour le produit : ${productId} / ${slug}`);
    }

    // ─── UTILS : VALIDATION & SÉCURITÉ ─────────────────────────────────────────

    async checkAvailability(slug, sku) {
        const [existingSlug, existingSku] = await Promise.all([
            productsRepo.findBySlug(slug),
            productsRepo.findVariantBySku(sku),
        ]);

        if (existingSlug) throw new ConflictError(`Le slug '${slug}' est déjà utilisé.`);
        if (existingSku) throw new ConflictError(`Le SKU '${sku}' est déjà utilisé.`);
    }

    #safeParseAttributes(attributesInput) {
        let attributes = {};
        try {
            if (typeof attributesInput === 'string') {
                attributes = JSON.parse(attributesInput);
            } else if (typeof attributesInput === 'object' && attributesInput !== null) {
                attributes = attributesInput;
            }
        } catch {
            throw new AppError('Format des attributs invalide (JSON requis)', HTTP_STATUS.BAD_REQUEST);
        }

        const allowedKeys = ['color', 'size', 'material', 'image'];
        const cleanAttributes = {};

        Object.keys(attributes).forEach((key) => {
            if (allowedKeys.includes(key)) {
                cleanAttributes[key] = String(attributes[key]).replace(/[<>]/g, '');
            }
        });

        return cleanAttributes;
    }

    // ─── UTILS : ENRICHISSEMENT ─────────────────────────────────────────────────

    /**
     * Résout le prix promotionnel le plus bas parmi toutes les variantes d'un produit.
     * Parcourt l'ensemble des variantes pour ne pas rater une promo sur une variante non-0.
     *
     * @param {object[]} variants      - Tableau de variantes avec leur champ `promotion`.
     * @param {number}   startingPrice - Prix de base du produit (fallback).
     * @returns {number} Prix affiché en vitrine (promoé ou original).
     */
    #resolveDisplayPrice(variants, startingPrice) {
        if (!Array.isArray(variants) || variants.length === 0) return startingPrice;

        const lowestDiscounted = variants.reduce((lowest, variant) => {
            const discounted = variant.promotion?.discountedPrice;
            if (discounted == null) return lowest;
            return lowest === null || discounted < lowest ? discounted : lowest;
        }, null);

        return lowestDiscounted ?? startingPrice;
    }

    // ─── MÉTHODES DE LECTURE (CACHE-ASIDE) ─────────────────────────────────────

    async getProductDetails(idOrSlug) {
        const cacheKey = this.#getCacheKey('details', idOrSlug);

        const cachedProduct = await cacheService.get(cacheKey);
        if (cachedProduct) return cachedProduct;

        const isUUID =
            /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
                idOrSlug
            );
        const product = await productsRepo.getFullDetails(idOrSlug, isUUID ? 'id' : 'slug');

        if (!product) throw new AppError('Produit introuvable', HTTP_STATUS.NOT_FOUND);

        const totalStock = product.variants.reduce(
            (acc, v) => acc + (v.inventory?.available_stock ?? 0),
            0
        );
        const enrichedProduct = { ...product, totalInventory: totalStock };

        await cacheService.set(cacheKey, enrichedProduct, 3600);
        return enrichedProduct;
    }

    async listCatalog(filters) {
        const cacheKey = `catalog:list:${Buffer.from(JSON.stringify(filters)).toString('base64')}`;

        const cachedList = await cacheService.get(cacheKey);
        if (cachedList) return cachedList;

        const queryFilters = { ...filters };

        if (!queryFilters.status) {
            queryFilters.status = PRODUCT_STATUS.ACTIVE;
        } else if (queryFilters.status === 'ALL') {
            delete queryFilters.status;
        }

        const { data, pagination } = await productsRepo.list(queryFilters);

        const enrichedData = data.map((product) => {
            const startingPrice = parseFloat(product.startingPrice);

            return {
                ...product,
                startingPrice,
                // Résolution correcte : parcourt TOUTES les variantes, pas seulement [0]
                discountedPrice: this.#resolveDisplayPrice(product.variants_preview, startingPrice),
            };
        });

        const result = { data: enrichedData, pagination };
        await cacheService.set(cacheKey, result, 900);
        return result;
    }

    // ─── MÉTHODES D'ÉCRITURE (MUTATIONS) ───────────────────────────────────────

    async createProductWithVariant(productData, variantData, imageUrl = null) {
        const { categoryIds, ...pureProductData } = productData;
        await this.checkAvailability(pureProductData.slug, variantData.sku);

        const client = await pgPool.connect();
        try {
            await client.query('BEGIN');

            const product = await productsRepo.create(pureProductData, client);

            if (categoryIds) {
                const ids = Array.isArray(categoryIds) ? categoryIds : [categoryIds];
                await Promise.all(
                    ids.map((catId) => categoriesRepo.addProductCategory(product.id, catId, client))
                );
            }

            const safeAttributes = this.#safeParseAttributes(variantData.attributes);
            const variant = await productsRepo.addVariant(
                {
                    ...variantData,
                    price: parseFloat(variantData.price),
                    productId: product.id,
                    attributes: { ...safeAttributes, size: variantData.size, image: imageUrl },
                },
                client
            );

            const stockQty = parseInt(variantData.initialStock, 10);
            await inventoryRepo.upsert(
                { variantId: variant.id, availableStock: isNaN(stockQty) ? 0 : stockQty },
                client
            );

            await client.query('COMMIT');
            await cacheService.deleteMany(['catalog:list:*']);
            return { ...product, categoryIds, variants: [variant] };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async updateProduct(id, updateData) {
        const existingProduct = await productsRepo.findById(id);
        if (!existingProduct) throw new AppError('Produit introuvable', HTTP_STATUS.NOT_FOUND);

        const client = await pgPool.connect();
        try {
            await client.query('BEGIN');
            if (updateData.categoryIds) {
                await categoriesRepo.removeAllFromProduct(id, client);
                const ids = Array.isArray(updateData.categoryIds)
                    ? updateData.categoryIds
                    : [updateData.categoryIds];
                await Promise.all(
                    ids.map((catId) => categoriesRepo.addProductCategory(id, catId, client))
                );
            }
            await productsRepo.update(id, updateData, client);
            await client.query('COMMIT');

            await this.#invalidateProductCache(id, existingProduct.slug);
            return await this.getProductDetails(id);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async addVariantToProduct(productId, variantData) {
        const product = await productsRepo.findById(productId);
        if (!product) throw new AppError('Produit parent introuvable', HTTP_STATUS.NOT_FOUND);

        let finalAttributes =
            typeof variantData.attributes === 'string'
                ? JSON.parse(variantData.attributes)
                : variantData.attributes || {};

        if (variantData.size) finalAttributes.size = variantData.size;
        if (variantData.image) finalAttributes.image = variantData.image;

        const variant = await productsRepo.addVariant({
            ...variantData,
            productId,
            attributes: finalAttributes,
        });

        const initialQty = parseInt(variantData.initialStock || 0, 10);
        await inventoryRepo.upsert({ variantId: variant.id, availableStock: initialQty });

        await this.#invalidateProductCache(productId, product.slug);
        return { ...variant, inventory: { available_stock: initialQty } };
    }

    async deleteProduct(productId) {
        const product = await productsRepo.findById(productId);
        if (!product) throw new AppError('Produit introuvable', HTTP_STATUS.NOT_FOUND);

        await productsRepo.deleteById(productId);
        await this.#invalidateProductCache(productId, product.slug);
        return true;
    }

    // ─── AUTRES MÉTHODES ───────────────────────────────────────────────────────

    async validateVariants(variantIds) {
        if (!variantIds || !Array.isArray(variantIds) || variantIds.length === 0) return [];
        return productsRepo.validateVariants(variantIds);
    }

    async updateVariant(variantId, updateData) {
        const variant = await productsRepo.findVariantById(variantId);
        if (!variant) throw new AppError('Variante introuvable', HTTP_STATUS.NOT_FOUND);

        const finalAttributes = { ...variant.attributes, ...updateData.attributes };
        const updated = await productsRepo.updateVariant(variantId, {
            ...updateData,
            attributes: finalAttributes,
        });

        const product = await productsRepo.findById(variant.productId);
        await this.#invalidateProductCache(variant.productId, product.slug);
        return updated;
    }

    async deleteVariant(variantId) {
        const variant = await productsRepo.findVariantById(variantId);
        if (!variant) throw new AppError('Variante introuvable', HTTP_STATUS.NOT_FOUND);

        const allVariants = await productsRepo.listVariantsByProduct(variant.productId);
        if (allVariants.length <= 1) {
            throw new BusinessError('Un produit doit avoir au moins une variante.');
        }

        await productsRepo.deleteVariantById(variantId);
        const product = await productsRepo.findById(variant.productId);
        await this.#invalidateProductCache(variant.productId, product.slug);
        return true;
    }

    async getProductFilters() {
        return { sizes: await productsRepo.getUniqueSizes() };
    }
}

export const productService = new ProductService();