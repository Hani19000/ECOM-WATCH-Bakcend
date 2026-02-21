/**
 * @module Routes/Admin
 *
 * Routes réservées aux administrateurs.
 * Protection globale appliquée via router.use() en tête de fichier.
 */
import { Router } from 'express';
import { adminController } from '../controllers/admin.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { restrictTo } from '../middlewares/role.middleware.js';
import { cronScheduler } from '../jobs/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { logError } from '../utils/logger.js';

const router = Router();

router.use(protect);
router.use(restrictTo('ADMIN'));

// ─────────────────────────────────────────────────────────────────────
// STATISTIQUES
// ─────────────────────────────────────────────────────────────────────

router.get('/stats', adminController.getStats);

/**
 * GET /api/v1/admin/sales-history?days=30
 * Historique des ventes journalières pour le graphique du dashboard.
 * Paramètre optionnel : days (1–365, défaut : 30).
 */
router.get('/sales-history', adminController.getSalesHistory);

// ─────────────────────────────────────────────────────────────────────
// GESTION DES CRONS
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/crons/status
 * Liste tous les crons enregistrés avec leur planning.
 */
router.get('/crons/status', asyncHandler(async (_req, res) => {
    const jobs = cronScheduler.listJobs();

    res.status(HTTP_STATUS.OK).json({
        status: 'success',
        data: { jobs },
    });
}));

/**
 * POST /api/v1/admin/crons/:name/execute
 * Déclenche un cron manuellement (tests, debugging).
 */
router.post('/crons/:name/execute', asyncHandler(async (req, res) => {
    const { name } = req.params;

    const jobs = cronScheduler.listJobs();
    const jobExists = jobs.some((job) => job.name === name);

    if (!jobExists) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
            status: 'error',
            message: `Cron job "${name}" introuvable`,
            availableJobs: jobs.map((j) => j.name),
        });
    }

    try {
        const result = await cronScheduler.executeNow(name);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: `Cron "${name}" exécuté manuellement`,
            data: { result },
        });
    } catch (error) {
        logError(error, { route: 'POST /admin/crons/:name/execute', cronName: name });

        res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
            status: 'error',
            message: `Erreur lors de l'exécution du cron "${name}"`,
        });
    }
}));

/**
 * POST /api/v1/admin/crons/:name/stop
 * Arrête un cron en cours d'exécution.
 */
router.post('/crons/:name/stop', asyncHandler(async (req, res) => {
    const { name } = req.params;
    const success = cronScheduler.stop(name);

    if (!success) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
            status: 'error',
            message: `Cron job "${name}" introuvable`,
        });
    }

    res.status(HTTP_STATUS.OK).json({
        status: 'success',
        message: `Cron "${name}" arrêté`,
    });
}));

/**
 * POST /api/v1/admin/crons/:name/restart
 * Redémarre un cron spécifique.
 */
router.post('/crons/:name/restart', asyncHandler(async (req, res) => {
    const { name } = req.params;
    const success = cronScheduler.restart(name);

    if (!success) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
            status: 'error',
            message: `Cron job "${name}" introuvable`,
        });
    }

    res.status(HTTP_STATUS.OK).json({
        status: 'success',
        message: `Cron "${name}" redémarré`,
    });
}));

export default router;