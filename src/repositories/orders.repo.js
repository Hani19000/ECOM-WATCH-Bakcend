/**
 * @module Repository/Orders
 *
 * Gère le cycle de vie des commandes avec une séparation stricte
 * entre les commandes Guest (user_id IS NULL) et User (user_id IS NOT NULL).
 *
 * PRINCIPE DE SÉCURITÉ :
 * La colonne `user_id` est la source de vérité pour le périmètre d'accès.
 * - user_id IS NULL     → commande publique (accessible par suivi guest)
 * - user_id IS NOT NULL → commande privée (accessible uniquement par son propriétaire)
 *
 * Ce périmètre est appliqué directement en SQL, pas en application,
 * pour garantir l'immuabilité et éviter les oublis côté service.
 */
import { pgPool } from '../config/database.js';
import { mapRow, mapRows } from './_mappers.js';
import { validateUUID } from '../utils/validation.js';
import crypto from 'crypto';

export const ordersRepo = {

  // ─────────────────────────────────────────────────────────────────────
  // ÉCRITURE
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Insère l'en-tête d'une commande dans une transaction existante.
   */
  async createOrder(client, {
    userId,
    subtotalAmount,
    shippingCost,
    shippingMethod,
    taxAmount,
    taxRate,
    discountAmount,
    totalAmount,
    shippingAddress,
    billingAddress,
  }) {
    const { rows } = await client.query(
      `INSERT INTO orders
             (user_id, subtotal_amount, shipping_cost, shipping_method,
              tax_amount, tax_rate, discount_amount, total_amount,
              shipping_address, billing_address, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING')
             RETURNING *`,
      [
        userId,
        subtotalAmount,
        shippingCost || 0,
        shippingMethod,
        taxAmount || 0,
        taxRate || 0,
        discountAmount || 0,
        totalAmount,
        shippingAddress,
        billingAddress,
      ]
    );
    return mapRow(rows[0]);
  },

  async addItem(client, {
    orderId,
    variantId,
    productName,
    variantAttributes,
    unitPrice,
    quantity,
  }) {
    const { rows } = await client.query(
      `INSERT INTO order_items
             (order_id, variant_id, product_name, variant_attributes, unit_price, quantity)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
      [orderId, variantId, productName, JSON.stringify(variantAttributes), unitPrice, quantity]
    );
    return mapRow(rows[0]);
  },

  /**
   * Crée une commande et ses articles de manière atomique.
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

  // ─────────────────────────────────────────────────────────────────────
  // LECTURE — ACCÈS UNIVERSEL (authentifié ou admin)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Récupère une commande sans restriction de périmètre.
   * Réservé aux flux authentifiés (le service vérifie ensuite les droits).
   */
  async findById(id) {
    validateUUID(id, 'orderId');
    const { rows } = await pgPool.query(
      `SELECT * FROM orders WHERE id = $1`,
      [id]
    );
    return mapRow(rows[0]);
  },

  // ─────────────────────────────────────────────────────────────────────
  // LECTURE — ACCÈS PUBLIC GUEST (barrière user_id IS NULL en SQL)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Récupération guest par UUID — barrière principale.
   *
   * Le filtre `user_id IS NULL` est en SQL et non dans le service pour garantir
   * que la barrière est indiscutable. Un refactoring ne peut pas l'omettre.
   *
   * Comportement :
   * - Commande guest (user_id IS NULL)       → retourne la commande avec ses items
   * - Commande rattachée (user_id IS NOT NULL) → retourne null (invisible)
   * - UUID inconnu                            → retourne null
   *
   * Dès que transferOwnership met à jour user_id, cette requête ne retourne
   * plus rien — immuablement et immédiatement.
   */
  async findGuestOnlyById(id) {
    validateUUID(id, 'orderId');

    const { rows } = await pgPool.query(
      `SELECT
               o.*,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'id',                oi.id,
                     'variantId',         oi.variant_id,
                     'productName',       oi.product_name,
                     'variantAttributes', oi.variant_attributes,
                     'unitPrice',         oi.unit_price,
                     'quantity',          oi.quantity
                   )
                 ) FILTER (WHERE oi.id IS NOT NULL),
                 '[]'
               ) AS items
             FROM orders o
             LEFT JOIN order_items oi ON oi.order_id = o.id
             WHERE o.id = $1
               AND o.user_id IS NULL
             GROUP BY o.id`,
      [id]
    );

    return mapRow(rows[0]);
  },

  /**
   * Recherche guest par numéro + email — timing-safe.
   *
   * user_id IS NULL est la barrière de sécurité : dès qu'une commande est
   * rattachée à un compte, cette requête ne renvoie plus rien.
   * La comparaison de l'email se fait côté applicatif en timing-safe
   * pour éviter les attaques par timing sur la longueur de l'email.
   */
  async findByOrderNumberAndEmail(orderNumber, email) {
    const orderNumberRegex = /^ORD-\d{4}-\d+$/;
    if (!orderNumberRegex.test(orderNumber)) return null;

    const normalizedEmail = email.trim().toLowerCase();

    const { rows } = await pgPool.query(
      `SELECT
               o.*,
               COALESCE(
                 json_agg(
                   json_build_object(
                     'id',                oi.id,
                     'variantId',         oi.variant_id,
                     'productName',       oi.product_name,
                     'variantAttributes', oi.variant_attributes,
                     'unitPrice',         oi.unit_price,
                     'quantity',          oi.quantity
                   )
                 ) FILTER (WHERE oi.id IS NOT NULL),
                 '[]'
               ) AS items
             FROM orders o
             LEFT JOIN order_items oi ON oi.order_id = o.id
             WHERE o.order_number = $1
               AND o.user_id IS NULL
             GROUP BY o.id`,
      [orderNumber]
    );

    if (rows.length === 0) return null;

    const order = mapRow(rows[0]);

    // Comparaison timing-safe de l'email (protège contre les attaques par canal auxiliaire)
    const storedEmail = order.shippingAddress?.email?.trim().toLowerCase();
    if (!storedEmail) return null;

    try {
      const storedBuffer = Buffer.from(storedEmail, 'utf8');
      const providedBuffer = Buffer.from(normalizedEmail, 'utf8');
      const maxLength = Math.max(storedBuffer.length, providedBuffer.length);
      const paddedStored = Buffer.alloc(maxLength);
      const paddedProvided = Buffer.alloc(maxLength);

      storedBuffer.copy(paddedStored);
      providedBuffer.copy(paddedProvided);

      if (!crypto.timingSafeEqual(paddedStored, paddedProvided)) return null;
      return order;
    } catch {
      return null;
    }
  },

  /**
   * Trouve toutes les commandes guest liées à un email.
   * Utilisé exclusivement par l'auto-claim à l'inscription.
   */
  async findGuestOrdersByEmail(email) {
    const normalizedEmail = email.trim().toLowerCase();
    const { rows } = await pgPool.query(
      `SELECT id, order_number
             FROM orders
             WHERE LOWER(shipping_address->>'email') = $1
               AND user_id IS NULL`,
      [normalizedEmail]
    );
    return rows;
  },

  // ─────────────────────────────────────────────────────────────────────
  // TRANSFERT — CLAIM (guest → user)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Transfère la propriété d'une commande d'un guest vers un utilisateur.
   *
   * SÉCURITÉ :
   * - SELECT ... FOR UPDATE : verrouillage pessimiste (pas de double-claim concurrent)
   * - Vérification user_id IS NULL : idempotence (un second claim échoue proprement)
   * - Vérification email : seul le destinataire légitime peut effectuer le transfert
   *
   * Dès que la transaction est commitée, user_id != null — toutes les méthodes
   * "guest" retourneront null pour cette commande sans modification supplémentaire.
   */
  async transferOwnership(orderId, newUserId, verificationEmail) {
    validateUUID(orderId, 'orderId');
    validateUUID(newUserId, 'newUserId');

    const client = await pgPool.connect();
    try {
      await client.query('BEGIN');

      const { rows: orderRows } = await client.query(
        `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId]
      );

      if (orderRows.length === 0) throw new Error('Commande introuvable');
      const order = mapRow(orderRows[0]);

      if (order.userId !== null) throw new Error('Déjà rattachée');

      const storedEmail = order.shippingAddress?.email?.trim().toLowerCase();
      if (storedEmail !== verificationEmail.trim().toLowerCase()) {
        throw new Error('Email incorrect');
      }

      const { rows: updatedRows } = await client.query(
        `UPDATE orders
                 SET user_id    = $1,
                     updated_at = NOW()
                 WHERE id = $2
                 RETURNING *`,
        [newUserId, orderId]
      );

      await client.query('COMMIT');
      return mapRow(updatedRows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  // ─────────────────────────────────────────────────────────────────────
  // LECTURE — ACCÈS PROPRIÉTAIRE AUTHENTIFIÉ
  // ─────────────────────────────────────────────────────────────────────

  async listByUserId(userId) {
    validateUUID(userId, 'userId');
    const { rows } = await pgPool.query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return mapRows(rows);
  },

  /**
   * Accepte un client optionnel pour s'exécuter dans une transaction externe.
   * Nécessaire pour le webhook Stripe qui confirme le stock et le statut en une seule transaction.
   */
  async listItems(orderId, client = pgPool) {
    validateUUID(orderId, 'orderId');
    const { rows } = await client.query(
      `SELECT * FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    return mapRows(rows);
  },

  /**
   * Met à jour le statut de la commande.
   * Accepte un client optionnel pour s'intégrer dans une transaction externe
   * (ex : webhook Stripe qui met à jour statut + confirme stock atomiquement).
   * Quand paymentData est fourni, insère également l'enregistrement de paiement.
   */
  async updateStatus(orderId, status, paymentData = null, client = pgPool) {
    validateUUID(orderId, 'orderId');

    const { rows } = await client.query(
      `UPDATE orders SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [orderId, status]
    );
    const updatedOrder = mapRow(rows[0]);

    if (paymentData) {
      await client.query(
        `INSERT INTO payments (order_id, provider, payment_intent_id, status, amount)
                 VALUES ($1, $2, $3, $4, $5)`,
        [
          orderId,
          paymentData.provider,
          paymentData.paymentIntentId,
          'SUCCESS',
          paymentData.amount,
        ]
      );
    }

    return updatedOrder;
  },

  async getUserStats(userId) {
    const { rows } = await pgPool.query(
      `SELECT
               COUNT(*) as "totalOrders",
               COUNT(*) FILTER (WHERE status IN ('PENDING', 'PAID', 'PROCESSING', 'SHIPPED')) as "pendingOrders",
               COALESCE(SUM(total_amount), 0) as "totalSpent"
             FROM orders
             WHERE user_id = $1`,
      [userId]
    );
    return rows[0];
  },

  // ─────────────────────────────────────────────────────────────────────
  // ADMINISTRATION
  // ─────────────────────────────────────────────────────────────────────

  /**
     * ADMINISTRATION : Liste toutes les commandes avec filtres, recherche et pagination.
     */
  async findAll({ status, userId, search, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;
    const values = [];
    let whereClause = 'WHERE 1=1';

    // 1. FILTRE PAR STATUT (Ignore 'ALL' envoyé par le frontend)
    if (status && status !== 'ALL') {
      values.push(status);
      whereClause += ` AND o.status = $${values.length}`;
    }

    // 2. FILTRE PAR USER ID
    if (userId) {
      values.push(userId);
      whereClause += ` AND o.user_id = $${values.length}`;
    }

    // 3. FILTRE DE RECHERCHE (Numéro de commande, email utilisateur, ou email invité)
    if (search) {
      values.push(`%${search}%`);
      whereClause += ` AND (
            o.order_number ILIKE $${values.length} OR 
            u.email ILIKE $${values.length} OR
            o.shipping_address->>'email' ILIKE $${values.length} OR
            o.shipping_address->>'lastName' ILIKE $${values.length}
        )`;
    }

    // 4. REQUÊTE POUR LE COMPTAGE TOTAL (Pour la pagination)
    const countQuery = `
        SELECT COUNT(*) 
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ${whereClause}
    `;
    // On copie le tableau de valeurs car le LIMIT/OFFSET n'y sont pas encore
    const countValues = [...values];

    // 5. REQUÊTE PRINCIPALE AVEC PAGINATION ET TRI
    const query = `
        SELECT o.*, u.email AS user_email
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ${whereClause}
        ORDER BY o.created_at DESC
        LIMIT $${values.push(limit)} OFFSET $${values.push(offset)}
    `;

    // Exécution en parallèle pour optimiser le temps de réponse
    const [dataResult, countResult] = await Promise.all([
      pgPool.query(query, values),
      pgPool.query(countQuery, countValues)
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    return {
      orders: mapRows(dataResult.rows),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  /**
   * Trouve les commandes PENDING qui ont dépassé un certain délai.
   * Optimisé pour l'index idx_orders_pending_old.
   *
   * @param {number} expirationMinutes - Délai en minutes (ex : 1440 pour 24h)
   * @returns {Promise<Array>} Liste des commandes expirées
   */
  async findExpiredPendingOrders(expirationMinutes = 30) {
    const { rows } = await pgPool.query(
      `SELECT id
             FROM orders
             WHERE status = 'PENDING'
               AND created_at < NOW() - (INTERVAL '1 minute' * $1)`,
      [expirationMinutes]
    );
    return rows;
  },

  async getGlobalStats(client = pgPool) {
    const { rows } = await client.query(
      `SELECT
         COUNT(*)                        AS count,
         COALESCE(SUM(total_amount), 0)  AS "totalAmount"
       FROM orders
       WHERE status != 'CANCELLED'`
    );
    return {
      count: parseInt(rows[0].count),
      totalAmount: parseFloat(rows[0].totalAmount),
    };
  },

  /** 
   * ─────────────────────────────────────────────────────────────────────
   * HISTORIQUE DES VENTES JOURNALIÈRES (pour le graphique dashboard)
   * ─────────────────────────────────────────────────────────────────────
   *
   * Agrège le CA par jour sur les N derniers jours.
   * Exclut CANCELLED et PENDING : seules les commandes confirmées contribuent au CA.
   * Les jours sans vente ne sont pas retournés — le frontend gère les trous.
   *
   * @param {number} days - Fenêtre temporelle en jours (défaut : 30)
   * @returns {Promise<Array<{ date: string, revenue: string }>>}
   */
  async getDailySalesHistory(days = 30) {
    const { rows } = await pgPool.query(
      `SELECT
             DATE(created_at)               AS date,
             COALESCE(SUM(total_amount), 0) AS revenue
         FROM orders
         WHERE status NOT IN ('CANCELLED', 'PENDING')
           AND created_at >= NOW() - ($1 || ' days')::INTERVAL
         GROUP BY DATE(created_at)
         ORDER BY date ASC`,
      [days]
    );
    return rows;
  },
};