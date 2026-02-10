import { describe, it, expect, vi } from 'vitest';

// Mock du service pour isoler le controller
vi.mock('../services/cart.service.js', () => ({
    cartService: {
        getCartByUserId: vi.fn()
    }
}));

import { cartController } from '../controllers/cart.controller.js';
import { cartService } from '../services/cart.service.js';

describe('CartController', () => {
    it('devrait retourner le panier de l\'utilisateur avec un statut 200', async () => {
        const mockCart = { items: [], total: 0 };
        cartService.getCartByUserId.mockResolvedValue(mockCart);

        const req = { user: { id: 'user-123' } };
        const res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn()
        };

        await cartController.getCart(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            status: 'success',
            data: { cart: mockCart }
        });
    });
});