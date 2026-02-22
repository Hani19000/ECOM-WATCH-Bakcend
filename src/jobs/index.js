/**
 * @module Jobs
 *
 * Point d'entrée unique pour tous les cron jobs.
 * Appelé une seule fois au démarrage de l'application.
 */
import { cronScheduler } from './schedulers/cronScheduler.js';
import { inventoryCleanupJob } from './cron/inventory.cron.js';
import { sessionsCleanupJob } from './cron/sessions.cron.js';
import { ordersCleanupJob } from './cron/orders.cron.js';
import { statsRefreshJob } from './cron/stats.cron.js';
import { archiveJob } from './cron/archive.cron.js';

/**
 * Enregistre et démarre tous les cron jobs.
 * @returns {CronScheduler} Instance du scheduler pour contrôle externe si nécessaire.
 */
export function initializeCronJobs() {
    cronScheduler.registerMany([
        inventoryCleanupJob,  // Toutes les 15 minutes (*/15 * * * *)
        sessionsCleanupJob,   // 1x/jour à 3h
        ordersCleanupJob,     // 1x/jour à 3h30
        statsRefreshJob,      // Toutes les heures
        archiveJob,           // 1er du mois à 4h
    ]);

    cronScheduler.startAll();
    return cronScheduler;
}

/**
 * Arrête proprement tous les cron jobs.
 * Appelé lors du shutdown graceful de l'application.
 */
export function shutdownCronJobs() {
    cronScheduler.stopAll();
}

export { cronScheduler };