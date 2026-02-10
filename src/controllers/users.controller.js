/**
 * @module Controller/User
 *
 * Interface pour la gestion des profils utilisateurs et l'administration des comptes.
 * Les routes admin (getAllUsers, getUserById, deleteUser) sont protégées
 * par le middleware de rôle en amont.
 */
import { userService } from '../services/users.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/appError.js';

class UserController {
    /**
     * Récupère le profil d'un utilisateur.
     * Fonctionne pour /me (req.user.id) et pour la route admin /:id (req.params.id), évitant de créer deux handlers distincts.
     */
    getProfile = asyncHandler(async (req, res) => {
        const targetId = req.params.id || req.user.id;
        const user = await userService.getUserProfile(targetId);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { user },
        });
    });

    /** Met à jour les informations du profil de l'utilisateur connecté */
    updateProfile = asyncHandler(async (req, res) => {
        const { firstName, lastName, phone } = req.body;
        const updatedUser = await userService.updateUser(req.user.id, { firstName, lastName, phone });

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Profil mis à jour avec succès',
            data: { user: updatedUser },
        });
    });

    /** ADMINISTRATION : Liste tous les comptes utilisateurs */
    getAllUsers = asyncHandler(async (req, res) => {
        const users = await userService.listAllUsers();

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            results: users.length,
            data: { users },
        });
    });

    /** ADMINISTRATION : Récupère un utilisateur par son ID */
    getUserById = asyncHandler(async (req, res) => {
        const user = await userService.getUserProfile(req.params.id);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { user },
        });
    });

    /** ADMINISTRATION : Supprime un compte utilisateur */
    deleteUser = asyncHandler(async (req, res) => {
        await userService.deleteUser(req.params.id);

        res.status(HTTP_STATUS.NO_CONTENT).send();
    });

    /** Change le mot de passe de l'utilisateur connecté après vérification de l'ancien */
    updatePassword = asyncHandler(async (req, res) => {
        const { oldPassword, newPassword } = req.body;

        if (!oldPassword || !newPassword) {
            throw new AppError('Veuillez fournir l\'ancien et le nouveau mot de passe', HTTP_STATUS.BAD_REQUEST);
        }

        await userService.changePassword(req.user.id, { oldPassword, newPassword });

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Mot de passe mis à jour avec succès',
        });
    });
}

export const userController = new UserController();