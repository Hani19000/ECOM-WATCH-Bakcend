/**
 * @module Config/Cloudinary
 *
 * Initialise le client Cloudinary et expose l'instance multer prête à l'emploi.
 * Le stockage est délégué directement à Cloudinary pour éviter toute écriture disque.
 */
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: 'fburger',
        allowed_formats: ['jpg', 'png', 'webp', 'avif'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }],
    },
});

export const uploadCloud = multer({ storage });
export { cloudinary };