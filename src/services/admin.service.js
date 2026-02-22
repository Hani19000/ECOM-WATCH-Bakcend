/**
 * @module Service/Admin
 *
 * Orchestre les données transversales pour le tableau de bord et la gestion globale.
 */
import { usersRepo, productsRepo, ordersRepo } from '../repositories/index.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class AdminService {
    constructor() {
        if (AdminService.instance) return AdminService.instance;
        AdminService.instance = this;
        Object.freeze(this);
    }

    /**
     * Les trois requêtes sont indépendantes : Promise.all les exécute en parallèle
     * pour éviter d'attendre chaque résultat séquentiellement.
     */
    async getDashboardStats() {
        const [userCount, orderStats, lowStockCount, productCount] = await Promise.all([
            usersRepo.count(),
            ordersRepo.getGlobalStats(),
            productsRepo.countLowStock(5),
            productsRepo.count(),
        ]);

        return {
            users: {
                total: userCount,
            },
            orders: {
                totalSales: orderStats.totalAmount || 0,
                orderCount: orderStats.count || 0,
                averageOrderValue: orderStats.count > 0
                    ? (orderStats.totalAmount / orderStats.count).toFixed(2)
                    : 0,
            },
            inventory: {
                alerts: lowStockCount,
            },
            products: {
                total: productCount,
            },
            timestamp: new Date(),
        };
    }

    /**
     * Historique des ventes journalières pour le graphique du dashboard.
     * Délègue au repo qui agrège en SQL — aucun calcul applicatif ici.
     *
     * @param {number} days - Fenêtre temporelle en jours (défaut : 30)
     * @returns {Promise<Array<{ date: string, revenue: string }>>}
     */
    async getSalesHistory(days = 30) {
        const parsedDays = parseInt(days, 10);

        if (isNaN(parsedDays) || parsedDays < 1 || parsedDays > 365) {
            throw new AppError('Le paramètre days doit être compris entre 1 et 365', HTTP_STATUS.BAD_REQUEST);
        }

        return await ordersRepo.getDailySalesHistory(parsedDays);
    }

    async getSalesReport(startDate, endDate) {
        if (!startDate || !endDate) {
            throw new AppError('Les dates de début et de fin sont requises', HTTP_STATUS.BAD_REQUEST);
        }

        return await ordersRepo.getSalesReport(startDate, endDate);
    }

    /**
     * La mise à jour du rôle passe par ce service plutôt que directement par le repo
     * pour centraliser les règles métier (ex : interdire l'auto-rétrogradation).
     */
    async updateUserRole(userId, roleName) {
        const user = await usersRepo.findById(userId);
        if (!user) throw new AppError('Utilisateur introuvable', HTTP_STATUS.NOT_FOUND);

        await usersRepo.updateRole(userId, roleName);

        return { message: `L'utilisateur ${user.email} est désormais ${roleName}` };
    }
}

export const adminService = new AdminService();