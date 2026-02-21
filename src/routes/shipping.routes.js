/**
 * @module Routes/Shipping
 * 
 * Routes pour la gestion des adresses et calcul des frais de livraison.
 */
import { Router } from 'express';
import { shippingController } from '../controllers/shipping.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { restrictTo } from '../middlewares/role.middleware.js';

const router = Router();

router.use(protect);

// ===================================================================
// GESTION DES ADRESSES
// ===================================================================

// Liste des adresses de l'utilisateur
router.get('/addresses', shippingController.getAddresses);

// Ajouter une adresse
router.post('/addresses', shippingController.addAddress);

// Supprimer une adresse
router.delete('/addresses/:addressId', shippingController.deleteAddress);

// ===================================================================
// CALCUL DES FRAIS DE LIVRAISON
// ===================================================================

// Calcule toutes les options de livraison disponibles
// Retourne STANDARD, EXPRESS, RELAY avec prix et délais pour chaque
router.post('/calculate', shippingController.calculateOptions);

// Estimation simple des frais (méthode legacy)
router.post('/rates', shippingController.getRates);

// ===================================================================
// SUIVI DES EXPÉDITIONS
// ===================================================================

// Suivi d'une commande
router.get('/track/:orderId', shippingController.getTracking);

// ===================================================================
// ROUTES ADMINISTRATION
// ===================================================================

// Créer une expédition pour une commande
router.post('/shipments/:orderId', restrictTo('ADMIN'), shippingController.createShipment);

// Mettre à jour le statut de livraison
router.patch('/shipments/:shipmentId', restrictTo('ADMIN'), shippingController.updateTracking);

export default router;