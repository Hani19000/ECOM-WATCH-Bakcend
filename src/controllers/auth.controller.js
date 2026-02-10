/**
 * @module Controller/Auth
 *
 * Gère l'inscription, la connexion et le cycle de vie des tokens.
 * Le contrôleur est responsable des cookies (pas le service) : cela maintient le service testable sans dépendance à l'objet Response d'Express.
 */
import { authService } from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ENV } from '../config/environment.js';

/**
 * Options partagées du cookie refreshToken.
 * Centralisé ici pour garantir une configuration identique entre register et login, et faciliter les futures modifications.
 * Correction: Utilisation de la bonne variable d'environnement pour la production.
 */
const isProduction = ENV.server.isProduction;

const REFRESH_TOKEN_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
};

class AuthController {
    register = asyncHandler(async (req, res) => {
        const result = await authService.register(req.body);

        res.cookie('refreshToken', result.refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);

        res.status(HTTP_STATUS.CREATED).json({
            status: 'success',
            data: {
                user: result.user,
                accessToken: result.accessToken,
            },
        });
    });

    login = asyncHandler(async (req, res) => {
        const { email, password } = req.body;
        const result = await authService.login({ email, password });

        res.cookie('refreshToken', result.refreshToken, REFRESH_TOKEN_COOKIE_OPTIONS);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: {
                user: result.user,
                accessToken: result.accessToken,
            },
        });
    });

    logout = asyncHandler(async (req, res) => {
        const { refreshToken } = req.cookies;
        await authService.logout(refreshToken);

        res.clearCookie('refreshToken');
        res.status(HTTP_STATUS.OK).json({ status: 'success', message: 'Déconnecté' });
    });

    refresh = asyncHandler(async (req, res) => {
        const { refreshToken } = req.cookies;
        const result = await authService.refreshAccessToken(refreshToken);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { accessToken: result.accessToken },
        });
    });
}

export const authController = new AuthController();