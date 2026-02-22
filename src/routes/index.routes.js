/**
 * @module Routes/Index
 *
 * Point d'entrée unique du routeur.
 * Applique le rate limiter général sur toutes les routes.
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
import { generateProductsSitemap } from '../controllers/sitemap.controller.js';

const router = Router();

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
router.get('/sitemap-products.xml', generateProductsSitemap);

export default router;