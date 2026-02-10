/**
 * @module Service/Email
 *
 * Gère l'envoi des emails transactionnels via Nodemailer.
 */
import nodemailer from 'nodemailer';
import { ENV } from '../config/environment.js';
import { logger } from '../utils/logger.js';

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: ENV.email.host,
            port: ENV.email.port,
            // secure doit être true uniquement sur le port 465 (SMTPS) ;
            // sur 587, STARTTLS prend le relais après la connexion initiale.
            secure: ENV.email.port === 465,
            auth: {
                user: ENV.email.user,
                pass: ENV.email.pass,
            },
            tls: {
                // Nécessaire sur certains serveurs SMTP dont le certificat auto-signé
                // ferait échouer la connexion en mode strict.
                rejectUnauthorized: false,
            },
        });
    }

    /**
     * L'email est envoyé de façon "best-effort" : un échec ne doit pas bloquer
     * la confirmation de commande côté API. L'erreur est capturée par Sentry
     * pour investigation sans interrompre le flux utilisateur.
     */
    async sendOrderConfirmation(to, order) {
        try {
            await this.transporter.sendMail({
                from: '"Ma Boutique" <noreply@maboutique.com>',
                to,
                subject: `Confirmation de votre commande #${order.orderNumber}`,
                html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
                        <h2 style="color: #2ecc71;">Merci pour votre achat !</h2>
                        <p>Nous avons bien reçu votre paiement pour la commande <strong>#${order.orderNumber}</strong>.</p>
                        <hr>
                        <p><strong>Montant total :</strong> ${order.totalAmount} €</p>
                        <p><strong>Statut :</strong> PAYÉ</p>
                        <br>
                        <p>Vous recevrez un email dès que votre colis sera expédié.</p>
                    </div>
                `,
            });

            logger.info(`Email de confirmation envoyé à : ${to}`);
        } catch (error) {
            logger.error(`Échec envoi email de confirmation à ${to} :`, error);
        }
    }
}

export const emailService = new EmailService();