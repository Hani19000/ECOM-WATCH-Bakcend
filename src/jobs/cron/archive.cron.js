/**
 * @module Jobs/Cron/Archive
 *
 * Archive les commandes de plus de 2 ans vers la table orders_archive.
 * Fréquence : premier jour du mois à 4h.
 */
import { pgPool } from '../../config/database.js';
import { logInfo, logError } from '../../utils/logger.js';

export const archiveJob = {
    name: 'orders-archive',
    schedule: '0 4 1 * *',

    async execute() {
        try {
            const { rows } = await pgPool.query('SELECT archive_old_orders()');
            const count = rows[0]?.archive_old_orders || 0;

            logInfo(`[CRON:ARCHIVE] ${count} commande(s) archivée(s)`);
            return { success: true, archivedCount: count };
        } catch (error) {
            logError(error, { job: 'orders-archive' });
            return { success: false, error: error.message };
        }
    },
};