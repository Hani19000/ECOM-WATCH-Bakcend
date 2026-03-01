/**
 * @module Config/Environment
 *
 * Source unique de vérité pour les variables d'environnement du cart-service.
 * Validation fail-fast au démarrage — le service ne démarre pas si une variable
 * critique est manquante, évitant des erreurs silencieuses en production.
 */
import 'dotenv/config';

const requiredEnv = [
    'PORT',
    'JWT_ACCESS_SECRET',         // Vérification des access tokens émis par l'auth-service
    'DATABASE_URL',              // Connexion Neon (schéma cart)
    'REDIS_URL',                 // Upstash — cache des paniers
    'PRODUCT_SERVICE_URL',       // Appels HTTP vers product-service /internal/*
    'INTERNAL_PRODUCT_SECRET',   // Secret partagé avec le product-service
];

if (process.env.NODE_ENV === 'production') {
    requiredEnv.push('SENTRY_DSN');
}

const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
    console.error(`[FATAL] [cart-service] Variables d'environnement manquantes : ${missing.join(', ')}`);
    process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';

export const ENV = Object.freeze({
    server: {
        port: Number(process.env.PORT) || 3006,
        nodeEnv: process.env.NODE_ENV || 'development',
        isProduction,
    },

    database: {
        postgres: {
            url: process.env.DATABASE_URL,
        },
        redis: {
            url: process.env.REDIS_URL,
        },
    },

    jwt: {
        // Le cart-service valide les tokens, il n'en émet pas.
        accessTokenSecret: process.env.JWT_ACCESS_SECRET,
    },

    // Communication vers le product-service
    services: {
        productServiceUrl: process.env.PRODUCT_SERVICE_URL,
        httpTimeoutMs: Number(process.env.INTERNAL_HTTP_TIMEOUT_MS) || 5000,
    },

    // Secret partagé avec le product-service pour les appels /internal/*
    internal: {
        productSecret: process.env.INTERNAL_PRODUCT_SECRET,
    },

    rateLimit: {
        windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
        max: Number(process.env.RATE_LIMIT_MAX) || 200,
    },

    cors: {
        origins: process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()) || [],
    },

    // TTL du cache panier en secondes (24h — invalidé à chaque mutation)
    cache: {
        cartTtl: Number(process.env.CART_CACHE_TTL_SECONDS) || 86400,
    },
});
