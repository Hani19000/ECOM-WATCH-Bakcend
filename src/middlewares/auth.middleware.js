/**
 * @module Middleware/Auth
 *
 * Protège les routes en vérifiant le JWT Access Token présent dans le header Authorization.
 * Hydrate req.user avec les données de l'utilisateur et ses rôles pour les middlewares suivants.
 */
import { tokenService } from '../services/token.service.js';
import { usersRepo, rolesRepo } from '../repositories/index.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const protect = asyncHandler(async (req, res, next) => {
    // Extraction du token depuis le header — seul le schéma Bearer est accepté
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        throw new AppError('Accès refusé. Veuillez vous connecter.', HTTP_STATUS.UNAUTHORIZED);
    }

    const decoded = tokenService.verifyAccessToken(token);
    if (!decoded) {
        throw new AppError('Token invalide ou expiré.', HTTP_STATUS.UNAUTHORIZED);
    }

    // On supporte à la fois `id` (claim custom) et `sub` (claim standard JWT RFC 7519)
    // pour rester compatible avec différents providers si nécessaire
    const user = await usersRepo.findById(decoded.id || decoded.sub);
    if (!user) {
        throw new AppError("L'utilisateur associé à ce token n'existe plus.", HTTP_STATUS.UNAUTHORIZED);
    }

    // Les rôles sont récupérés en base plutôt qu'embarqués dans le token
    // pour refléter immédiatement tout changement de rôle sans attendre l'expiration du JWT
    const roles = await rolesRepo.listUserRoles(user.id);

    req.user = {
        ...user,
        roles: roles.map((r) => r.name),
    };

    next();
});