/**
 * @module Client/Order
 *
 * Client HTTP interne pour communiquer avec l'order-service.
 * Remplace l'import direct d'orderService dans auth.service.js.
 *
 * RESPONSABILITÉ UNIQUE : transporter les appels vers order-service
 * via HTTP sécurisé, sans aucune logique métier.
 *
 * SÉCURITÉ :
 * - Authentification inter-services via header X-Internal-Secret
 * - Timeout strict pour éviter les attaques de type slowloris
 * - Aucune donnée sensible loguée (email masqué, pas de token)
 * - Validation des paramètres avant envoi
 * - Dégradation gracieuse : un échec du claim ne bloque jamais l'auth
 *
 * CONTRAT DE RETOUR (identique à orderService.autoClaimGuestOrders) :
 *   { claimed: number, claimedOrderNumbers: string[] }
 *   { claimed: 0, error: string }  ← en cas d'échec
 */

import { ENV } from '../config/environment.js';
import { logInfo, logError } from '../utils/logger.js';

// ─── Constantes ─────────────────────────────────────────────────────────────

const ORDER_SERVICE_URL = ENV.services.orderServiceUrl;
const INTERNAL_SECRET = ENV.services.internalSecret;
const REQUEST_TIMEOUT_MS = 5_000; // 5s max — le claim est non-bloquant

// ─── Helpers privés ──────────────────────────────────────────────────────────

/**
 * Masque partiellement un email pour les logs.
 * "john.doe@example.com" → "jo***@example.com"
 *
 * @param {string} email
 * @returns {string}
 */
function maskEmail(email) {
    if (!email || typeof email !== 'string') return '[invalid]';
    const [local, domain] = email.split('@');
    if (!domain) return '[invalid]';
    const masked = local.slice(0, 2).padEnd(local.length, '*');
    return `${masked}@${domain}`;
}

/**
 * Construit les headers communs à tous les appels inter-services.
 * X-Internal-Secret permet à order-service de rejeter les appels externes.
 *
 * @returns {HeadersInit}
 */
function buildInternalHeaders() {
    return {
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_SECRET,
        'X-Source-Service': 'auth-service',
    };
}

/**
 * Effectue un fetch avec timeout via AbortController.
 * Évite qu'une lenteur d'order-service bloque indéfiniment le thread.
 *
 * @param {string}      url
 * @param {RequestInit} options
 * @param {number}      timeoutMs
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timerId);
    }
}

// ─── Client public ───────────────────────────────────────────────────────────

/**
 * Transfère les commandes guest vers un compte utilisateur nouvellement créé.
 *
 * Appelé après register() et login() dans auth.service.js.
 * Ne lève jamais d'exception — retourne { claimed: 0, error } en cas d'échec
 * pour que l'auth ne soit jamais bloquée par une indisponibilité d'order-service.
 *
 * @param {string} userId  - UUID de l'utilisateur (nouveau propriétaire)
 * @param {string} email   - Email normalisé (lowercase) pour la recherche
 * @returns {Promise<{ claimed: number, claimedOrderNumbers: string[] } |
 *                   { claimed: 0, error: string }>}
 */
async function claimGuestOrders(userId, email) {
    // Validation des paramètres avant tout appel réseau
    if (!userId || typeof userId !== 'string') {
        return { claimed: 0, error: 'userId invalide' };
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        return { claimed: 0, error: 'email invalide' };
    }

    const endpoint = `${ORDER_SERVICE_URL}/internal/orders/claim`;

    try {
        logInfo('Auto-claim guest orders', {
            userId,
            email: maskEmail(email), // email masqué dans les logs
        });

        const response = await fetchWithTimeout(
            endpoint,
            {
                method: 'POST',
                headers: buildInternalHeaders(),
                body: JSON.stringify({ userId, email }),
            },
            REQUEST_TIMEOUT_MS
        );

        if (!response.ok) {
            const errorBody = await response.text().catch(() => 'no body');
            logError(new Error(`order-service responded with ${response.status}`), {
                context: 'orderClient.claimGuestOrders',
                status: response.status,
                endpoint,
                body: ENV.server.isProduction ? '[redacted]' : errorBody,
            });
            return { claimed: 0, error: `order-service error: ${response.status}` };
        }

        const data = await response.json();

        logInfo('Auto-claim terminé', {
            userId,
            claimed: data.claimed ?? 0,
        });

        return {
            claimed: data.claimed ?? 0,
            claimedOrderNumbers: data.claimedOrderNumbers ?? [],
        };

    } catch (error) {
        const isTimeout = error.name === 'AbortError';

        logError(error, {
            context: 'orderClient.claimGuestOrders',
            reason: isTimeout ? 'timeout' : 'network_error',
            endpoint,
            userId,
        });

        return {
            claimed: 0,
            error: isTimeout
                ? 'order-service timeout'
                : 'order-service unreachable',
        };
    }
}

// ─── Export ──────────────────────────────────────────────────────────────────

export const orderClient = { claimGuestOrders };