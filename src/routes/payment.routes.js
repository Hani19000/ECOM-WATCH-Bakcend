/**
 * @module Routes/Payment
 * 
 * Routes de gestion des paiements et webhooks.
 * Supporte les paiements en mode guest (invité) et authentifié.
 * 
 * Pourquoi optionalAuth au lieu de protect :
 * - Permet le paiement sans compte (guest checkout)
 * - Réduit la friction et l'abandon de panier
 * - L'utilisateur peut créer un compte après paiement
 * - Stripe collecte l'email pour les guests
 * 
 * Sécurité :
 * - L'orderId est généré côté serveur (UUID ou auto-increment sécurisé)
 * - Le webhook Stripe vérifie le paiement (signature HMAC)
 * - Le frontend ne peut pas confirmer un paiement, seul Stripe peut
 * 
 * IMPORTANT : rawBody est géré dans app.js via express.json({ verify })
 * Il ne faut PAS utiliser express.raw() ici, sinon conflit !
 */
import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller.js';
import { optionalAuth } from '../middlewares/optionalAuth.middleware.js';

const router = Router();

// ================================================================
// ROUTES AVEC AUTHENTIFICATION OPTIONNELLE
// ================================================================

/**
 * POST /api/v1/payments/create-session/:orderId
 * Crée une session de paiement Stripe pour une commande existante.
 * 
 * Accessible en mode :
 * - Guest : Pas de token, req.user = undefined
 * - Authentifié : Token valide, req.user défini
 * 
 * Pourquoi optionalAuth :
 * - Ne bloque pas les utilisateurs non connectés
 * - Permet le checkout rapide sans inscription
 * - L'email est collecté par Stripe pour les confirmations
 */
router.post('/create-session/:orderId', optionalAuth, paymentController.createCheckoutSession);

/**
 * GET /api/v1/payments/status/:orderId
 * Vérifie le statut de paiement d'une commande (polling après redirection Stripe).
 * 
 * Accessible en mode :
 * - Guest : Pour vérifier le statut après paiement
 * - Authentifié : Avec vérification de propriété
 */
router.get('/status/:orderId', optionalAuth, paymentController.checkStatus);

// ================================================================
// WEBHOOKS PUBLICS (appelés par Stripe/PayPal, pas d'auth)
// ================================================================

/**
 * POST /api/v1/payments/webhook/stripe
 * Webhook Stripe pour notifications de paiement.
 * 
 * Sécurité :
 * - Vérification de signature HMAC (webhookSecret)
 * - Pas de JWT nécessaire (Stripe n'est pas authentifié)
 * - Le rawBody est géré dans app.js via express.json({ verify })
 */
router.post('/webhook/stripe', paymentController.handleStripeWebhook);

/**
 * POST /api/v1/payments/webhook/paypal
 * Webhook PayPal pour notifications de paiement.
 */
router.post('/webhook/paypal', paymentController.handlePayPalWebhook);

// ================================================================
// REDIRECTIONS APRÈS PAIEMENT (pages de confirmation)
// ================================================================

/**
 * GET /api/v1/payments/success?session_id=xxx
 * Page de succès après paiement (fallback HTML avec redirection).
 */
router.get('/success', paymentController.handleSuccess);

/**
 * GET /api/v1/payments/cancel
 * Page d'annulation après abandon de paiement.
 */
router.get('/cancel', paymentController.handleCancel);

export default router;