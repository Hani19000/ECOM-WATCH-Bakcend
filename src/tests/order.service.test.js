import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/database.js', () => ({
    pgPool: {
        connect: vi.fn().mockResolvedValue({
            query: vi.fn().mockResolvedValue({ rows: [] }),
            release: vi.fn()
        })
    }
}));

vi.mock('../repositories/index.js', () => ({
    ordersRepo: {
        createOrder: vi.fn(),
        addItem: vi.fn(),
        updateStatus: vi.fn(),
        listItems: vi.fn()
    },
    inventoryRepo: {
        reserve: vi.fn().mockResolvedValue(true),
        release: vi.fn()
    },
    cartsRepo: {
        listItems: vi.fn(),
        clearCart: vi.fn()
    },
    shipmentsRepo: {
        create: vi.fn()
    },
    productsRepo: {
        findActivePromotionPrice: vi.fn().mockResolvedValue(null)
    }
}));

import { orderService } from '../services/orders.service.js';
import { ordersRepo, cartsRepo, inventoryRepo } from '../repositories/index.js';

describe('OrderService', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('devrait créer une commande et vider le panier', async () => {
        const userId = 'u-1';
        const shippingAddress = { addressLine1: '123 Rue de la Montre', city: 'Paris', country: 'France' };
        const mockItems = [
            { variantId: 'v-1', price: 100, quantity: 2 }
        ];

        cartsRepo.listItems.mockResolvedValue(mockItems);
        ordersRepo.createOrder.mockResolvedValue({ id: 'order-999', status: 'PENDING' });
        ordersRepo.addItem.mockResolvedValue({ id: 'item-1' });

        const order = await orderService.createOrderFromCart(userId, {
            items: mockItems,
            shippingAddress: shippingAddress,
            shippingMethod: 'STANDARD'
        });

        expect(order.status).toBe('PENDING');
        expect(order.id).toBe('order-999');
        expect(inventoryRepo.reserve).toHaveBeenCalled();
    });
});