/**
 * @module App
 *
 * Point d'entrée Express de l'auth-service.
 *
 * DIFFÉRENCES PAR RAPPORT AU MONOLITHE :
 * - Port 3002 (défini dans environment.js)
 * - Pas de fichiers statiques (images, assets → monolithe ou CDN)
 * - Pas de rawBody webhook (aucun paiement ici)
 * - Uniquement les routes /auth et /users
 * - Uniquement le cron sessions (nettoyage des tokens expirés)
 * - Health check allégé : PostgreSQL + Redis uniquement
 */

import * as Sentry from '@sentry/node';
import express from 'express';
import cookieParser from 'cookie-parser';

import { requestLogger } from './middlewares/logger.middleware.js';
import { errorHandler } from './middlewares/erroHandler.middleware.js';
import { notFound } from './config/security.js';
import v1Router from './routes/index.routes.js';
import {
    helmetMiddleware,
    corsMiddleware,
    compressResponse,
} from './config/security.js';
import { healthCheck } from './utils/healthCheck.js';
import { pgPool } from './config/database.js';
import { logInfo, logError } from './utils/logger.js';
import { initializeAuthCronJobs, shutdownAuthCronJobs } from './jobs/index.js';
import { ENV } from './config/environment.js';

const app = express();

// Indispensable derrière un reverse proxy (Render, Nginx) pour récupérer
// la vraie IP client dans les rate limiters et les logs.
app.set('trust proxy', 1);

// ─────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// Répondre sur /health sans passer par le router /api/v1 :
// - Evite les middlewares (rate limit, auth) sur un endpoint de monitoring
// - Permet à Render et UptimeRobot de vérifier le service rapidement
// ─────────────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
    try {
        const { postgres } = await healthCheck(pgPool);

        const isHealthy = postgres.status === 'up';

        res.status(isHealthy ? 200 : 503).json({
            status: isHealthy ? 'ok' : 'degraded',
            service: 'auth-service',
            version: '1.0.0',
            uptime: process.uptime(),
            dependencies: { postgres: postgres.status },
        });
    } catch (err) {
        logError(err, { context: 'health-check' });
        res.status(503).json({ status: 'error', service: 'auth-service' });
    }
});

// ─────────────────────────────────────────────────────────────────────
// BODY PARSING
// Pas de rawBody ici : l'auth-service ne traite aucun webhook de paiement.
// ─────────────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─────────────────────────────────────────────────────────────────────
// PIPELINE SÉCURITÉ ET LOGS
// ─────────────────────────────────────────────────────────────────────

app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(cookieParser());
app.use(compressResponse);
app.use(requestLogger);

// ─────────────────────────────────────────────────────────────────────
// ROUTES API
// Seules /auth et /users sont exposées dans ce service.
// Le rate limiter général est appliqué dans index.routes.js.
// ─────────────────────────────────────────────────────────────────────

app.use('/api/v1', v1Router);

// ─────────────────────────────────────────────────────────────────────
// GESTION DES ROUTES INCONNUES
// Doit être déclaré après toutes les routes pour capturer le reste.
// ─────────────────────────────────────────────────────────────────────

app.use(notFound);

// ─────────────────────────────────────────────────────────────────────
// GESTION DES ERREURS
// Sentry doit intercepter avant le handler applicatif pour capturer
// la stack trace complète en production.
// ─────────────────────────────────────────────────────────────────────

if (ENV.sentry.dsn) {
    Sentry.setupExpressErrorHandler(app);
}

app.use(errorHandler);

// ─────────────────────────────────────────────────────────────────────
// CRON JOBS
// Seul le job de nettoyage des sessions est nécessaire ici.
// Les autres crons (inventaire, commandes, stats) restent dans le monolithe.
// ─────────────────────────────────────────────────────────────────────

initializeAuthCronJobs();

// Arrêt propre : on laisse les crons se terminer avant d'éteindre le process
const shutdown = (signal) => {
    logInfo(`[auth-service] ${signal} reçu — arrêt des crons...`);
    shutdownAuthCronJobs();
    process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;