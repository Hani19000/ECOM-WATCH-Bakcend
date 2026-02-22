/**
 * @module Service/Notification
 *
 * Orchestre les notifications multi-canaux selon les événements métier.
 * Responsabilité : décider QUAND et QUEL email envoyer — pas comment l'envoyer.
 */
import { emailService } from './email.service.js';
import { usersRepo } from '../../repositories/users.repo.js';
import { ENV } from '../../config/environment.js';
import { logInfo, logError } from '../../utils/logger.js';

class NotificationService {
    constructor() {
        if (NotificationService.instance) return NotificationService.instance;
        NotificationService.instance = this;
        Object.freeze(this);
    }

    /**
     * Récupère l'email du destinataire.
     * Priorité à l'adresse de livraison (valable Guest et User),
     * fallback sur le compte utilisateur si disponible.
     *
     * @private
     */
    async _getCustomerEmail(userId, orderData) {
        if (orderData?.shippingAddress?.email) {
            return orderData.shippingAddress.email;
        }

        if (userId) {
            const user = await usersRepo.findById(userId);
            if (user?.email) return user.email;
        }

        return null;
    }

    async notifyOrderPaid(email, orderData) {
        emailService.sendOrderConfirmation(email, orderData).catch((error) =>
            logError(error, { context: 'NotificationService.notifyOrderPaid', orderId: orderData.id })
        );
        logInfo(`Notification confirmation commande #${orderData.id} envoyée à ${email}`);
    }

    async notifyOrderShipped(email, orderData, shipmentData = {}) {
        emailService.sendOrderShipped(email, orderData, shipmentData).catch((error) =>
            logError(error, { context: 'NotificationService.notifyOrderShipped', orderId: orderData.id })
        );
        logInfo(`Notification expédition commande #${orderData.id} envoyée à ${email}`);
    }

    async notifyOrderDelivered(email, orderData) {
        emailService.sendOrderDelivered(email, orderData).catch((error) =>
            logError(error, { context: 'NotificationService.notifyOrderDelivered', orderId: orderData.id })
        );
        logInfo(`Notification livraison commande #${orderData.id} envoyée à ${email}`);
    }

    async notifyOrderCancelled(email, orderData, reason = null) {
        emailService.sendOrderCancelled(email, orderData, reason).catch((error) =>
            logError(error, { context: 'NotificationService.notifyOrderCancelled', orderId: orderData.id })
        );
        logInfo(`Notification annulation commande #${orderData.id} envoyée à ${email}`);
    }

    async notifyOrderGenericUpdate(email, orderData, newStatus) {
        emailService.sendOrderStatusUpdate(email, orderData, newStatus).catch((error) =>
            logError(error, { context: 'NotificationService.notifyOrderGenericUpdate', orderId: orderData.id })
        );
        logInfo(`Notification MAJ statut (${newStatus}) commande #${orderData.id} envoyée à ${email}`);
    }

    /**
     * Orchestre l'envoi de la notification appropriée selon le nouveau statut de commande.
     * Aucune notification si le statut n'a pas changé (idempotence).
     */
    async notifyOrderStatusChange(previousStatus, newStatus, userId, orderData, additionalData = {}) {
        if (previousStatus === newStatus) return;

        const email = await this._getCustomerEmail(userId, orderData);

        if (!email) {
            logError(
                new Error('Email introuvable pour la notification de commande'),
                { context: 'NotificationService.notifyOrderStatusChange', orderId: orderData.id }
            );
            return;
        }

        switch (newStatus) {
            case 'PAID':
                await this.notifyOrderPaid(email, orderData);
                break;
            case 'SHIPPED':
                await this.notifyOrderShipped(email, orderData, additionalData.shipment);
                break;
            case 'DELIVERED':
                await this.notifyOrderDelivered(email, orderData);
                break;
            case 'CANCELLED':
                await this.notifyOrderCancelled(email, orderData, additionalData.cancellationReason);
                break;
            default:
                await this.notifyOrderGenericUpdate(email, orderData, newStatus);
                break;
        }
    }

    async notifyUserRegistered(userData) {
        if (!userData.email) {
            logError(
                new Error('Email manquant pour la notification de bienvenue'),
                { context: 'NotificationService.notifyUserRegistered' }
            );
            return;
        }
        emailService.sendWelcomeEmail(userData.email, userData).catch((error) =>
            logError(error, { context: 'NotificationService.notifyUserRegistered', email: userData.email })
        );
        logInfo(`Email de bienvenue envoyé à ${userData.email}`);
    }

    async notifyPasswordReset(email, resetToken) {
        const resetUrl = `${ENV.clientUrl}/reset-password?token=${resetToken}`;
        emailService.sendPasswordReset(email, resetToken, resetUrl).catch((error) =>
            logError(error, { context: 'NotificationService.notifyPasswordReset', email })
        );
        logInfo(`Email de réinitialisation mot de passe envoyé à ${email}`);
    }
}

export const notificationService = new NotificationService();