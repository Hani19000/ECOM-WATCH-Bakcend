/**
 * @module Routes/Promotions
 *
 * Lecture publique (liste).
 * Création, modification, suppression et toggle : réservés aux administrateurs.
 */
import { Router } from 'express';
import { promotionController } from '../controllers/promotions.controller.js';
import { protect } from '../middleware/auth.middleware.js';
import { restrictTo } from '../middleware/role.middleware.js';
import { validateUUID, validateRequired } from '../utils/validation.js';

const router = Router();

// ─────────────────────────────────────────────────────────────────────
// LECTURE PUBLIQUE
// ─────────────────────────────────────────────────────────────────────

router.get('/', promotionController.getAll);

// ─────────────────────────────────────────────────────────────────────
// ROUTES ADMINISTRATION
// ─────────────────────────────────────────────────────────────────────

router.get('/:id',
    protect,
    restrictTo('ADMIN'),
    (req, _res, next) => {
        validateUUID(req.params.id);
        next();
    },
    promotionController.getOne
);

router.post('/',
    protect,
    restrictTo('ADMIN'),
    (req, _res, next) => {
        validateRequired(req.body.promotion, [
            'name',
            'discountType',
            'discountValue',
            'startDate',
            'endDate',
        ]);
        next();
    },
    promotionController.create
);

router.patch('/:id',
    protect,
    restrictTo('ADMIN'),
    (req, _res, next) => {
        validateUUID(req.params.id);
        next();
    },
    promotionController.update
);

router.patch('/:id/toggle',
    protect,
    restrictTo('ADMIN'),
    (req, _res, next) => {
        validateUUID(req.params.id);
        next();
    },
    promotionController.toggle
);

router.delete('/:id',
    protect,
    restrictTo('ADMIN'),
    (req, _res, next) => {
        validateUUID(req.params.id);
        next();
    },
    promotionController.delete
);

export default router;