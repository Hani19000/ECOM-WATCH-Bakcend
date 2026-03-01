/**
 * @module Service/Cache
 *
 * Service Redis pour le product-service.
 * Compatible Upstash (rediss:// TLS) et Redis local (redis://).
 *
 * Préfixes utilisés dans ce service :
 *   product:details:<id|slug>  → détails d'un produit (TTL 1h)
 *   catalog:list:<base64>      → liste catalogue avec filtres (TTL 15min)
 *   categories:all             → liste des catégories (TTL 24h)
 *   stock:variant:<variantId>  → niveau de stock d'une variante (TTL 1h)
 */
import { createClient } from 'redis';
import { ENV } from '../config/environment.js';
import { logInfo, logError } from '../utils/logger.js';

class CacheService {
    constructor() {
        if (CacheService.instance) return CacheService.instance;

        this.client = createClient({ url: ENV.database.redis.url });

        this.client.on('error', (err) =>
            logError(err, { context: 'Redis connection error (product-service)' })
        );
        this.client.on('connect', () => logInfo('Redis connecté avec succès'));

        CacheService.instance = this;
        Object.freeze(this);
    }

    async connect() {
        if (!this.client.isOpen) {
            await this.client.connect();
        }
    }

    /**
     * Stocke une valeur JSON sérialisée avec TTL optionnel.
     * @param {string} key
     * @param {*} value
     * @param {number} [ttlSeconds=900]
     */
    async set(key, value, ttlSeconds = 900) {
        try {
            await this.connect();
            await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds });
        } catch (error) {
            // Cache non-critique : on logue et on continue
            logError(error, { context: 'CacheService.set', key });
        }
    }

    /**
     * Récupère et désérialise une valeur.
     * Retourne null si absente ou si Redis est indisponible.
     */
    async get(key) {
        try {
            await this.connect();
            const value = await this.client.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            logError(error, { context: 'CacheService.get', key });
            return null; // Fail graceful — la DB prend le relais
        }
    }

    async delete(key) {
        try {
            await this.connect();
            await this.client.del(key);
        } catch (error) {
            logError(error, { context: 'CacheService.delete', key });
        }
    }

    /**
     * Supprime plusieurs clés, avec support des patterns glob (* = wildcard).
     * Les clés avec wildcard sont résolues via SCAN (non-bloquant).
     */
    async deleteMany(keys) {
        try {
            await this.connect();
            for (const key of keys) {
                if (key.includes('*')) {
                    // SCAN itératif pour ne pas bloquer Redis avec KEYS *
                    let cursor = 0;
                    do {
                        const { cursor: newCursor, keys: matchedKeys } =
                            await this.client.scan(cursor, { MATCH: key, COUNT: 100 });
                        cursor = newCursor;
                        if (matchedKeys.length > 0) {
                            await this.client.del(matchedKeys);
                        }
                    } while (cursor !== 0);
                } else {
                    await this.client.del(key);
                }
            }
        } catch (error) {
            logError(error, { context: 'CacheService.deleteMany', keys });
        }
    }
}

export const cacheService = new CacheService();