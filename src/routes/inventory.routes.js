import { Router } from 'express';
import { inventoryController } from '../controllers/inventory.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { restrictTo } from '../middlewares/role.middleware.js';
const router = Router();

// Routes protégées : Seul l'admin peut ajuster ou voir les alertes
router.use(protect);
router.use(restrictTo('ADMIN'));

router.get('/alerts', inventoryController.getLowStockAlerts);
router.get('/:variantId', inventoryController.getStock);
router.patch('/:variantId/adjust', inventoryController.adjustStock);
router.patch('/restock/:variantId', inventoryController.addStock);

export default router;