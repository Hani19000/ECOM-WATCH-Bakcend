/**
 * @module Email/Templates/Index
 *
 * Point d'entrée centralisé pour tous les templates d'emails.
 * Facilite l'importation et la maintenance des templates.
 * 
 * Pourquoi ce fichier existe :
 * - Simplifie les imports : `import { emailTemplates } from './templates'`
 * - Permet de réorganiser les fichiers sans casser les imports
 * - Facilite l'ajout de templates par catégorie
 * - Permet de lazy-load des templates si nécessaire
 */

/**
 * Style de base réutilisable pour tous les emails.
 * Utilise des tables pour la compatibilité avec Outlook.
 */
const getBaseTemplate = (content, title) => `
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background-color: #000000; padding: 30px 20px; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; }
        .content { padding: 40px 30px; color: #333333; line-height: 1.6; }
        .content h2 { color: #000000; font-size: 20px; margin-bottom: 20px; }
        .content p { margin: 15px 0; font-size: 15px; }
        .order-details { background-color: #f9f9f9; padding: 20px; border-radius: 8px; margin: 25px 0; }
        .order-details-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e0e0e0; }
        .order-details-row:last-child { border-bottom: none; }
        .order-details-label { font-weight: 600; color: #666666; }
        .order-details-value { color: #000000; font-weight: 500; }
        .button { display: inline-block; padding: 14px 32px; background-color: #000000; color: #ffffff !important; text-decoration: none; border-radius: 5px; font-weight: 600; margin: 20px 0; }
        .button:hover { background-color: #333333; }
        .footer { background-color: #f9f9f9; padding: 30px 20px; text-align: center; color: #999999; font-size: 13px; }
        .footer a { color: #666666; text-decoration: none; }
        .status-badge { display: inline-block; padding: 6px 12px; border-radius: 4px; font-size: 13px; font-weight: 600; margin: 10px 0; }
        .status-paid { background-color: #d4edda; color: #155724; }
        .status-shipped { background-color: #cce5ff; color: #004085; }
        .status-delivered { background-color: #d4edda; color: #155724; }
        .status-cancelled { background-color: #f8d7da; color: #721c24; }
        @media only screen and (max-width: 600px) {
            .content { padding: 30px 20px !important; }
            .order-details { padding: 15px !important; }
        }
    </style>
</head>
<body>
    <table class="container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
        <tr>
            <td class="header">
                <h1>🛍️ ECOM-WATCH</h1>
            </td>
        </tr>
        <tr>
            <td class="content">
                ${content}
            </td>
        </tr>
        <tr>
            <td class="footer">
                <p>Vous recevez cet email car vous avez effectué une commande sur notre boutique.</p>
                <p>
                    <a href="#">Suivre ma commande</a> • 
                    <a href="#">Nous contacter</a> • 
                    <a href="#">Politique de retour</a>
                </p>
                <p style="margin-top: 20px;">© ${new Date().getFullYear()} Ma Boutique. Tous droits réservés.</p>
            </td>
        </tr>
    </table>
</body>
</html>
`;

/**
 * Formate un montant en euros.
 */
const formatPrice = (amount) => {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR',
    }).format(amount);
};

/**
 * Formate une date en français.
 */
