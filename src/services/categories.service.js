import { categoriesRepo } from '../repositories/categories.repo.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class CategoryService {
    /**
     * Liste toutes les catégories disponibles pour le front-end
     */
    async getAllCategories() {
        return await categoriesRepo.list();
    }

    /**
     * Crée une catégorie avec validation d'unicité sur le slug
     * @param {Object} categoryData - { name, slug }
     */
    async createCategory({ name, slug }) {
        // 1. Normalisation préventive (ex: suppression espaces inutiles)
        const sanitizedSlug = slug.trim().toLowerCase();

        // 2. Vérification d'existence (Règle métier : pas de slug en double)
        const existingCategory = await categoriesRepo.findBySlug(sanitizedSlug);
        if (existingCategory) {
            throw new AppError(
                `La catégorie avec le slug '${sanitizedSlug}' existe déjà.`,
                HTTP_STATUS.CONFLICT
            );
        }

        // 3. Persistance
        const newCategory = await categoriesRepo.create({ name, slug: sanitizedSlug });

        // Double sécurité si la DB renvoie null malgré le check précédent (ex: race condition)
        if (!newCategory) {
            throw new AppError('Erreur lors de la création de la catégorie.', HTTP_STATUS.INTERNAL_SERVER_ERROR);
        }

        return newCategory;
    }

    /**
     * Attache une liste de catégories à un produit
     * Utilise Promise.all pour paralléliser les insertions (Performance)
     * @param {string} productId - UUID du produit
     * @param {Array<string>} categoryIds - Tableau d'UUIDs
     */
    async assignCategoriesToProduct(productId, categoryIds) {
        // Guard clause : on ne fait rien si la liste est vide ou invalide
        if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
            return;
        }

        // Création des promesses d'insertion (Non-bloquant séquentiellement)
        const linkPromises = categoryIds.map(categoryId =>
            categoriesRepo.linkProductToCategory(productId, categoryId)
        );

        // Attente de la complétion de toutes les liaisons
        await Promise.all(linkPromises);
    }

    /**
     * Supprime une catégorie uniquement si elle n'est pas liée à des produits.
     * C'est une règle de sécurité métier pour éviter les données orphelines.
     */
    async deleteCategory(id) {
        // Logique de sécurité pour vérifier si la catégorie est utilisée
        const products = await categoriesRepo.listByProductId(id);
        if (products && products.length > 0) {
            throw new AppError(
                'Impossible de supprimer : cette catégorie est liée à des produits.',
                HTTP_STATUS.CONFLICT
            );
        }

        const success = await categoriesRepo.delete(id);
        if (!success) {
            throw new AppError('Catégorie non trouvée', HTTP_STATUS.NOT_FOUND);
        }
        return true;
    }

    async updateCategory(id, data) {
        const updated = await categoriesRepo.update(id, data);
        if (!updated) {
            throw new AppError('Catégorie non trouvée', HTTP_STATUS.NOT_FOUND);
        }
        return updated;
    }
}

export const categoryService = new CategoryService();