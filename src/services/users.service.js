/**
 * @module Service/User
 *
 * Gère la logique métier des utilisateurs : profil, rôles et changement de mot de passe.
 */
import { usersRepo, rolesRepo } from '../repositories/index.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { passwordService } from './password.service.js';
import { ordersRepo } from '../repositories/orders.repo.js';
import { cacheService } from './cache.service.js';

class UserService {
    constructor() {
        if (UserService.instance) return UserService.instance;
        UserService.instance = this;
        Object.freeze(this);
    }

    /**
     * Récupère le profil complet d'un utilisateur avec ses statistiques de commande.
     * Mis en cache 15 minutes pour garder les statistiques fraîches sans surcharger la DB.
     */
    async getUserProfile(userId) {
        const cacheKey = `user:profile:full:${userId}`;

        const cachedData = await cacheService.get(cacheKey);
        if (cachedData) return cachedData;

        const user = await usersRepo.findById(userId);
        if (!user) throw new AppError('Utilisateur introuvable', HTTP_STATUS.NOT_FOUND);

        const roles = await rolesRepo.listUserRoles(userId);
        const stats = await ordersRepo.getUserStats(userId);

        const fullProfile = {
            ...user,
            roles: roles.map((r) => r.name),
            stats,
        };

        await cacheService.set(cacheKey, fullProfile, 900);
        return fullProfile;
    }

    /**
     * Liste tous les utilisateurs enrichis de leurs rôles.
     * Résultat non mis en cache car utilisé en administration (fraîcheur prioritaire).
     */
    async listAllUsers(params = {}) {
        // 1. On passe les paramètres (search, page...) au repository
        const result = await usersRepo.list(params);

        // 2. On enrichit la liste d'utilisateurs avec leurs rôles
        const usersWithRoles = await Promise.all(
            result.users.map(async (user) => {
                const roles = await rolesRepo.listUserRoles(user.id);
                return { ...user, roles: roles.map((r) => r.name) };
            })
        );

        // 3. On retourne l'objet structuré attendu par le contrôleur
        return {
            users: usersWithRoles,
            pagination: result.pagination
        };
    }

    async deleteUser(targetUserId, currentAdminId) {
        // SÉCURITÉ 1 : Impossible de se supprimer soi-même
        if (targetUserId === currentAdminId) {
            throw new AppError('Opération interdite : Vous ne pouvez pas supprimer votre propre compte.', HTTP_STATUS.FORBIDDEN);
        }

        // SÉCURITÉ 2 : Impossible de supprimer un autre administrateur
        const targetUserRoles = await rolesRepo.listUserRoles(targetUserId);
        const isTargetAdmin = targetUserRoles.some((r) => r.name.toUpperCase() === 'ADMIN');
        if (isTargetAdmin) {
            throw new AppError('Opération interdite : Vous ne pouvez pas supprimer un compte Administrateur.', HTTP_STATUS.FORBIDDEN);
        }

        const deleted = await usersRepo.deleteById(targetUserId);
        if (!deleted) throw new AppError('Erreur lors de la suppression', HTTP_STATUS.INTERNAL_SERVER_ERROR);

        await this.#clearUserCache(targetUserId);
        return true;
    }

    /**
     * Met à jour les informations du profil utilisateur (prénom, nom, téléphone).
     * Vérifie l'existence de l'utilisateur avant de renvoyer le résultat.
     */
    async updatePrivileges(targetUserId, { role, isActive }, currentAdminId) {
        const user = await usersRepo.findById(targetUserId);
        if (!user) throw new AppError('Utilisateur introuvable', HTTP_STATUS.NOT_FOUND);

        // SÉCURITÉ 1 : Impossible de modifier ses propres privilèges
        if (targetUserId === currentAdminId) {
            throw new AppError('Opération interdite : Vous ne pouvez pas modifier vos propres accès.', HTTP_STATUS.FORBIDDEN);
        }

        const currentRoles = await rolesRepo.listUserRoles(targetUserId);
        const isAdmin = currentRoles.some((r) => r.name.toUpperCase() === 'ADMIN');

        // SÉCURITÉ 2 : Impossible de bloquer ou rétrograder un autre administrateur
        if (isAdmin) {
            throw new AppError('Opération interdite : Impossible de modifier les accès d\'un autre Administrateur.', HTTP_STATUS.FORBIDDEN);
        }

        // 1. Mise à jour du Statut (Bloqué / Actif)
        if (isActive !== undefined) {
            await usersRepo.setActive(targetUserId, isActive);
        }

        // 2. Mise à jour du Rôle (Admin / User)
        if (role) {
            const targetRoleName = role.toUpperCase();

            if (targetRoleName === 'ADMIN' && !isAdmin) {
                const adminRoleDef = await rolesRepo.findByName('ADMIN');
                if (adminRoleDef) await rolesRepo.addUserRole(targetUserId, adminRoleDef.id);
            } else if (targetRoleName === 'USER' && isAdmin) {
                // Note : Ce code ne sera techniquement plus jamais atteint grâce à la "Sécurité 2" au-dessus,
                // mais on le laisse pour la cohérence logique de la fonction.
                const adminRoleAssigned = currentRoles.find(r => r.name.toUpperCase() === 'ADMIN');
                if (adminRoleAssigned) await rolesRepo.removeUserRole(targetUserId, adminRoleAssigned.id);

                const userRoleDef = await rolesRepo.findByName('USER');
                const hasUserRole = currentRoles.some(r => r.name.toUpperCase() === 'USER');
                if (userRoleDef && !hasUserRole) await rolesRepo.addUserRole(targetUserId, userRoleDef.id);
            }
        }

        await this.#clearUserCache(targetUserId);
        return this.getUserProfile(targetUserId);
    }

