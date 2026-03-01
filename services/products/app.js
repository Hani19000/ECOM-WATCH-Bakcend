/**
 * @module App
 *
 * Configuration Express du product-service.
 * Monte les routes catalogue, inventory, categories, promotions
 * et les endpoints internes inter-services.
 */
import * as Sentry from '@sentry/node';
import express from 'express';
import cookieParser from 'cookie-parser';

import { requestLogger } from './middleware/logger.middleware.js';
import { errorHandler } from './middleware/erroHandler.middleware.js';
import {
    helmetMiddleware,
    corsMiddleware,
    compressResponse,
} from './config/security.js';
import { pgPool } from './config/database.js';
import { cacheService } from './services/cache.service.js';
import { logInfo } from './utils/logger.js';
import rootRouter from './routes/index.routes.js';

const app = express();

// Nécessaire sur Render derrière un Load Balancer
// pour que le rate limiter lise la vraie IP depuis X-Forwarded-For.
app.set('trust proxy', 1);

// ─────────────────────────────────────────────────────────────────────
// HEALTH CHECK
// Déclaré avant les middlewares pour répondre le plus vite possible
// aux sondes Render/K8s sans passer par le pipeline de sécurité.
// ─────────────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
    let dbStatus = 'up';
    let cacheStatus = 'up';

    try {
        await pgPool.query('SELECT 1');
    } catch {
        dbStatus = 'down';
    }

    try {
        await cacheService.connect();
        await cacheService.client.ping();
    } catch {
        cacheStatus = 'down';
    }

    const isHealthy = dbStatus === 'up' && cacheStatus === 'up';

    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'up' : 'degraded',
        checks: { postgres: { status: dbStatus }, redis: { status: cacheStatus } },
    });
});

// ─────────────────────────────────────────────────────────────────────
// BODY PARSING
// ─────────────────────────────────────────────────────────────────────

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────────────────────────────
// PIPELINE SÉCURITÉ ET LOGS
// ─────────────────────────────────────────────────────────────────────

app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(cookieParser());
app.use(compressResponse);
app.use(requestLogger);

// ─────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────

app.use(rootRouter);

// ─────────────────────────────────────────────────────────────────────
// GESTION DES ERREURS
// ─────────────────────────────────────────────────────────────────────

Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

export default app;