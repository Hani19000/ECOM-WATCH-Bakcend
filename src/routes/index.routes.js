/**
 * @module Routes/Index
 * Point d'entrée unique pour toutes les routes de l'API v1
 */
import { Router } from 'express';
import authRoutes from './auth.routes.js';
import userRoutes from './users.routes.js';
import productRoutes from './products.routes.js';
import cartRoutes from './cart.routes.js';
import orderRoutes from './order.routes.js';
import shippingRoutes from "./shipping.routes.js";
import adminRoutes from './admin.routes.js';
import paymentRoutes from './payment.routes.js';
import inventoryRoutes from './inventory.routes.js';
// Ajout de l'import des catégories
import categoryRoutes from './categories.routes.js';

import { generalLimiter } from '../config/security.js';

const router = Router();

// Applique le limiter général sur toutes les routes pour protéger contre le DDoS/Brute-force
router.use(generalLimiter);

// Montage des sous-modules
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/products', productRoutes);
// Intégration des routes catégories
router.use('/categories', categoryRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/shipping', shippingRoutes);
router.use('/payments', paymentRoutes);
router.use('/admin', adminRoutes);

export default router;