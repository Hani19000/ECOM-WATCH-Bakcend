/**
 * @module Jobs/Cron/Orders
 *
 * Annule les commandes PENDING expirées (plus de 30 min) et libère le stock.
 * Fréquence : Toutes les 15 minutes.
 */
import { pgPool } from '../../config/database.js';
import { logInfo, logError } from '../../utils/logger.js';
import { ordersRepo } from '../../repositories/orders.repo.js';
import { orderService } from '../../services/orders.service.js';

export const ordersCleanupJob = {
    name: 'orders-cleanup',
    schedule: '*/15 * * * *',

    async execute() {
        try {
            // 1. Libération des stocks pour les commandes "PENDING" de plus de 30 min
            const expiredOrders = await ordersRepo.findExpiredPendingOrders(30);

            for (const order of expiredOrders) {
                // L'appel à orderService passe la commande en CANCELLED et remet le stock en rayon
                await orderService.updateOrderStatus(order.id, 'CANCELLED');
                logInfo(`[CRON:ORDERS] Commande expirée annulée et stock libéré : ${order.id}`);
            }

            // 2. Nettoyage global SQL (si tu as toujours besoin de ta procédure stockée)
            const { rows } = await pgPool.query('SELECT cleanup_abandoned_orders()');
            const sqlCount = rows[0]?.cleanup_abandoned_orders || 0;

            if (sqlCount > 0) {
                logInfo(`[CRON:ORDERS] ${sqlCount} ancienne(s) commande(s) supprimée(s) par SQL`);
            }

            return {
                success: true,
                stockReleased: expiredOrders.length,
                sqlCleaned: sqlCount
            };
        } catch (error) {
            logError(error, { job: 'orders-cleanup' });
            return { success: false, error: error.message };
        }
    },
};