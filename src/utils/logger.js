/**
 * @module Utils/Logger
 * * Centralise le logging de l'application. 
 * S'appuie sur Sentry (initialisé dans instruments.js) pour la production.
 */
import * as Sentry from '@sentry/node';
import { ENV } from '../config/environment.js';

const isProduction = ENV.server.nodeEnv === 'production';

export const logError = (error, context = {}) => {
    // 1. Enrichissement de l'erreur pour Sentry
    // On ajoute le contexte (nom de la méthode, IDs, etc.) pour faciliter le debug
    Sentry.setExtras(context);
    Sentry.captureException(error);

    // 2. Log local pour le développement
    // On ne veut pas polluer la console en prod, mais on en a besoin en local
    if (!isProduction) {
        console.error(`[Error]: ${error.message}`);
        if (Object.keys(context).length > 0) {
            console.error('   Context:', JSON.stringify(context, null, 2));
        }
    }
};

/**
 * Pour les logs d'information importants (ex: démarrage de services)
 */
export const logInfo = (message) => {
    if (!isProduction) {
        console.log(`[Info]: ${message}`);
    } else {
        // En prod, on peut envoyer des "breadcrumbs" à Sentry au lieu de loguer
        Sentry.addBreadcrumb({
            category: 'info',
            message: message,
            level: 'info',
        });
    }
};