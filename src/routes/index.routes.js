/**
 * @module Routes/Index
 *
 * Point d'entrée unique du routeur monolith.
 *
 * Deux périmètres distincts :
 * - /api/v1/*   → routes publiques/auth (rate limiter général)
 * - /internal/* → routes inter-services (pas de rate limiter, protégées par X-Internal-Secret)
 *
 * Les routes /internal ne passent pas par le Gateway Nginx (bloquées en amont)
 * et ne sont accessibles qu'en réseau interne Render (service-to-service).
 */
import { Router } from 'express';
import { generalLimiter } from '../config/security.js';
import authRoutes from './auth.routes.js';
import userRoutes from './users.routes.js';
import productRoutes from './products.routes.js';
import categoryRoutes from './categories.routes.js';
import promotionRoutes from './promotions.routes.js';
import cartRoutes from './cart.routes.js';
import orderRoutes from './order.routes.js';
import shippingRoutes from './shipping.routes.js';
import paymentRoutes from './payment.routes.js';
import inventoryRoutes from './inventory.routes.js';
import taxRoutes from './tax.routes.js';
import adminRoutes from './admin.routes.js';
import sitemapRoutes from './sitemap.routes.js';
import internalRoutes from './internal.routes.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────
// ROUTES PUBLIQUES ET AUTHENTIFIÉES
// ─────────────────────────────────────────────────────────────────────

router.use(generalLimiter);

router.use('/api/v1/auth', authRoutes);
router.use('/api/v1/users', userRoutes);
router.use('/api/v1/products', productRoutes);
router.use('/api/v1/categories', categoryRoutes);
router.use('/api/v1/promotions', promotionRoutes);
router.use('/api/v1/cart', cartRoutes);
router.use('/api/v1/orders', orderRoutes);
router.use('/api/v1/shipping', shippingRoutes);
router.use('/api/v1/payments', paymentRoutes);
router.use('/api/v1/inventory', inventoryRoutes);
router.use('/api/v1/taxes', taxRoutes);
router.use('/api/v1/admin', adminRoutes);
router.use('/api/v1', sitemapRoutes);

// ─────────────────────────────────────────────────────────────────────
// ROUTES INTER-SERVICES (pas de rate limiter, protégées par secret)
// Appelées uniquement par l'order-service — jamais exposées via Gateway.
// ─────────────────────────────────────────────────────────────────────

router.use('/internal', internalRoutes);

export default router;