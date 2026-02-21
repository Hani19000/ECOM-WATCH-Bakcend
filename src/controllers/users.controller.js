/**
 * @module Controller/Users
 *
 * Interface pour la gestion des profils utilisateurs et l'administration des comptes.
 */
import { userService } from '../services/users.service.js';
import { orderService } from '../services/orders.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class UserController {
    /**
     * Récupère le profil d'un utilisateur avec statistiques.
     * Fonctionne pour /me (req.user.id) et pour la route admin /:id (req.params.id),
     * évitant de créer deux handlers distincts.
     */
    getProfile = asyncHandler(async (req, res) => {
        const targetId = req.params.id || req.user.id;
        const user = await userService.getUserProfile(targetId);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { user },
        });
    });

    updateProfile = asyncHandler(async (req, res) => {
        const { firstName, lastName, phone } = req.body;
        const updatedUser = await userService.updateProfile(req.user.id, {
            firstName,
            lastName,
            phone,
        });

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Profil mis à jour avec succès',
            data: { user: updatedUser },
        });
    });

    updatePassword = asyncHandler(async (req, res) => {
        const { oldPassword, newPassword } = req.body;
        await userService.changePassword(req.user.id, { oldPassword, newPassword });

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Mot de passe mis à jour avec succès',
        });
    });

    /**
     * GET /api/v1/users/me/orders
     * Historique paginé des commandes de l'utilisateur connecté.
     */
    getMyOrders = asyncHandler(async (req, res) => {
        const { page, limit, status } = req.query;

        const result = await orderService.getOrderHistory(req.user.id, {
            page: parseInt(page, 10) || 1,
            limit: parseInt(limit, 10) || 10,
            status,
        });

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            results: result.orders.length,
            data: {
                orders: result.orders,
                pagination: result.pagination,
            },
        });
    });

    /**
     * ADMINISTRATION : Liste tous les comptes utilisateurs avec filtres et pagination.
     */
    getAllUsers = asyncHandler(async (req, res) => {
        // NOUVEAU : On extrait les paramètres de requête et on les passe au service
        const queryParams = {
            search: req.query.search || null,
            page: parseInt(req.query.page, 10) || 1,
            limit: parseInt(req.query.limit, 10) || 10,
        };

        const result = await userService.listAllUsers(queryParams);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: {
                users: result.users || result || [],
                pagination: result.pagination || null
            },
        });
    });

    /**
         * ADMINISTRATION : Supprime un compte utilisateur.
         */
    deleteUser = asyncHandler(async (req, res) => {
        // AJOUT : On passe l'ID de l'admin actuel (req.user.id) au service
        await userService.deleteUser(req.params.id, req.user.id);
        res.status(HTTP_STATUS.NO_CONTENT).send();
    });

    /**
     * ADMINISTRATION : Met à jour le rôle et/ou le statut (isActive) d'un compte.
     */
    updatePrivileges = asyncHandler(async (req, res) => {
        const { role, isActive } = req.body;

        // AJOUT : On passe l'ID de l'admin actuel (req.user.id) au service
        const updatedUser = await userService.updatePrivileges(req.params.id, { role, isActive }, req.user.id);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Privilèges mis à jour avec succès',
            data: { user: updatedUser },
        });
    });
}

export const userController = new UserController();