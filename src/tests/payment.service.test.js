import { describe, it, expect, vi, beforeEach } from 'vitest';

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

vi.mock('../repositories/index.js', () => ({
    ordersRepo: { findById: vi.fn(), updateStatus: vi.fn() }
}));

import { paymentService } from '../services/payment.service.js';
import { ordersRepo } from '../repositories/index.js';
import Stripe from 'stripe';

describe('PaymentService', () => {
    const { mockSessionCreate, mockConstructEvent } = Stripe.instanceMocks;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('devrait valider et mettre à jour la commande via webhook', async () => {
        const mockEvent = {
            type: 'checkout.session.completed',
            data: { object: { metadata: { orderId: 'ord_123' } } }
        };

        mockConstructEvent.mockReturnValue(mockEvent);

        const result = await paymentService.processStripeWebhook('body', 'sig');

        expect(result.received).toBe(true);
        expect(ordersRepo.updateStatus).toHaveBeenCalledWith('ord_123', 'PAID');
    });

    it('devrait créer une session de paiement', async () => {
        ordersRepo.findById.mockResolvedValue({ id: 'ord_1', status: 'PENDING' });
        mockSessionCreate.mockResolvedValue({ id: 'sess_123', url: 'http://pay.com' });

        const session = await paymentService.createSession('ord_1');

        expect(session.id).toBe('sess_123');
        expect(mockSessionCreate).toHaveBeenCalled();
    });
});