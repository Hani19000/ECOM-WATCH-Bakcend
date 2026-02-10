/**
 * @module Repository/Products
 *
 * Gère le catalogue produits et leurs variantes.
 * Toutes les méthodes de mutation acceptent un client optionnel
 * pour pouvoir s'exécuter dans une transaction externe.
 */
import { pgPool } from '../config/database.js';
import { mapRow, mapRows } from './_mappers.js';
import { PRODUCT_STATUS, validateEnum as validateProductEnum } from '../constants/enums.js';
import { validateRequired, validateSlug } from '../utils/validation.js';
import { NotFoundError, assertExists, AppError } from '../utils/appError.js';

export const productsRepo = {
  /**
   * Crée un produit en statut DRAFT par défaut.
   * Le produit n'est visible côté catalogue qu'une fois passé en ACTIVE,
   * ce qui permet une publication différée.
   */
  async create({ name, slug, description, status = PRODUCT_STATUS.DRAFT }, client = pgPool) {
    validateRequired({ name, slug }, ['name', 'slug']);
    validateSlug(slug);
    validateProductEnum(status, PRODUCT_STATUS, 'status');

    const { rows } = await client.query(
      `INSERT INTO products (name, slug, description, status)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
      [name, slug, description ?? null, status]
    );

    return mapRow(rows[0]);
  },

  async findById(id, client = pgPool) {
    const { rows } = await client.query(
      `SELECT * FROM products WHERE id = $1`,
      [id]
    );

    return mapRow(rows[0]);
  },

  /**
   * Variante stricte de findById : lève une NotFoundError si le produit est absent.
   * Préférer cette méthode dans les services pour éviter les vérifications null répétitives.
   */
  async findByIdOrFail(id, client = pgPool) {
    const product = await this.findById(id, client);
    return assertExists(product, 'Product', id);
  },

  async findBySlug(slug, client = pgPool) {
    const { rows } = await client.query(
      `SELECT * FROM products WHERE slug = $1`,
      [slug]
    );

    return mapRow(rows[0]);
  },

  async findBySlugOrFail(slug, client = pgPool) {
    const product = await this.findBySlug(slug, client);
    if (!product) throw new NotFoundError('Product', slug);
    return product;
  },

  /**
   * Liste les produits avec pagination et filtre optionnel par statut.
   * Retourne également le total pour calculer la pagination côté client.
   */
  async list({ status, categorySlug, page = 1, limit = 20 } = {}, client = pgPool) {
    const offset = (page - 1) * limit;
    const params = [];
    let queryIndex = 1;

    const conditions = [];
    if (status) {
      conditions.push(`p.status = $${queryIndex++}`);
      params.push(status);
    }
    if (categorySlug) {
      conditions.push(`c.slug = $${queryIndex++}`);
      params.push(categorySlug);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Jointure nécessaire seulement si on filtre par catégorie
    const joinClause = categorySlug
      ? `JOIN product_categories pc ON p.id = pc.product_id 
           JOIN categories c ON c.id = pc.category_id`
      : '';

    const { rows: countRows } = await client.query(
      `SELECT COUNT(DISTINCT p.id) FROM products p ${joinClause} ${whereClause}`,
      params
    );
    const total = parseInt(countRows[0].count);

    // Dans productsRepo.list
    const { rows } = await client.query(
      `SELECT 
      p.*, 
      MIN(v.price) as starting_price,
      COUNT(v.id) as variant_count,
      -- On récupère un aperçu léger des variantes pour le catalogue
      COALESCE(
        json_agg(
          json_build_object('id', v.id, 'attributes', v.attributes)
        ) FILTER (WHERE v.id IS NOT NULL), '[]'
      ) as variants_preview
   FROM products p
   LEFT JOIN product_variants v ON p.id = v.product_id
   ${joinClause}
   ${whereClause}
   GROUP BY p.id
   ORDER BY p.created_at DESC
   LIMIT $${queryIndex++} OFFSET $${queryIndex++}`,
      [...params, limit, offset]
    );

    return {
      data: mapRows(rows),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  },

  /**
   * Charge plusieurs produits en une seule requête (bulk fetch).
   * Évite le problème N+1 lors de l'hydratation de listes de commandes ou de paniers.
   */
  async findByIds(ids, client = pgPool) {
    if (!ids || ids.length === 0) return [];

    const { rows } = await client.query(
      `SELECT * FROM products WHERE id = ANY($1) ORDER BY created_at DESC`,
      [ids]
    );

    return mapRows(rows);
  },

  async count({ status } = {}, client = pgPool) {
    const whereClause = status ? 'WHERE status = $1' : '';
    const params = status ? [status] : [];

    const { rows } = await client.query(
      `SELECT COUNT(*) FROM products ${whereClause}`,
      params
    );

    return parseInt(rows[0].count);
  },

  async updateStatus(id, status, client = pgPool) {
    validateProductEnum(status, PRODUCT_STATUS, 'status');

    const { rows } = await client.query(
      `UPDATE products SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, status]
    );

    return assertExists(mapRow(rows[0]), 'Product', id);
  },

  /**
   * Met à jour les champs d'un produit dynamiquement.
   * Seuls les champs fournis sont modifiés, les autres restent inchangés.
   * Si aucun champ n'est fourni, retourne le produit tel quel sans requête UPDATE.
   */
  async update(id, { name, slug, description, status }, client = pgPool) {
    if (slug) validateSlug(slug);
    if (status) validateProductEnum(status, PRODUCT_STATUS, 'status');

    const updates = [];
    const params = [id];
    let paramIdx = 2;

    if (name !== undefined) { updates.push(`name        = $${paramIdx++}`); params.push(name); }
    if (slug !== undefined) { updates.push(`slug        = $${paramIdx++}`); params.push(slug); }
    if (description !== undefined) { updates.push(`description = $${paramIdx++}`); params.push(description); }
    if (status !== undefined) { updates.push(`status      = $${paramIdx++}`); params.push(status); }

    if (updates.length === 0) return this.findById(id, client);

    updates.push('updated_at = NOW()');

    const { rows } = await client.query(
      `UPDATE products SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );

    return assertExists(mapRow(rows[0]), 'Product', id);
  },

  // --- Variantes ---

  /**
   * Ajoute une variante à un produit existant.
   * Les attributs (taille, couleur…) sont stockés en JSON pour rester flexibles
   * sans migration de schéma à chaque nouveau type d'attribut.
   */
  async addVariant({ productId, sku, price, attributes }, client = pgPool) {
    validateRequired({ productId, sku, price }, ['productId', 'sku', 'price']);

    const { rows } = await client.query(
      `INSERT INTO product_variants (product_id, sku, price, attributes)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
      [productId, sku, price, attributes ? JSON.stringify(attributes) : null]
    );

    return mapRow(rows[0]);
  },

  async findVariantById(id, client = pgPool) {
    const { rows } = await client.query(
      `SELECT * FROM product_variants WHERE id = $1`,
      [id]
    );

    return mapRow(rows[0]);
  },

  async findVariantBySku(sku, client = pgPool) {
    const { rows } = await client.query(
      `SELECT * FROM product_variants WHERE sku = $1`,
      [sku]
    );

    return mapRow(rows[0]);
  },

  async listVariantsByProduct(productId, client = pgPool) {
    const { rows } = await client.query(
      `SELECT * FROM product_variants WHERE product_id = $1 ORDER BY price ASC`,
      [productId]
    );

    return mapRows(rows);
  },

  async updateVariant(id, { sku, price, attributes }, client = pgPool) {
    if (price !== undefined && (typeof price !== 'number' || price < 0)) {
      throw new AppError('Le prix doit être un nombre positif', 400);
    }

    const { rows } = await client.query(
      `UPDATE product_variants
             SET sku        = COALESCE($2, sku),
                 price      = COALESCE($3, price),
                 attributes = COALESCE($4, attributes),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
      [id, sku, price, attributes ? JSON.stringify(attributes) : null]
    );

    return assertExists(mapRow(rows[0]), 'ProductVariant', id);
  },

  async deleteVariant(id, client = pgPool) {
    const { rowCount } = await client.query(
      `DELETE FROM product_variants WHERE id = $1`,
      [id]
    );

    if (rowCount === 0) throw new NotFoundError('ProductVariant', id);
    return true;
  },

  async deleteById(id, client = pgPool) {
    const { rowCount } = await client.query(
      `DELETE FROM products WHERE id = $1`,
      [id]
    );

    if (rowCount === 0) throw new NotFoundError('Product', id);
    return true;
  },

  /**
   * Retourne un produit avec toutes ses variantes et leur stock en une seule requête.
   * Évite les allers-retours multiples lors du rendu d'une page produit.
   * La liste de colonnes autorisées (validColumns) protège contre l'injection SQL
   * sur le paramètre dynamique `column`.
   */
  async getFullDetails(identifier, column = 'slug', client = pgPool) {
    const validColumns = ['id', 'slug'];
    if (!validColumns.includes(column)) throw new Error('Invalid column name');

    const { rows } = await client.query(
      `SELECT
               p.*,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'id',         v.id,
                     'sku',        v.sku,
                     'price',      v.price,
                     'attributes', v.attributes,
                     'inventory',  json_build_object('available_stock', COALESCE(i.available_stock, 0))
                   )
                 ) FILTER (WHERE v.id IS NOT NULL), '[]'
               ) AS variants
             FROM products p
             LEFT JOIN product_variants v ON p.id = v.product_id
             LEFT JOIN inventory        i ON v.id = i.variant_id
             WHERE p.${column} = $1
             GROUP BY p.id`,
      [identifier]
    );

    return rows[0] ? mapRow(rows[0]) : null;
  },
};