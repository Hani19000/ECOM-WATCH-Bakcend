import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock de la Database
vi.mock('../config/database.js', () => ({
    pgPool: {
        connect: vi.fn().mockResolvedValue({
            query: vi.fn().mockResolvedValue({ rows: [] }),
            release: vi.fn()
        })
    }
}));

// 2. Mock des Repositories (Alignés sur les noms réels)
vi.mock('../repositories/index.js', () => ({
    ordersRepo: {
        create: vi.fn(),
        addItem: vi.fn(),
        updateStatus: vi.fn(),
        listItems: vi.fn()
    },
    inventoryRepo: {
        reserve: vi.fn().mockResolvedValue(true),
        release: vi.fn()
    },
    cartsRepo: {
        listItems: vi.fn(), // Utilisé à l'étape 1 du service
        clearCart: vi.fn()  // Utilisé à l'étape 6 du service
    },
    shipmentsRepo: {
        create: vi.fn()
    }
}));

import { orderService } from '../services/orders.service.js';
import { ordersRepo, cartsRepo, inventoryRepo } from '../repositories/index.js';

describe('OrderService', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('devrait créer une commande et vider le panier', async () => {
        const userId = 'u-1';
        const cartId = 'c-1';
        const shippingAddress = '123 Rue de la Montre';

        const mockItems = [
            { variantId: 'v-1', price: 100, quantity: 2 }
        ];

        // Configuration des mocks pour suivre le flux du service
        cartsRepo.listItems.mockResolvedValue(mockItems);
        ordersRepo.create.mockResolvedValue({ id: 'order-999', status: 'PENDING' });
        ordersRepo.addItem.mockResolvedValue({ id: 'item-1' });

        const order = await orderService.createOrderFromCart(userId, cartId, shippingAddress);

        // Assertions
        expect(order.status).toBe('PENDING');
        expect(order.id).toBe('order-999');
        expect(inventoryRepo.reserve).toHaveBeenCalled();
        expect(cartsRepo.clearCart).toHaveBeenCalledWith(cartId, expect.anything());
    });
});