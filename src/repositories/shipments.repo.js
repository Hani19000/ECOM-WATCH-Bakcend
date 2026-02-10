/**
 * @module Repository/Shipments
 *
 * Gère le suivi logistique des commandes (transporteur, numéro de suivi, horodatages).
 */
import { pgPool } from '../config/database.js';
import { mapRow } from './_mappers.js';
import { validateUUID } from '../utils/validation.js';
import { assertExists } from '../utils/appError.js';

export const shipmentsRepo = {
  /**
   * Crée une expédition ou met à jour le transporteur/tracking si une expédition
   * existe déjà pour cette commande. L'upsert évite les doublons sans vérification préalable.
   * Accepte un client de transaction pour être couplé à la mise à jour du statut commande.
   */
  async create({ orderId, carrier, trackingNumber }, client = pgPool) {
    validateUUID(orderId, 'orderId');

    const { rows } = await client.query(
      `INSERT INTO shipments (order_id, carrier, tracking_number)
             VALUES ($1, $2, $3)
             ON CONFLICT (order_id) DO UPDATE SET
               carrier         = EXCLUDED.carrier,
               tracking_number = EXCLUDED.tracking_number,
               updated_at      = NOW()
             RETURNING *`,
      [orderId, carrier ?? null, trackingNumber ?? null]
    );

    return mapRow(rows[0]);
  },

  async updateTracking(id, { carrier, trackingNumber }) {
    const { rows } = await pgPool.query(
      `UPDATE shipments
             SET carrier         = $2,
                 tracking_number = $3,
                 updated_at      = NOW()
             WHERE id = $1
             RETURNING *`,
      [id, carrier ?? null, trackingNumber ?? null]
    );

    return assertExists(mapRow(rows[0]), 'Shipment', id);
  },

  /**
   * Enregistre l'horodatage d'expédition.
   * COALESCE permet au service de forcer une date précise (ex : sync depuis transporteur)
   * ou de laisser la base utiliser NOW() par défaut.
   * Accepte un client de transaction pour être couplé au passage de commande en SHIPPED.
   */
  async markShipped(id, shippedAt = null, client = pgPool) {
    const { rows } = await client.query(
      `UPDATE shipments
             SET shipped_at = COALESCE($2, NOW()),
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
      [id, shippedAt]
    );

    return assertExists(mapRow(rows[0]), 'Shipment', id);
  },

  /**
   * Enregistre l'horodatage de livraison.
   * Accepte un client de transaction pour être couplé au passage de commande en DELIVERED.
   */
  async markDelivered(id, deliveredAt = null, client = pgPool) {
    const { rows } = await client.query(
      `UPDATE shipments
             SET delivered_at = COALESCE($2, NOW()),
                 updated_at   = NOW()
             WHERE id = $1
             RETURNING *`,
      [id, deliveredAt]
    );

    return assertExists(mapRow(rows[0]), 'Shipment', id);
  },

  async findByOrderId(orderId) {
    validateUUID(orderId, 'orderId');

    const { rows } = await pgPool.query(
      `SELECT * FROM shipments WHERE order_id = $1`,
      [orderId]
    );

    return mapRow(rows[0]);
  },

  async findById(id) {
    const { rows } = await pgPool.query(
      `SELECT * FROM shipments WHERE id = $1`,
      [id]
    );

    return mapRow(rows[0]);
  },
};