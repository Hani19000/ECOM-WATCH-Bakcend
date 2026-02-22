import { productsService } from '../services/products.service.js';
import { logError } from '../utils/logger.js';

export const generateProductsSitemap = async (req, res) => {
    try {
        // 1. Récupérer tous les produits actifs depuis ton service
        // Adapte cette ligne selon la méthode exacte de ton productsService
        const products = await productsService.getAllProducts({ status: 'ACTIVE' });

        // 2. Initialiser le format XML
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

        // 3. Boucler sur les produits pour générer les balises <url>
        products.forEach(product => {
            // Attention : Vérifie que le chemin "/produit/" correspond bien à ton routing React (ex: /produit/:slug)
            const productUrl = `https://ecomwatch.vercel.app/produit/${product.slug}`;

            // Formatage de la date de dernière modification (YYYY-MM-DD)
            const lastMod = new Date(product.updatedAt || product.createdAt || Date.now())
                .toISOString()
                .split('T')[0];

            xml += '  <url>\n';
            xml += `    <loc>${productUrl}</loc>\n`;
            xml += `    <lastmod>${lastMod}</lastmod>\n`;
            xml += '    <changefreq>weekly</changefreq>\n';
            xml += '    <priority>0.8</priority>\n';
            xml += '  </url>\n';
        });

        xml += '</urlset>';

        // 4. Renvoyer la réponse avec le bon Content-Type pour que Google comprenne que c'est du XML
        res.header('Content-Type', 'application/xml');
        res.status(200).send(xml);

    } catch (error) {
        logError('[Sitemap Controller] Erreur lors de la génération :', error);
        res.status(500).send('Erreur de génération du sitemap');
    }
};