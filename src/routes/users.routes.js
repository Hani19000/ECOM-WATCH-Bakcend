import { Router } from 'express';
import { userController } from '../controllers/users.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { restrictTo } from '../middlewares/role.middleware.js';
import { validateUUID } from '../utils/validation.js';

const router = Router();

router.use(protect); // Toutes les routes utilisateurs nécessitent d'être connecté

// --- Routes Profil (Self) ---
router.get('/me', userController.getProfile);
router.patch('/me', userController.updateProfile);
router.patch('/update-password', userController.updatePassword);

// --- Routes Administration ---
router.get('/', restrictTo('ADMIN'), userController.getAllUsers);
router.get('/:id', restrictTo('ADMIN'), userController.getProfile);
router.delete('/:id', restrictTo('ADMIN'), userController.deleteUser);

export default router;