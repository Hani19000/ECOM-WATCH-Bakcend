/**
 * @module Controller/Shipping
 *
 * Gère les adresses de livraison et la logistique transporteurs.
 * Les adresses sont liées à un utilisateur — toutes les opérations
 * passent l'userId pour isoler les données par compte.
 */
import { shippingService } from '../services/shipping.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class ShippingController {
    /** Carnet d'adresses de l'utilisateur connecté */
    getAddresses = asyncHandler(async (req, res) => {
        const addresses = await shippingService.getUserAddresses(req.user.id);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            results: addresses.length,
            data: { addresses },
        });
    });

    /**
     * Ajoute une adresse au carnet.
     * Les champs sont extraits explicitement pour éviter toute injection de propriétés non autorisées (mass assignment).
     */
    addAddress = asyncHandler(async (req, res) => {
        const {
            title, firstName, lastName, street, city,
            zipCode, country, phone, isDefault,
        } = req.body;

        const address = await shippingService.createAddress(req.user.id, {
            title, firstName, lastName, street, city,
            zipCode, country, phone, isDefault,
        });

        res.status(HTTP_STATUS.CREATED).json({
            status: 'success',
            data: { address },
        });
    });

    /** Supprime une adresse du carnet */
    deleteAddress = asyncHandler(async (req, res) => {
        const { addressId } = req.params;
        await shippingService.deleteAddress(req.user.id, addressId);

        res.status(HTTP_STATUS.NO_CONTENT).send();
    });

    /**
     * Estime les frais de livraison avant le checkout.
     * Permet au frontend d'afficher le coût total avant confirmation de commande.
     */
    getRates = asyncHandler(async (req, res) => {
        const { cartId, zipCode, country } = req.body;
        const rates = await shippingService.calculateRates(cartId, { zipCode, country });

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { rates },
        });
    });

    /** ADMINISTRATION : Met à jour le numéro de suivi d'une commande expédiée */
    updateTracking = asyncHandler(async (req, res) => {
        const { orderId } = req.params;
        const { carrier, trackingNumber } = req.body;

        const shipment = await shippingService.updateTracking(orderId, { carrier, trackingNumber });

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Informations de suivi mises à jour',
            data: { shipment },
        });
    });
}

export const shippingController = new ShippingController();