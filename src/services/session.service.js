/**
 * @module Service/Session
 * Gère la persistance des sessions avec une stratégie de cache hybride (Redis + DB).
 */
import { refreshTokensRepo } from '../repositories/index.js';
import { cacheService } from './cache.service.js'; // Ton nouveau service
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

        if (ENV.server.nodeEnv === 'development') {
            this.#cookieOptions.sameSite = 'Lax';
            this.#cookieOptions.secure = false;
        }

        SessionService.instance = this;
        Object.freeze(this);
    }

    async createSession(userId, refreshToken) {
        if (!userId || !refreshToken) throw new Error('Données de session manquantes');

        const expiresAt = new Date(Date.now() + this.#cookieOptions.maxAge);

        // 1. Persistance en Base de Données (Source de vérité)
        await refreshTokensRepo.create({ userId, token: refreshToken, expiresAt });

        // 2. Mise en cache pour accès rapide (TTL synchronisé avec le cookie)
        // On stocke l'ID utilisateur pour éviter une requête DB au refresh
        await cacheService.set(
            `session:${refreshToken}`,
            { userId, expiresAt },
            Math.floor(this.#cookieOptions.maxAge / 1000)
        );
    }

    async validateSession(refreshToken) {
        if (!refreshToken) return null;

        // --- ÉTAPE 1 : Tentative via Redis (Ultra rapide) ---
        try {
            const cachedSession = await cacheService.get(`session:${refreshToken}`);
            if (cachedSession) return cachedSession;
        } catch (err) {
            // Si Redis échoue, on loggue mais on ne bloque pas l'utilisateur
            console.error('CacheService Error (Validate):', err);
        }

        // --- ÉTAPE 2 : Fallback via PostgreSQL ---
        const session = await refreshTokensRepo.findByToken(refreshToken);

        // --- ÉTAPE 3 : Remplissage du cache (Self-healing) ---
        if (session) {
            await cacheService.set(
                `session:${refreshToken}`,
                { userId: session.userId, expiresAt: session.expiresAt },
                3600 // On remet pour 1h par exemple
            );
        }

        return session;
    }

    async deleteSession(refreshToken) {
        if (!refreshToken) return;

        // On supprime des deux côtés en parallèle
        await Promise.all([
            refreshTokensRepo.revokeById(refreshToken),
            cacheService.delete(`session:${refreshToken}`)
        ]);
    }
}

export const sessionService = new SessionService();