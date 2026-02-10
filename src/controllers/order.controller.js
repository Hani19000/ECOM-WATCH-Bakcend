/**
 * @module Controller/Order
 *
 * Gère le cycle de vie des commandes (Checkout, Historique, Statuts).
 * Le contrôleur délègue toute la logique transactionnelle au service
 * (vérification des stocks, calcul des totaux, atomicité SQL).
 */
import { orderService } from '../services/orders.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class OrderController {
    /**
     * Checkout : transforme le panier en commande.
     * Le service gère la transaction SQL et la vérification des stocks en une seule opération.
     */
    checkout = asyncHandler(async (req, res) => {
        const { shippingAddressId, paymentMethod } = req.body;

        const order = await orderService.createOrderFromCart(req.user.id, {
            shippingAddressId,
            paymentMethod,
        });

        res.status(HTTP_STATUS.CREATED).json({
            status: 'success',
            message: 'Commande initialisée avec succès',
            data: { order },
        });
    });

    /** Historique des commandes de l'utilisateur connecté */
    getMyOrders = asyncHandler(async (req, res) => {
        const orders = await orderService.getUserOrders(req.user.id);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            results: orders.length,
            data: { orders },
        });
    });

    /**
     * Détails d'une commande.
     * On passe req.user pour que le service vérifie les droits (propriétaire ou admin)
     * sans dupliquer cette vérification dans le contrôleur.
     */
    getOrderDetail = asyncHandler(async (req, res) => {
        const { orderId } = req.params;
        const order = await orderService.getOrderDetails(orderId, req.user);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { order },
        });
    });

    /**
     * ADMINISTRATION : Liste paginée et filtrée de toutes les commandes.
     * Les paramètres de pagination/filtrage sont normalisés ici avant d'atteindre le service.
     */
    getAllOrders = asyncHandler(async (req, res) => {
        const queryParams = {
            status: req.query.status || null,
            userId: req.query.userId || null,
            page: parseInt(req.query.page, 10) || 1,
            limit: parseInt(req.query.limit, 10) || 20,
        };

        const result = await orderService.listAllOrders(queryParams);

        res.status(HTTP_STATUS.OK).json({
            success: true,
            ...result,
        });
    });

    /**
     * ADMINISTRATION : Mise à jour du statut d'une commande.
     * Ex: PENDING → PAID → SHIPPED → DELIVERED
     */
    updateStatus = asyncHandler(async (req, res) => {
        const { orderId } = req.params;
        const { status } = req.body;

        const updatedOrder = await orderService.updateOrderStatus(orderId, status);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: `Statut de la commande mis à jour : ${status}`,
            data: { order: updatedOrder },
        });
    });
}

export const orderController = new OrderController();