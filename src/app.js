import * as Sentry from '@sentry/node';
import express from 'express';
import cookieParser from 'cookie-parser';
import cron from 'node-cron';

// Tes imports locaux
import { requestLogger } from './middlewares/logger.middleware.js';
import { errorHandler } from './middlewares/erroHandler.middleware.js';
import { inventoryService } from './services/inventory.service.js';
import v1Router from './routes/index.routes.js';
import {
    helmetMiddleware,
    corsMiddleware,
    generalLimiter,
    compressResponse,
} from './config/security.js';

const app = express();


// --- 1. MIDDLEWARES DE BASE ---
app.use(express.json({
    verify: (req, _res, buf) => {
        if (req.originalUrl?.includes('/webhook')) {
            req.rawBody = buf;
        }
    }
}));

// --- 2. PIPELINE DE SÉCURITÉ ET LOGS ---
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(cookieParser());
app.use(compressResponse);
app.use(generalLimiter);
app.use(requestLogger);

// --- 3. ROUTES DE L'API ---
app.use('/api/v1', v1Router);

app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'UP', env: process.env.NODE_ENV });
});

// --- 4. GESTIONNAIRE D'ERREURS SENTRY ---
// Indispensable APRÈS les routes, mais AVANT ton errorHandler perso
Sentry.setupExpressErrorHandler(app);

// --- 5. TON HANDLER D'ERREUR FINAL ---
app.use(errorHandler);

// Cron Jobs
cron.schedule('0 * * * *', () => {
    inventoryService.cleanupExpiredReservations();
});

export default app;