/**
 * @module Routes/Cart
 *
 * Routes du panier — entièrement protégées.
 * Un panier est toujours lié à un utilisateur authentifié.
 */
import { Router } from 'express';
import { cartController } from '../controllers/cart.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { validateInteger, validateUUID } from '../utils/validation.js';

const router = Router();

router.use(protect);

router.get('/', cartController.getCart);

router.post(
    '/items',
    (req, _res, next) => {
        validateInteger(req.body.quantity);
        validateUUID(req.body.variantId);
        next();
    },
    cartController.addItem
);

router.patch('/items/:itemId', cartController.updateQuantity);
router.delete('/items/:itemId', cartController.removeItem);
router.delete('/', cartController.clear);

export default router;