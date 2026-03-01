/**
 * @module Routes/Category
 * Définition des endpoints pour la gestion des catégories.
 */
import { Router } from 'express';
import { categoryController } from '../controllers/categories.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { restrictTo } from '../middleware/role.middleware.js';

const router = Router();

// Lecture publique : Tout le monde doit pouvoir voir les catégories
router.get('/', categoryController.getAllCategories);

// Écriture protégée : Seuls les admins peuvent modifier la taxonomie du site
router.post(
    '/',
    protect,              // 1. Vérifie le token JWT
    restrictTo('ADMIN'),  // 2. Vérifie le rôle
    categoryController.createCategory
);


router.patch('/:id', protect, restrictTo('ADMIN'), categoryController.updateCategory);
router.delete('/:id', protect, restrictTo('ADMIN'), categoryController.deleteCategory);

export default router;