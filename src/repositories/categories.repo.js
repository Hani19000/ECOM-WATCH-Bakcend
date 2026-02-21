/**
 * @module Repository/Categories
 *
 * Gère la taxonomie des produits et les associations via product_categories.
 *
 * Note : La colonne 'parent_category_id' a été retirée car elle ne figure pas
 * dans le schéma de base actuel pour éviter les erreurs SQL 42703.
 */
import { pgPool } from '../config/database.js';
import { mapRow, mapRows } from './_mappers.js';
import { validateUUID } from '../utils/validation.js';
import { logError } from '../utils/logger.js';

export const categoriesRepo = {
  /**
   * Crée une catégorie.
   * Retourne null si un conflit de slug survient plutôt que de lever une erreur —
   * le service lève une AppError avec un message métier plus explicite.
   */
  async create({ name, slug }) {
    try {
      const { rows } = await pgPool.query(
        `INSERT INTO categories (name, slug)
                 VALUES ($1, $2)
                 RETURNING *`,
        [name, slug]
      );
      return mapRow(rows[0]);
    } catch (error) {
      if (error.code === '23505') return null;
      logError(error, { method: 'categoriesRepo.create', name, slug });
      throw error;
    }
  },

  async findById(id) {
    validateUUID(id, 'categoryId');
    try {
      const { rows } = await pgPool.query(
        'SELECT * FROM categories WHERE id = $1',
        [id]
      );
      return mapRow(rows[0]);
    } catch (error) {
      logError(error, { method: 'categoriesRepo.findById', id });
      throw error;
    }
  },

  async findBySlug(slug) {
    try {
      const { rows } = await pgPool.query(
        'SELECT * FROM categories WHERE slug = $1',
        [slug]
      );
      return mapRow(rows[0]);
    } catch (error) {
      logError(error, { method: 'categoriesRepo.findBySlug', slug });
      throw error;
    }
  },

  async list() {
    try {
      const { rows } = await pgPool.query(
        'SELECT * FROM categories ORDER BY name ASC'
      );
      return mapRows(rows);
    } catch (error) {
      logError(error, { method: 'categoriesRepo.list' });
      throw error;
    }
  },

  /**
   * Associe un produit à une catégorie (idempotent).
   * Accepte un client de transaction pour être couplé à la création de produit.
   * Appelé par products.service.js (avec client) et categories.service.js (sans client).
   */
  async addProductCategory(productId, categoryId, client = pgPool) {
    validateUUID(productId, 'productId');
    validateUUID(categoryId, 'categoryId');
    try {
      const { rows } = await client.query(
        `INSERT INTO product_categories (product_id, category_id)
                 VALUES ($1, $2)
                 ON CONFLICT DO NOTHING
                 RETURNING *`,
        [productId, categoryId]
      );
      return mapRow(rows[0]);
    } catch (error) {
      logError(error, { method: 'categoriesRepo.addProductCategory', productId, categoryId });
      throw error;
    }
  },

  /**
   * Alias de addProductCategory sans client transactionnel.
   * Appelé par categories.service.js → assignCategoriesToProduct().
   */
  async linkProductToCategory(productId, categoryId) {
    return this.addProductCategory(productId, categoryId);
  },

  async removeProductCategory(productId, categoryId) {
    validateUUID(productId, 'productId');
    validateUUID(categoryId, 'categoryId');
    try {
      const { rowCount } = await pgPool.query(
        'DELETE FROM product_categories WHERE product_id = $1 AND category_id = $2',
        [productId, categoryId]
      );
      return rowCount > 0;
    } catch (error) {
      logError(error, { method: 'categoriesRepo.removeProductCategory', productId, categoryId });
      throw error;
    }
  },

  async listByProductId(productId) {
    validateUUID(productId, 'productId');
    try {
      const { rows } = await pgPool.query(
        `SELECT c.*
                 FROM product_categories pc
                 JOIN categories c ON c.id = pc.category_id
                 WHERE pc.product_id = $1
                 ORDER BY c.name ASC`,
        [productId]
      );
      return mapRows(rows);
    } catch (error) {
      logError(error, { method: 'categoriesRepo.listByProductId', productId });
      throw error;
    }
  },

  async update(id, data) {
    validateUUID(id, 'categoryId');
    const { name, slug } = data;
    try {
      const { rows } = await pgPool.query(
        `UPDATE categories
                 SET name = COALESCE($1, name),
                     slug = COALESCE($2, slug)
                 WHERE id = $3
                 RETURNING *`,
        [name, slug, id]
      );
      return mapRow(rows[0]);
    } catch (error) {
      logError(error, { method: 'categoriesRepo.update', id, data });
      throw error;
    }
  },

  async delete(id) {
    validateUUID(id, 'categoryId');
    try {
      const { rowCount } = await pgPool.query(
        'DELETE FROM categories WHERE id = $1',
        [id]
      );
      return rowCount > 0;
    } catch (error) {
      logError(error, { method: 'categoriesRepo.delete', id });
      throw error;
    }
  },

  async removeAllFromProduct(productId, client = pgPool) {
    await client.query(
      `DELETE FROM product_categories WHERE product_id = $1`,
      [productId]
    );
  },
};