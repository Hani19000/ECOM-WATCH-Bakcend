/**
 * @module Controller/Promotions
 *
 * Gère les endpoints de création, consultation et gestion des promotions.
 * Routes réservées aux administrateurs.
 */
import { promotionService } from '../services/promotions.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class PromotionController {
    create = asyncHandler(async (req, res) => {
        const { promotion, linkedItems } = req.body;
        const result = await promotionService.createPromotion(promotion, linkedItems);

        res.status(HTTP_STATUS.CREATED).json({
            status: 'success',
            data: { promotion: result },
        });
    });

    getAll = asyncHandler(async (req, res) => {
        const { status, active, page, limit } = req.query;

        const filters = {
            status,
            active: active === 'true',
            page: parseInt(page, 10) || 1,
            limit: parseInt(limit, 10) || 20,
        };

        const result = await promotionService.listPromotions(filters);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: result,
        });
    });

    getOne = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const promotion = await promotionService.getPromotionDetails(id);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { promotion },
        });
    });

    update = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { promotion, linkedItems } = req.body;
        const result = await promotionService.updatePromotion(id, promotion, linkedItems);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { promotion: result },
        });
    });

    delete = asyncHandler(async (req, res) => {
        const { id } = req.params;
        await promotionService.deletePromotion(id);

        res.status(HTTP_STATUS.NO_CONTENT).send();
    });

    toggle = asyncHandler(async (req, res) => {
        const { id } = req.params;
        const promotion = await promotionService.togglePromotionStatus(id);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { promotion },
        });
    });
}

export const promotionController = new PromotionController();