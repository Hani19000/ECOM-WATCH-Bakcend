/**
 * @module Controller/Categories
 *
 * Gère les entrées/sorties HTTP pour les catégories.
 */
import { categoryService } from '../services/categories.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/appError.js';

class CategoryController {
    /**
     * GET /api/v1/categories
     * Route publique pour permettre au frontend d'afficher les filtres.
     */
    getAllCategories = asyncHandler(async (_req, res) => {
        const categories = await categoryService.getAllCategories();

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            results: categories.length,
            data: { categories },
        });
    });

    /**
     * POST /api/v1/categories
     * Route protégée (Admin uniquement).
     */
    createCategory = asyncHandler(async (req, res) => {
        const { name, slug } = req.body;

        if (!name || !slug) {
            throw new AppError('Le nom et le slug sont requis.', HTTP_STATUS.BAD_REQUEST);
        }

        const newCategory = await categoryService.createCategory({ name, slug });

        res.status(HTTP_STATUS.CREATED).json({
            status: 'success',
            message: 'Catégorie créée avec succès',
            data: { category: newCategory },
        });
    });

    updateCategory = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const updatedCategory = await categoryService.updateCategory(id, req.body);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { category: updatedCategory },
        });
    });

    deleteCategory = asyncHandler(async (req, res) => {
        const { id } = req.params;
        await categoryService.deleteCategory(id);

        res.status(HTTP_STATUS.NO_CONTENT).send();
    });
}

export const categoryController = new CategoryController();