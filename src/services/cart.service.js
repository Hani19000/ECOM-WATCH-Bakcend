/**
 * @module Service/Cart
 *
 * Gère la logique du panier, la validation des stocks et le caching.
 * Pattern: SQL pour la source de vérité, Redis pour la lecture rapide.
 */
import { cartsRepo, inventoryRepo, productsRepo } from '../repositories/index.js';
import { cacheService } from './cache.service.js';
import { AppError } from '../utils/appError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { logInfo } from '../utils/logger.js';

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

    /**
     * Invalide le cache d'un panier spécifique.
     * À appeler après chaque modification (Add, Update, Remove).
     */
    async #invalidateCartCache(cartId) {
        const key = this.#getCacheKey(cartId);
        await cacheService.delete(key);
        logInfo(`Cache invalidé pour le panier : ${cartId}`);
    }

    // --- MÉTHODES DE LECTURE ---

    /**
     * Récupère le panier complet avec calcul des totaux.
     * Utilise Redis pour éviter de recalculer à chaque changement de page.
     */
    async getFullCart(cartId) {
        const cacheKey = this.#getCacheKey(cartId);

        // 1. Tenter de récupérer depuis Redis
        const cachedCart = await cacheService.get(cacheKey);
        if (cachedCart) return cachedCart;

        // 2. Sinon, récupération SQL
        const items = await cartsRepo.listItems(cartId);

        // 3. Calculs métier (Memory-based)
        const subTotal = items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);
        const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

        const result = {
            id: cartId,
            items,
            summary: {
                subTotal: parseFloat(subTotal.toFixed(2)),
                itemCount,
                currency: 'EUR'
            },
        };

        // 4. Stockage Redis (TTL long car le panier est persistant tant qu'on ne le modifie pas)
        await cacheService.set(cacheKey, result, 86400); // 24 heures

        return result;
    }

    async getCartByUserId(userId) {
        // Cette étape reste en SQL car elle est très légère (SELECT id FROM carts...)
        const cart = await cartsRepo.getOrCreate(userId);
        return await this.getFullCart(cart.id);
    }

    // --- MÉTHODES D'ÉCRITURE (MUTATIONS) ---

    async addToCart(userId, variantId, quantity) {
        const cart = await cartsRepo.getOrCreate(userId);

        // 1. Validation Produit & Stock (Toujours en temps réel via SQL)
        const variant = await productsRepo.findVariantById(variantId);
        if (!variant) throw new AppError('Produit introuvable', HTTP_STATUS.NOT_FOUND);

        const inventory = await inventoryRepo.findByVariantId(variantId);
        const available = inventory?.availableStock ?? 0;

        if (available < quantity) {
            throw new AppError(`Stock insuffisant. Disponible : ${available}`, HTTP_STATUS.BAD_REQUEST);
        }

        // 2. Écriture SQL
        const result = await cartsRepo.addItem({ cartId: cart.id, variantId, quantity });

        // 3. Invalidation Cache
        await this.#invalidateCartCache(cart.id);

        return result;
    }

    async updateItemQuantity(userId, itemId, newQuantity) {
        const cart = await cartsRepo.getOrCreate(userId);
        const items = await cartsRepo.listItems(cart.id);

        const item = items.find((i) => String(i.id) === String(itemId));
        if (!item) throw new AppError('Article non trouvé dans le panier', HTTP_STATUS.NOT_FOUND);

        // Validation Stock avant update
        const inventory = await inventoryRepo.findByVariantId(item.variantId);
        const available = inventory?.availableStock ?? 0;

        if (available < newQuantity) {
            throw new AppError(
                `Stock insuffisant : seulement ${available} disponibles.`,
                HTTP_STATUS.BAD_REQUEST
            );
        }

        const result = await cartsRepo.updateItemQuantity(itemId, newQuantity);

        // Invalidation Cache
        await this.#invalidateCartCache(cart.id);

        return result;
    }

    async removeItemFromCart(userId, itemId) {
        const cart = await cartsRepo.getOrCreate(userId);
        const items = await cartsRepo.listItems(cart.id);

        // Sécurité : Vérifier que l'item appartient bien au panier de l'user
        const itemExists = items.some((i) => String(i.id) === String(itemId));
        if (!itemExists) throw new AppError("Cet article n'existe pas dans votre panier", HTTP_STATUS.NOT_FOUND);

        await cartsRepo.removeItem(itemId);

        // Invalidation Cache
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

        // On utilise addToCart en boucle qui gère déjà les stocks et l'invalidation
        // Note: On pourrait optimiser pour ne faire qu'une invalidation à la fin, 
        // mais pour une fusion (rare), la sécurité prévaut.
        for (const item of guestItems) {
            await this.addToCart(userId, item.variantId, item.quantity);
        }

        await cartsRepo.delete(guestCartId);

        // On nettoie le cache du panier invité (qui n'existe plus) par précaution
        await this.#invalidateCartCache(guestCartId);
        // Le cache du User a été invalidé par les appels successifs à addToCart

        return this.getFullCart(userCart.id);
    }
}

export const cartService = new CartService();