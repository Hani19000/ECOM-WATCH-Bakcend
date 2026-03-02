/**
 * @module Middlewares/Auth
 *
 * Valide le JWT Access Token émis par l'auth-service de façon stateless.
 * Aucune requête DB — le payload signé garantit l'intégrité.
 */
import jwt from 'jsonwebtoken';
import { ENV } from '../config/environment.js';
import { AppError } from '../utils/appError.js';

export const protect = (req, _res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
        return next(new AppError('Authentification requise', 401));
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, ENV.jwt.accessTokenSecret);
        req.user = {
            id: decoded.sub,
            email: decoded.email,
            roles: decoded.roles || [],
        };
        next();
    } catch {
        // Ne pas distinguer token expiré vs invalide pour éviter l'énumération
        next(new AppError('Token invalide ou expiré', 401));
    }
};
