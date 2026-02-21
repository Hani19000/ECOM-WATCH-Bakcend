/**
 * @module Controller/Tax
 *
 * Expose les endpoints pour la consultation des taux de TVA.
 * Utilisé par le frontend pour afficher les taxes applicables selon le pays.
 */
import { taxService } from '../services/tax.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/appError.js';

class TaxController {
    /**
     * GET /api/v1/taxes/calculate?amount=100&country=France&category=standard
     * Calcule la TVA pour un montant donné.
     */
    calculate = asyncHandler(async (req, res) => {
        const { amount, country = 'France', category = 'standard' } = req.query;

        if (!amount || isNaN(amount)) {
            throw new AppError('Montant invalide', HTTP_STATUS.BAD_REQUEST);
        }

        const result = taxService.calculateTax(parseFloat(amount), country, category);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: result,
        });
    });

    /**
     * GET /api/v1/taxes/rates/:country
     * Retourne les taux de TVA pour un pays.
     */
    getCountryRates = asyncHandler(async (req, res) => {
        const { country } = req.params;
        const rates = taxService.getCountryRates(country);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { country, rates },
        });
    });

    /**
     * GET /api/v1/taxes/countries
     * Liste tous les pays supportés avec leurs taux.
     */
    getAllCountries = asyncHandler(async (_req, res) => {
        const countries = taxService.getAllSupportedCountries();

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            results: countries.length,
            data: { countries },
        });
    });

    /**
     * POST /api/v1/taxes/check-exemption
     * Vérifie l'éligibilité à l'exonération de TVA.
     */
    checkExemption = asyncHandler(async (req, res) => {
        const { country, vatNumber } = req.body;

        const isExempt = taxService.isEligibleForExemption(country, vatNumber);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: {
                isExempt,
                country,
                // Masquage partiel pour éviter l'exposition du numéro complet dans les logs
                vatNumber: vatNumber ? '***' + vatNumber.slice(-4) : null,
            },
        });
    });
}

export const taxController = new TaxController();