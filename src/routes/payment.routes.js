import { Router } from 'express';
import express from 'express'; // Pour express.raw()
import { paymentController } from '../controllers/payment.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = Router();

// Route pour créer la session (Protégée)
router.post('/create-session/:orderId', protect, paymentController.createCheckoutSession);
router.get('/status/:orderId', protect, paymentController.checkStatus);

// Webhooks (PUBLICS car appelés par Stripe/PayPal)
// Le middleware express.raw() est crucial ici pour la signature Stripe
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), paymentController.handleStripeWebhook);
router.post('/webhook/paypal', paymentController.handlePayPalWebhook);


// Redirections après paiement
router.get('/success', paymentController.handleSuccess);
router.get('/cancel', paymentController.handleCancel);

export default router;