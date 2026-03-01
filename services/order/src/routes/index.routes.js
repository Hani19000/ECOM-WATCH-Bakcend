/**
 * @module Routes/Index
 *
 * Point d'entrée unique du routeur de l'order-service.
 *
 * Deux périmètres distincts :
 * - /api/v1/orders  → routes publiques/auth (rate limiter général)
 * - /internal       → routes inter-services (pas de rate limiter, protégées par X-Internal-Secret)
 *
 * Les routes /internal ne passent pas par le Gateway Nginx et ne sont donc
 * jamais exposées à Internet — le rate limiter y est superflu.
 */
import { Router } from 'express';
import { generalLimiter } from '../config/security.js';
import orderRoutes from './order.routes.js';
import internalRoutes from './internal.routes.js';

const router = Router();

// Routes publiques et authentifiées — soumises au rate limiter global
router.use('/api/v1/orders', generalLimiter, orderRoutes);

// Routes inter-services — protégées uniquement par X-Internal-Secret
router.use('/internal', internalRoutes);

export default router;