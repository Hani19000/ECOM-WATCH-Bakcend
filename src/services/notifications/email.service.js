/**
 * @module Service/Email
 *
 * Service d'envoi d'emails transactionnels via Resend.
 * Architecture modulaire permettant l'ajout facile de nouveaux types d'emails.
 * 
 * Pourquoi Resend plutôt que Nodemailer :
 * - API moderne et simple à utiliser
 * - Templates React/JSX natifs (optionnel)
 * - Meilleure délivrabilité (réputation IP partagée optimisée)
 * - Analytics intégrés (taux d'ouverture, clics)
 * - Pas de configuration SMTP complexe
 * 
 * Pourquoi ce service est isolé :
 * - Permet de changer facilement de provider (Resend → SendGrid → SES)
 * - Centralise la logique de retry et d'error handling
 * - Facilite les tests unitaires via mocking
 * - Sépare la génération du contenu de l'envoi
 */
import { Resend } from 'resend';
import { ENV } from '../../config/environment.js';
import { logger } from '@sentry/node';
import { emailTemplates } from '../templates/email/index.js';

class EmailService {
    constructor() {
        if (EmailService.instance) return EmailService.instance;

        // Initialisation du client Resend
        this.resend = new Resend(ENV.resend?.apiKey);
        this.fromEmail = ENV.resend?.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
        this.fromName = ENV.resend?.RESEND_FROM_NAME || 'ECOM-WATCH';

        EmailService.instance = this;
        Object.freeze(this);
    }

    /**
     * Méthode générique d'envoi d'email avec gestion d'erreur robuste.
     * 
     * Pourquoi une méthode privée générique :
     * - Évite la duplication du code de retry et logging
     * - Centralise la gestion des erreurs
     * - Permet d'ajouter facilement du monitoring (Sentry, DataDog)
     * - Facilite l'ajout de features (rate limiting, queuing)
     * 
     * @private
     * @param {Object} emailData - Données de l'email (to, subject, html)
     * @returns {Promise<Object>} Résultat de l'envoi
     */
    async _sendEmail({ to, subject, html, text = null }) {
        try {
            const result = await this.resend.emails.send({
                from: `${this.fromName} <${this.fromEmail}>`,
                to,
                subject,
                html,
                text: text || this._stripHtml(html), // Fallback texte brut
            });

            logger.info(`Email envoyé avec succès à ${to}`, {
                emailId: result.id,
                subject,
            });

            return result;
        } catch (error) {
            // L'envoi d'email ne doit jamais bloquer le flux métier
            // On log l'erreur pour investigation mais on ne throw pas
            logger.error(`Échec envoi email à ${to}:`, {
                error: error.message,
                subject,
                stack: error.stack,
            });

            // En production, on pourrait envoyer à une queue de retry
            // ou à un système de monitoring (Sentry)
            return null;
        }
    }

    /**
     * Supprime les balises HTML pour générer une version texte brut.
     * Utilisé comme fallback pour les clients email ne supportant pas HTML.
     * 
     * @private
     */
    _stripHtml(html) {
        return html
            .replace(/<style[^>]*>.*<\/style>/gm, '')
            .replace(/<[^>]+>/gm, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Envoie un email de confirmation de commande payée.
     * 
     * Quand cet email est envoyé :
     * - Immédiatement après réception du webhook Stripe (checkout.session.completed)
     * - Garantit que le paiement a bien été capturé
     * 
     * @param {string} to - Email du destinataire
     * @param {Object} orderData - Détails de la commande
     * @returns {Promise<Object>}
     */
    async sendOrderConfirmation(to, orderData) {
        const { subject, html } = emailTemplates.orderConfirmation(orderData);

        return this._sendEmail({
            to,
            subject,
            html,
        });
    }

    /**
     * Envoie un email de notification d'expédition.
     * 
     * Quand cet email est envoyé :
     * - Lorsque l'admin change le statut de la commande à 'SHIPPED'
     * - Inclut le numéro de tracking si disponible
     * 
     * @param {string} to - Email du destinataire
     * @param {Object} orderData - Détails de la commande
     * @param {Object} shipmentData - Informations d'expédition (tracking, carrier)
     * @returns {Promise<Object>}
     */
    async sendOrderShipped(to, orderData, shipmentData = {}) {
        const { subject, html } = emailTemplates.orderShipped({
            ...orderData,
            trackingNumber: shipmentData.trackingNumber,
            carrier: shipmentData.carrier,
            estimatedDelivery: shipmentData.estimatedDelivery,
        });

        return this._sendEmail({
            to,
            subject,
            html,
        });
    }

    /**
     * Envoie un email de confirmation de livraison.
     * 
     * Quand cet email est envoyé :
     * - Lorsque l'admin change le statut de la commande à 'DELIVERED'
     * - Peut inclure une demande d'avis client
     * 
     * @param {string} to - Email du destinataire
     * @param {Object} orderData - Détails de la commande
     * @returns {Promise<Object>}
     */
    async sendOrderDelivered(to, orderData) {
        const { subject, html } = emailTemplates.orderDelivered(orderData);

        return this._sendEmail({
            to,
            subject,
            html,
        });
    }

    /**
     * Envoie un email de notification d'annulation de commande.
     * 
     * Quand cet email est envoyé :
     * - Lorsque l'admin ou le client annule une commande
     * - Confirme que le remboursement sera traité (si applicable)
     * 
     * @param {string} to - Email du destinataire
     * @param {Object} orderData - Détails de la commande
     * @param {string} reason - Raison de l'annulation (optionnel)
     * @returns {Promise<Object>}
     */
    async sendOrderCancelled(to, orderData, reason = null) {
        const { subject, html } = emailTemplates.orderCancelled({
            ...orderData,
            cancellationReason: reason,
        });

        return this._sendEmail({
            to,
            subject,
            html,
        });
    }

    /**
     * Envoie un email de notification de changement de statut générique.
     * 
     * Pourquoi cette méthode existe :
     * - Fallback pour les statuts personnalisés futurs
     * - Permet l'envoi d'email même si le template spécifique n'existe pas
     * 
     * @param {string} to - Email du destinataire
     * @param {Object} orderData - Détails de la commande
     * @param {string} newStatus - Nouveau statut
     * @returns {Promise<Object>}
     */
    async sendOrderStatusUpdate(to, orderData, newStatus) {
        const { subject, html } = emailTemplates.orderStatusUpdate({
            ...orderData,
            newStatus,
        });

        return this._sendEmail({
            to,
            subject,
            html,
        });
    }

    /**
     * Envoie un email de bienvenue après inscription.
     * 
     * Pourquoi cet email est important :
     * - Améliore l'engagement utilisateur dès le départ
     * - Peut inclure un code promo de bienvenue
     * - Réduit le taux de désabonnement précoce
     * 
     * @param {string} to - Email du destinataire
     * @param {Object} userData - Données utilisateur
     * @returns {Promise<Object>}
     */
    async sendWelcomeEmail(to, userData) {
        const { subject, html } = emailTemplates.welcome(userData);

        return this._sendEmail({
            to,
            subject,
            html,
        });
    }

    /**
     * Envoie un email de réinitialisation de mot de passe.
     * 
     * @param {string} to - Email du destinataire
     * @param {string} resetToken - Token de réinitialisation
     * @param {string} resetUrl - URL de réinitialisation
     * @returns {Promise<Object>}
     */
    async sendPasswordReset(to, resetToken, resetUrl) {
        const { subject, html } = emailTemplates.passwordReset({
            resetToken,
            resetUrl,
        });

        return this._sendEmail({
            to,
            subject,
            html,
        });
    }
}

export const emailService = new EmailService();