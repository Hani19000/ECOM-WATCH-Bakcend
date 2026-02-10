/**
 * @module Utils/HealthCheck
 *
 * Vérifie l'état des dépendances critiques de l'application.
 * Exposé via un endpoint dédié pour les outils de monitoring (Kubernetes, UptimeRobot...).
 */
import { logger } from './logger.js';

/**
 * Sonde la connexion PostgreSQL avec une requête légère.
 * Retourner un objet structuré plutôt que de throw permet d'agréger
 * l'état de toutes les dépendances sans court-circuiter les autres vérifications.
 */
export const checkPostgres = async (pgPool) => {
    try {
        await pgPool.query('SELECT 1');
        return { status: 'up' };
    } catch (err) {
        logger.error('PostgreSQL healthcheck failed', err);
        return { status: 'down', error: err.message };
    }
};

/**
 * Agrège l'état de toutes les dépendances en une seule réponse.
 * Les vérifications sont lancées en parallèle pour minimiser le temps de réponse.
 */
export const healthCheck = async (pgPool) => {
    const [postgres] = await Promise.all([
        checkPostgres(pgPool),
    ]);

    return { postgres };
};