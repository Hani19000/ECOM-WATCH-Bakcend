/**
 * @module Config/Security
 *
 * Middlewares de sécurité Express centralisés.
 * Regrouper ici permet d'appliquer une politique de sécurité cohérente
 * et de la faire évoluer sans toucher aux fichiers de routes.
 */
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { ENV } from './environment.js';
import { ERRORS } from '../constants/errors.js';
import { logInfo } from '../utils/logger.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { NotFoundError } from '../utils/appError.js';

/**
 * Retourne la liste des origines autorisées selon l'environnement.
 * Séparé de la config CORS pour pouvoir la tester unitairement.
 */
const getAllowedOrigins = () => {
    if (ENV.server.nodeEnv === 'production') {
        return ['https://fburger.vercel.app'];
    }
    return [
        'http://localhost:5173',
        'http://localhost:3000',
    ];
};

const origins = process.env.CORS_ORIGINS?.split(',') || getAllowedOrigins();

/** Helmet durcit les en-têtes HTTP pour limiter la surface d'attaque XSS, clickjacking, etc. */
export const helmetMiddleware = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: [
                "'self'",
                "data:",
                "blob:",
                "https://res.cloudinary.com",
            ],
            connectSrc: [
                "'self'",
                "https://fburger-420b.onrender.com",
                "https://o4510681965199360.ingest.de.sentry.io",
            ],
            fontSrc: ["'self'", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
});

export const compressionMiddleware = compression();

export const corsMiddleware = cors({
    origin: (origin, cb) => {
        const isAllowed = !origin || origins.some((o) =>
            o instanceof RegExp ? o.test(origin) : o === origin
        );
        return isAllowed
            ? cb(null, true)
            : cb(new Error('Non autorisé par CORS'));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
});

/**
 * Extrait l'IP réelle du client derrière un reverse proxy (Render, Heroku...).
 * Sans ce traitement, toutes les requêtes sembleraient venir de la même IP interne,
 * ce qui rendrait le rate limiting inefficace.
 */
const getClientIp = (req) => {
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
        return xForwardedFor.split(',')[0].trim();
    }
    return req.ip || 'unknown';
};

export const generalLimiter = rateLimit({
    windowMs: ENV.rateLimit.windowMs,
    max: ENV.rateLimit.max,
    validate: { ip: false },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
});

export const authLimiter = rateLimit({
    windowMs: ENV.rateLimit.authWindowMs,
    max: ENV.rateLimit.authMax,
    validate: { ip: false },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => getClientIp(req),
    handler: (req, res) => {
        const clientIp = getClientIp(req);
        logInfo(`Tentative de spam détectée depuis l'IP : ${clientIp}`);
        res.status(HTTP_STATUS.TOO_MANY_REQUESTS).json({
            status: HTTP_STATUS.TOO_MANY_REQUESTS,
            error: ERRORS.AUTH.TOO_MANY_ATTEMPTS,
            message: 'Trop de tentatives, veuillez réessayer plus tard.',
        });
    },
});

export const compressResponse = compression({
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    },
    level: 6,
});

/** Centralise la gestion des routes inexistantes pour un message d'erreur cohérent */
export const notFound = (req, _res, next) => {
    next(new NotFoundError('Route', req.originalUrl));
};