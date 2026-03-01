/**
 * @module Routes/Products
 *
 * Catalogue produits et gestion des variantes.
 * Lecture : publique. Création, modification, suppression : ADMIN uniquement.
 *
 * ORDRE DES ROUTES (critique) :
 * /filters et /validate-variants doivent précéder /:idOrSlug
 * pour ne pas être capturés comme valeurs de paramètre.
 */
import { Router } from 'express';
import { productController } from '../controllers/product.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { restrictTo } from '../middleware/role.middleware.js';
import { validateUUID, validateRequired } from '../utils/validation.js';
import { ValidationError } from '../utils/appError.js';
import { uploadCloud } from '../config/cloudinary.js';
import { handleUpload } from '../middleware/upload.middleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { productService } from '../services/products.service.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────
// ROUTES PUBLIQUES — statiques en premier, paramétriques en dernier
// ─────────────────────────────────────────────────────────────────────

router.get('/filters', productController.getFilters);

/**
 * POST /api/v1/products/validate-variants
 * Valide l'existence et le stock de plusieurs variantes en une seule requête.
 * Utilisé par le frontend pour détecter les ruptures avant checkout.
 */
router.post(
    '/validate-variants',
    asyncHandler(async (req, res) => {
        const { variantIds } = req.body;

        if (!Array.isArray(variantIds)) {
            return res
                .status(HTTP_STATUS.BAD_REQUEST)
                .json({ status: 'error', message: 'variantIds doit être un tableau' });
        }

        const variants = await productService.validateVariants(variantIds);

        // Dictionnaire { variantId: stock } — les IDs absents correspondent à des variantes supprimées
        const stockMap = Object.fromEntries(variants.map((variant) => [variant.id, variant.stock]));

        res.status(HTTP_STATUS.OK).json({ status: 'success', data: { stockMap } });
    })
);

router.get('/', productController.getAll);
router.get('/:idOrSlug', productController.getOne);

// ─────────────────────────────────────────────────────────────────────
// ROUTES ADMINISTRATION
// ─────────────────────────────────────────────────────────────────────

router.use(protect, restrictTo('ADMIN'));

router.post(
    '/',
    handleUpload(uploadCloud, 'image'),
    (req, _res, next) => {
        try {
            if (typeof req.body.variant === 'string') {
                req.body.variant = JSON.parse(req.body.variant);
            }

            // Compatibilité avec les clients qui envoient sku/price à la racine du body
            if (!req.body.variant && req.body.sku) {
                req.body.variant = {
                    sku: req.body.sku,
                    price: req.body.price,
                    attributes:
                        typeof req.body.attributes === 'string'
                            ? JSON.parse(req.body.attributes)
                            : req.body.attributes,
                };
            }

            validateRequired(req.body, ['name', 'slug']);

            if (!req.body.variant) {
                throw new ValidationError(
                    "L'objet 'variant' ou les champs 'sku/price' sont obligatoires."
                );
            }

            validateRequired(req.body.variant, ['sku', 'price']);
            next();
        } catch (err) {
            next(err);
        }
    },
    productController.create
);

router.patch('/:id', productController.update);

router.delete(
    '/:id',
    (req, _res, next) => {
        try {
            validateUUID(req.params.id);
            next();
        } catch (err) {
            next(err);
        }
    },
    productController.delete
);

/**
 * POST /api/v1/products/:productId/variants
 * Ajoute une variante à un produit existant.
 */
router.post(
    '/:productId/variants',
    handleUpload(uploadCloud, 'image'),
    (req, _res, next) => {
        try {
            if (req.body.attributes && typeof req.body.attributes === 'string') {
                req.body.attributes = JSON.parse(req.body.attributes);
            }
            validateRequired(req.body, ['sku', 'price']);
            validateUUID(req.params.productId, 'productId');
            next();
        } catch (err) {
            next(err);
        }
    },
    productController.addVariant
);

/**
 * PATCH /api/v1/products/variants/:id
 * Met à jour une variante spécifique.
 */
router.patch(
    '/variants/:id',
    (req, _res, next) => {
        try {
            validateUUID(req.params.id);
            next();
        } catch (err) {
            next(err);
        }
    },
    asyncHandler(async (req, res) => {
        const result = await productService.updateVariant(req.params.id, req.body);
        res.status(HTTP_STATUS.OK).json({ status: 'success', data: { variant: result } });
    })
);

router.delete(
    '/variants/:id',
    (req, _res, next) => {
        try {
            validateUUID(req.params.id);
            next();
        } catch (err) {
            next(err);
        }
    },
    productController.deleteVariant
);

export default router;