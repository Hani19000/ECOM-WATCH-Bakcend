/**
 * @module Service/Sitemap
 *
 * Génère le sitemap XML du catalogue produits à la volée.
 * Interroge uniquement les slugs des produits actifs — pas de chargement
 * des variantes ou des promotions pour garder la requête légère.
 *
 * Pas de mise en cache Redis : Google crawle le sitemap rarement (1x/jour max)
 * et on veut toujours des slugs frais si un produit est publié ou dépublié.
 */
import { pgPool } from '../config/database.js';
import { ENV } from '../config/environment.js';
import { logError } from '../utils/logger.js';

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

/**
 * URL publique du frontend — utilisée comme base pour toutes les URLs du sitemap.
 * Doit correspondre exactement au domaine indexé par Google (pas de trailing slash).
 */
const SITE_URL = (ENV.clientUrl || 'https://ecomwatch.vercel.app').replace(/\/$/, '');

/**
 * Pages statiques toujours présentes dans le sitemap.
 * changefreq et priority sont des hints pour les crawlers, pas des garanties.
 */
const STATIC_PAGES = [
    { path: '/', changefreq: 'weekly', priority: '1.0' },
    { path: '/catalogue', changefreq: 'daily', priority: '0.9' },
    { path: '/login', changefreq: 'monthly', priority: '0.3' },
    { path: '/register', changefreq: 'monthly', priority: '0.3' },
    { path: '/track-order', changefreq: 'monthly', priority: '0.2' },
];

// ─── HELPERS PURS ─────────────────────────────────────────────────────────────

const escapeXml = (str) =>
    String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

const toW3CDate = (date) =>
    (date instanceof Date ? date : new Date(date)).toISOString().split('T')[0];

const buildUrlEntry = ({ loc, lastmod, changefreq, priority }) => `
  <url>
    <loc>${escapeXml(loc)}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`.trimStart();

// ─── REQUÊTE DB ───────────────────────────────────────────────────────────────

/**
 * Récupère les slugs et dates de mise à jour de tous les produits actifs.
 * Requête minimale : on ne charge que ce dont le sitemap a besoin.
 *
 * @returns {Promise<Array<{ slug: string, updatedAt: Date }>>}
 */
const fetchActiveProductSlugs = async () => {
    const { rows } = await pgPool.query(
        `SELECT slug, updated_at
         FROM products
         WHERE status = 'ACTIVE'
         ORDER BY updated_at DESC`
    );
    return rows.map((r) => ({ slug: r.slug, updatedAt: r.updated_at }));
};

// ─── SERVICE ──────────────────────────────────────────────────────────────────

class SitemapService {
    constructor() {
        if (SitemapService.instance) return SitemapService.instance;
        SitemapService.instance = this;
        Object.freeze(this);
    }

    /**
     * Génère le sitemap XML complet (pages statiques + pages produits).
     *
     * @returns {Promise<string>} XML valide prêt à être envoyé avec Content-Type text/xml
     */
    async generate() {
        let products = [];

        try {
            products = await fetchActiveProductSlugs();
        } catch (error) {
            // Si la DB est indisponible, on renvoie quand même le sitemap statique
            // plutôt que de faire échouer le crawl Google.
            logError(error, { context: 'SitemapService.generate — DB unavailable, fallback to static pages' });
        }

        const staticEntries = STATIC_PAGES.map((page) =>
            buildUrlEntry({
                loc: `${SITE_URL}${page.path}`,
                changefreq: page.changefreq,
                priority: page.priority,
            })
        );

        const productEntries = products.map((product) =>
            buildUrlEntry({
                loc: `${SITE_URL}/product/${escapeXml(product.slug)}`,
                lastmod: toW3CDate(product.updatedAt),
                changefreq: 'weekly',
                priority: '0.8',
            })
        );

        const allEntries = [...staticEntries, ...productEntries].join('\n');

        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
            allEntries,
            '</urlset>',
        ].join('\n');
    }
}

export const sitemapService = new SitemapService();