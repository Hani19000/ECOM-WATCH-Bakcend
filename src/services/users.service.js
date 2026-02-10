/**
 * @module Service/User
 *
 * Gère la logique métier des utilisateurs : profil, rôles et changement de mot de passe.
 */
import { usersRepo, rolesRepo } from '../repositories/index.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { passwordService } from './password.service.js';

class UserService {
    constructor() {
        if (UserService.instance) return UserService.instance;
        UserService.instance = this;
        Object.freeze(this);
    }

    async getUserProfile(userId) {
        const user = await usersRepo.findById(userId);
        if (!user) throw new AppError('Utilisateur introuvable', HTTP_STATUS.NOT_FOUND);

        const roles = await rolesRepo.listUserRoles(userId);

        return { ...user, roles: roles.map((r) => r.name) };
    }

    async listAllUsers() {
        return await usersRepo.list();
    }

    async deleteUser(userId) {
        const user = await usersRepo.findById(userId);
        if (!user) throw new AppError('Utilisateur introuvable', HTTP_STATUS.NOT_FOUND);

        // Les tables liées (user_roles, refresh_tokens) sont nettoyées automatiquement
        // grâce aux FK ON DELETE CASCADE, sans requêtes supplémentaires.
        const deleted = await usersRepo.deleteById(userId);
        if (!deleted) throw new AppError('Erreur lors de la suppression', HTTP_STATUS.INTERNAL_SERVER_ERROR);

        return true;
    }

    /**
     * Remplace l'ensemble des rôles d'un utilisateur : les anciens rôles sont d'abord
     * retirés pour éviter les conflits, puis le nouveau rôle est attribué.
     */
    async updateUser(userId, roleName) {
        const role = await rolesRepo.findByName(roleName.toUpperCase());
        if (!role) throw new AppError(`Le rôle ${roleName} n'existe pas`, HTTP_STATUS.NOT_FOUND);

        const user = await usersRepo.findById(userId);
        if (!user) throw new AppError('Utilisateur introuvable', HTTP_STATUS.NOT_FOUND);

        const currentRoles = await rolesRepo.listUserRoles(userId);
        for (const r of currentRoles) {
            await rolesRepo.removeUserRole(userId, r.id);
        }

        await rolesRepo.addUserRole(userId, role.id);

        return { userId, updatedRole: role.name };
    }

    /**
     * Les champs sensibles (hash, salt) sont supprimés de la réponse
     * pour ne jamais les exposer dans les logs ou les réponses API.
     */
    async getProfile(userId) {
        const user = await usersRepo.findById(userId);
        if (!user) throw new AppError('Utilisateur non trouvé', HTTP_STATUS.NOT_FOUND);

        delete user.passwordHash;
        delete user.salt;

        return user;
    }

    async updateProfile(userId, updateData) {
        return await usersRepo.updateProfile(userId, updateData);
    }

    async changePassword(userId, { oldPassword, newPassword }) {
        const user = await usersRepo.findById(userId);
        if (!user) throw new AppError('Utilisateur non trouvé', HTTP_STATUS.NOT_FOUND);

        const isMatch = await passwordService.comparePassword(
            oldPassword,
            user.passwordHash,
            user.salt
        );

        if (!isMatch) throw new AppError('Ancien mot de passe incorrect', HTTP_STATUS.UNAUTHORIZED);

        const newSalt = passwordService.generateSalt();
        const newHash = await passwordService.hashPassword(newPassword, newSalt);

        return await usersRepo.updateCredentials(userId, { passwordHash: newHash, salt: newSalt });
    }
}

export const userService = new UserService();