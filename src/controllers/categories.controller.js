/**
 * @module Controller/Category
 * Gère les entrées/sorties HTTP pour les catégories.
 * Fait le pont entre la requête client et la logique métier (Service).
 */
import { categoryService } from '../services/categories.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/appError.js';

class CategoryController {
    /**
     * Récupère la liste complète des catégories.
     * Route publique pour permettre au front-end d'afficher les filtres.
     */
    getAllCategories = asyncHandler(async (_req, res) => {
        const categories = await categoryService.getAllCategories();

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            results: categories.length,
            data: { categories }
        });
    });

    /**
     * Crée une nouvelle catégorie.
     * Route protégée (Admin uniquement).
     */
    createCategory = asyncHandler(async (req, res) => {
        const { name, slug } = req.body;

        // Validation basique des entrées ici (le Service fera la validation métier)
        if (!name || !slug) {
            throw new AppError('Le nom et le slug sont requis.', HTTP_STATUS.BAD_REQUEST);
        }

        const newCategory = await categoryService.createCategory({ name, slug });

        res.status(HTTP_STATUS.CREATED).json({
            status: 'success',
            message: 'Catégorie créée avec succès',
            data: { category: newCategory }
        });
    });

    /**
     * Met à jour une catégorie existante
     */
    updateCategory = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const updatedCategory = await categoryService.updateCategory(id, req.body);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { category: updatedCategory }
        });
    });

    /**
     * Supprime une catégorie
     */
    deleteCategory = asyncHandler(async (req, res) => {
        const { id } = req.params;
        await categoryService.deleteCategory(id);

        // 204 No Content est le standard pour une suppression réussie
        res.status(HTTP_STATUS.NO_CONTENT).send();
    });
}

export const categoryController = new CategoryController();