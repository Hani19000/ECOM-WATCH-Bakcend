/**
 * @module Service/Category
 *
 * Gère la logique métier des catégories produit.
 * Les catégories sont mises en cache 24h car elles changent rarement.
 */
import { categoriesRepo } from '../repositories/categories.repo.js';
import { cacheService } from './cache.service.js';
import { AppError, ValidationError, ConflictError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class CategoryService {
    constructor() {
        if (CategoryService.instance) return CategoryService.instance;
        CategoryService.instance = this;
        Object.freeze(this);
    }

    #getCacheKey(key) {
        return `categories:${key}`;
    }

    async getAllCategories() {
        const cacheKey = this.#getCacheKey('all');
        const cached = await cacheService.get(cacheKey);
        if (cached) return cached;

        const categories = await categoriesRepo.list();
        await cacheService.set(cacheKey, categories, 86400);
        return categories;
    }

    async createCategory({ name, slug }) {
        if (!name || name.trim().length < 2 || name.trim().length > 50) {
            throw new ValidationError('Nom de catégorie invalide (2-50 caractères).');
        }

        const sanitizedSlug = slug.trim().toLowerCase();
        const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

        if (!slugRegex.test(sanitizedSlug)) {
            throw new ValidationError('Format du slug invalide.');
        }

        const existingCategory = await categoriesRepo.findBySlug(sanitizedSlug);
        if (existingCategory) {
            throw new ConflictError(`Le slug '${sanitizedSlug}' existe déjà.`);
        }

        const newCategory = await categoriesRepo.create({
            name: name.trim(),
            slug: sanitizedSlug,
        });
        await cacheService.delete(this.#getCacheKey('all'));
        return newCategory;
    }

    async assignCategoriesToProduct(productId, categoryIds) {
        if (!Array.isArray(categoryIds) || categoryIds.length === 0) return;

        await Promise.all(
            categoryIds.map((catId) => categoriesRepo.linkProductToCategory(productId, catId))
        );
        // Le cache produit est invalidé car ses catégories ont changé.
        await cacheService.delete(`product:details:${productId}`);
    }

    async updateCategory(id, data) {
        const updated = await categoriesRepo.update(id, data);
        if (!updated) throw new AppError('Catégorie introuvable', HTTP_STATUS.NOT_FOUND);

        await cacheService.delete(this.#getCacheKey('all'));
        return updated;
    }

    async deleteCategory(id) {
        const linkedProducts = await categoriesRepo.listByProductId(id);
        if (linkedProducts?.length > 0) {
            throw new ConflictError('Action impossible : catégorie utilisée.');
        }

        const success = await categoriesRepo.delete(id);
        if (!success) throw new AppError('Catégorie introuvable', HTTP_STATUS.NOT_FOUND);

        await cacheService.delete(this.#getCacheKey('all'));
        return true;
    }
}

export const categoryService = new CategoryService();