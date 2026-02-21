/**
 * @module Config/Environment
 *
 * Point d'entrée unique pour toutes les variables d'environnement.
 * Centraliser ici permet de détecter les variables manquantes au démarrage
 * plutôt qu'à l'exécution d'une requête, et d'éviter les process.env éparpillés.
 */
import 'dotenv/config';

/** Variables obligatoires sans lesquelles l'application ne peut pas démarrer */
const requiredEnv = [
    'PORT',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'SENTRY_DSN',
    // 'REDIS_HOST',
    // 'REDIS_PORT',
    'CLIENT_URL',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET'
];

// On vérifie soit la DATABASE_URL (Cloud), soit l'ensemble des paramètres Host/User/Pass (Local)
const hasPostgresConfig = process.env.DATABASE_URL || (
    process.env.POSTGRES_HOST &&
    process.env.POSTGRES_USER &&
    process.env.POSTGRES_PASSWORD &&
    process.env.POSTGRES_DB
);

const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0 || !hasPostgresConfig) {
    const errorMsg = missingEnv.length > 0
        ? `Missing environment variables: ${missingEnv.join(', ')}`
        : 'Missing PostgreSQL configuration (DATABASE_URL or individual POSTGRES_* variables)';
    throw new Error(errorMsg);
}

export const ENV = Object.freeze({
    server: {
        port: Number(process.env.PORT) || 3000,
        nodeEnv: process.env.NODE_ENV || 'development',
        isProduction: process.env.NODE_ENV === 'production',
    },
    database: {
        postgres: {
            url: process.env.DATABASE_URL,
            host: process.env.POSTGRES_HOST,
            port: Number(process.env.POSTGRES_PORT),
            user: process.env.POSTGRES_USER,
            password: process.env.POSTGRES_PASSWORD,
            database: process.env.POSTGRES_DB,
        },
        redis: {
            host: process.env.REDIS_HOST || 'redis',
            port: Number(process.env.REDIS_PORT) || 6379,
            password: process.env.REDIS_PASSWORD || undefined,
        }
    },
    jwt: {
        accessTokenSecret: process.env.JWT_ACCESS_SECRET,
        accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '60m',
        refreshTokenSecret: process.env.JWT_REFRESH_SECRET,
        refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    },
    bcrypt: {
        iterations: Number(process.env.BCRYPT_ITERATIONS) || 100000,
    },
    rateLimit: {
        windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
        max: Number(process.env.RATE_LIMIT_MAX) || 100,
        authWindowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 900000,
        authMax: Number(process.env.RATE_LIMIT_AUTH_MAX) || 100,
    },
    sentry: {
        dsn: process.env.SENTRY_DSN,
        tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 1.0,
    },
    stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    },
    clientUrl: process.env.CLIENT_URL || 'http://localhost:3000',
    email: {
        host: process.env.MAIL_HOST,
        port: Number(process.env.MAIL_PORT) || 587,
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
    },
});