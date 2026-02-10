/**
 * @module Repository/Carts
 *
 * Gère la persistance du panier et de ses articles.
 * Le panier peut appartenir à un utilisateur connecté ou être anonyme (guest checkout).
 */
import { pgPool } from '../config/database.js';
import { mapRow, mapRows } from './_mappers.js';
import { validateUUID, validateQuantity } from '../utils/validation.js';
import { NotFoundError, assertExists } from '../utils/appError.js';

export const cartsRepo = {
  /**
   * Crée un nouveau panier, associé ou non à un utilisateur.
   * Un panier anonyme (userId = null) est conservé pour le guest checkout.
   */
  async create({ userId = null } = {}) {
    if (userId) validateUUID(userId, 'userId');

    const { rows } = await pgPool.query(
      `INSERT INTO carts (user_id) VALUES ($1) RETURNING *`,
      [userId]
    );

    return mapRow(rows[0]);
  },

  async findById(id) {
    validateUUID(id, 'cartId');

    const { rows } = await pgPool.query(
      `SELECT * FROM carts WHERE id = $1`,
      [id]
    );

    return mapRow(rows[0]);
  },

  /**
   * Variante stricte de findById : lève une erreur si le panier est introuvable.
   * Préférer cette méthode dans les services pour éviter les vérifications répétitives.
   */
  async findByIdOrFail(id) {
    const cart = await this.findById(id);
    return assertExists(cart, 'Cart', id);
  },

  async findByUserId(userId) {
    validateUUID(userId, 'userId');

    const { rows } = await pgPool.query(
      `SELECT * FROM carts WHERE user_id = $1`,
      [userId]
    );

    return mapRow(rows[0]);
  },

  /**
   * Récupère le panier d'un utilisateur ou en crée un s'il n'en a pas encore.
   * Évite une double requête (find + create) dans les services.
   */
  async getOrCreate(userId) {
    validateUUID(userId, 'userId');

    const existing = await this.findByUserId(userId);
    return existing ?? await this.create({ userId });
  },

  /**
   * Ajoute un article au panier ou incrémente sa quantité s'il est déjà présent.
   * L'ON CONFLICT garantit l'atomicité sans nécessiter de vérification préalable.
   */
  async addItem({ cartId, variantId, quantity }) {
    validateUUID(cartId, 'cartId');
    validateUUID(variantId, 'variantId');
    validateQuantity(quantity, 'quantity');

    const { rows } = await pgPool.query(
      `INSERT INTO cart_items (cart_id, variant_id, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (cart_id, variant_id)
             DO UPDATE SET
               quantity   = cart_items.quantity + EXCLUDED.quantity,
               updated_at = NOW()
             RETURNING *`,
      [cartId, variantId, quantity]
    );

    return mapRow(rows[0]);
  },

  /**
   * Écrase la quantité d'un article (contrairement à addItem qui additionne).
   * Utilisé typiquement depuis le panier UI où l'utilisateur saisit une quantité exacte.
   */
  async setItemQuantity({ cartId, variantId, quantity }) {
    validateUUID(cartId, 'cartId');
    validateUUID(variantId, 'variantId');
    validateQuantity(quantity, 'quantity');

    const { rows } = await pgPool.query(
      `INSERT INTO cart_items (cart_id, variant_id, quantity)
             VALUES ($1, $2, $3)
             ON CONFLICT (cart_id, variant_id)
             DO UPDATE SET
               quantity   = EXCLUDED.quantity,
               updated_at = NOW()
             RETURNING *`,
      [cartId, variantId, quantity]
    );

    return mapRow(rows[0]);
  },

  async updateItemQuantity(id, quantity) {
    validateQuantity(quantity, 'quantity');

    const { rows } = await pgPool.query(
      `UPDATE cart_items SET quantity = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, quantity]
    );

    return assertExists(mapRow(rows[0]), 'CartItem', id);
  },

  async removeItem(id) {
    const { rowCount } = await pgPool.query(
      `DELETE FROM cart_items WHERE id = $1`,
      [id]
    );

    if (rowCount === 0) throw new NotFoundError('CartItem', id);
    return true;
  },

  async removeItemByVariant(cartId, variantId) {
    validateUUID(cartId, 'cartId');
    validateUUID(variantId, 'variantId');

    const { rowCount } = await pgPool.query(
      `DELETE FROM cart_items WHERE cart_id = $1 AND variant_id = $2`,
      [cartId, variantId]
    );

    return rowCount > 0;
  },

  async clearCart(cartId) {
    validateUUID(cartId, 'cartId');

    await pgPool.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);
    return true;
  },

  /**
   * Liste les articles du panier avec les détails produit et le stock disponible.
   * La jointure vers l'inventaire permet de détecter les ruptures côté service
   * sans requête supplémentaire.
   */
  async listItems(cartId) {
    validateUUID(cartId, 'cartId');

    const { rows } = await pgPool.query(
      `SELECT
               ci.id,
               ci.cart_id,
               ci.variant_id,
               ci.quantity,
               pv.price,
               pv.sku,
               pv.attributes,
               p.id      AS product_id,
               p.name    AS product_name,
               p.slug    AS product_slug,
               p.status  AS product_status,
               i.available_stock,
               i.reserved_stock
             FROM cart_items ci
             JOIN product_variants pv ON ci.variant_id = pv.id
             JOIN products         p  ON pv.product_id = p.id
             LEFT JOIN inventory   i  ON pv.id = i.variant_id
             WHERE ci.cart_id = $1
             ORDER BY ci.created_at ASC`,
      [cartId]
    );

    return mapRows(rows);
  },

  async calculateTotal(cartId) {
    validateUUID(cartId, 'cartId');

    const { rows } = await pgPool.query(
      `SELECT COALESCE(SUM(ci.quantity * pv.price), 0) AS total
             FROM cart_items ci
             JOIN product_variants pv ON ci.variant_id = pv.id
             WHERE ci.cart_id = $1`,
      [cartId]
    );

    return parseFloat(rows[0].total);
  },

  async countItems(cartId) {
    validateUUID(cartId, 'cartId');

    const { rows } = await pgPool.query(
      `SELECT COALESCE(SUM(quantity), 0) AS count FROM cart_items WHERE cart_id = $1`,
      [cartId]
    );

    return parseInt(rows[0].count);
  },

  async hasItems(cartId) {
    const count = await this.countItems(cartId);
    return count > 0;
  },

  /**
   * Supprime le panier et ses articles via CASCADE.
   * Appelé après conversion en commande pour ne pas laisser de paniers orphelins.
   */
  async delete(cartId) {
    validateUUID(cartId, 'cartId');

    const { rowCount } = await pgPool.query(
      `DELETE FROM carts WHERE id = $1`,
      [cartId]
    );

    if (rowCount === 0) throw new NotFoundError('Cart', cartId);
    return true;
  },
};