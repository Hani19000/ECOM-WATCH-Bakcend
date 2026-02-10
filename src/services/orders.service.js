/**
 * @module Service/Order
 *
 * Orchestre la finalisation d'achat (checkout) et le cycle de vie des commandes.
 */
import { ordersRepo, inventoryRepo, cartsRepo, shipmentsRepo } from '../repositories/index.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { pgPool } from '../config/database.js';

class OrderService {
    constructor() {
        if (OrderService.instance) return OrderService.instance;
        OrderService.instance = this;
        Object.freeze(this);
    }

    /**
     * Convertit un panier en commande de façon atomique.
     * La transaction couvre à la fois la réservation du stock et la création de la commande :
     * un échec sur n'importe quelle étape annule l'ensemble pour éviter les incohérences.
     */
    async createOrderFromCart(userId, { shippingAddressId }) {
        const client = await pgPool.connect();
        try {
            await client.query('BEGIN');

            const cart = await cartsRepo.findByUserId(userId);
            if (!cart) throw new AppError('Panier introuvable', HTTP_STATUS.NOT_FOUND);

            const cartItems = await cartsRepo.listItems(cart.id);
            if (!cartItems.length) throw new AppError('Le panier est vide', HTTP_STATUS.BAD_REQUEST);

            const totalAmount = cartItems.reduce(
                (sum, item) => sum + Number(item.price) * item.quantity,
                0
            );

            for (const item of cartItems) {
                await inventoryRepo.reserve(item.variantId, item.quantity, client);
            }

            const order = await ordersRepo.createOrder(client, {
                userId,
                subtotalAmount: totalAmount,
                totalAmount,
                shippingAddress: shippingAddressId,
                status: 'PENDING',
            });

            for (const item of cartItems) {
                await ordersRepo.addItem(client, {
                    orderId: order.id,
                    variantId: item.variantId,
                    productName: item.productName,
                    unitPrice: item.price,
                    quantity: item.quantity,
                });
            }

            await cartsRepo.clearCart(cart.id);
            await client.query('COMMIT');

            return order;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Déclenche les effets de bord associés au changement de statut :
     * création d'un shipment pour SHIPPED, libération du stock pour CANCELLED.
     */
    async updateOrderStatus(orderId, newStatus) {
        const order = await ordersRepo.findById(orderId);
        if (!order) throw new AppError('Commande introuvable', HTTP_STATUS.NOT_FOUND);

        const updatedOrder = await ordersRepo.updateStatus(orderId, newStatus);

        if (newStatus === 'SHIPPED') {
            await shipmentsRepo.create({ orderId });
        }

        if (newStatus === 'CANCELLED') {
            const items = await ordersRepo.listItems(orderId);
            for (const item of items) {
                await inventoryRepo.release(item.variantId, item.quantity);
            }
        }

        return updatedOrder;
    }

    async getUserOrders(userId) {
        return await ordersRepo.listByUserId(userId);
    }

    /**
     * L'accès au détail d'une commande est restreint au propriétaire ou à un admin
     * pour éviter l'exposition des données d'achat d'un utilisateur à un autre.
     */
    async getOrderDetails(orderId, user) {
        const order = await ordersRepo.findById(orderId);
        if (!order) throw new AppError('Commande introuvable', HTTP_STATUS.NOT_FOUND);

        if (order.userId !== user.id && user.role !== 'ADMIN') {
            throw new AppError('Accès non autorisé', HTTP_STATUS.FORBIDDEN);
        }

        return order;
    }

    async listAllOrders(queryParams) {
        const { status, userId, page = 1, limit = 20 } = queryParams;

        const offset = (page - 1) * limit;

        const result = await ordersRepo.findAll({
            status,
            userId,
            limit: parseInt(limit),
            offset: parseInt(offset),
        });

        return {
            data: result.orders,
            pagination: {
                total: result.total,
                page: parseInt(page),
                limit: parseInt(limit),
                totalPages: Math.ceil(result.total / limit),
            },
        };
    }
}

export const orderService = new OrderService();