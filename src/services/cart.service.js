/**
 * @module Service/Cart
 *
 * Gère la logique du panier et la validation des stocks en temps réel.
 */
import { cartsRepo, inventoryRepo, productsRepo } from '../repositories/index.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class CartService {
    constructor() {
        if (CartService.instance) return CartService.instance;
        CartService.instance = this;
        Object.freeze(this);
    }

    /**
     * Calcule les totaux en mémoire plutôt qu'en SQL pour garder la flexibilité
     * d'appliquer des règles métier (remises, taxes) sans modifier les requêtes.
     */
    async getFullCart(cartId) {
        const items = await cartsRepo.listItems(cartId);

        const subTotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

        return {
            id: cartId,
            items,
            summary: { subTotal, itemCount, currency: 'EUR' },
        };
    }

    async getCartByUserId(userId) {
        const cart = await cartsRepo.getOrCreate(userId);
        return await this.getFullCart(cart.id);
    }

    /**
     * La vérification du stock se fait avant l'écriture pour retourner
     * un message précis à l'utilisateur plutôt qu'une erreur DB générique.
     */
    async addToCart(userId, variantId, quantity) {
        const cart = await cartsRepo.getOrCreate(userId);

        const variant = await productsRepo.findVariantById(variantId);
        if (!variant) throw new AppError('Produit introuvable', HTTP_STATUS.NOT_FOUND);

        const inventory = await inventoryRepo.findByVariantId(variantId);
        const available = inventory?.availableStock ?? 0;

        if (available < quantity) {
            throw new AppError(`Stock insuffisant. Disponible : ${available}`, HTTP_STATUS.BAD_REQUEST);
        }

        return await cartsRepo.addItem({ cartId: cart.id, variantId, quantity });
    }

    async updateItemQuantity(userId, itemId, newQuantity) {
        const cart = await cartsRepo.getOrCreate(userId);
        const items = await cartsRepo.listItems(cart.id);

        // Comparaison souple String/Number pour absorber les IDs venant de l'URL.
        const item = items.find((i) => String(i.id) === String(itemId));
        if (!item) throw new AppError('Article non trouvé dans le panier', HTTP_STATUS.NOT_FOUND);

        const inventory = await inventoryRepo.findByVariantId(item.variantId);
        if (!inventory || inventory.availableStock < newQuantity) {
            throw new AppError(
                `Stock insuffisant : seulement ${inventory?.availableStock ?? 0} disponibles.`,
                HTTP_STATUS.BAD_REQUEST
            );
        }

        return await cartsRepo.updateItemQuantity(itemId, newQuantity);
    }

    async clearCart(cartId) {
        return await cartsRepo.clearCart(cartId);
    }

    /**
     * La vérification de propriété (item appartient bien à CE panier) protège
     * contre la suppression d'articles appartenant à d'autres utilisateurs.
     */
    async removeItemFromCart(userId, itemId) {
        const cart = await cartsRepo.getOrCreate(userId);
        const items = await cartsRepo.listItems(cart.id);

        const itemExists = items.some((i) => String(i.id) === String(itemId));
        if (!itemExists) throw new AppError("Cet article n'existe pas dans votre panier", HTTP_STATUS.NOT_FOUND);

        return await cartsRepo.removeItem(itemId);
    }

    /**
     * Fusionne le panier guest dans le panier utilisateur après connexion.
     * Le panier guest est supprimé ensuite pour ne pas laisser de données orphelines.
     */
    async mergeCarts(guestCartId, userId) {
        const userCart = await cartsRepo.getOrCreate(userId);
        const guestItems = await cartsRepo.listItems(guestCartId);

        for (const item of guestItems) {
            await this.addToCart(userId, item.variantId, item.quantity);
        }

        await cartsRepo.delete(guestCartId);

        return this.getFullCart(userCart.id);
    }
}

export const cartService = new CartService();