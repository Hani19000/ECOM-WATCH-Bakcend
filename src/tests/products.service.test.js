import { describe, it, expect, vi, beforeEach } from 'vitest';

// 1. Mock des repositories (L'ordre est crucial : AVANT les imports du service)
vi.mock('../repositories/index.js', () => ({
    productsRepo: {
        findById: vi.fn(),
        findBySlug: vi.fn(),
        listVariantsByProduct: vi.fn()
    },
    inventoryRepo: {
        findByVariantId: vi.fn().mockResolvedValue({ availableStock: 10 })
    }
}));

// Mock de pgPool pour les transactions
vi.mock('../config/database.js', () => ({
    pgPool: {
        connect: vi.fn().mockResolvedValue({
            query: vi.fn(),
            release: vi.fn()
        })
    }
}));

// 2. Imports du code
import { productsRepo, inventoryRepo } from '../repositories/index.js';
import { productService } from '../services/products.service.js';
import { AppError } from '../utils/appError.js';

describe('ProductsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('devrait retourner un produit complet avec stocks si le Slug existe', async () => {
        const mockProduct = { id: 'p-1', name: 'Montre Luxe' };
        const mockVariants = [{ id: 'v-1', sku: 'ML-01', price: 500 }];

        productsRepo.findBySlug.mockResolvedValue(mockProduct);
        productsRepo.listVariantsByProduct.mockResolvedValue(mockVariants);
        inventoryRepo.findByVariantId.mockResolvedValue({ availableStock: 42 });

        const result = await productService.getProductDetails('montre-luxe');

        expect(result.name).toBe('Montre Luxe');
        expect(result.variants[0].inventory.availableStock).toBe(42);
        expect(productsRepo.findBySlug).toHaveBeenCalledWith('montre-luxe');
    });

    it('devrait lancer une erreur 404 si le produit n\'existe pas', async () => {
        productsRepo.findBySlug.mockResolvedValue(null);

        await expect(productService.getProductDetails('inconnu'))
            .rejects.toThrow(AppError);
    });
});