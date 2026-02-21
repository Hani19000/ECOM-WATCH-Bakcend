/**
 * @module Service/Notification
 *
 * Service d'orchestration des notifications multi-canaux.
 * Responsabilité : décider QUAND et QUEL email envoyer selon les événements métier.
 */
import { emailService } from './email.service.js';
import { usersRepo } from '../../repositories/users.repo.js';
import { logger } from '@sentry/node';

class NotificationService {
    constructor() {
        if (NotificationService.instance) return NotificationService.instance;
        NotificationService.instance = this;
        Object.freeze(this);
    }

    /**
     * Récupère l'email du destinataire (supporte les Guest et les Users inscrits).
     * @private
     */
    async _getCustomerEmail(userId, orderData) {
        // 1. On regarde en priorité si une adresse email a été saisie lors du checkout (valable pour Guest et User)
        if (orderData?.shippingAddress?.email) {
            return orderData.shippingAddress.email;
        }

        // 2. Si pas d'email dans la commande mais qu'on a un userId, on cherche dans la BDD
        if (userId) {
            const user = await usersRepo.findById(userId);
            if (user && user.email) return user.email;
        }

        return null;
    }

    async notifyOrderPaid(email, orderData) {
        emailService.sendOrderConfirmation(email, orderData).catch(error => {
            logger.error(`Échec notification confirmation commande #${orderData.id}:`, error);
        });
        logger.info(`Notification confirmation commande #${orderData.id} envoyée à ${email}`);
    }

    async notifyOrderShipped(email, orderData, shipmentData = {}) {
        emailService.sendOrderShipped(email, orderData, shipmentData).catch(error => {
            logger.error(`Échec notification expédition commande #${orderData.id}:`, error);
        });
        logger.info(`Notification expédition commande #${orderData.id} envoyée à ${email}`);
    }

    async notifyOrderDelivered(email, orderData) {
        emailService.sendOrderDelivered(email, orderData).catch(error => {
            logger.error(`Échec notification livraison commande #${orderData.id}:`, error);
        });
        logger.info(`Notification livraison commande #${orderData.id} envoyée à ${email}`);
    }

    async notifyOrderCancelled(email, orderData, reason = null) {
        emailService.sendOrderCancelled(email, orderData, reason).catch(error => {
            logger.error(`Échec notification annulation commande #${orderData.id}:`, error);
        });
        logger.info(`Notification annulation commande #${orderData.id} envoyée à ${email}`);
    }

    // NOUVEAU : Méthode générique pour les autres statuts (En préparation, Remboursé...)
    async notifyOrderGenericUpdate(email, orderData, newStatus) {
        emailService.sendOrderStatusUpdate(email, orderData, newStatus).catch(error => {
            logger.error(`Échec notification MAJ générique commande #${orderData.id}:`, error);
        });
        logger.info(`Notification MAJ statut (${newStatus}) commande #${orderData.id} envoyée à ${email}`);
    }

    /**
     * Orchestre l'envoi de notifications selon le nouveau statut de commande.
     */
    async notifyOrderStatusChange(previousStatus, newStatus, userId, orderData, additionalData = {}) {
        if (previousStatus === newStatus) return;

        // Récupération universelle de l'email (Inscrits + Invités)
        const email = await this._getCustomerEmail(userId, orderData);

        if (!email) {
            logger.warn(`Impossible d'envoyer l'email pour la commande #${orderData.id} : Email introuvable.`);
            return;
        }

        // Sélection de la notification appropriée selon le nouveau statut
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
                // CORRECTION : Appel à la méthode générique pour PROCESSING, REFUNDED, etc.
                await this.notifyOrderGenericUpdate(email, orderData, newStatus);
                break;
        }
    }

    // ... (garde tes fonctions notifyUserRegistered et notifyPasswordReset intactes ici) ...
    async notifyUserRegistered(userData) {
        if (!userData.email) {
            logger.warn('Impossible d\'envoyer email bienvenue : email manquant');
            return;
        }
        emailService.sendWelcomeEmail(userData.email, userData).catch(error => {
            logger.error(`Échec envoi email bienvenue à ${userData.email}:`, error);
        });
        logger.info(`Email de bienvenue envoyé à ${userData.email}`);
    }

    async notifyPasswordReset(email, resetToken) {
        const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}`;
        emailService.sendPasswordReset(email, resetToken, resetUrl).catch(error => {
            logger.error(`Échec envoi email reset password à ${email}:`, error);
        });
        logger.info(`Email de réinitialisation de mot de passe envoyé à ${email}`);
    }
}

export const notificationService = new NotificationService();