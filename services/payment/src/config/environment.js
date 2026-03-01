/**
 * @module Config/Environment
 *
 * Source unique de vérité pour les variables d'environnement du payment-service.
 * Toutes les variables obligatoires sont validées ici au démarrage (fail-fast),
 * ce qui garantit que l'absence d'une variable est détectée dès le lancement
 * plutôt qu'à l'exécution d'une requête en production.
 */
import 'dotenv/config';

const requiredEnv = [
    'PORT',
    'JWT_ACCESS_SECRET',         // Valider les access tokens émis par l'auth-service
    'DATABASE_URL',              // Connexion Neon (schéma payment)
    'REDIS_URL',                 // Upstash — idempotence des webhooks Stripe
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'ORDER_SERVICE_URL',         // Appels HTTP vers order-service /internal/orders/*
    'INTERNAL_ORDER_SECRET',     // Secret partagé avec l'order-service (header X-Internal-Secret)
    // 'INTERNAL_PAYMENT_SECRET',   // Secret partagé avec le monolith (webhook Stripe)   
    'CLIENT_URL',
    'RESEND_API_KEY',
];

// SENTRY_DSN optionnel en développement, obligatoire en production
if (process.env.NODE_ENV === 'production') {
    requiredEnv.push('SENTRY_DSN');
}

const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
    console.error(
        `[FATAL] [payment-service] Variables d'environnement manquantes : ${missing.join(', ')}`
    );
    process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';

export const ENV = Object.freeze({
    server: {
        port: Number(process.env.PORT) || 3005,
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
        // Le payment-service valide les access tokens, il n'en émet pas.
        accessTokenSecret: process.env.JWT_ACCESS_SECRET,
        accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    },

    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    },

    services: {
        orderServiceUrl: process.env.ORDER_SERVICE_URL,
        // URL publique du payment-service lui-même, utilisée pour construire
        // les success_url et cancel_url transmises à Stripe lors de la création de session.
        paymentServiceUrl: process.env.PAYMENT_SERVICE_URL,
        // Timeout en ms — en dessous on préfère échouer vite plutôt que bloquer Stripe
        httpTimeoutMs: Number(process.env.INTERNAL_HTTP_TIMEOUT_MS) || 5000,
    },

    // Secret partagé avec l'order-service pour les appels /internal/*
    internal: {
        orderSecret: process.env.INTERNAL_ORDER_SECRET,
    },

    rateLimit: {
        windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
        max: Number(process.env.RATE_LIMIT_MAX) || 100,
        checkoutWindowMs: Number(process.env.CHECKOUT_RATE_LIMIT_WINDOW_MS) || 60000,
        checkoutMax: Number(process.env.CHECKOUT_RATE_LIMIT_MAX) || 10,
    },

    sentry: {
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 1.0,
    },

    cors: {
        origins: process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()) || [],
    },

    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

    email: {
        apiKey: process.env.RESEND_API_KEY,
        fromEmail: process.env.RESEND_FROM_EMAIL || 'noreply@ecom-watch.local',
        fromName: process.env.RESEND_FROM_NAME || 'ECOM-WATCH',
    },
});
