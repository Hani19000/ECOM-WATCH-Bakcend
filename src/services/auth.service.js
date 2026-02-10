/**
 * @module Service/Auth
 *
 * Orchestre l'inscription, la connexion et le renouvellement de session.
 */
import { usersRepo, rolesRepo } from '../repositories/index.js';
import { passwordService } from './password.service.js';
import { tokenService } from './token.service.js';
import { sessionService } from './session.service.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class AuthService {
    constructor() {
        if (AuthService.instance) return AuthService.instance;
        AuthService.instance = this;
        Object.freeze(this);
    }

    /**
     * Factorise la génération des tokens et la persistance de session,
     * partagée entre register et login pour rester DRY.
     * Retourne les tokens au contrôleur qui se charge de poser le cookie.
     */
    async #createAuthSession(user) {
        const accessToken = tokenService.generateAccessToken(user);
        const refreshToken = tokenService.generateRefreshToken(user);

        await sessionService.createSession(user.id, refreshToken);

        return {
            user: { id: user.id, email: user.email, firstName: user.firstName },
            accessToken,
            refreshToken,
        };
    }

    async register({ email, password, firstName, lastName }) {
        const existing = await usersRepo.findByEmail(email);
        if (existing) throw new AppError('Email déjà utilisé', HTTP_STATUS.CONFLICT);

        // Le rôle USER doit exister en base (seedDefaults) ; une absence signale
        // un problème de configuration serveur, pas une erreur utilisateur.
        const role = await rolesRepo.findByName('USER');
        if (!role) throw new AppError('Configuration serveur : rôle introuvable', HTTP_STATUS.INTERNAL_SERVER_ERROR);

        const salt = passwordService.generateSalt();
        const passwordHash = await passwordService.hashPassword(password, salt);

        const newUser = await usersRepo.create({ email, passwordHash, salt, firstName, lastName });

        await rolesRepo.addUserRole(newUser.id, role.id);

        const userWithRoles = { ...newUser, roles: ['USER'] };

        return await this.#createAuthSession(userWithRoles);
    }

    async login({ email, password }) {
        const user = await usersRepo.findByEmail(email);

        // Message volontairement générique pour ne pas indiquer si l'email existe ou non.
        if (!user) throw new AppError('Identifiants invalides', HTTP_STATUS.UNAUTHORIZED);

        const isValid = await passwordService.comparePassword(password, user.passwordHash, user.salt);
        if (!isValid) throw new AppError('Identifiants invalides', HTTP_STATUS.UNAUTHORIZED);

        const roles = await rolesRepo.listUserRoles(user.id);
        const userWithRoles = { ...user, roles: roles.map((r) => r.name) };

        return await this.#createAuthSession(userWithRoles);
    }

    async logout(refreshToken) {
        if (!refreshToken) return;
        await sessionService.deleteSession(refreshToken);
    }

    async refreshAccessToken(refreshToken) {
        const session = await sessionService.validateSession(refreshToken);
        if (!session) throw new AppError('Session invalide ou expirée', HTTP_STATUS.UNAUTHORIZED);

        const payload = tokenService.verifyRefreshToken(refreshToken);
        if (!payload) {
            // Suppression proactive pour éviter qu'un token expiré reste en base.
            await sessionService.deleteSession(refreshToken);
            throw new AppError('Token expiré', HTTP_STATUS.UNAUTHORIZED);
        }

        const user = await usersRepo.findById(payload.sub);
        const roles = await rolesRepo.listUserRoles(user.id);

        const accessToken = tokenService.generateAccessToken({
            ...user,
            roles: roles.map((r) => r.name),
        });

        return { accessToken };
    }
}

export const authService = new AuthService();