/**
 * @module Routes/Sitemap
 *
 * Route publique — aucune authentification requise.
 * Google, Bing et autres crawlers doivent pouvoir y accéder librement.
 */
import { Router } from 'express';
import { sitemapController } from '../controllers/sitemap.controller.js';

const router = Router();

/**
 * GET /api/v1/sitemap.xml
 * Retourne le sitemap XML du catalogue.
 * Le frontend Vercel proxifie /sitemap-products.xml vers cette route.
 */
router.get('/sitemap.xml', sitemapController.getSitemap);

export default router;