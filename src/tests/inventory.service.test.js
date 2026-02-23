import { describe, it, expect, vi, beforeEach } from 'vitest';
// 1. D'abord les mocks (avant les imports du code à tester)
vi.mock('../repositories/index.js', () => ({
    inventoryRepo: {
        findByVariantId: vi.fn(),
        upsert: vi.fn(),
    },
    productsRepo: {
        findVariantById: vi.fn(),
        findById: vi.fn()
    }
}));

import { inventoryService } from '../services/inventory.service.js';
import { inventoryRepo, productsRepo } from '../repositories/index.js';

describe('InventoryService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('devrait augmenter le stock lors d\'un réapprovisionnement', async () => {
        const variantId = 'v-1';

        // Configuration des mocks
        productsRepo.findVariantById.mockResolvedValue({ id: variantId, productId: 'p-1' });
        inventoryRepo.findByVariantId.mockResolvedValue({ availableStock: 10 });
        inventoryRepo.upsert.mockResolvedValue({ variantId, availableStock: 15 });

        // Action
        const result = await inventoryService.adjustStock(variantId, 5, 'RESTOCK');

        // Assertions
        expect(result.availableStock).toBe(15);
        expect(inventoryRepo.upsert).toHaveBeenCalledWith({
            variantId: 'v-1',
            availableStock: 15
        });
    });
});