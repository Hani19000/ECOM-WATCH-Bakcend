/**
 * @module Controller/Payment
 *
 * Gère l'initialisation des sessions de paiement et la réception des webhooks.
 * Les webhooks doivent être traités rapidement (répondre 200 immédiatement)
 * pour éviter les retentatives automatiques de Stripe/PayPal.
 */
import { paymentService } from '../services/payment.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { logInfo } from '../utils/logger.js';

class PaymentController {
    /**
     * Crée une session de paiement Stripe ou PayPal.
     * Retourne l'URL de redirection vers la plateforme de paiement tierce.
     * POST /api/v1/payments/create-session/:orderId
     */
    createCheckoutSession = asyncHandler(async (req, res) => {
        const { orderId } = req.params;
        const { provider } = req.body;

        const session = await paymentService.createSession(orderId, provider, req.user.id);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: {
                checkoutUrl: session.url,
                sessionId: session.id,
            },
        });
    });

    /**
     * Webhook Stripe.
     * ATTENTION : nécessite le body "raw" (Buffer) pour valider la signature HMAC.
     * Sans rawBody, Stripe rejettera la vérification et les paiements ne seront pas confirmés.
     */
    handleStripeWebhook = asyncHandler(async (req, res) => {
        const signature = req.headers['stripe-signature'];

        if (!req.rawBody) {
            logInfo('Stripe webhook reçu sans rawBody — vérifier la config express.json dans app.js');
        }

        await paymentService.processStripeWebhook(req.rawBody, signature);
        res.status(HTTP_STATUS.OK).json({ received: true });
    });

    /** Webhook PayPal */
    handlePayPalWebhook = asyncHandler(async (req, res) => {
        const payload = req.body;
        const headers = req.headers;

        await paymentService.processPayPalWebhook(payload, headers);

        res.status(HTTP_STATUS.OK).json({ status: 'success' });
    });

    /** Vérifie l'état d'un paiement — utile pour le polling côté frontend */
    checkStatus = asyncHandler(async (req, res) => {
        const { orderId } = req.params;
        const status = await paymentService.getPaymentStatus(orderId);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { paymentStatus: status },
        });
    });

    handleSuccess = asyncHandler(async (req, res) => {
        // Option A : Rediriger vers ton Frontend (React/Vue/etc.)
        // res.redirect(`${ENV.clientUrl}/checkout/success?session_id=${req.query.session_id}`);

        // Option B : Page HTML de confirmation temporaire
        res.send(`
        <div style="text-align: center; margin-top: 50px; font-family: sans-serif;">
            <h1 style="color: #2ecc71;">✅ Paiement réussi !</h1>
            <p>Merci pour votre commande. Nous préparons votre colis.</p>
            <p>Vous allez être redirigé vers l'accueil dans quelques secondes...</p>
            <script>
                setTimeout(() => { window.location.href = 'http://localhost:5173'; }, 5000);
            </script>
        </div>
    `);
    });

    handleCancel = asyncHandler(async (req, res) => {
        res.send(`
        <div style="text-align: center; margin-top: 50px; font-family: sans-serif;">
            <h1 style="color: #e74c3c;">❌ Paiement annulé</h1>
            <p>Votre commande n'a pas été facturée.</p>
            <a href="http://localhost:3000/api/v1/orders">Retourner à mes commandes</a>
        </div>
    `);
    });
}

export const paymentController = new PaymentController();