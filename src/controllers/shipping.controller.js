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
import { AppError } from '../utils/appError.js';
import { validateRequired } from '../utils/validation.js';

const ALLOWED_SHIPMENT_STATUSES = [
    'PREPARING',
    'SHIPPED',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'FAILED',
    'RETURNED',
];

class ShippingController {
    /**
     * GET /api/v1/shipping/addresses
     * Carnet d'adresses de l'utilisateur connecté.
     */
    getAddresses = asyncHandler(async (req, res) => {
        const addresses = await shippingService.getUserAddresses(req.user.id);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            results: addresses.length,
            data: { addresses },
        });
    });

    /**
     * POST /api/v1/shipping/addresses
     * Ajoute une adresse au carnet.
     *
     * Les champs sont extraits explicitement pour prévenir le mass assignment.
     */
    addAddress = asyncHandler(async (req, res) => {
        const {
            title,
            firstName,
            lastName,
            street,
            city,
            zipCode,
            country,
            phone,
            isDefault,
        } = req.body;

        validateRequired(req.body, ['firstName', 'lastName', 'street', 'city', 'zipCode', 'country']);

        const address = await shippingService.createAddress(req.user.id, {
            title,
            firstName,
            lastName,
            street,
            city,
            zipCode,
            country,
            phone,
            isDefault,
        });

        res.status(HTTP_STATUS.CREATED).json({
            status: 'success',
            message: 'Adresse ajoutée avec succès',
            data: { address },
        });
    });

    /**
     * DELETE /api/v1/shipping/addresses/:addressId
     */
    deleteAddress = asyncHandler(async (req, res) => {
        await shippingService.deleteAddress(req.user.id, req.params.addressId);
        res.status(HTTP_STATUS.NO_CONTENT).send();
    });

    /**
     * POST /api/v1/shipping/calculate
     * Calcule toutes les options de livraison disponibles (STANDARD, EXPRESS, RELAY)
     * pour un pays et un poids donnés.
     */
    calculateOptions = asyncHandler(async (req, res) => {
        const { country, totalWeight, cartSubtotal = 0 } = req.body;

        if (!country || totalWeight === undefined) {
            throw new AppError(
                'Les champs country et totalWeight sont requis',
                HTTP_STATUS.BAD_REQUEST
            );
        }

        if (totalWeight < 0) {
            throw new AppError('Le poids ne peut pas être négatif', HTTP_STATUS.BAD_REQUEST);
        }

        const options = await shippingService.getAvailableOptions(country, totalWeight, cartSubtotal);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { country, totalWeight, cartSubtotal, options },
        });
    });

    /**
     * POST /api/v1/shipping/rates
     * Estime les frais de livraison avant le checkout.
     */
    getRates = asyncHandler(async (req, res) => {
        const { cartId, country } = req.body;

        if (!country) {
            throw new AppError('Le champ country est requis', HTTP_STATUS.BAD_REQUEST);
        }

        const rates = await shippingService.calculateRates(cartId, { country });

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { rates },
        });
    });

    /**
     * GET /api/v1/shipping/track/:orderId
     * Récupère les informations d'expédition d'une commande.
     */
    getTracking = asyncHandler(async (req, res) => {
        const shipment = await shippingService.getShipmentByOrder(req.params.orderId);

        if (!shipment) {
            throw new AppError(
                'Aucune expédition trouvée pour cette commande',
                HTTP_STATUS.NOT_FOUND
            );
        }

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { shipment },
        });
    });

    /**
     * POST /api/v1/shipping/shipments/:orderId
     * ADMINISTRATION : Crée une expédition pour une commande.
     */
    createShipment = asyncHandler(async (req, res) => {
        const { orderId } = req.params;
        const { carrier = 'COLISSIMO' } = req.body;

        const shipment = await shippingService.createShipment(orderId, carrier);

        res.status(HTTP_STATUS.CREATED).json({
            status: 'success',
            message: 'Expédition créée avec succès',
            data: { shipment },
        });
    });

    /**
     * PATCH /api/v1/shipping/shipments/:shipmentId
     * ADMINISTRATION : Met à jour le statut et la localisation d'une expédition.
     * Si status = 'DELIVERED', la commande passe automatiquement en 'COMPLETED'.
     */
    updateTracking = asyncHandler(async (req, res) => {
        const { shipmentId } = req.params;
        const { status, currentLocation = '' } = req.body;

        if (!status) {
            throw new AppError('Le champ status est requis', HTTP_STATUS.BAD_REQUEST);
        }

        if (!ALLOWED_SHIPMENT_STATUSES.includes(status)) {
            throw new AppError(
                `Statut invalide. Valeurs autorisées : ${ALLOWED_SHIPMENT_STATUSES.join(', ')}`,
                HTTP_STATUS.BAD_REQUEST
            );
        }

        const shipment = await shippingService.updateTracking(shipmentId, status, currentLocation);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Informations de suivi mises à jour',
            data: { shipment },
        });
    });
}

export const shippingController = new ShippingController();