/**
 * @module Service/Cart
 *
 * Gère la logique du panier, la validation des stocks et le caching.
 * Pattern: SQL pour la source de vérité, Redis pour la lecture rapide.
 */
import { cartsRepo, inventoryRepo, productsRepo } from '../repositories/index.js';
import { cacheService } from './cache.service.js';
import { AppError, ValidationError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';

class CartService {
    constructor() {
        if (CartService.instance) return CartService.instance;
        CartService.instance = this;
        Object.freeze(this);
    }

    // --- UTILS : LOGIQUE DE CACHE ---

    #getCacheKey(cartId) {
        return `cart:${cartId}`;
    }

    async #invalidateCartCache(cartId) {
        await cacheService.delete(this.#getCacheKey(cartId));
    }

    // --- MÉTHODES DE LECTURE ---

    /**
     * Récupère le panier complet avec calcul des totaux.
     * Utilise Redis pour éviter de recalculer à chaque changement de page.
     */
    async getFullCart(cartId) {
        const cacheKey = this.#getCacheKey(cartId);

        const cachedCart = await cacheService.get(cacheKey);
        if (cachedCart) return cachedCart;

        const items = await cartsRepo.listItems(cartId);

        const subTotal = items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

        const result = {
            id: cartId,
            items,
            summary: {
                subTotal: parseFloat(subTotal.toFixed(2)),
                itemCount,
                currency: 'EUR',
            },
        };

        // TTL long car le panier est persistant tant qu'on ne le modifie pas.
        await cacheService.set(cacheKey, result, 86400);

        return result;
    }

    async getCartByUserId(userId) {
        const cart = await cartsRepo.getOrCreate(userId);
        return await this.getFullCart(cart.id);
    }

    // --- MÉTHODES D'ÉCRITURE (MUTATIONS) ---

    async addToCart(userId, variantId, quantity) {
        const cart = await cartsRepo.getOrCreate(userId);

        // Validation stock en temps réel (SQL) — pas de cache pour la disponibilité.
        const variant = await productsRepo.findVariantById(variantId);
        if (!variant) throw new AppError('Produit introuvable', HTTP_STATUS.NOT_FOUND);

        const inventory = await inventoryRepo.findByVariantId(variantId);
        const available = inventory?.availableStock ?? 0;

        if (available < quantity) {
            throw new ValidationError(`Stock insuffisant. Disponible : ${available}`);
        }

        const result = await cartsRepo.addItem({ cartId: cart.id, variantId, quantity });

        await this.#invalidateCartCache(cart.id);

        return result;
    }

    async updateItemQuantity(userId, itemId, newQuantity) {
        const cart = await cartsRepo.getOrCreate(userId);
        const items = await cartsRepo.listItems(cart.id);

        const item = items.find((i) => String(i.id) === String(itemId));
        if (!item) throw new AppError('Article non trouvé dans le panier', HTTP_STATUS.NOT_FOUND);

        const inventory = await inventoryRepo.findByVariantId(item.variantId);
        const available = inventory?.availableStock ?? 0;

        if (available < newQuantity) {
            throw new ValidationError(`Stock insuffisant : seulement ${available} disponibles.`);
        }

        const result = await cartsRepo.updateItemQuantity(itemId, newQuantity);

        await this.#invalidateCartCache(cart.id);

        return result;
    }

    async removeItemFromCart(userId, itemId) {
        const cart = await cartsRepo.getOrCreate(userId);
        const items = await cartsRepo.listItems(cart.id);

        // Vérification de propriété avant suppression.
        const itemExists = items.some((i) => String(i.id) === String(itemId));
        if (!itemExists) throw new AppError("Cet article n'existe pas dans votre panier", HTTP_STATUS.NOT_FOUND);

        await cartsRepo.removeItem(itemId);

        await this.#invalidateCartCache(cart.id);

        return true;
    }

    async clearCart(cartId) {
        await cartsRepo.clearCart(cartId);
        await this.#invalidateCartCache(cartId);
        return true;
    }

    async mergeCarts(guestCartId, userId) {
        const userCart = await cartsRepo.getOrCreate(userId);
        const guestItems = await cartsRepo.listItems(guestCartId);

        // addToCart gère déjà les stocks et l'invalidation à chaque itération.
        for (const item of guestItems) {
            await this.addToCart(userId, item.variantId, item.quantity);
        }

        await cartsRepo.delete(guestCartId);
        await this.#invalidateCartCache(guestCartId);

        return this.getFullCart(userCart.id);
    }
}

export const cartService = new CartService();