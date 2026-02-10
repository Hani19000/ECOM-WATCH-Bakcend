import { Router } from 'express';
import { orderController } from '../controllers/order.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { restrictTo } from '../middlewares/role.middleware.js';

const router = Router();

router.use(protect);

// Client : Voir ses commandes et passer commande
router.get('/my-orders', orderController.getMyOrders);
router.get('/:orderId', orderController.getOrderDetail);
router.post('/checkout', orderController.checkout);

// Admin : Gérer toutes les commandes du système
router.get('/', restrictTo('ADMIN'), orderController.getAllOrders);
router.patch('/:orderId/status', restrictTo('ADMIN'), orderController.updateStatus);

export default router;