/**
 * @module Clients/Product
 *
 * Client HTTP vers les endpoints internes du monolith pour les données produit.
 * Remplace les appels directs à `productsRepo` qui référençaient le schéma `product`.
 *
 * Données retournées par le monolith :
 * - `getVariant`        → { id, price, weight, slug, productId }
 * - `getPromotionPrice` → { basePrice, effectivePrice, hasPromotion }
 */
import { ENV } from '../config/environment.js';
import { logError } from '../utils/logger.js';

// Même raison que inventory.client.js : le monolith monte tout sous /api/v1.
const BASE_URL = `${ENV.services.monolithUrl}/api/v1/internal/products`;
const TIMEOUT_MS = ENV.services.httpTimeoutMs;

// ── Utilitaires ───────────────────────────────────────────────────────────────

const buildHeaders = () => ({
    'Content-Type': 'application/json',
    'X-Internal-Secret': ENV.internal.orderSecret,
});

const fetchWithTimeout = async (url, options) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
};

const parseResponse = async (response, context) => {
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = body?.message || `HTTP ${response.status}`;
        const error = new Error(`[productClient.${context}] ${message}`);
        error.statusCode = response.status;
        error.body = body;
        throw error;
    }

    return body?.data ?? body;
};

// ── Client ────────────────────────────────────────────────────────────────────

export const productClient = {

    /**
     * Récupère les données d'une variante produit (prix de base, poids, slug).
     * Utilisé dans `previewOrderTotal` pour obtenir le poids sans réserver le stock.
     *
     * @param {string} variantId - UUID de la variante
     * @throws {Error} Si la variante est introuvable (404) ou le monolith inaccessible
     */
    async getVariant(variantId) {
        try {
            const response = await fetchWithTimeout(
                `${BASE_URL}/variant/${variantId}`,
                { method: 'GET', headers: buildHeaders() }
            );

            return await parseResponse(response, 'getVariant');
        } catch (error) {
            logError(error, { context: 'productClient.getVariant', variantId });
            throw error;
        }
    },

    /**
     * Récupère le prix effectif d'une variante en tenant compte des promotions actives.
     * Retourne le prix de base si aucune promotion n'est active.
     *
     * @param {string} variantId - UUID de la variante
     * @returns {{ basePrice: number, effectivePrice: number, hasPromotion: boolean }}
     * @throws {Error} Si le monolith est inaccessible
     */
    async getPromotionPrice(variantId) {
        try {
            const response = await fetchWithTimeout(
                `${BASE_URL}/variant/${variantId}/promo`,
                { method: 'GET', headers: buildHeaders() }
            );

            return await parseResponse(response, 'getPromotionPrice');
        } catch (error) {
            logError(error, { context: 'productClient.getPromotionPrice', variantId });
            throw error;
        }
    },
};