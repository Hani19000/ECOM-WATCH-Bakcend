/**
 * @module Routes/Index
 *
 * Point d'entrée du routeur v1 du monolith.
 * Ne contient QUE les routes publiques et authentifiées sous /api/v1/*.
 *
 * Les routes /internal/* sont montées directement sur l'app Express
 * dans src/app.js (app.use('/internal', internalRoutes)) pour que
 * l'order-service puisse les appeler via ${MONOLITH_URL}/internal/...
 * sans le préfixe /api/v1.
 *
 * Ces routes ne passent pas par le Gateway Nginx (bloquées en amont :
 *   location ~ ^/internal/ { return 404; }
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

const router = Router();

// ─────────────────────────────────────────────────────────────────────
// ROUTES PUBLIQUES ET AUTHENTIFIÉES
// Le préfixe /api/v1 est déjà ajouté par app.use('/api/v1', v1Router)
// dans app.js — ne pas le répéter ici.
// ─────────────────────────────────────────────────────────────────────

router.use(generalLimiter);

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/promotions', promotionRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/shipping', shippingRoutes);
router.use('/payments', paymentRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/taxes', taxRoutes);
router.use('/admin', adminRoutes);
router.use('/', sitemapRoutes);

export default router;