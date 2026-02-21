/**
 * @module Jobs/Cron/Stats
 *
 * Met à jour les vues matérialisées des statistiques du dashboard admin.
 * Fréquence : toutes les heures.
 */
import { pgPool } from '../../config/database.js';
import { logInfo, logError } from '../../utils/logger.js';

export const statsRefreshJob = {
    name: 'stats-refresh',
    schedule: '0 * * * *',

    async execute() {
        try {
            await pgPool.query('SELECT refresh_stats()');
            logInfo('[CRON:STATS] Stats rafraîchies');
            return { success: true };
        } catch (error) {
            logError(error, { job: 'stats-refresh' });
            return { success: false, error: error.message };
        }
    },
};