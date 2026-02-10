/**
 * @module Service/Health
 * Vérifie l'état de santé des dépendances critiques (DB, Cache).
 */
import { pgPool } from '../config/database.js'; // Ton instance PG Pool
import { cacheService } from './cache.service.js';

class HealthService {
    async check() {
        const status = {
            uptime: process.uptime(),
            timestamp: Date.now(),
            services: {
                database: 'DOWN',
                cache: 'DOWN'
            }
        };

        try {
            // Test PostgreSQL : une simple requête légère
            await pgPool.query('SELECT 1');
            status.services.database = 'UP';
        } catch (err) {
            status.services.database = `DOWN: ${err.message}`;
        }

        try {
            // Test Redis : la commande PING doit répondre PONG
            const ping = await cacheService.client.ping();
            status.services.cache = ping === 'PONG' ? 'UP' : 'DOWN';
        } catch (err) {
            status.services.cache = `DOWN: ${err.message}`;
        }

        // Si l'un des services critiques est DOWN, on pourra retourner un code 503
        const isHealthy = status.services.database === 'UP' && status.services.cache === 'UP';

        return { isHealthy, status };
    }
}

export const healthService = new HealthService();