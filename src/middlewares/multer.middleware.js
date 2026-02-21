import multer from 'multer';

/**
 * Higher-Order Middleware pour gérer les erreurs d'upload
 * @param {multer.Multer} multerInstance - L'instance (upload ou uploadCloud)
 * @param {string} fieldName - Le nom du champ (ex: 'image')
 */
export const handleUpload = (multerInstance, fieldName) => {
    return (req, res, next) => {
        const uploadStep = multerInstance.single(fieldName);

        uploadStep(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        message: "L'image est trop lourde (max 5MB)"
                    });
                }
                return res.status(400).json({ message: `Erreur Multer: ${err.message}` });
            } else if (err) {
                return res.status(400).json({ message: err.message });
            }

            next();
        });
    };
};