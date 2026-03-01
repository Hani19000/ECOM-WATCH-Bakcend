/**
 * @module Routes/Internal
 *
 * Endpoints du product-service exclusivement appelés par les services pairs.
 * Non exposés via le Gateway Nginx.
 *
 * Protégés par `X-Internal-Secret` → `fromInternalService`.
 *
 * Périmètre :
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ GET  /internal/variants/:variantId        → order + cart        │
 * │ GET  /internal/variants/:variantId/promo  → order-service       │
 * │ GET  /internal/inventory/:variantId       → cart-service        │
 * │ POST /internal/inventory/reserve          → order-service       │
 * │ POST /internal/inventory/release          → order-service       │
 * │ POST /internal/inventory/confirm          → order-service       │
 * │ GET  /internal/stats                      → admin-service       │
 * └─────────────────────────────────────────────────────────────────┘
 */
import { Router } from 'express';
import { productsRepo, inventoryRepo } from '../../repositories/index.js';
import { inventoryService } from '../services/inventory.service.js';
import { fromInternalService } from '../middleware/internal.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ValidationError } from '../utils/appError.js';

const router = Router();

// Toutes les routes /internal sont protégées par le secret
router.use(fromInternalService);

// ─────────────────────────────────────────────────────────────────────────────
// VARIANTS — lecture de données produit (sans effet de bord)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /internal/variants/:variantId
 * Retourne les données brutes d'une variante : prix, poids, productId.
 * Utilisé par l'order-service pour calculer le total de la commande
 * et par le cart-service pour valider la variante avant ajout au panier.
 */
router.get(
    '/variants/:variantId',
    asyncHandler(async (req, res) => {
        const { variantId } = req.params;

        const variant = await productsRepo.findVariantById(variantId);

        if (!variant) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                status: 'fail',
                message: 'Variante introuvable',
            });
        }

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: {
                id: variant.id,
                sku: variant.sku,
                price: parseFloat(variant.price),
                weight: parseFloat(variant.attributes?.weight ?? 0.5),
                productId: variant.productId,
                attributes: variant.attributes,
            },
        });
    })
);

/**
 * GET /internal/variants/:variantId/promo
 * Retourne le prix effectif en tenant compte des promotions actives.
 * Utilisé par l'order-service pour snapshot le prix promotionnel au checkout.
 */
router.get(
    '/variants/:variantId/promo',
    asyncHandler(async (req, res) => {
        const { variantId } = req.params;

        const promotionData = await productsRepo.findActivePromotionPrice(variantId);

        if (!promotionData) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                status: 'fail',
                message: 'Variante introuvable',
            });
        }

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: {
                basePrice: promotionData.basePrice,
                effectivePrice: promotionData.effectivePrice,
                hasPromotion: promotionData.hasPromotion,
            },
        });
    })
);

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY — opérations de stock avec effet de bord
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /internal/inventory/:variantId
 * Lecture du stock d'une variante sans cache (source de vérité DB).
 * Utilisé par le cart-service avant ajout au panier.
 */
router.get(
    '/inventory/:variantId',
    asyncHandler(async (req, res) => {
        const { variantId } = req.params;

        const inventory = await inventoryRepo.findByVariantId(variantId);

        if (!inventory) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({
                status: 'fail',
                message: 'Inventaire introuvable pour cette variante',
            });
        }

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: {
                variantId,
                availableStock: inventory.availableStock,
                reservedStock: inventory.reservedStock,
            },
        });
    })
);

/**
 * POST /internal/inventory/reserve
 * Déplace du stock de "disponible" vers "réservé" lors du checkout.
 * Retourne price + weight pour que l'order-service calcule les totaux.
 * Atomique : si available_stock < quantity, la requête échoue sans effet.
 */
router.post(
    '/inventory/reserve',
    asyncHandler(async (req, res) => {
        const { variantId, quantity } = req.body;

        if (!variantId || !quantity) {
            throw new ValidationError('Les champs variantId et quantity sont requis');
        }

        const inventoryEntry = await inventoryRepo.reserve(variantId, quantity);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: {
                variantId,
                price: parseFloat(inventoryEntry.price),
                weight: 0.5, // poids par défaut (le product-service n'a pas encore de colonne weight)
            },
        });
    })
);

/**
 * POST /internal/inventory/release
 * Restitue du stock réservé vers le disponible.
 * Appelé par l'order-service lors d'une annulation ou d'une session Stripe expirée.
 */
router.post(
    '/inventory/release',
    asyncHandler(async (req, res) => {
        const { variantId, quantity } = req.body;

        if (!variantId || !quantity) {
            throw new ValidationError('Les champs variantId et quantity sont requis');
        }

        await inventoryRepo.release(variantId, quantity);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Stock libéré',
        });
    })
);

/**
 * POST /internal/inventory/confirm
 * Confirme la sortie définitive du stock après paiement validé.
 * Le stock réservé est décrémenté sans restaurer le disponible — la marchandise est vendue.
 */
router.post(
    '/inventory/confirm',
    asyncHandler(async (req, res) => {
        const { variantId, quantity } = req.body;

        if (!variantId || !quantity) {
            throw new ValidationError('Les champs variantId et quantity sont requis');
        }

        await inventoryRepo.confirmSale(variantId, quantity);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Vente confirmée',
        });
    })
);

// ─────────────────────────────────────────────────────────────────────────────
// STATS — agrégats pour l'admin-service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /internal/stats
 * Retourne les compteurs produit pour le dashboard admin.
 * Appelé par l'admin-service qui agrège les stats de tous les services.
 */
router.get(
    '/stats',
    asyncHandler(async (req, res) => {
        const [totalProducts, lowStockCount, inventoryStats] = await Promise.all([
            productsRepo.count(),
            productsRepo.countLowStock(5),
            inventoryRepo.getStats(),
        ]);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: {
                totalProducts,
                lowStockCount,
                inventory: inventoryStats,
            },
        });
    })
);

export default router;