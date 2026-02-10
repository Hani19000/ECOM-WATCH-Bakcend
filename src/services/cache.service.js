import { createClient } from 'redis';
import { ENV } from '../config/environment.js';
import { logInfo, logError } from '../utils/logger.js';

class CacheService {
    constructor() {
        if (CacheService.instance) return CacheService.instance;

        const { host, port, password } = ENV.database.redis;
        const url = `redis://${host}:${port}`;

        this.client = createClient({
            url,
            password
        });

        this.client.on('error', (err) => logError('Redis Client Error', err));
        this.client.on('connect', () => logInfo('Redis connecté avec succès'));

        this.connect();

        CacheService.instance = this;
    }

    async connect() {
        if (!this.client.isOpen) {
            await this.client.connect();
        }
    }

    /**
     * @param {string} key 
     * @param {any} value - Sera stringifié en JSON
     * @param {number} ttl - Durée de vie en secondes
     */
    async set(key, value, ttl = 3600) {
        const data = JSON.stringify(value);
        await this.client.set(key, data, { EX: ttl });
    }

    async get(key) {
        const data = await this.client.get(key);
        return data ? JSON.parse(data) : null;
    }

    async delete(key) {
        await this.client.del(key);
    }
}

export const cacheService = new CacheService();