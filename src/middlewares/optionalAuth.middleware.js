/**
 * @module Middleware/OptionalAuth
 *
 * Middleware d'authentification optionnelle.
 * Contrairement au middleware `protect`, celui-ci ne bloque pas la requête si l'utilisateur n'est pas authentifié.
 * 
 * Pourquoi ce middleware existe :
 * - Permet le paiement en mode "guest" (invité) sans compte
 * - Améliore l'UX : pas de friction avant le paiement
 * - Réduit l'abandon de panier (étape de moins)
 * - Le compte peut être créé après paiement avec les infos de commande
 * 
 * Différence avec `protect` :
 * - `protect` : Lance une erreur 401 si pas de token → bloque la requête
 * - `optionalAuth` : Continue même sans token → req.user sera undefined
 * 
 * Cas d'usage :
 * - Checkout guest (paiement sans compte)
 * - Pages publiques avec contenu personnalisé si connecté
 * - API mixtes public/privé
 */
import { tokenService } from '../services/token.service.js';
import { usersRepo, rolesRepo } from '../repositories/index.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * Tente d'authentifier l'utilisateur, mais ne bloque pas si échec.
 * 
 * Comportement :
 * - Token valide → req.user est hydraté avec les données utilisateur
 * - Token invalide/absent → req.user reste undefined, la requête continue
 * 
 * @param {Object} req - Requête Express
 * @param {Object} res - Réponse Express
 * @param {Function} next - Callback suivant
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
    // Tentative d'extraction du token depuis le header Authorization
    let token;
    if (req.headers.authorization?.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    // Si pas de token, on continue sans authentification
    if (!token) {
        req.user = undefined;
        return next();
    }

    try {
        // Vérification de la signature du token
        const decoded = tokenService.verifyAccessToken(token);

        // Token invalide cryptographiquement
        if (!decoded) {
            req.user = undefined;
            return next();
        }

        // Récupération de l'utilisateur en base
        const user = await usersRepo.findById(decoded.id || decoded.sub);

        // Utilisateur supprimé entre temps
        if (!user) {
            req.user = undefined;
            return next();
        }

        // Récupération des rôles
        const roles = await rolesRepo.listUserRoles(user.id);

        // Hydratation de req.user
        req.user = {
            ...user,
            roles: roles.map((r) => r.name),
        };

        next();
    } catch (error) {
        // En cas d'erreur (token malformé, DB down, etc.), on continue sans auth
        // L'erreur est loguée mais ne bloque pas le flux
        req.user = undefined;
        next();
    }
});