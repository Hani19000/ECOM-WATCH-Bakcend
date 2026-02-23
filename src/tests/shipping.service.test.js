import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mocks des repositories utilisés dans TON service
vi.mock('../repositories/index.js', () => ({
    shipmentsRepo: {
        create: vi.fn(),
        findById: vi.fn(),
        update: vi.fn(),
        findByOrderId: vi.fn()
    },
    ordersRepo: {
        findById: vi.fn(),
        updateStatus: vi.fn()
    }
}));

// 2. Imports
import { shippingService } from '../services/shipping.service.js';
import { shipmentsRepo, ordersRepo } from '../repositories/index.js';
import { AppError } from '../utils/appError.js';

describe('ShippingService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ...
    describe('calculateShippingCost', () => {
        it('devrait calculer le tarif correct pour la France', () => {
            const result = shippingService.calculateShippingCost('FR', 2);
            expect(result.cost).toBe(6.90);
        });
        // ...

        it('devrait utiliser le tarif INTERNATIONAL par défaut', () => {
            const result = shippingService.calculateShippingCost('MARS', 1);
            expect(result.cost).toBe(30.00);
        });
    });

    describe('createShipment', () => {
        it('devrait créer une expédition si la commande est payée', async () => {
            const orderId = 'order_123';
            ordersRepo.findById.mockResolvedValue({ id: orderId, status: 'PAID' });
            shipmentsRepo.create.mockResolvedValue({ id: 'ship_1', trackingNumber: 'COL-XYZ' });

            const shipment = await shippingService.createShipment(orderId, 'COLLISIMO');

            expect(shipment.trackingNumber).toBeDefined();
            expect(ordersRepo.updateStatus).toHaveBeenCalledWith(orderId, 'SHIPPING_IN_PROGRESS');
        });

        it('devrait lancer une erreur si la commande n\'est pas payée', async () => {
            ordersRepo.findById.mockResolvedValue({ id: 'order_123', status: 'PENDING' });

            await expect(shippingService.createShipment('order_123'))
                .rejects.toThrow('La commande doit être payée avant expédition');
        });
    });

    describe('updateTracking', () => {
        it('devrait passer la commande à COMPLETED si le statut est DELIVERED', async () => {
            const shipmentId = 'ship_1';
            shipmentsRepo.findById.mockResolvedValue({ id: shipmentId, orderId: 'order_123' });
            shipmentsRepo.update.mockResolvedValue({ status: 'DELIVERED' });

            await shippingService.updateTracking(shipmentId, 'DELIVERED');

            expect(ordersRepo.updateStatus).toHaveBeenCalledWith('order_123', 'COMPLETED');
        });
    });
});