const formatDate = (date) => {
    return new Intl.DateTimeFormat('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(date));
};

/**
 * Collection de tous les templates d'emails.
 * Chaque template retourne { subject, html }.
 */
export const emailTemplates = {
    /**
     * Template de confirmation de commande payée.
     * Envoyé immédiatement après paiement réussi.
     */
    orderConfirmation: (orderData) => {
        const content = `
            <h2>✅ Commande confirmée !</h2>
            <p>Bonjour,</p>
            <p>Nous avons bien reçu votre paiement et votre commande est confirmée.</p>
            
            <div class="order-details">
                <div class="order-details-row">
                    <span class="order-details-label">Numéro de commande</span>
                    <span class="order-details-value">#${orderData.orderNumber || orderData.id}</span>
                </div>
                <div class="order-details-row">
                    <span class="order-details-label">Date</span>
                    <span class="order-details-value">${formatDate(orderData.createdAt || new Date())}</span>
                </div>
                <div class="order-details-row">
                    <span class="order-details-label">Montant total</span>
                    <span class="order-details-value">${formatPrice(orderData.totalAmount)}</span>
                </div>
                <div class="order-details-row">
                    <span class="order-details-label">Statut</span>
                    <span class="status-badge status-paid">PAYÉE</span>
                </div>
            </div>

            ${orderData.shippingAddress ? `
                <p><strong>Adresse de livraison :</strong><br>
                ${orderData.shippingAddress}</p>
            ` : ''}

            <p>Nous préparons votre commande avec soin. Vous recevrez un email de confirmation dès que votre colis sera expédié.</p>

            <a href="${process.env.CLIENT_URL}/orders/${orderData.id}" class="button">
                Suivre ma commande
            </a>

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
                Une question ? Notre équipe est disponible pour vous aider.
            </p>
        `;

        return {
            subject: `Confirmation de votre commande #${orderData.orderNumber || orderData.id}`,
            html: getBaseTemplate(content, 'Commande confirmée'),
        };
    },

    /**
     * Template de notification d'expédition.
     * Envoyé quand le statut passe à 'SHIPPED'.
     */
    orderShipped: (orderData) => {
        const content = `
            <h2>📦 Votre commande a été expédiée !</h2>
            <p>Bonjour,</p>
            <p>Bonne nouvelle ! Votre commande est en route.</p>
            
            <div class="order-details">
                <div class="order-details-row">
                    <span class="order-details-label">Numéro de commande</span>
                    <span class="order-details-value">#${orderData.orderNumber || orderData.id}</span>
                </div>
                ${orderData.trackingNumber ? `
                <div class="order-details-row">
                    <span class="order-details-label">Numéro de suivi</span>
                    <span class="order-details-value">${orderData.trackingNumber}</span>
                </div>
                ` : ''}
                ${orderData.carrier ? `
                <div class="order-details-row">
                    <span class="order-details-label">Transporteur</span>
                    <span class="order-details-value">${orderData.carrier}</span>
                </div>
                ` : ''}
                ${orderData.estimatedDelivery ? `
                <div class="order-details-row">
                    <span class="order-details-label">Livraison estimée</span>
                    <span class="order-details-value">${formatDate(orderData.estimatedDelivery)}</span>
                </div>
                ` : ''}
                <div class="order-details-row">
                    <span class="order-details-label">Statut</span>
                    <span class="status-badge status-shipped">EXPÉDIÉE</span>
                </div>
            </div>

            ${orderData.trackingNumber ? `
                <a href="#" class="button">
                    Suivre mon colis
                </a>
            ` : ''}

            <p style="margin-top: 30px;">Vous recevrez votre commande sous peu. Merci de votre confiance !</p>
        `;

        return {
            subject: `📦 Votre commande #${orderData.orderNumber || orderData.id} a été expédiée`,
            html: getBaseTemplate(content, 'Commande expédiée'),
        };
    },

    /**
     * Template de confirmation de livraison.
     * Envoyé quand le statut passe à 'DELIVERED'.
     */
    orderDelivered: (orderData) => {
        const content = `
            <h2>🎉 Votre commande a été livrée !</h2>
            <p>Bonjour,</p>
            <p>Votre commande a bien été livrée. Nous espérons que vous en êtes satisfait !</p>
            
            <div class="order-details">
                <div class="order-details-row">
                    <span class="order-details-label">Numéro de commande</span>
                    <span class="order-details-value">#${orderData.orderNumber || orderData.id}</span>
                </div>
                <div class="order-details-row">
                    <span class="order-details-label">Date de livraison</span>
                    <span class="order-details-value">${formatDate(new Date())}</span>
                </div>
                <div class="order-details-row">
                    <span class="order-details-label">Statut</span>
                    <span class="status-badge status-delivered">LIVRÉE</span>
                </div>
            </div>

            <p style="margin-top: 30px;">
                <strong>Vous avez un problème avec votre commande ?</strong><br>
                Vous disposez de 14 jours pour retourner vos articles.
            </p>

            <a href="${process.env.CLIENT_URL}/orders/${orderData.id}" class="button">
                Voir ma commande
            </a>

            <p style="margin-top: 30px; padding: 20px; background-color: #f0f8ff; border-radius: 8px;">
                💬 <strong>Votre avis compte !</strong><br>
                Partagez votre expérience pour aider d'autres clients.
            </p>
        `;

        return {
            subject: `🎉 Votre commande #${orderData.orderNumber || orderData.id} a été livrée`,
            html: getBaseTemplate(content, 'Commande livrée'),
        };
    },

    /**
     * Template de notification d'annulation.
     * Envoyé quand le statut passe à 'CANCELLED'.
     */
    orderCancelled: (orderData) => {
        const content = `
            <h2>❌ Votre commande a été annulée</h2>
            <p>Bonjour,</p>
            <p>Votre commande a été annulée ${orderData.cancellationReason ? `pour la raison suivante : ${orderData.cancellationReason}` : ''}.</p>
            
            <div class="order-details">
                <div class="order-details-row">
                    <span class="order-details-label">Numéro de commande</span>
                    <span class="order-details-value">#${orderData.orderNumber || orderData.id}</span>
                </div>
                <div class="order-details-row">
                    <span class="order-details-label">Montant</span>
                    <span class="order-details-value">${formatPrice(orderData.totalAmount)}</span>
                </div>
                <div class="order-details-row">
                    <span class="order-details-label">Statut</span>
                    <span class="status-badge status-cancelled">ANNULÉE</span>
                </div>
            </div>

            <p style="margin-top: 30px;">
                ${orderData.status === 'PAID' ?
                'Si vous avez déjà payé cette commande, le remboursement sera effectué dans les 5 à 10 jours ouvrés sur votre moyen de paiement.' :
                'Aucun montant n\'a été débité pour cette commande.'
            }
            </p>

            <a href="${process.env.CLIENT_URL}/shop" class="button">
                Continuer mes achats
            </a>

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
                Une question sur cette annulation ? Contactez notre service client.
            </p>
        `;

        return {
            subject: `Annulation de votre commande #${orderData.orderNumber || orderData.id}`,
            html: getBaseTemplate(content, 'Commande annulée'),
        };
    },

    /**
     * Template générique de changement de statut.
     * Utilisé comme fallback pour les statuts personnalisés.
     */
    /**
         * Template générique de changement de statut.
         * Utilisé comme fallback pour les statuts personnalisés.
         */
    orderStatusUpdate: (orderData) => {
        // CORRECTION : Ajout de TOUS les statuts possibles
        const statusLabels = {
            PENDING: 'En attente',
            PAID: 'Payée',
            PROCESSING: 'En préparation', // AJOUT
            SHIPPED: 'Expédiée',
            DELIVERED: 'Livrée',
            CANCELLED: 'Annulée',
            REFUNDED: 'Remboursée',       // AJOUT
        };

        const content = `
            <h2>Mise à jour de votre commande</h2>
            <p>Bonjour,</p>
            <p>Le statut de votre commande a été mis à jour.</p>
            
            <div class="order-details">
                <div class="order-details-row">
                    <span class="order-details-label">Numéro de commande</span>
                    <span class="order-details-value">#${orderData.orderNumber || orderData.id}</span>
                </div>
                <div class="order-details-row">
                    <span class="order-details-label">Nouveau statut</span>
                    <span class="order-details-value">${statusLabels[orderData.newStatus] || orderData.newStatus}</span>
                </div>
            </div>

            <a href="${process.env.CLIENT_URL}/orders/${orderData.id}" class="button">
                Voir ma commande
            </a>
        `;

        return {
            subject: `Mise à jour de votre commande #${orderData.orderNumber || orderData.id}`,
            html: getBaseTemplate(content, 'Mise à jour de commande'),
        };
    },

    /**
     * Template d'email de bienvenue.
     * Envoyé après inscription.
     */
    welcome: (userData) => {
        const content = `
            <h2>Bienvenue sur Ma Boutique ! 👋</h2>
            <p>Bonjour ${userData.firstName || ''},</p>
            <p>Nous sommes ravis de vous compter parmi nous !</p>
            
            <p style="margin: 30px 0;">
                Découvrez notre sélection de produits et profitez d'une expérience d'achat unique.
            </p>

            <a href="${process.env.CLIENT_URL}/shop" class="button">
                Découvrir la boutique
            </a>
        `;

        return {
            subject: 'Bienvenue sur Ma Boutique ! 🎉',
            html: getBaseTemplate(content, 'Bienvenue'),
        };
    },

    /**
     * Template de réinitialisation de mot de passe.
     */
    passwordReset: (data) => {
        const content = `
            <h2>🔒 Réinitialisation de mot de passe</h2>
            <p>Bonjour,</p>
            <p>Vous avez demandé à réinitialiser votre mot de passe.</p>
            
            <p style="margin: 30px 0;">
                Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :
            </p>

            <a href="${data.resetUrl}" class="button">
                Réinitialiser mon mot de passe
            </a>

            <p style="margin-top: 30px; font-size: 14px; color: #666;">
                Ce lien est valable pendant 1 heure.<br>
                Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
            </p>
        `;

        return {
            subject: 'Réinitialisation de votre mot de passe',
            html: getBaseTemplate(content, 'Réinitialisation de mot de passe'),
        };
    },
};