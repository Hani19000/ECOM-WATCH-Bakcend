import { Router } from 'express';
import { productController } from '../controllers/product.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { restrictTo } from '../middlewares/role.middleware.js';
import { validateUUID, validateRequired } from '../utils/validation.js';
import { ValidationError } from '../utils/appError.js'; // Correction : Import ajouté

const router = Router();

// --- Routes Publiques ---
router.get('/', productController.getAll);
router.get('/:idOrSlug', productController.getOne);

// --- Routes Admin ---
router.use(protect, restrictTo('ADMIN'));

router.post('/',
    (req, _res, next) => {
        // 1. On valide les champs du produit
        validateRequired(req.body, ['name', 'slug']);

        // 2. On valide que l'objet variant existe et contient le prix
        if (!req.body.variant) {
            throw new ValidationError("L'objet 'variant' est obligatoire.");
        }

        validateRequired(req.body.variant, ['sku', 'price']);

        next();
    },
    productController.create
);

router.patch('/:id',
    (req, _res, next) => {
        validateUUID(req.params.id);
        next();
    },
    productController.update
);

router.delete('/:id', productController.delete);

export default router;