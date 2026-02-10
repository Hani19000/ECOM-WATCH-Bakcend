/**
 * @module Repository/Categories
 * Gère la taxonomie des produits et les associations via product_categories.
 * * Note technique : La colonne 'parent_category_id' a été retirée car elle ne figure pas 
 * dans le schéma de base actuel pour éviter les erreurs SQL 42703.
 */
import { pgPool } from '../config/database.js';
import { mapRow, mapRows } from './_mappers.js';
import { validateUUID } from '../utils/validation.js';
import { logError } from '../utils/logger.js';

export const categoriesRepo = {
  /**
   * Crée une catégorie.
   * Retourne l'objet mappé ou null si un conflit de slug survient.
   */
  async create({ name, slug }) {
    // Suppression de parent_category_id pour correspondre au schéma physique
    const sql = `
      INSERT INTO categories (name, slug)
      VALUES ($1, $2)
      RETURNING *
    `;

    try {
      const { rows } = await pgPool.query(sql, [name, slug]);
      return mapRow(rows[0]);
    } catch (error) {
      // Gestion spécifique du conflit d'unicité (slug)
      if (error.code === '23505') return null;

      logError(error, { method: 'categoriesRepo.create', name, slug });
      throw error;
    }
  },

  /**
   * Récupère une catégorie par son ID unique (UUID)
   */
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

  /**
   * Récupère une catégorie par son slug (utile pour le SEO et le front-end)
   */
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

  /**
   * Liste toutes les catégories par ordre alphabétique
   */
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
   * Associe un produit à une catégorie (Idempotent)
   */
  async addProductCategory(productId, categoryId, client = pgPool) { // <-- Accepte le client
    validateUUID(productId, 'productId');
    validateUUID(categoryId, 'categoryId');

    const sql = `
      INSERT INTO product_categories (product_id, category_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING *
    `;

    try {
      const { rows } = await client.query(sql, [productId, categoryId]);
      return mapRow(rows[0]);
    } catch (error) {
      logError(error, { method: 'categoriesRepo.addProductCategory', productId, categoryId });
      throw error;
    }
  },

  /**
   * Retire une association entre un produit et une catégorie
   */
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

  /**
   * Liste les catégories liées à un produit spécifique
   */
  async listByProductId(productId) {
    validateUUID(productId, 'productId');

    const sql = `
      SELECT c.*
      FROM product_categories pc
      JOIN categories c ON c.id = pc.category_id
      WHERE pc.product_id = $1
      ORDER BY c.name ASC
    `;

    try {
      const { rows } = await pgPool.query(sql, [productId]);
      return mapRows(rows);
    } catch (error) {
      logError(error, { method: 'categoriesRepo.listByProductId', productId });
      throw error;
    }
  },
  /**
  * Met à jour partiellement une catégorie.
  **/
  async update(id, data) {
    validateUUID(id, 'categoryId');
    const { name, slug } = data;

    // On ne garde que les colonnes qui existent réellement en base
    const sql = `
        UPDATE categories 
        SET name = COALESCE($1, name), 
            slug = COALESCE($2, slug)
        WHERE id = $3
        RETURNING *`;

    try {
      const { rows } = await pgPool.query(sql, [name, slug, id]);
      return mapRow(rows[0]);
    } catch (error) {
      logError(error, { method: 'categoriesRepo.update', id, data });
      throw error;
    }
  },

  /**
   * Supprime une catégorie.
   */
  async delete(id) {
    validateUUID(id, 'categoryId');
    try {
      const { rowCount } = await pgPool.query('DELETE FROM categories WHERE id = $1', [id]);
      return rowCount > 0;
    } catch (error) {
      logError(error, { method: 'categoriesRepo.delete', id });
      throw error;
    }
  }
};