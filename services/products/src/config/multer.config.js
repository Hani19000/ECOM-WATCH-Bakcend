/**
 * @module Config/Multer
 *
 * Configuration de l'upload de fichiers.
 * Utilise le MemoryStorage car les fichiers transitent directement vers Cloudinary,
 * ce qui évite une écriture disque inutile sur le serveur.
 */
import multer from 'multer';
import { ValidationError } from '../utils/appError.js';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — équilibre entre qualité image et bande passante

const fileFilter = (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new ValidationError('Format invalide : seules les images (jpg, png, gif, webp) sont autorisées.'));
    }
};

export const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE_BYTES,
    },
});