/**
 * @module Jobs/Cron/Inventory
 *
 * Libère le stock des paniers abandonnés.
 * Fréquence : toutes les heures.
 */
import { inventoryService } from '../../services/inventory.service.js';
import { logInfo, logError } from '../../utils/logger.js';

export const inventoryCleanupJob = {
    name: 'inventory-cleanup',
    schedule: '0 * * * *',

    async execute() {
        const result = await inventoryService.cleanupExpiredReservations().catch((error) => {
            logError(error, { job: 'inventory-cleanup' });
            // Ne pas relancer : permet aux autres crons de continuer en cas d'échec isolé
            return null;
        });

        if (result !== null) {
            logInfo(`[CRON:INVENTORY] Stock nettoyé avec succès`);
        }

        return result !== null
            ? { success: true, result }
            : { success: false };
    },
};