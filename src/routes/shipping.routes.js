import { Router } from 'express';
import { protect } from '../middlewares/auth.middleware.js';
import { shippingController } from '../controllers/shipping.controller.js';

const router = Router();

router.use(protect);

// Carnet d'adresses de l'utilisateur
router.get('/addresses', shippingController.getAddresses);
router.post('/addresses', shippingController.addAddress);

// Estimation des frais de port (pour le panier)
router.post('/estimate', shippingController.getRates);

router.delete('/addresses/:addressId', shippingController.deleteAddress);

export default router;