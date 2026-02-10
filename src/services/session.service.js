/**
 * @module Service/Session
 *
 * Gère la persistance des sessions (refresh tokens en base) et les options de cookie.
 */
import { refreshTokensRepo } from '../repositories/index.js';
import { ENV } from '../config/environment.js';

class SessionService {
    // SameSite: None + Secure: true est requis pour les cookies cross-domain
    // (ex : frontend Vercel → API Render). En développement, les navigateurs bloquent
    // SameSite: None sans HTTPS, d'où le basculement sur Lax/false.
    #cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'None',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    };

    constructor() {
        if (SessionService.instance) return SessionService.instance;

        if (ENV.nodeEnv === 'development') {
            this.#cookieOptions.sameSite = 'Lax';
            this.#cookieOptions.secure = false;
        }

        SessionService.instance = this;
        Object.freeze(this);
    }

    async createSession(userId, refreshToken) {
        if (!userId || !refreshToken) throw new Error('Données de session manquantes');

        const expiresAt = new Date(Date.now() + this.#cookieOptions.maxAge);

        await refreshTokensRepo.create({ userId, token: refreshToken, expiresAt });
    }

    async validateSession(refreshToken) {
        if (!refreshToken) return null;
        return await refreshTokensRepo.findByToken(refreshToken);
    }

    async deleteSession(refreshToken) {
        if (refreshToken) {
            await refreshTokensRepo.revokeById(refreshToken);
        }
    }

    async cleanExpiredSessions() {
        return await refreshTokensRepo.deleteExpired();
    }
}

export const sessionService = new SessionService();