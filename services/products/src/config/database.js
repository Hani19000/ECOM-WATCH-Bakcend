/**
 * @module Config/Database
 *
 * Pool PostgreSQL du product-service.
 * Le search_path est positionné sur "product" à chaque nouvelle connexion
 * pour que toutes les requêtes SQL utilisent le schéma dédié sans préfixe
 * (ex: `SELECT * FROM products` au lieu de `SELECT * FROM product.products`).
 *
 * Utilise l'URL directe (sans suffixe -pooler) pour que les paramètres
 * de search_path soient bien pris en compte par Neon.
 */
import pkg from 'pg';
const { Pool } = pkg;
import { ENV } from './environment.js';
import { logInfo, logError } from '../utils/logger.js';

const poolConfig = {
    connectionString: ENV.database.postgres.url,
    ssl: { rejectUnauthorized: false }, // Requis par Neon et Render
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
};

export const pgPool = new Pool(poolConfig);

/**
 * Positionne le search_path sur "product" puis "public" (pour uuid-ossp et extensions).
 * Critique : sans cette ligne, toutes les tables seraient cherchées dans public
 * et les requêtes échoueraient avec "table not found".
 */
pgPool.on('connect', (client) => {
    client.query('SET search_path TO product, public')
        .catch((err) => logError(err, { context: 'pgPool search_path init (product-service)' }));
});

export const connectPostgres = async () => {
    try {
        const client = await pgPool.connect();
        logInfo('PostgreSQL connecté avec succès (Pool ready)');
        client.release();
    } catch (error) {
        logError(error, { context: 'PostgreSQL connection error' });
        throw error;
    }
};

export const closePostgres = async () => {
    try {
        await pgPool.end();
        logInfo('PostgreSQL pool fermé');
    } catch (error) {
        logError(error, { context: 'Error closing PostgreSQL pool' });
    }
};