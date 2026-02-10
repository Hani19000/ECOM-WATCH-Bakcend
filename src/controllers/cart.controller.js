/**
 * @module Controller/Cart
 *
 * Gère les opérations sur le panier utilisateur.
 * Toutes les méthodes nécessitent un utilisateur authentifié (req.user injecté par protect).
 */
import { cartService } from '../services/cart.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class CartController {
    /** Récupère le panier complet avec les totaux calculés */
    getCart = asyncHandler(async (req, res) => {
        const cart = await cartService.getCartByUserId(req.user.id);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            data: { cart },
        });
    });

    /**
     * Ajoute un article puis retourne le panier complet.
     * On re-fetch le panier après l'ajout pour inclure les calculs (subtotal, total) sans les dupliquer dans le contrôleur.
     */
    addItem = asyncHandler(async (req, res) => {
        const { variantId, quantity } = req.body;

        await cartService.addToCart(req.user.id, variantId, quantity);
        const fullCart = await cartService.getCartByUserId(req.user.id);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Article ajouté au panier',
            data: { cart: fullCart },
        });
    });

    /** Met à jour la quantité d'un article spécifique */
    updateQuantity = asyncHandler(async (req, res) => {
        const { itemId } = req.params;
        const { quantity } = req.body;

        const updatedItem = await cartService.updateItemQuantity(req.user.id, itemId, quantity);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Quantité mise à jour',
            data: { item: updatedItem },
        });
    });

    /** Supprime un article du panier */
    removeItem = asyncHandler(async (req, res) => {
        const { itemId } = req.params;

        await cartService.removeItemFromCart(req.user.id, itemId);

        res.status(HTTP_STATUS.NO_CONTENT).send();
    });

    /** Vide entièrement le panier */
    clear = asyncHandler(async (req, res) => {
        await cartService.clearCart(req.user.id);

        res.status(HTTP_STATUS.OK).json({
            status: 'success',
            message: 'Panier vidé avec succès',
        });
    });
}

export const cartController = new CartController();