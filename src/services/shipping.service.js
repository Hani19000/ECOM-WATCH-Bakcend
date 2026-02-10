/**
 * @module Service/Shipping
 *
 * Gère les frais de port, les adresses de livraison et le suivi des expéditions.
 */
import { shipmentsRepo, ordersRepo, addressesRepo } from '../repositories/index.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class ShippingService {
    // Tarifs centralisés ici pour qu'un changement tarifaire ne nécessite
    // pas de toucher à la logique de calcul.
    #shippingRates = {
        FRANCE: { base: 5.90, perItem: 0.50 },
        EUROPE: { base: 12.50, perItem: 1.50 },
        INTERNATIONAL: { base: 25.00, perItem: 5.00 },
    };

    constructor() {
        if (ShippingService.instance) return ShippingService.instance;
        ShippingService.instance = this;
        Object.freeze(this);
    }

    async calculateRates(cartId, { country }) {
        const zone = country === 'France' ? 'FRANCE' : 'EUROPE';
        const cost = this.calculateShippingCost(zone, 1);

        return {
            carrier: 'COLLISIMO',
            price: cost,
            estimatedDays: zone === 'FRANCE' ? 2 : 5,
        };
    }

    async getUserAddresses(userId) {
        return await addressesRepo.findByUserId(userId);
    }

    async createAddress(userId, addressData) {
        const payload = {
            ...addressData,
            country: addressData.country || 'France',
            isDefault: addressData.isDefault || false,
        };

        return await addressesRepo.create(userId, payload);
    }

    async deleteAddress(userId, addressId) {
        const deleted = await addressesRepo.delete(userId, addressId);
        if (!deleted) throw new AppError('Adresse non trouvée', HTTP_STATUS.NOT_FOUND);
    }

    /**
     * La méthode est synchrone car le calcul est purement arithmétique.
     * Le fallback sur INTERNATIONAL protège contre une zone inconnue
     * sans lever d'erreur qui bloquerait le checkout.
     */
    calculateShippingCost(zone, itemCount) {
        const rate = this.#shippingRates[zone] || this.#shippingRates.INTERNATIONAL;
        return rate.base + rate.perItem * itemCount;
    }

    /**
     * Une expédition ne peut être créée que sur une commande PAID
     * pour éviter d'expédier avant confirmation du paiement.
     */
    async createShipment(orderId, carrier = 'COLLISIMO') {
        const order = await ordersRepo.findById(orderId);
        if (!order) throw new AppError('Commande introuvable', HTTP_STATUS.NOT_FOUND);

        if (order.status !== 'PAID') {
            throw new AppError('La commande doit être payée avant expédition', HTTP_STATUS.BAD_REQUEST);
        }

        const trackingNumber = `${carrier.substring(0, 3)}-${Math.random().toString(36).toUpperCase().substring(2, 10)}`;

        const shipment = await shipmentsRepo.create({
            orderId,
            carrier,
            trackingNumber,
            status: 'PREPARING',
        });

        await ordersRepo.updateStatus(orderId, 'SHIPPING_IN_PROGRESS');

        return shipment;
    }

    async updateTracking(shipmentId, status, currentLocation = '') {
        const shipment = await shipmentsRepo.findById(shipmentId);
        if (!shipment) throw new AppError('Expédition introuvable', HTTP_STATUS.NOT_FOUND);

        const updated = await shipmentsRepo.update(shipmentId, {
            status,
            currentLocation,
            updatedAt: new Date(),
        });

        // Ferme la commande dès que la livraison est confirmée.
        if (status === 'DELIVERED') {
            await ordersRepo.updateStatus(shipment.orderId, 'COMPLETED');
        }

        return updated;
    }

    async getShipmentByOrder(orderId) {
        return await shipmentsRepo.findByOrderId(orderId);
    }
}

export const shippingService = new ShippingService();