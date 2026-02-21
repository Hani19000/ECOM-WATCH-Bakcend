/**
 * @module Routes/Users
 *
 * Routes pour la gestion du profil utilisateur et l'administration des comptes.
 */
import { Router } from 'express';
import { userController } from '../controllers/users.controller.js';
import { protect } from '../middlewares/auth.middleware.js';
import { restrictTo } from '../middlewares/role.middleware.js';
import { passwordChangeLimiter, profileGeneralLimiter } from '../config/security.js';
import { validateRequired } from '../utils/validation.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

const router = Router();

router.use(protect);

// ─────────────────────────────────────────────────────────────────────
// PROFIL UTILISATEUR
// ─────────────────────────────────────────────────────────────────────

router.use('/me', profileGeneralLimiter);

router.get('/me', userController.getProfile);

router.patch('/me',
    (req, _res, next) => {
        const { firstName, lastName, phone } = req.body;

        if (!firstName && !lastName && !phone) {
            throw new AppError('Au moins un champ doit être fourni', HTTP_STATUS.BAD_REQUEST);
        }

        next();
    },
    userController.updateProfile
);

/**
 * PATCH /api/v1/users/update-password
 * Rate limit strict (3 req/15min) pour prévenir le brute-force.
 */
router.patch('/update-password',
    passwordChangeLimiter,
    (req, _res, next) => {
        validateRequired(req.body, ['oldPassword', 'newPassword']);

        const { newPassword } = req.body;

        if (newPassword.length < 8) {
            throw new AppError(
                'Le mot de passe doit contenir au moins 8 caractères',
                HTTP_STATUS.BAD_REQUEST
            );
        }

        if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
            throw new AppError(
                'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
                HTTP_STATUS.BAD_REQUEST
            );
        }

        next();
    },
    userController.updatePassword
);

router.get('/me/orders', userController.getMyOrders);

// ─────────────────────────────────────────────────────────────────────
// ADMINISTRATION
// ─────────────────────────────────────────────────────────────────────

router.get('/', restrictTo('ADMIN'), userController.getAllUsers);

router.get('/:id', restrictTo('ADMIN'), userController.getProfile);

router.patch('/:id', restrictTo('ADMIN'), userController.updatePrivileges);

/**
 * DELETE /api/v1/users/:id
 * Les tables liées (user_roles, refresh_tokens) sont nettoyées
 * automatiquement via ON DELETE CASCADE.
 */
router.delete('/:id', restrictTo('ADMIN'), userController.deleteUser);

export default router;