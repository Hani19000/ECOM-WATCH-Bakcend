import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validator.middleware.js';
import { validateEmail, validatePasswordStrength, validateRequired } from '../utils/validation.js';
import { authLimiter } from '../config/security.js';

const router = Router();

// Inscription : Validation des champs requis + force du mot de passe
router.post('/register',
    authLimiter,
    (req, _res, next) => {
        validateRequired(req.body, ['email', 'password', 'firstName', 'lastName']);
        validateEmail(req.body.email);
        validatePasswordStrength(req.body.password);
        next();
    },
    authController.register
);

// Connexion
router.post('/login',
    authLimiter,
    (req, _res, next) => {
        validateRequired(req.body, ['email', 'password']);
        validateEmail(req.body.email);
        next();
    },
    authController.login
);

// Refresh & Logout
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

export default router;