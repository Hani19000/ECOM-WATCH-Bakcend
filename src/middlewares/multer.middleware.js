/**
 * @module Middleware/Multer
 *
 * Higher-Order Middleware pour gérer les erreurs d'upload de fichiers.
 * Intercepte les erreurs Multer avant qu'elles n'atteignent le handler d'erreur global,
 * afin de retourner des messages lisibles plutôt que des erreurs génériques.
 */
import multer from 'multer';
import { HTTP_STATUS } from '../constants/httpStatus.js';

/**
 * @param {multer.Multer} multerInstance - L'instance configurée (upload ou uploadCloud)
 * @param {string}        fieldName      - Le nom du champ de fichier (ex: 'image')
 */
export const handleUpload = (multerInstance, fieldName) => {
    return (req, res, next) => {
        const uploadStep = multerInstance.single(fieldName);

        uploadStep(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(HTTP_STATUS.BAD_REQUEST).json({
                        message: "L'image est trop lourde (max 5MB)",
                    });
                }
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: `Erreur Multer: ${err.message}` });
            }

            if (err) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({ message: err.message });
            }

            next();
        });
    };
};