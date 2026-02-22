/**
 * @module Config/Cloudinary
 *
 * Initialise le client Cloudinary et expose l'instance multer prête à l'emploi.
 * Le stockage est délégué directement à Cloudinary pour éviter toute écriture disque.
 */
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import { ENV } from './environment.js';

cloudinary.config({
    cloud_name: ENV.cloudinary.cloudName,
    api_key: ENV.cloudinary.apiKey,
    api_secret: ENV.cloudinary.apiSecret,
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'fburger',
        allowed_formats: ['jpg', 'png', 'webp', 'avif'],
        /**
         * Transformations appliquées à l'upload (exécutées une fois, puis CDN-cachées) :
         * - fetch_format: 'auto' → Cloudinary sert WebP/AVIF selon l'Accept header du navigateur
         * - quality: 'auto'      → compression optimale sans dégradation visible
         * - limit 800×800        → cap suffisant pour carte produit + galerie
         */
        transformation: [
            { width: 800, height: 800, crop: 'limit', fetch_format: 'auto', quality: 'auto' },
        ],
    },
});

export const uploadCloud = multer({ storage });
export { cloudinary };
/**
 * Construit une URL Cloudinary optimisée à partir d'une URL brute déjà stockée.
 *
 * Utile pour les images uploadées avant l'activation de f_auto/q_auto :
 * injecte les transformations dans l'URL de livraison CDN sans toucher à la ressource source.
 *
 * @param {string} rawUrl            - URL Cloudinary brute (https://res.cloudinary.com/…)
 * @param {object} [options]
 * @param {number} [options.width=800]  - Largeur max (px)
 * @param {number} [options.height=800] - Hauteur max (px)
 * @returns {string} URL avec f_auto,q_auto,w_X,h_Y,c_limit injectées
 */
export function buildCloudinaryUrl(rawUrl, { width = 800, height = 800 } = {}) {
    if (!rawUrl || !rawUrl.includes('res.cloudinary.com')) return rawUrl;

    // Évite d'injecter les transformations deux fois si l'URL en a déjà
    if (rawUrl.includes('f_auto')) return rawUrl;

    const transformations = `f_auto,q_auto,w_${width},h_${height},c_limit`;
    return rawUrl.replace('/upload/', `/upload/${transformations}/`);
}