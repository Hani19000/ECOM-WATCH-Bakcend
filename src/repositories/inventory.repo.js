/**
 * @module Repository/Inventory
 *
 * Gère les mouvements de stock : réservation, libération, confirmation de vente
 * et réapprovisionnement. Toutes les méthodes de mutation acceptent un client
 * optionnel pour pouvoir s'exécuter dans une transaction externe.
 */
import { pgPool } from '../config/database.js';
import { mapRow, mapRows } from './_mappers.js';
import { validateUUID, validateQuantity } from '../utils/validation.js';
import { NotFoundError, BusinessError, ValidationError, assertExists } from '../utils/appError.js';

export const inventoryRepo = {
  /**
   * Initialise ou met à jour l'entrée de stock d'une variante (upsert).
   * Utilisé lors de la création d'une variante ou d'un ajustement administratif.
   */
  async upsert({ variantId, availableStock, reservedStock = 0 }, client = pgPool) {
    validateUUID(variantId, 'variantId');

    if (typeof availableStock !== 'number' || availableStock < 0) {
      throw new ValidationError('availableStock must be a positive number');
    }
    if (typeof reservedStock !== 'number' || reservedStock < 0) {
      throw new ValidationError('reservedStock must be a positive number');
    }

    const { rows } = await client.query(
      `INSERT INTO inventory (variant_id, available_stock, reserved_stock)
             VALUES ($1, $2, $3)
             ON CONFLICT (variant_id)
             DO UPDATE SET
               available_stock = EXCLUDED.available_stock,
               reserved_stock  = EXCLUDED.reserved_stock,
               updated_at      = NOW()
             RETURNING *`,
      [variantId, availableStock, reservedStock]
    );

    return mapRow(rows[0]);
  },

  /**
   * Déplace du stock de "disponible" vers "réservé" lors d'un ajout au panier
   * ou d'une création de commande. La condition WHERE available_stock >= $2
   * est atomique : elle évite les conditions de course sans verrou applicatif.
   */
  async reserve(variantId, quantity, client = pgPool) {
    validateUUID(variantId, 'variantId');
    validateQuantity(quantity, 'quantity');

    const { rows } = await client.query(
      `UPDATE inventory i
       SET available_stock = i.available_stock - $2,
           reserved_stock  = i.reserved_stock + $2,
           updated_at      = NOW()
       FROM product_variants pv
       WHERE i.variant_id = pv.id
         AND i.variant_id = $1
         AND i.available_stock >= $2
       RETURNING i.*, pv.price`,
      [variantId, quantity]
    );

    if (rows.length === 0) {
      const existing = await this.findByVariantId(variantId);
      if (!existing) throw new NotFoundError('Inventory', variantId);

      throw new BusinessError(
        `Insufficient stock for variant ${variantId}. Requested: ${quantity}, Available: ${existing.availableStock}`
      );
    }

    return mapRow(rows[0]);
  },

  /**
   * Restitue du stock réservé vers le disponible (annulation de commande ou panier expiré).
   * GREATEST(0, ...) protège contre un reserved_stock négatif suite à une désynchronisation.
   */
  async release(variantId, quantity, client = pgPool) {
    validateUUID(variantId, 'variantId');
    validateQuantity(quantity, 'quantity');

    const { rows } = await client.query(
      `UPDATE inventory
             SET available_stock = available_stock + $2,
                 reserved_stock  = GREATEST(0, reserved_stock - $2),
                 updated_at      = NOW()
             WHERE variant_id = $1
             RETURNING *`,
      [variantId, quantity]
    );

    return assertExists(mapRow(rows[0]), 'Inventory', variantId);
  },

  /**
   * Confirme la sortie définitive du stock après paiement.
   * Contrairement à release, le stock disponible n'est pas restauré : la marchandise est vendue.
   */
  async confirmSale(variantId, quantity, client = pgPool) {
    validateUUID(variantId, 'variantId');
    validateQuantity(quantity, 'quantity');

    const { rows } = await client.query(
      `UPDATE inventory
             SET reserved_stock = reserved_stock - $2,
                 updated_at     = NOW()
             WHERE variant_id = $1 AND reserved_stock >= $2
             RETURNING *`,
      [variantId, quantity]
    );

    if (rows.length === 0) {
      const existing = await this.findByVariantId(variantId);
      if (!existing) throw new NotFoundError('Inventory', variantId);

      throw new BusinessError(
        `Insufficient reserved stock for variant ${variantId}. Requested: ${quantity}, Reserved: ${existing.reservedStock}`
      );
    }

    return mapRow(rows[0]);
  },

  /**
   * Liste tout l'inventaire pour le tableau d'administration avec filtres et pagination.
   */
  async findAll({ page = 1, limit = 15, search = '' }) {
    const offset = (page - 1) * limit;
    const values = [];
    let whereClause = 'WHERE 1=1';

    if (search) {
      values.push(`%${search}%`);
      whereClause += ` AND (pv.sku ILIKE $${values.length} OR p.name ILIKE $${values.length})`;
    }

    values.push(limit, offset);

    const query = `
      SELECT
        i.*,
        pv.sku,
        pv.price,
        p.name AS product_name,
        p.id AS product_id
      FROM inventory i
      JOIN product_variants pv ON i.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      ${whereClause}
      ORDER BY p.name ASC, pv.sku ASC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;

    const countQuery = `
      SELECT COUNT(*)
      FROM inventory i
      JOIN product_variants pv ON i.variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      ${whereClause}
    `;

    const { rows } = await pgPool.query(query, values);
    const { rows: countRows } = await pgPool.query(countQuery, search ? [`%${search}%`] : []);

    return {
      items: mapRows(rows),
      total: parseInt(countRows[0].count, 10),
    };
  },

  /**
   * Incrémente le stock disponible (réapprovisionnement, retour fournisseur).
   */
  async addStock(variantId, quantity, client = pgPool) {
    validateUUID(variantId, 'variantId');
    validateQuantity(quantity, 'quantity');

    const { rows } = await client.query(
      `UPDATE inventory
             SET available_stock = available_stock + $2,
                 updated_at      = NOW()
             WHERE variant_id = $1
             RETURNING *`,
      [variantId, quantity]
    );

    return assertExists(mapRow(rows[0]), 'Inventory', variantId);
  },

  /**
   * Décrémente le stock disponible sans passer par la réservation
   * (casse, vol, ajustement d'inventaire physique).
   * GREATEST(0, ...) empêche un stock négatif en cas de saisie erronée.
   */
  async removeStock(variantId, quantity, client = pgPool) {
    validateUUID(variantId, 'variantId');
    validateQuantity(quantity, 'quantity');

    const { rows } = await client.query(
      `UPDATE inventory
             SET available_stock = GREATEST(0, available_stock - $2),
                 updated_at      = NOW()
             WHERE variant_id = $1
             RETURNING *`,
      [variantId, quantity]
    );

    return assertExists(mapRow(rows[0]), 'Inventory', variantId);
  },

  async findByVariantId(variantId) {
    validateUUID(variantId, 'variantId');

    const { rows } = await pgPool.query(
      `SELECT * FROM inventory WHERE variant_id = $1`,
      [variantId]
    );

    return mapRow(rows[0]);
  },

  /**
   * Vérifie la disponibilité sans lever d'erreur.
   * Préférer cette méthode pour les contrôles pré-ajout au panier
   * afin d'afficher un message adapté côté UI.
   */
  async checkAvailability(variantId, quantity) {
    validateUUID(variantId, 'variantId');
    validateQuantity(quantity, 'quantity');

    const inventory = await this.findByVariantId(variantId);
    return inventory ? inventory.availableStock >= quantity : false;
  },

  /**
   * Liste les variantes dont le stock descend sous le seuil donné.
   * Utilisé pour les alertes de réapprovisionnement (cron ou dashboard admin).
   */
  async findLowStock(threshold = 10) {
    if (typeof threshold !== 'number' || threshold < 0) {
      throw new ValidationError('threshold must be a positive number');
    }

    const { rows } = await pgPool.query(
      `SELECT
              i.*,
              pv.sku,
              pv.price,
              p.name AS product_name,
              p.slug AS product_slug
              FROM inventory i
              JOIN product_variants pv ON i.variant_id = pv.id
              JOIN products         p  ON pv.product_id = p.id
              WHERE i.available_stock < $1
              ORDER BY i.available_stock ASC`,
      [threshold]
    );

    return mapRows(rows);
  },

  /**
   * Raccourci pour récupérer les variantes en rupture totale de stock.
   */
  async findOutOfStock() {
    return this.findLowStock(1);
  },

  /**
   * Agrège les statistiques globales d'inventaire pour le dashboard admin.
   */
  async getStats() {
    const { rows } = await pgPool.query(
      `SELECT
              COUNT(*)               AS total_variants,
              SUM(available_stock)   AS total_available,
              SUM(reserved_stock)    AS total_reserved,
              COUNT(*) FILTER (WHERE available_stock = 0)    AS out_of_stock_count,
              COUNT(*) FILTER (WHERE available_stock < 10)   AS low_stock_count
              FROM inventory`
    );

    return {
      totalVariants: parseInt(rows[0].total_variants, 10),
      totalAvailable: parseInt(rows[0].total_available, 10),
      totalReserved: parseInt(rows[0].total_reserved, 10),
      outOfStockCount: parseInt(rows[0].out_of_stock_count, 10),
      lowStockCount: parseInt(rows[0].low_stock_count, 10),
    };
  },
};