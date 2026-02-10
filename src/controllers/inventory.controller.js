/**
 * @module Controller/Inventory
 *
 * Interface pour la gestion logistique des stocks.
 * Les opérations d'ajustement sont réservées aux admins ;
 * la lecture du stock peut être exposée à des rôles plus larges selon le contexte.
 */
import { inventoryService } from '../services/inventory.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class InventoryController {
    /** État du stock pour une variante — utile pour l'affichage "en stock / rupture" */
    getStock = asyncHandler(async (req, res) => {
        const { variantId } = req.params;
        const stock = await inventoryService.getStockLevel(variantId);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { stock },
        });
    });

    /**
     * Ajustement manuel du stock (positif ou négatif).
     * Couvre les cas : réception de marchandise, perte, correction d'inventaire.
     */
    adjustStock = asyncHandler(async (req, res) => {
        const { variantId } = req.params;
        const { quantity, reason } = req.body;

        const updatedStock = await inventoryService.adjustStock(variantId, quantity, reason);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Stock mis à jour avec succès',
            data: { stock: updatedStock },
        });
    });

    /**
     * ADMINISTRATION : Alertes de stock bas.
     * Permet de déclencher les réassorts avant d'atteindre la rupture.
     */
    getLowStockAlerts = asyncHandler(async (req, res) => {
        const alerts = await inventoryService.getLowStockAlerts();

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            results: alerts.length,
            data: { alerts },
        });
    });

    /** Réapprovisionne une variante suite à une réception de stock */
    addStock = asyncHandler(async (req, res) => {
        const { variantId } = req.params;
        const { quantity } = req.body;

        const stock = await inventoryService.restockVariant(variantId, parseInt(quantity, 10));

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Stock mis à jour avec succès',
            data: { stock },
        });
    });
}

export const inventoryController = new InventoryController();