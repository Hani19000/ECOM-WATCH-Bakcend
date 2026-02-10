/**
 * @module Service/Product
 *
 * Gère le catalogue, les variantes et l'intégration avec l'inventaire.
 */
import { productsRepo, inventoryRepo, categoriesRepo } from '../repositories/index.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { pgPool } from '../config/database.js';

class ProductService {
    constructor() {
        if (ProductService.instance) return ProductService.instance;
        ProductService.instance = this;
        Object.freeze(this);
    }

    /**
     * Vérifie l'unicité du slug et du SKU avant toute écriture.
     * Vérifier en amont permet de retourner un message explicite plutôt qu'une erreur
     * de contrainte d'unicité DB difficilement interprétable côté client.
     */
    async checkAvailability(slug, sku) {
        const [existingSlug, existingSku] = await Promise.all([
            productsRepo.findBySlug(slug),
            productsRepo.findVariantBySku(sku),
        ]);

        if (existingSlug) throw new AppError(`Le slug '${slug}' est déjà utilisé.`, HTTP_STATUS.CONFLICT);
        if (existingSku) throw new AppError(`Le SKU '${sku}' est déjà utilisé.`, HTTP_STATUS.CONFLICT);
    }

    /**
     * Crée produit, variante et stock dans une même transaction pour garantir
     * qu'un produit sans variante ni stock ne peut jamais exister en base.
     */
    async createProductWithVariant(productData, variantData) {
        const { categoryIds, ...pureProductData } = productData; // On extrait les IDs de catégories

        await this.checkAvailability(pureProductData.slug, variantData.sku);

        const client = await pgPool.connect();
        try {
            await client.query('BEGIN');

            // 1. Création du produit
            const product = await productsRepo.create(pureProductData, client);

            // 2. Liaison des catégories (Nouveau)
            if (categoryIds && categoryIds.length > 0) {
                const linkPromises = categoryIds.map(catId =>
                    categoriesRepo.addProductCategory(product.id, catId, client) // Utilisation du client transactionnel
                );
                await Promise.all(linkPromises);
            }

            // 3. Création variante et stock...
            const variant = await productsRepo.addVariant({ productId: product.id, ...variantData }, client);
            await inventoryRepo.upsert({ variantId: variant.id, availableStock: variantData.initialStock || 0 }, client);

            await client.query('COMMIT');
            return { ...product, categoryIds, variants: [variant] };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Détecte dynamiquement si l'identifiant est un UUID ou un slug
     * pour éviter deux endpoints distincts sur la route produit.
     */
    async getProductDetails(idOrSlug) {
        const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(idOrSlug);

        const product = await productsRepo.getFullDetails(idOrSlug, isUUID ? 'id' : 'slug');
        if (!product) throw new AppError('Produit introuvable', HTTP_STATUS.NOT_FOUND);

        const totalStock = product.variants.reduce((acc, v) => {
            return acc + (v.inventory?.availableStock ?? 0);
        }, 0);

        return { ...product, totalInventory: totalStock };
    }

    /**
     * Enrichit chaque produit avec son prix de départ pour éviter N+1 requêtes
     * côté client (le front n'a pas besoin de charger toutes les variantes pour l'affichage catalogue).
     */
    async listCatalog(filters) {
        const { data, pagination } = await productsRepo.list(filters);

        const enrichedData = await Promise.all(
            data.map(async (product) => {
                const variants = await productsRepo.listVariantsByProduct(product.id);
                const minPrice = variants.length > 0
                    ? Math.min(...variants.map((v) => v.price))
                    : null;

                return { ...product, startingPrice: minPrice };
            })
        );

        return { data: enrichedData, pagination };
    }

    async updateProduct(id, updateData) {
        const existingProduct = await productsRepo.findById(id);
        if (!existingProduct) throw new AppError('Produit introuvable', HTTP_STATUS.NOT_FOUND);

        if (updateData.slug && updateData.slug !== existingProduct.slug) {
            const slugExists = await productsRepo.findBySlug(updateData.slug);
            if (slugExists) throw new AppError('Ce slug est déjà utilisé par un autre produit', HTTP_STATUS.CONFLICT);
        }

        return await productsRepo.update(id, updateData);
    }

    async addVariantToProduct(productId, variantData) {
        const product = await productsRepo.findById(productId);
        if (!product) throw new AppError('Produit parent introuvable', HTTP_STATUS.NOT_FOUND);

        const variant = await productsRepo.addVariant({ ...variantData, productId });

        // Stock initialisé à 0 : le réapprovisionnement se fait via inventoryService.
        await inventoryRepo.upsert({ variantId: variant.id, availableStock: 0 });

        return variant;
    }

    async deleteProduct(productId) {
        const product = await productsRepo.findById(productId);
        if (!product) throw new AppError('Produit introuvable', HTTP_STATUS.NOT_FOUND);

        // La suppression en cascade (FK ON DELETE CASCADE) nettoie variantes et inventaire.
        return await productsRepo.deleteById(productId);
    }
}

export const productService = new ProductService();