    /**
     * ADMINISTRATION : Mise à jour des accès utilisateurs.
     */
    /**
         * ADMINISTRATION : Mise à jour des accès utilisateurs.
         */
    async updatePrivileges(userId, { role, isActive }) {
        const user = await usersRepo.findById(userId);
        if (!user) throw new AppError('Utilisateur introuvable', HTTP_STATUS.NOT_FOUND);

        // 1. Mise à jour du Statut (Bloqué / Actif)
        if (isActive !== undefined) {
            await usersRepo.setActive(userId, isActive);
        }

        // 2. Mise à jour du Rôle (Admin / User)
        if (role) {
            // Le frontend envoie 'ADMIN' ou 'USER'
            const targetRoleName = role.toUpperCase();

            // On récupère les rôles actuels de l'utilisateur
            const currentRoles = await rolesRepo.listUserRoles(userId);

            // On vérifie (sans tenir compte de la casse) s'il est déjà admin
            const isAdmin = currentRoles.some(r => r.name.toUpperCase() === 'ADMIN');

            if (targetRoleName === 'ADMIN' && !isAdmin) {
                // Promotion
                // On s'assure d'utiliser exactement la casse de la BDD (généralement en majuscules)
                const adminRoleDef = await rolesRepo.findByName('ADMIN');
                if (adminRoleDef) {
                    await rolesRepo.addUserRole(userId, adminRoleDef.id);
                }
            } else if (targetRoleName === 'USER' && isAdmin) {
                // Rétrogradation
                const adminRoleAssigned = currentRoles.find(r => r.name.toUpperCase() === 'ADMIN');
                if (adminRoleAssigned) {
                    await rolesRepo.removeUserRole(userId, adminRoleAssigned.id);
                }

                const userRoleDef = await rolesRepo.findByName('USER');
                const hasUserRole = currentRoles.some(r => r.name.toUpperCase() === 'USER');
                if (userRoleDef && !hasUserRole) {
                    await rolesRepo.addUserRole(userId, userRoleDef.id);
                }
            }
        }

        // 3. Nettoyage immédiat du cache
        await this.#clearUserCache(userId);

        // 4. On retourne le profil complet mis à jour
        return this.getUserProfile(userId);
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

    async changePassword(userId, { oldPassword, newPassword }) {
        const user = await usersRepo.findById(userId);

        const isCurrentMatch = await passwordService.comparePassword(
            oldPassword,
            user.passwordHash,
            user.salt
        );
        if (!isCurrentMatch) {
            throw new AppError('Ancien mot de passe incorrect', HTTP_STATUS.UNAUTHORIZED);
        }

        // Vérification de l'historique pour interdire la réutilisation des anciens mots de passe.
        const history = await usersRepo.getPasswordHistory(userId, 2);
        const allEntriesToCheck = [
            { passwordHash: user.passwordHash, salt: user.salt },
            ...history,
        ];

        for (const entry of allEntriesToCheck) {
            const isAlreadyUsed = await passwordService.comparePassword(
                newPassword,
                entry.passwordHash,
                entry.salt
            );
            if (isAlreadyUsed) {
                throw new AppError(
                    'Vous ne pouvez pas réutiliser un de vos anciens mots de passe.',
                    HTTP_STATUS.BAD_REQUEST
                );
            }
        }

        await usersRepo.addToHistory(userId, user.passwordHash, user.salt);

        const newSalt = passwordService.generateSalt();
        const newHash = await passwordService.hashPassword(newPassword, newSalt);

        const result = await usersRepo.updateCredentials(userId, {
            passwordHash: newHash,
            salt: newSalt,
        });

        await this.#clearUserCache(userId);
        return result;
    }

    async #clearUserCache(userId) {
        const keys = [
            `user:profile:full:${userId}`,
            `user:profile:basic:${userId}`,
        ];
        await Promise.all(keys.map((key) => cacheService.delete(key)));
    }
}

export const userService = new UserService();