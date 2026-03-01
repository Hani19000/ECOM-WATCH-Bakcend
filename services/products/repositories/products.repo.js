/**
 * @module Repository/Products
 *
 * Gère le catalogue produits, les variantes et l'intégration des promotions actives.
 * Les requêtes de lecture embarquent les promotions directement en SQL pour éviter
 * les requêtes N+1 côté service.
 */
import { pgPool } from '../config/database.js';
import { mapRow, mapRows } from './_mappers.js';
import { PRODUCT_STATUS, isValidEnum } from '../constants/enums.js';
import { validateRequired, validateSlug } from '../utils/validation.js';
import { NotFoundError, assertExists } from '../utils/appError.js';

export const productsRepo = {
  async create({ name, slug, description, status = PRODUCT_STATUS.DRAFT }, client = pgPool) {
    validateRequired({ name, slug }, ['name', 'slug']);
    validateSlug(slug);
    isValidEnum(status, PRODUCT_STATUS, 'status');

    const { rows } = await client.query(
      `INSERT INTO products (name, slug, description, status) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, slug, description ?? null, status]
    );
    return mapRow(rows[0]);
  },

  async findById(id, client = pgPool) {
    const { rows } = await client.query(`SELECT * FROM products WHERE id = $1`, [id]);
    return mapRow(rows[0]);
  },

  async findBySlug(slug, client = pgPool) {
    const { rows } = await client.query(`SELECT * FROM products WHERE slug = $1`, [slug]);
    return mapRow(rows[0]);
  },

  /**
   * Liste les produits avec filtres dynamiques, pagination et promotions actives embarquées.
   * Les promotions (variante ou produit) sont calculées en SQL pour retourner
   * directement le prix réduit sans requête supplémentaire côté service.
   */
  async list({ status, categorySlug, size, search, page = 1, limit = 20 } = {}, client = pgPool) {
    const offset = (page - 1) * limit;
    const params = [];
    let queryIndex = 1;
    const conditions = [];

    if (status && status !== 'ALL') {
      conditions.push(`p.status = $${queryIndex++}`);
      params.push(status);
    }

    if (categorySlug) {
      conditions.push(`c.slug = $${queryIndex++}`);
      params.push(categorySlug);
    }
    if (size) {
      conditions.push(`v.attributes @> $${queryIndex++}`);
      params.push(JSON.stringify({ size }));
    }

    if (search) {
      conditions.push(`(
            p.name ILIKE $${queryIndex} OR
            p.description ILIKE $${queryIndex} OR
            v.sku ILIKE $${queryIndex}
        )`);
      params.push(`%${search}%`);
      queryIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const joinClause = categorySlug
      ? `LEFT JOIN product_variants v ON p.id = v.product_id
           JOIN product_categories pc ON p.id = pc.product_id
           JOIN categories c ON c.id = pc.category_id`
      : `LEFT JOIN product_variants v ON p.id = v.product_id
           LEFT JOIN product_categories pc ON p.id = pc.product_id
           LEFT JOIN categories c ON c.id = pc.category_id`;

    const { rows: countRows } = await client.query(
      `SELECT COUNT(DISTINCT p.id) FROM products p ${joinClause} ${whereClause}`,
      params
    );
    const total = parseInt(countRows[0].count, 10);

    const limitIdx = queryIndex++;
    const offsetIdx = queryIndex++;
    const dataParams = [...params, limit, offset];

    const { rows } = await client.query(
      `SELECT
                p.*,
                MIN(v.price) as starting_price,
                COUNT(DISTINCT v.id) as variant_count,
                MIN(c.name) as category_name,
                COALESCE(
                    json_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name))
                    FILTER (WHERE c.id IS NOT NULL), '[]'
                ) as categories,
                COALESCE(
                    json_agg(
                        DISTINCT jsonb_build_object(
                            'id', v.id,
                            'attributes', v.attributes,
                            'price', v.price,
                            'inventory', jsonb_build_object('availableStock', COALESCE(i.available_stock, 0)),
                            'promotion', CASE
                                WHEN promo_v.id IS NOT NULL THEN jsonb_build_object(
                                    'id', promo_v.id,
                                    'name', promo_v.name,
                                    'discountType', promo_v.discount_type,
                                    'discountValue', promo_v.discount_value,
                                    'startDate', promo_v.start_date,
                                    'endDate', promo_v.end_date,
                                    'discountedPrice',
                                        CASE
                                            WHEN promo_v.discount_type = 'PERCENTAGE' THEN ROUND(v.price * (1 - promo_v.discount_value / 100.0), 2)
                                            WHEN promo_v.discount_type = 'FIXED' THEN GREATEST(0, v.price - promo_v.discount_value)
                                            ELSE v.price
                                        END
                                )
                                WHEN promo_p.id IS NOT NULL THEN jsonb_build_object(
                                    'id', promo_p.id,
                                    'name', promo_p.name,
                                    'discountType', promo_p.discount_type,
                                    'discountValue', promo_p.discount_value,
                                    'startDate', promo_p.start_date,
                                    'endDate', promo_p.end_date,
                                    'discountedPrice',
                                        CASE
                                            WHEN promo_p.discount_type = 'PERCENTAGE' THEN ROUND(v.price * (1 - promo_p.discount_value / 100.0), 2)
                                            WHEN promo_p.discount_type = 'FIXED' THEN GREATEST(0, v.price - promo_p.discount_value)
                                            ELSE v.price
                                        END
                                )
                                ELSE NULL
                            END
                        )
                    ) FILTER (WHERE v.id IS NOT NULL), '[]'
                ) as variants_preview
            FROM products p
            LEFT JOIN product_variants v ON p.id = v.product_id
            LEFT JOIN inventory i ON v.id = i.variant_id
            LEFT JOIN variant_promotions vp ON v.id = vp.variant_id
            LEFT JOIN promotions promo_v ON vp.promotion_id = promo_v.id
                AND promo_v.status = 'ACTIVE'
                AND promo_v.start_date <= NOW()
                AND promo_v.end_date >= NOW()
            LEFT JOIN product_promotions pp ON p.id = pp.product_id
            LEFT JOIN promotions promo_p ON pp.promotion_id = promo_p.id
                AND promo_p.status = 'ACTIVE'
                AND promo_p.start_date <= NOW()
                AND promo_p.end_date >= NOW()
            ${categorySlug
        ? 'JOIN product_categories pc ON p.id = pc.product_id JOIN categories c ON c.id = pc.category_id'
        : 'LEFT JOIN product_categories pc ON p.id = pc.product_id LEFT JOIN categories c ON c.id = pc.category_id'
      }
            ${whereClause}
            GROUP BY p.id
            ORDER BY p.created_at DESC
            LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      dataParams
    );

    return {
      data: mapRows(rows),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async update(id, { name, slug, description, status }, client = pgPool) {
    if (slug) validateSlug(slug);
    if (status) isValidEnum(status, PRODUCT_STATUS, 'status');

    const updates = [];
    const params = [id];
    let paramIdx = 2;

    if (name !== undefined) { updates.push(`name = $${paramIdx++}`); params.push(name); }
    if (slug !== undefined) { updates.push(`slug = $${paramIdx++}`); params.push(slug); }
    if (description !== undefined) { updates.push(`description = $${paramIdx++}`); params.push(description); }
    if (status !== undefined) { updates.push(`status = $${paramIdx++}`); params.push(status); }

    if (updates.length === 0) return this.findById(id, client);

    updates.push('updated_at = NOW()');
    const { rows } = await client.query(
      `UPDATE products SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    return assertExists(mapRow(rows[0]), 'Product', id);
  },

  async getUniqueSizes(client = pgPool) {
    const { rows } = await client.query(`
            SELECT DISTINCT v.attributes->>'size' as size
            FROM product_variants v
            WHERE v.attributes->>'size' IS NOT NULL
            ORDER BY size ASC
        `);
    return rows.map((r) => r.size);
  },

  // --- Variantes ---

  async addVariant({ productId, sku, price, attributes }, client = pgPool) {
    validateRequired({ productId, sku, price }, ['productId', 'sku', 'price']);
    const { rows } = await client.query(
      `INSERT INTO product_variants (product_id, sku, price, attributes) VALUES ($1, $2, $3, $4) RETURNING *`,
      [productId, sku, price, attributes || null]
    );
    return mapRow(rows[0]);
  },

  async findVariantBySku(sku, client = pgPool) {
    const { rows } = await client.query(`SELECT * FROM product_variants WHERE sku = $1`, [sku]);
    return mapRow(rows[0]);
  },

  async listVariantsByProduct(productId, client = pgPool) {
    const { rows } = await client.query(
      `SELECT * FROM product_variants WHERE product_id = $1 ORDER BY price ASC`,
      [productId]
    );
    return mapRows(rows);
  },

  async deleteById(id, client = pgPool) {
    const { rowCount } = await client.query(`DELETE FROM products WHERE id = $1`, [id]);
    if (rowCount === 0) throw new NotFoundError('Product', id);
    return true;
  },

  /**
   * Retourne les détails complets d'un produit avec ses variantes, catégories et promotions actives.
   * Tout est agrégé en une seule requête SQL pour éviter les N+1.
   */
  async getFullDetails(identifier, column = 'slug', client = pgPool) {
    const validColumns = ['id', 'slug'];
    if (!validColumns.includes(column)) throw new Error('Invalid column name');

    const { rows } = await client.query(
      `SELECT
                p.*,
                COALESCE(
                    json_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name, 'slug', c.slug))
                    FILTER (WHERE c.id IS NOT NULL), '[]'
                ) AS categories,
                COALESCE(
                    json_agg(DISTINCT
                        jsonb_build_object(
                            'id', v.id,
                            'sku', v.sku,
                            'price', v.price,
                            'attributes', v.attributes,
                            'inventory', jsonb_build_object('available_stock', COALESCE(i.available_stock, 0)),
                            'promotion', CASE
                                WHEN promo_v.id IS NOT NULL THEN jsonb_build_object(
                                    'id', promo_v.id,
                                    'name', promo_v.name,
                                    'discountType', promo_v.discount_type,
                                    'discountValue', promo_v.discount_value,
                                    'startDate', promo_v.start_date,
                                    'endDate', promo_v.end_date,
                                    'discountedPrice',
                                        CASE
                                            WHEN promo_v.discount_type = 'PERCENTAGE'
                                                THEN ROUND(v.price * (1 - promo_v.discount_value / 100.0), 2)
                                            WHEN promo_v.discount_type = 'FIXED'
                                                THEN GREATEST(0, v.price - promo_v.discount_value)
                                            ELSE v.price
                                        END
                                )
                                WHEN promo_p.id IS NOT NULL THEN jsonb_build_object(
                                    'id', promo_p.id,
                                    'name', promo_p.name,
                                    'discountType', promo_p.discount_type,
                                    'discountValue', promo_p.discount_value,
                                    'startDate', promo_p.start_date,
                                    'endDate', promo_p.end_date,
                                    'discountedPrice',
                                        CASE
                                            WHEN promo_p.discount_type = 'PERCENTAGE'
                                                THEN ROUND(v.price * (1 - promo_p.discount_value / 100.0), 2)
                                            WHEN promo_p.discount_type = 'FIXED'
                                                THEN GREATEST(0, v.price - promo_p.discount_value)
                                            ELSE v.price
                                        END
                                )
                                ELSE NULL
                            END
                        )
                    ) FILTER (WHERE v.id IS NOT NULL), '[]'
                ) AS variants
             FROM products p
             LEFT JOIN product_variants v ON p.id = v.product_id
             LEFT JOIN inventory i ON v.id = i.variant_id
             LEFT JOIN variant_promotions vp ON v.id = vp.variant_id
             LEFT JOIN promotions promo_v ON vp.promotion_id = promo_v.id
               AND promo_v.status = 'ACTIVE'
               AND promo_v.start_date <= NOW()
               AND promo_v.end_date >= NOW()
             LEFT JOIN product_promotions pp ON p.id = pp.product_id
             LEFT JOIN promotions promo_p ON pp.promotion_id = promo_p.id
               AND promo_p.status = 'ACTIVE'
               AND promo_p.start_date <= NOW()
               AND promo_p.end_date >= NOW()
             LEFT JOIN product_categories pc ON p.id = pc.product_id
             LEFT JOIN categories c ON c.id = pc.category_id
             WHERE p.${column} = $1
             GROUP BY p.id`,
      [identifier]
    );

    return rows[0] ? mapRow(rows[0]) : null;
  },

  async findVariantById(id) {
    const { rows } = await pgPool.query(
      'SELECT * FROM product_variants WHERE id = $1',
      [id]
    );
    return mapRow(rows[0]);
  },

  async updateVariant(id, { sku, price, attributes }) {
    const { rows } = await pgPool.query(
      `UPDATE product_variants
             SET sku        = COALESCE($1, sku),
                 price      = COALESCE($2, price),
                 attributes = COALESCE($3, attributes)
             WHERE id = $4
             RETURNING *`,
      [sku, price, attributes, id]
    );
    return mapRow(rows[0]);
  },

  async deleteVariantById(id, client = pgPool) {
    const { rowCount } = await client.query(
      `DELETE FROM product_variants WHERE id = $1`,
      [id]
    );
    return rowCount > 0;
  },

  async findExistingVariantIds(ids, client = pgPool) {
    if (!ids.length) return [];
    const { rows } = await client.query(
      `SELECT id FROM product_variants WHERE id = ANY($1::uuid[])`,
      [ids]
    );
    return rows.map((r) => r.id);
  },

  async validateVariants(ids, client = pgPool) {
    if (!ids.length) return [];
    const { rows } = await client.query(
      `SELECT v.id, COALESCE(i.available_stock, 0) as stock
             FROM product_variants v
             LEFT JOIN inventory i ON i.variant_id = v.id
             WHERE v.id = ANY($1::uuid[])`,
      [ids]
    );
    return rows.map((r) => ({ id: r.id, stock: parseInt(r.stock, 10) }));
  },

  async count(client = pgPool) {
    const { rows } = await client.query('SELECT COUNT(*) FROM products');
    return parseInt(rows[0].count, 10);
  },

  async countLowStock(threshold = 5, client = pgPool) {
    const { rows } = await client.query(
      `SELECT COUNT(DISTINCT v.product_id) AS count
       FROM product_variants v
       LEFT JOIN inventory i ON i.variant_id = v.id
       WHERE COALESCE(i.available_stock, 0) <= $1`,
      [threshold]
    );
    return parseInt(rows[0].count, 10);
  },

  /**
   * @method findActivePromotionPrice
   * Résout le prix effectif d'une variante en tenant compte des promotions actives
   * (variante ou produit entier), à l'intérieur d'une transaction externe.
   *
   * La logique promotion appartient au domaine "produit", pas "stock".
   * Cette méthode accepte un `client` pour s'exécuter dans la même transaction
   * que la réservation de stock, garantissant une vue cohérente de la DB.
   *
   * @param {string} variantId - UUID de la variante
   * @param {import('pg').PoolClient} client - Client de transaction
   * @returns {Promise<{ basePrice: number, effectivePrice: number, hasPromotion: boolean }>}
   */
  async findActivePromotionPrice(variantId, client = pgPool) {
    const { rows } = await client.query(
      `SELECT
            v.price                                                      AS base_price,
            CASE
                WHEN promo_v.id IS NOT NULL THEN
                    CASE
                        WHEN promo_v.discount_type = 'PERCENTAGE'
                            THEN ROUND(v.price * (1 - promo_v.discount_value / 100.0), 2)
                        WHEN promo_v.discount_type = 'FIXED'
                            THEN GREATEST(0, v.price - promo_v.discount_value)
                        ELSE v.price
                    END
                WHEN promo_p.id IS NOT NULL THEN
                    CASE
                        WHEN promo_p.discount_type = 'PERCENTAGE'
                            THEN ROUND(v.price * (1 - promo_p.discount_value / 100.0), 2)
                        WHEN promo_p.discount_type = 'FIXED'
                            THEN GREATEST(0, v.price - promo_p.discount_value)
                        ELSE v.price
                    END
                ELSE v.price
            END                                                          AS effective_price,
            (promo_v.id IS NOT NULL OR promo_p.id IS NOT NULL)          AS has_promotion
        FROM product_variants v
        LEFT JOIN variant_promotions vp
            ON v.id = vp.variant_id
        LEFT JOIN promotions promo_v
            ON vp.promotion_id = promo_v.id
            AND promo_v.status      = 'ACTIVE'
            AND promo_v.start_date <= NOW()
            AND promo_v.end_date   >= NOW()
        LEFT JOIN product_promotions pp
            ON v.product_id = pp.product_id
        LEFT JOIN promotions promo_p
            ON pp.promotion_id = promo_p.id
            AND promo_p.status      = 'ACTIVE'
            AND promo_p.start_date <= NOW()
            AND promo_p.end_date   >= NOW()
        WHERE v.id = $1`,
      [variantId]
    );

    if (!rows[0]) return null;

    return {
      basePrice: parseFloat(rows[0].base_price),
      effectivePrice: parseFloat(rows[0].effective_price),
      hasPromotion: rows[0].has_promotion,
    };
  },
};