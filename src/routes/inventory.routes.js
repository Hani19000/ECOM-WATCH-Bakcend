/**
 * @module Routes/Inventory
 *
 * Lecture de stock : publique.
 * Ajustements et alertes : réservés aux administrateurs.
 *
 * ORDRE DES ROUTES (critique) :
 * GET /alerts doit être déclaré AVANT GET /:variantId.
 * Express évalue les routes dans l'ordre de déclaration : sans cette précaution,
 * "alerts" serait capturé comme valeur de variantId et la route admin deviendrait
 * inaccessible (appel avec variantId = "alerts").
 */
import { Router } from 'express';
import { inventoryController } from '../controllers/inventory.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { restrictTo } from '../middlewares/role.middleware.js';

const router = Router();

// Route statique déclarée en premier
router.get('/', protect, restrictTo('ADMIN'), inventoryController.getAllInventory);

// Route statique déclarée en premier — sinon capturée par /:variantId
router.get('/alerts', protect, restrictTo('ADMIN'), inventoryController.getLowStockAlerts);

// Route publique — lecture du stock d'une variante
router.get('/:variantId', inventoryController.getStock);

// Routes d'administration — mutation du stock
router.patch('/:variantId/adjust', protect, restrictTo('ADMIN'), inventoryController.adjustStock);
router.patch('/restock/:variantId', protect, restrictTo('ADMIN'), inventoryController.addStock);

export default router;