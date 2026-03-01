/**
 * @module Config/Environment
 *
 * Source unique de vérité pour les variables d'environnement du product-service.
 * Toutes les variables sont validées au démarrage — fail-fast avant toute connexion.
 */
import 'dotenv/config';

const requiredEnv = [
    'PORT',
    'JWT_ACCESS_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
    'INTERNAL_PRODUCT_SECRET',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
];

const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
    console.error(`[FATAL] Variables d'environnement manquantes : ${missing.join(', ')}`);
    process.exit(1);
}

const isProduction = process.env.NODE_ENV === 'production';

export const ENV = Object.freeze({
    server: {
        port: Number(process.env.PORT) || 3003,
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
        accessSecret: process.env.JWT_ACCESS_SECRET,
        accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    },
    // Secret partagé avec tous les services qui appellent les routes /internal
    // order-service, cart-service, admin-service utilisent ce même secret
    internalSecret: process.env.INTERNAL_PRODUCT_SECRET,
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
    },
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
    sentry: {
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1,
    },
});