import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { restrictTo } from '../middlewares/role.middleware.js';

const router = Router();

// Toutes les routes admin demandent d'être connecté ET d'être admin
router.use(protect);
router.use(restrictTo('admin'));

router.get('/stats', adminController.getStats);

export default router;