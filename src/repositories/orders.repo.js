/**
 * @module Repository/Orders
 *
 * Gère le cycle de vie des commandes.
 * Les opérations d'écriture critiques (création, changement de statut + paiement)
 * s'exécutent dans des transactions pour garantir la cohérence ACID.
 */
import { pgPool } from '../config/database.js';
import { mapRow, mapRows } from './_mappers.js';

export const ordersRepo = {
  /**
   * Insère l'en-tête d'une commande.
   * Accepte un client de transaction car cette méthode est toujours
   * appelée dans le contexte de createWithItems.
   */
  async createOrder(client, { userId, subtotalAmount, totalAmount, shippingAddress }) {
    const { rows } = await client.query(
      `INSERT INTO orders
             (user_id, subtotal_amount, total_amount, shipping_address, status)
             VALUES ($1, $2, $3, $4, 'PENDING')
             RETURNING *`,
      [userId, subtotalAmount, totalAmount, shippingAddress]
    );

    return mapRow(rows[0]);
  },

  /**
   * Insère une ligne de commande.
   * variantId peut être null si la variante a été supprimée depuis la commande
   * (conservation de l'historique via productName et variantAttributes).
   */
  async addItem(client, { orderId, variantId, productName, variantAttributes, unitPrice, quantity }) {
    const { rows } = await client.query(
      `INSERT INTO order_items
             (order_id, variant_id, product_name, variant_attributes, unit_price, quantity)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
      [orderId, variantId ?? null, productName, variantAttributes ?? null, unitPrice, quantity]
    );

    return mapRow(rows[0]);
  },

  /**
   * Crée une commande et ses articles de manière atomique.
   * Un seul commit garantit qu'une commande sans articles ne peut pas exister en base.
   */
  async createWithItems({ order, items }) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      const createdOrder = await ordersRepo.createOrder(client, order);

      const createdItems = await Promise.all(
        items.map((item) =>
          ordersRepo.addItem(client, { ...item, orderId: createdOrder.id })
        )
      );

      await client.query('COMMIT');
      return { order: createdOrder, items: createdItems };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async findById(id) {
    const { rows } = await pgPool.query(
      `SELECT * FROM orders WHERE id = $1`,
      [id]
    );

    return mapRow(rows[0]);
  },

  async listByUserId(userId) {
    const { rows } = await pgPool.query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    return mapRows(rows);
  },

  /**
   * Récupère la liste des articles liés à une commande.
   * Essentiel pour gérer les annulations et remises en stock.
   */
  async listItems(orderId) {
    const { rows } = await pgPool.query(
      `SELECT * FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    return mapRows(rows);
  },

  async setStatus(id, status) {
    const { rows } = await pgPool.query(
      `UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, status]
    );

    return mapRow(rows[0]);
  },

  /**
   * Met à jour le statut d'une commande et enregistre optionnellement un paiement
   * dans la même transaction. Utilisé notamment par les webhooks de paiement
   * pour éviter un statut "PAID" sans enregistrement du paiement associé.
   */
  async updateStatus(orderId, status, paymentData = null) {
    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [orderId, status]
      );
      const updatedOrder = mapRow(rows[0]);

      if (!updatedOrder) throw new Error('Commande non trouvée');

      if (paymentData) {
        await client.query(
          `INSERT INTO payments (order_id, provider, payment_intent_id, status, amount)
                      VALUES ($1, $2, $3, $4, $5)`,
          [orderId, paymentData.provider, paymentData.paymentIntentId, 'SUCCESS', paymentData.amount]
        );
      }

      await client.query('COMMIT');
      return updatedOrder;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  /**
   * Récupère les commandes PENDING non payées après le délai imparti.
   * Utilisé par le cron de nettoyage pour libérer le stock réservé.
   */
  async findExpiredPendingOrders(hours = 24) {
    const { rows } = await pgPool.query(
      `SELECT o.*, json_agg(oi.*) AS items
             FROM orders o
             JOIN order_items oi ON o.id = oi.order_id
             WHERE o.status = 'PENDING'
               AND o.created_at < NOW() - ($1 || ' hours')::interval
             GROUP BY o.id`,
      [hours]
    );

    return mapRows(rows);
  },

  /**
   * Liste les commandes avec filtres dynamiques et pagination.
   * Expose le total pour que le front puisse calculer le nombre de pages.
   */
  async findAll({ status, userId, limit = 20, offset = 0 } = {}) {
    const values = [];
    let whereClause = 'WHERE 1=1';

    if (status) {
      values.push(status);
      whereClause += ` AND o.status = $${values.length}`;
    }

    if (userId) {
      values.push(userId);
      whereClause += ` AND o.user_id = $${values.length}`;
    }

    values.push(limit, offset);

    const { rows } = await pgPool.query(
      `SELECT o.*, u.email AS user_email
             FROM orders o
             LEFT JOIN users u ON o.user_id = u.id
             ${whereClause}
             ORDER BY o.created_at DESC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    const countValues = status ? [status] : [];
    const countWhere = status ? 'WHERE status = $1' : '';
    const { rows: countRows } = await pgPool.query(
      `SELECT COUNT(*) FROM orders ${countWhere}`,
      countValues
    );

    return {
      orders: mapRows(rows),
      total: parseInt(countRows[0].count),
    };
  },

  /**
   * Calcule les statistiques globales pour le tableau de bord Admin.
   */
  async getGlobalStats() {
    const { rows } = await pgPool.query(`
        SELECT 
            COUNT(*) as total_orders,
            SUM(total_amount) as total_revenue,
            COUNT(CASE WHEN status = 'PENDING' THEN 1 END) as pending_orders
        FROM orders
    `);
    return rows[0];
  }
};