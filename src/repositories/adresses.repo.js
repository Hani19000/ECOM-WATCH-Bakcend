/**
 * @module Repository/Addresses
 *
 * Gère la persistance des adresses de livraison/facturation utilisateur.
 */
import { pgPool } from '../config/database.js';
import { mapRow, mapRows } from './_mappers.js';
import { validateUUID } from '../utils/validation.js';

export const addressesRepo = {
    /**
     * Crée une adresse pour un utilisateur.
     * Si l'adresse est définie comme par défaut, les autres adresses de l'utilisateur
     * sont d'abord décoché pour maintenir l'unicité du flag is_default.
     */
    async create(userId, data) {
        validateUUID(userId, 'userId');

        const { title, firstName, lastName, street, city, zipCode, country, phone, isDefault } = data;

        // Garantir l'unicité du flag is_default avant insertion
        if (isDefault) {
            await pgPool.query(
                'UPDATE addresses SET is_default = false WHERE user_id = $1',
                [userId]
            );
        }

        const { rows } = await pgPool.query(
            `INSERT INTO addresses
             (user_id, title, first_name, last_name, street, city, zip_code, country, phone, is_default)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [userId, title, firstName, lastName, street, city, zipCode, country, phone, isDefault]
        );

        return mapRow(rows[0]);
    },

    /**
     * Retourne toutes les adresses d'un utilisateur, triées par date de création.
     */
    async findByUserId(userId) {
        validateUUID(userId, 'userId');

        const { rows } = await pgPool.query(
            'SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );

        return mapRows(rows);
    },

    /**
     * Supprime une adresse en vérifiant que l'utilisateur en est bien le propriétaire.
     * La double condition (id + user_id) prévient la suppression par un utilisateur non autorisé.
     */
    async delete(userId, addressId) {
        validateUUID(userId, 'userId');
        validateUUID(addressId, 'addressId');

        const { rowCount } = await pgPool.query(
            'DELETE FROM addresses WHERE id = $1 AND user_id = $2',
            [addressId, userId]
        );

        return rowCount > 0;
    },
};