/**
 * @module Repository/Users
 *
 * Gère la persistance des utilisateurs et de leurs données sensibles.
 */
import { pgPool } from '../config/database.js';
import { mapRow, mapRows } from './_mappers.js';
import { validateUUID } from '../utils/validation.js';

export const usersRepo = {
  /**
   * Crée un utilisateur en normalisant l'email en minuscules dès la persistance.
   * Centraliser cette normalisation en base plutôt que dans le service évite
   * les doublons causés par des casses différentes (ex : "User@mail.com" vs "user@mail.com").
   * Accepte un client de transaction pour s'intégrer dans un flux de création atomique
   * (ex : création utilisateur + attribution du rôle par défaut).
   */
  async create({ email, passwordHash, salt, firstName, lastName, phone }, client = pgPool) {
    const { rows } = await client.query(
      `INSERT INTO users (email, password_hash, salt, first_name, last_name, phone)
             VALUES (LOWER($1), $2, $3, $4, $5, $6)
             RETURNING *`,
      [email, passwordHash, salt, firstName ?? null, lastName ?? null, phone ?? null]
    );

    return mapRow(rows[0]);
  },

  async findById(id) {
    validateUUID(id, 'userId');

    const { rows } = await pgPool.query(
      `SELECT * FROM users WHERE id = $1`,
      [id]
    );

    return mapRow(rows[0]);
  },

  async findByEmail(email) {
    const { rows } = await pgPool.query(
      `SELECT * FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    return mapRow(rows[0]);
  },

  /**
   * Liste les utilisateurs en excluant les champs sensibles (password_hash, salt).
   * Une projection explicite ici plutôt qu'un SELECT * protège contre
   * une fuite accidentelle de credentials si la réponse est sérialisée telle quelle.
   */
  async list() {
    const { rows } = await pgPool.query(
      `SELECT id, email, first_name, last_name, phone, is_active, created_at
             FROM users
             ORDER BY created_at DESC`
    );

    return mapRows(rows);
  },

  /**
   * Retourne uniquement les champs nécessaires à l'authentification.
   * Limiter la surface de données exposée réduit le risque en cas de log ou de fuite mémoire.
   */
  async findByEmailWithCredentials(email) {
    const { rows } = await pgPool.query(
      `SELECT id, email, first_name, password_hash, salt, is_active
             FROM users
             WHERE LOWER(email) = LOWER($1)`,
      [email]
    );

    return mapRow(rows[0]);
  },

  async updateProfile(id, { firstName, lastName, phone }) {
    validateUUID(id, 'userId');

    const { rows } = await pgPool.query(
      `UPDATE users
             SET first_name = $2,
                 last_name  = $3,
                 phone      = $4,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
      [id, firstName ?? null, lastName ?? null, phone ?? null]
    );

    return mapRow(rows[0]);
  },

  async setActive(id, isActive) {
    validateUUID(id, 'userId');

    const { rows } = await pgPool.query(
      `UPDATE users SET is_active = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, isActive]
    );

    return mapRow(rows[0]);
  },

  async deleteById(id) {
    validateUUID(id, 'userId');

    const { rowCount } = await pgPool.query(
      `DELETE FROM users WHERE id = $1`,
      [id]
    );

    return rowCount > 0;
  },

  /**
   * Met à jour les credentials après un changement de mot de passe.
   * Retourne un booléen plutôt que l'utilisateur complet pour ne pas exposer
   * les nouveaux hash/salt dans les logs du service appelant.
   */
  async updateCredentials(userId, { passwordHash, salt }) {
    validateUUID(userId, 'userId');

    const { rows } = await pgPool.query(
      `UPDATE users
             SET password_hash = $2,
                 salt          = $3,
                 updated_at    = NOW()
             WHERE id = $1
             RETURNING id`,
      [userId, passwordHash, salt]
    );

    return rows.length > 0;
  },
};