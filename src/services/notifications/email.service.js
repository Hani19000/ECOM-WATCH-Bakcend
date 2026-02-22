/**
 * @module Service/Email
 *
 * Service d'envoi d'emails transactionnels via Resend.
 * Isolé pour permettre le changement de provider (Resend → SendGrid → SES)
 * sans impacter les services métier, et pour centraliser la gestion d'erreur.
 */
import { Resend } from 'resend';
import { ENV } from '../../config/environment.js';
import { logInfo, logError } from '../../utils/logger.js';
import { emailTemplates } from '../templates/email/index.js';

class EmailService {
    constructor() {
        if (EmailService.instance) return EmailService.instance;

        this.resend = new Resend(ENV.resend?.apiKey);
        this.fromEmail = ENV.resend?.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
        this.fromName = ENV.resend?.RESEND_FROM_NAME || 'ECOM-WATCH';

        EmailService.instance = this;
        Object.freeze(this);
    }

    /**
     * Méthode générique d'envoi avec gestion d'erreur centralisée.
     * L'envoi d'email ne doit jamais bloquer ni faire échouer le flux métier appelant.
     *
     * @private
     * @param {{ to: string, subject: string, html: string, text?: string }} emailData
     * @returns {Promise<Object|null>} Résultat Resend, ou null en cas d'échec
     */
    async _sendEmail({ to, subject, html, text = null }) {
        try {
            const result = await this.resend.emails.send({
                from: `${this.fromName} <${this.fromEmail}>`,
                to,
                subject,
                html,
                text: text || this._stripHtml(html),
            });

            logInfo(`Email envoyé à ${to} — sujet : ${subject}`);
            return result;
        } catch (error) {
            logError(error, { context: 'EmailService._sendEmail', to, subject });
            return null;
        }
    }

    /**
     * Supprime les balises HTML pour générer une version texte brut.
     * Fallback pour les clients email ne supportant pas HTML.
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
     * Confirmation de commande payée.
     * Envoyé après réception du webhook Stripe (checkout.session.completed).
     */
    async sendOrderConfirmation(to, orderData) {
        const { subject, html } = emailTemplates.orderConfirmation(orderData);
        return this._sendEmail({ to, subject, html });
    }

    /**
     * Notification d'expédition.
     * Envoyé lorsque l'admin change le statut de la commande à SHIPPED.
     */
    async sendOrderShipped(to, orderData, shipmentData = {}) {
        const { subject, html } = emailTemplates.orderShipped({
            ...orderData,
            trackingNumber: shipmentData.trackingNumber,
            carrier: shipmentData.carrier,
            estimatedDelivery: shipmentData.estimatedDelivery,
        });
        return this._sendEmail({ to, subject, html });
    }

    /**
     * Confirmation de livraison.
     * Envoyé lorsque l'admin change le statut de la commande à DELIVERED.
     */
    async sendOrderDelivered(to, orderData) {
        const { subject, html } = emailTemplates.orderDelivered(orderData);
        return this._sendEmail({ to, subject, html });
    }

    /**
     * Notification d'annulation de commande.
     * Confirme que le remboursement sera traité si applicable.
     *
     * @param {string|null} reason - Raison de l'annulation (optionnel)
     */
    async sendOrderCancelled(to, orderData, reason = null) {
        const { subject, html } = emailTemplates.orderCancelled({
            ...orderData,
            cancellationReason: reason,
        });
        return this._sendEmail({ to, subject, html });
    }

    /**
     * Notification générique de changement de statut.
     * Fallback pour les statuts futurs sans template dédié (PROCESSING, REFUNDED...).
     */
    async sendOrderStatusUpdate(to, orderData, newStatus) {
        const { subject, html } = emailTemplates.orderStatusUpdate({
            ...orderData,
            newStatus,
        });
        return this._sendEmail({ to, subject, html });
    }

    /**
     * Email de bienvenue après inscription.
     */
    async sendWelcomeEmail(to, userData) {
        const { subject, html } = emailTemplates.welcome(userData);
        return this._sendEmail({ to, subject, html });
    }

    /**
     * Lien de réinitialisation de mot de passe.
     */
    async sendPasswordReset(to, resetToken, resetUrl) {
        const { subject, html } = emailTemplates.passwordReset({ resetToken, resetUrl });
        return this._sendEmail({ to, subject, html });
    }
}

export const emailService = new EmailService();