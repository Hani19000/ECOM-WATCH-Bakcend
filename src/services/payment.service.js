/**
 * @module Service/Payment
 *
 * Gère la création des sessions de paiement Stripe et le traitement des webhooks.
 */
import { ordersRepo, inventoryRepo } from '../repositories/index.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import Stripe from 'stripe';
import { ENV } from '../config/environment.js';

const stripe = new Stripe(ENV.stripe?.secretKey || 'dummy_key');

class PaymentService {
    /**
     * Crée une session Stripe Checkout avec le montant global de la commande
     * plutôt que ligne par ligne, pour simplifier la gestion des frais de port et remises.
     */
    async createSession(orderId) {
        const order = await ordersRepo.findById(orderId);
        if (!order) throw new AppError('Commande introuvable', HTTP_STATUS.NOT_FOUND);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            metadata: { orderId: order.id.toString() },
            success_url: `${ENV.clientUrl}/api/v1/payments/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${ENV.clientUrl}/api/v1/payments/cancel`,
            line_items: [
                {
                    price_data: {
                        currency: 'eur',
                        product_data: { name: `Commande #${order.id}` },
                        // Stripe attend des centimes entiers, d'où la conversion.
                        unit_amount: Math.round(order.totalAmount * 100),
                    },
                    quantity: 1,
                },
            ],
        });

        return session;
    }

    /**
     * Traite les événements Stripe de façon sécurisée via vérification de signature.
     * La confirmation de vente (confirmSale) est séparée de la réservation :
     * le stock n'est définitivement sorti qu'après confirmation du paiement.
     */
    async processStripeWebhook(rawBody, signature) {
        try {
            const event = stripe.webhooks.constructEvent(
                rawBody,
                signature,
                ENV.stripe?.webhookSecret
            );

            if (event.type === 'checkout.session.completed') {
                const session = event.data.object;
                const orderId = session.metadata.orderId;

                const updatedOrder = await ordersRepo.updateStatus(orderId, 'PAID', {
                    provider: 'STRIPE',
                    paymentIntentId: session.payment_intent,
                    amount: session.amount_total / 100,
                });

                if (updatedOrder.items?.length > 0) {
                    for (const item of updatedOrder.items) {
                        await inventoryRepo.confirmSale(item.variantId, item.quantity);
                    }
                }
            }

            return { received: true };
        } catch (err) {
            throw new AppError(`Stripe Webhook Error: ${err.message}`, HTTP_STATUS.BAD_REQUEST);
        }
    }
}

export const paymentService = new PaymentService();