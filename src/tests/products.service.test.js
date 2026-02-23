import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../repositories/index.js', () => ({
    productsRepo: {
        findById: vi.fn(),
        findBySlug: vi.fn(),
        listVariantsByProduct: vi.fn(),
        getFullDetails: vi.fn()
    },
    inventoryRepo: {
        findByVariantId: vi.fn().mockResolvedValue({ availableStock: 10 })
    }
}));

vi.mock('../config/database.js', () => ({
    pgPool: {
        connect: vi.fn().mockResolvedValue({
            query: vi.fn(),
            release: vi.fn()
        })
    }
}));

import { productsRepo, inventoryRepo } from '../repositories/index.js';
import { productService } from '../services/products.service.js';
import { AppError } from '../utils/appError.js';

describe('ProductsService', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('devrait retourner un produit complet avec stocks si le Slug existe', async () => {
        const mockProduct = { id: 'p-1', name: 'Montre Luxe', variants: [{ id: 'v-1', inventory: { availableStock: 42 } }] };

        productsRepo.getFullDetails.mockResolvedValue(mockProduct);

        const result = await productService.getProductDetails('montre-luxe');

        expect(result.name).toBe('Montre Luxe');
        expect(productsRepo.getFullDetails).toHaveBeenCalledWith('montre-luxe', undefined);
    });

    it('devrait lancer une erreur 404 si le produit n\'existe pas', async () => {
        productsRepo.getFullDetails.mockResolvedValue(null);

        await expect(productService.getProductDetails('inconnu'))
            .rejects.toThrow(AppError);
    });
});