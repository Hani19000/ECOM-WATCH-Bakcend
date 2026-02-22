/**
 * @module Controller/Sitemap
 *
 * Génère le sitemap XML des produits à la volée depuis la base de données.
 *
 * POURQUOI À LA VOLÉE ET NON UN FICHIER STATIQUE :
 * - Les produits changent fréquemment (ajout, suppression, slug renommé)
 * - Un fichier statique serait désynchronisé en quelques heures
 * - La réponse est mise en cache par le CDN Vercel via le header Cache-Control
 *
 * ARCHITECTURE :
 * Backend Render  → GET /api/v1/sitemap-products.xml  (cette route)
 * Frontend Vercel → GET /sitemap-products.xml         (rewrite → backend)
 * Google Search   → GET /sitemap-products.xml         (voit l'URL Vercel)
 */
import { productService } from '../services/products.service.js';
import { logError, logInfo } from '../utils/logger.js';
import { ENV } from '../config/environment.js';

const FRONTEND_URL = ENV.clientUrl;

// Google recommande <= 50 000 URLs par fichier sitemap.
const SITEMAP_PRODUCT_LIMIT = 10_000;

/**
 * Échappe les caractères réservés XML.
 * Indispensable si un slug contient un `&` ou un `<` (rare mais possible).
 */
const escapeXml = (str) =>
    String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

/**
 * Formate une date au format YYYY-MM-DD requis par le protocole Sitemap.
 */
const formatDate = (date) => {
    try {
        return new Date(date).toISOString().split('T')[0];
    } catch {
        return new Date().toISOString().split('T')[0];
    }
};

/**
 * GET /api/v1/sitemap-products.xml
 * Génère dynamiquement le sitemap XML des produits actifs.
 * Accessible publiquement — pas de middleware d'auth.
 */
export const generateProductsSitemap = async (_req, res) => {
    try {
        const { data: products } = await productService.listCatalog({
            limit: SITEMAP_PRODUCT_LIMIT,
            page: 1,
        });

        logInfo(`[Sitemap] Génération pour ${products.length} produit(s) actif(s)`);

        const urlEntries = products
            .filter((product) => product.slug) // Exclure les produits sans slug (données corrompues)
            .map((product) => {
                const loc = `${FRONTEND_URL}/product/${escapeXml(product.slug)}`;
                const lastmod = formatDate(product.updatedAt || product.createdAt);

                return [
                    '  <url>',
                    `    <loc>${loc}</loc>`,
                    `    <lastmod>${lastmod}</lastmod>`,
                    '    <changefreq>weekly</changefreq>',
                    '    <priority>0.8</priority>',
                    '  </url>',
                ].join('\n');
            })
            .join('\n');

        const xml = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            urlEntries,
            '</urlset>',
        ].join('\n');

        // Cache-Control : 1h navigateur / 24h CDN Vercel (s-maxage)
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600');

        res.status(200).send(xml);
    } catch (error) {
        logError(error, { context: 'generateProductsSitemap' });

        // Réponse XML minimaliste pour éviter un 500 nu qui perturbe Google Search Console
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.status(500).send(
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<!-- Erreur de génération du sitemap. Réessayez dans quelques instants. -->',
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>',
            ].join('\n')
        );
    }
};

export const sitemapController = { getSitemap: generateProductsSitemap };