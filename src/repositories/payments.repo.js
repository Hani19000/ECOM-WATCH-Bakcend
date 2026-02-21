/**
 * @module Repository/Payments
 *
 * Gère la persistance des transactions financières.
 * Les méthodes acceptent un client optionnel pour s'intégrer dans
 * une transaction externe (ex : updateStatus dans orders.repo.js).
 */
import { pgPool } from '../config/database.js';
import { mapRow, mapRows } from './_mappers.js';

export const paymentsRepo = {
  /**
   * Enregistre une tentative de paiement.
   * Le statut initial est PENDING ; il sera mis à jour via setStatus
   * après confirmation du prestataire de paiement.
   */
  // Mise à jour suggérée pour create
  async create({ orderId, provider, paymentIntentId, status = 'PENDING', amount, currency = 'EUR', metadata = {} }, client = pgPool) {
    const { rows } = await client.query(
      `INSERT INTO payments (order_id, provider, payment_intent_id, status, amount, currency, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
      [
        orderId,
        provider ?? null,
        paymentIntentId ?? null,
        status,
        amount,
        currency,
        metadata
      ]
    );

    return mapRow(rows[0]);
  },

  /**
   * Met à jour le statut du paiement après notification du prestataire (webhook).
   * Accepte un client de transaction pour être couplé à la mise à jour du statut commande.
   */
  async setStatus(id, status, client = pgPool) {
    const { rows } = await client.query(
      `UPDATE payments SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, status]
    );

    return mapRow(rows[0]);
  },

  /**
   * Retourne l'historique des paiements d'une commande, utile pour
   * afficher les tentatives successives (ex : première carte refusée, deuxième acceptée).
   */
  async listByOrderId(orderId) {
    const { rows } = await pgPool.query(
      `SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC`,
      [orderId]
    );

    return mapRows(rows);
  },
};