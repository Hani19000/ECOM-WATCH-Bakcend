/**
 * @module Controller/Admin
 *
 * Expose les fonctionnalités réservées aux administrateurs.
 * Ces routes sont protégées en amont par le middleware de vérification de rôle.
 */
import { adminService } from '../services/admin.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class AdminController {
    /** Tableau de bord : statistiques globales de la plateforme */
    getStats = asyncHandler(async (req, res) => {
        const stats = await adminService.getDashboardStats();
        res.status(HTTP_STATUS.OK).json({ status: 'success', data: stats });
    });

    /**
     * GET /api/v1/admin/sales-history?days=30
     * Historique des ventes journalières pour le graphique du dashboard.
     * Le paramètre `days` est validé dans adminService.getSalesHistory.
     */
    getSalesHistory = asyncHandler(async (req, res) => {
        const { days = 30 } = req.query;
        const history = await adminService.getSalesHistory(days);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { history },
        });
    });

    /** Modifier le rôle d'un utilisateur (ex: promouvoir en ADMIN) */
    changeUserRole = asyncHandler(async (req, res) => {
        const { userId } = req.params;
        const { role } = req.body;
        const result = await adminService.updateUserRole(userId, role);
        res.status(HTTP_STATUS.OK).json({ status: 'success', ...result });
    });
}

export const adminController = new AdminController();