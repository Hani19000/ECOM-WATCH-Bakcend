/**
 * @module Config/Database
 *
 * Initialisation et gestion du pool de connexions PostgreSQL.
 * Utiliser un pool plutôt que des connexions individuelles réduit la latence
 * et évite de saturer les connexions max autorisées par PostgreSQL.
 */
import pkg from 'pg';
const { Pool } = pkg;
import { ENV } from './environment.js';
import { logInfo, logError } from '../utils/logger.js';

/**
 * Le SSL est requis sur les hébergeurs comme Render/Heroku
 * qui rejettent les connexions non chiffrées en production.
 */
const poolConfig = {
    user: ENV.database.postgres.user,
    password: ENV.database.postgres.password,
    host: ENV.database.postgres.host,
    port: ENV.database.postgres.port,
    database: ENV.database.postgres.database,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: ENV.server.nodeEnv === 'production'
        ? { require: true, rejectUnauthorized: false }
        : false,
};

export const pgPool = new Pool(poolConfig);

/**
 * Valide la connexion au démarrage en empruntant un client du pool.
 * Échouer tôt (fail-fast) évite de démarrer un serveur inutilisable.
 */
export const connectPostgres = async () => {
    try {
        logInfo(`Connexion PostgreSQL → ${poolConfig.host}:${poolConfig.port} (user: ${poolConfig.user})`);
        const client = await pgPool.connect();
        logInfo('PostgreSQL connecté avec succès (Pool ready)');
        client.release();
    } catch (error) {
        logError(error, { context: 'PostgreSQL connection error' });
        throw error;
    }
};

/**
 * Ferme proprement toutes les connexions du pool à l'arrêt du serveur.
 * Nécessaire pour éviter les connexions fantômes côté PostgreSQL.
 */
export const closePostgres = async () => {
    try {
        await pgPool.end();
        logInfo('PostgreSQL pool fermé');
    } catch (error) {
        logError(error, { context: 'Error closing PostgreSQL pool' });
    }
};