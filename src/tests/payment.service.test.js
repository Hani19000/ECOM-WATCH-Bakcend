import { describe, it, expect, vi, beforeEach } from 'vitest';

// -----------------------------------------------------------------------------
// Mock Stripe
//
// On expose mockSessionCreate et mockConstructEvent via StripeMock.instanceMocks
// pour y accéder après l'import, une fois que vitest a résolu les mocks.
// -----------------------------------------------------------------------------
vi.mock('stripe', () => {
    const mockSessionCreate = vi.fn();
    const mockConstructEvent = vi.fn();

    const StripeMock = vi.fn().mockImplementation(function () {
        return {
            checkout: { sessions: { create: mockSessionCreate } },
            webhooks: { constructEvent: mockConstructEvent }
        };
    });

    StripeMock.instanceMocks = { mockSessionCreate, mockConstructEvent };

    return { default: StripeMock };
});

// -----------------------------------------------------------------------------
// Mock environment
//
// Nécessaire car payment.service.js lit ENV.stripe.secretKey au chargement du
// module. Sans ce mock, le service ne s'initialise pas en environnement de test.
// -----------------------------------------------------------------------------
vi.mock('../config/environment.js', () => ({
    ENV: {
        server: { nodeEnv: 'test' },
        database: {
            postgres: { url: 'postgres://test:test@localhost:5432/test' },
            redis: { host: 'localhost', port: 6379, password: '' }
        },
        stripe: { secretKey: 'sk_test', webhookSecret: 'wh_test' },
        PORT: 3000,
        JWT_ACCESS_SECRET: 'test',
        JWT_REFRESH_SECRET: 'test',
        SENTRY_DSN: 'http://test'
    }
}));

// -----------------------------------------------------------------------------
// Mock database
//
// Le pool retourne un client transactionnel fictif.
// Le client est passé en 4e argument à ordersRepo.updateStatus — c'est pour ça
// que l'assertion originale (2 args) échouait.
// -----------------------------------------------------------------------------
vi.mock('../config/database.js', () => ({
    pgPool: {
        connect: vi.fn().mockResolvedValue({
            query: vi.fn().mockResolvedValue({ rows: [] }),
            release: vi.fn()
        })
    }
}));

// -----------------------------------------------------------------------------
// Mock repositories
//
// Corrections apportées par rapport à la version initiale :
//
//   1. paymentsRepo manquait entièrement.
//      Le service appelle paymentsRepo.create() dans createSession() et
//      paymentsRepo.updateByIntentId() dans processStripeWebhook().
//      Sans ce mock, vitest lève "No paymentsRepo export is defined".
//
//   2. productsRepo manquait entièrement.
//      Le service appelle productsRepo.findById() pour invalider le cache Redis
//      après confirmation du paiement (invalidateProductCache).
//      Sans ce mock, vitest lève "No productsRepo export is defined".
// -----------------------------------------------------------------------------
vi.mock('../repositories/index.js', () => ({
    ordersRepo: {
        findById: vi.fn(),
        updateStatus: vi.fn(),
        listItems: vi.fn().mockResolvedValue([
            { productName: 'Montre', price: 100, quantity: 1 }
        ])
    },
    inventoryRepo: {
        confirmSale: vi.fn()
    },
    paymentsRepo: {
        create: vi.fn().mockResolvedValue({ id: 'pay_1' }),
        updateByIntentId: vi.fn().mockResolvedValue({ id: 'pay_1', status: 'SUCCESS' })
    },
    productsRepo: {
        findById: vi.fn().mockResolvedValue({ id: 'p-1', name: 'Montre Test' })
    }
}));

import { paymentService } from '../services/payment.service.js';
import { ordersRepo } from '../repositories/index.js';
import Stripe from 'stripe';

describe('PaymentService', () => {
    const { mockSessionCreate, mockConstructEvent } = Stripe.instanceMocks;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // -------------------------------------------------------------------------
    // Test 1 : traitement d'un webhook Stripe
    //
    // Corrections apportées :
    //
    //   1. ordersRepo.findById mocké avec un userId valide.
    //      Le service appelle findById() après updateStatus() pour récupérer
    //      la commande et déclencher les notifications (triggerPostPaymentNotifications).
    //      Sans userId dans l'objet retourné, le service crash avec
    //      "Cannot read properties of undefined (reading 'userId')".
    //
    //   2. L'événement mock inclut désormais amount_total et payment_intent.
    //      Sans ces champs, le service construisait { amount: NaN, paymentIntentId: undefined }
    //      ce qui causait une valeur NaN dans l'assertion.
    //
    //   3. L'assertion toHaveBeenCalledWith est corrigée pour refléter la
    //      signature réelle de ordersRepo.updateStatus() :
    //        updateStatus(orderId, status, paymentData, dbClient)
    //      On utilise expect.objectContaining pour les deux derniers arguments
    //      dont le contenu exact dépend du service, pas du test.
    // -------------------------------------------------------------------------
    it('devrait valider et mettre à jour la commande via webhook', async () => {
        const mockEvent = {
            type: 'checkout.session.completed',
            data: {
                object: {
                    metadata: { orderId: 'ord_123' },
                    amount_total: 19999,
                    payment_intent: 'pi_test_456'
                }
            }
        };

        mockConstructEvent.mockReturnValue(mockEvent);

        // L'ordre doit contenir userId pour que triggerPostPaymentNotifications
        // puisse récupérer les informations de l'utilisateur sans crasher.
        ordersRepo.findById.mockResolvedValue({
            id: 'ord_123',
            userId: 'user_abc',
            status: 'PENDING',
            totalAmount: 199.99
        });

        const result = await paymentService.processStripeWebhook('body', 'sig');

        expect(result.received).toBe(true);

        // Le service passe 4 arguments à updateStatus :
        //   1. orderId
        //   2. nouveau statut
        //   3. données de paiement extraites de l'event Stripe
        //   4. client transactionnel PostgreSQL
        expect(ordersRepo.updateStatus).toHaveBeenCalledWith(
            'ord_123',
            'PAID',
            expect.objectContaining({
                provider: 'STRIPE',
                paymentIntentId: 'pi_test_456',
                amount: 199.99
            }),
            expect.objectContaining({
                query: expect.any(Function),
                release: expect.any(Function)
            })
        );
    });

    // -------------------------------------------------------------------------
    // Test 2 : création d'une session de paiement Stripe Checkout
    //
    // Correction : paymentsRepo.create() étant maintenant mocké, le service
    // peut enregistrer le paiement en base sans lever d'erreur.
    // -------------------------------------------------------------------------
    it('devrait créer une session de paiement', async () => {
        ordersRepo.findById.mockResolvedValue({
            id: 'ord_1',
            status: 'PENDING',
            totalAmount: 199.99,
            userId: 'user_abc'
        });

        mockSessionCreate.mockResolvedValue({
            id: 'sess_123',
            url: 'https://checkout.stripe.com/pay/sess_123'
        });

        const session = await paymentService.createSession('ord_1');

        expect(session.id).toBe('sess_123');
        expect(mockSessionCreate).toHaveBeenCalled();
    });
});