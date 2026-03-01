/**
 * @module Repository/Promotions
 *
 * Gère la persistance des promotions et leurs liaisons aux produits/variantes.
 * Les promotions peuvent être appliquées au niveau produit ou variante.
 * Les requêtes getLinkedProducts/getLinkedVariants sont utilisées
 * par le service pour l'affichage des détails et la gestion des liaisons en update.
 */
import { pgPool } from '../config/database.js';
import { mapRow, mapRows } from './_mappers.js';
import { validateRequired } from '../utils/validation.js';
import { NotFoundError } from '../utils/appError.js';

export const promotionsRepo = {
    async create(promotionData, client = pgPool) {
        const {
            name,
            description,
            discountType,
            discountValue,
            startDate,
            endDate,
            maxUsage,
            status = 'ACTIVE',
        } = promotionData;

        validateRequired(
            { name, discountType, discountValue, startDate, endDate },
            ['name', 'discountType', 'discountValue', 'startDate', 'endDate']
        );

        const { rows } = await client.query(
            `INSERT INTO promotions
             (name, description, discount_type, discount_value, start_date, end_date, max_usage, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [name, description, discountType, discountValue, startDate, endDate, maxUsage, status]
        );
        return mapRow(rows[0]);
    },

    async list({ status, active, page = 1, limit = 20 } = {}, client = pgPool) {
        const offset = (page - 1) * limit;
        const params = [];
        let queryIndex = 1;
        const conditions = [];

        if (status) {
            conditions.push(`status = $${queryIndex++}`);
            params.push(status);
        }

        if (active === true) {
            conditions.push(`status = 'ACTIVE'`);
            conditions.push(`start_date <= NOW()`);
            conditions.push(`end_date >= NOW()`);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const { rows: countRows } = await client.query(
            `SELECT COUNT(*) FROM promotions ${whereClause}`,
            params
        );
        const total = parseInt(countRows[0].count, 10);

        const { rows } = await client.query(
            `SELECT * FROM promotions
             ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${queryIndex++} OFFSET $${queryIndex++}`,
            [...params, limit, offset]
        );

        return {
            data: mapRows(rows),
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    },

    async findById(id, client = pgPool) {
        const { rows } = await client.query(
            `SELECT * FROM promotions WHERE id = $1`,
            [id]
        );
        return mapRow(rows[0]);
    },

    async update(id, updateData, client = pgPool) {
        const {
            name, description, discountType, discountValue,
            startDate, endDate, maxUsage, status,
        } = updateData;

        const updates = [];
        const params = [id];
        let paramIdx = 2;

        if (name !== undefined) { updates.push(`name = $${paramIdx++}`); params.push(name); }
        if (description !== undefined) { updates.push(`description = $${paramIdx++}`); params.push(description); }
        if (discountType !== undefined) { updates.push(`discount_type = $${paramIdx++}`); params.push(discountType); }
        if (discountValue !== undefined) { updates.push(`discount_value = $${paramIdx++}`); params.push(discountValue); }
        if (startDate !== undefined) { updates.push(`start_date = $${paramIdx++}`); params.push(startDate); }
        if (endDate !== undefined) { updates.push(`end_date = $${paramIdx++}`); params.push(endDate); }
        if (maxUsage !== undefined) { updates.push(`max_usage = $${paramIdx++}`); params.push(maxUsage); }
        if (status !== undefined) { updates.push(`status = $${paramIdx++}`); params.push(status); }

        if (updates.length === 0) return this.findById(id, client);

        updates.push('updated_at = NOW()');

        const { rows } = await client.query(
            `UPDATE promotions
             SET ${updates.join(', ')}
             WHERE id = $1
             RETURNING *`,
            params
        );

        if (rows.length === 0) throw new NotFoundError('Promotion', id);
        return mapRow(rows[0]);
    },

    async delete(id, client = pgPool) {
        const { rowCount } = await client.query(
            `DELETE FROM promotions WHERE id = $1`,
            [id]
        );
        if (rowCount === 0) throw new NotFoundError('Promotion', id);
        return true;
    },

    async addToProduct(promotionId, productId, client = pgPool) {
        const { rows } = await client.query(
            `INSERT INTO product_promotions (promotion_id, product_id)
             VALUES ($1, $2)
             ON CONFLICT (promotion_id, product_id) DO NOTHING
             RETURNING *`,
            [promotionId, productId]
        );
        return mapRow(rows[0]);
    },

    async addToVariant(promotionId, variantId, client = pgPool) {
        const { rows } = await client.query(
            `INSERT INTO variant_promotions (promotion_id, variant_id)
             VALUES ($1, $2)
             ON CONFLICT (promotion_id, variant_id) DO NOTHING
             RETURNING *`,
            [promotionId, variantId]
        );
        return mapRow(rows[0]);
    },

    async removeFromProduct(promotionId, productId, client = pgPool) {
        await client.query(
            `DELETE FROM product_promotions WHERE promotion_id = $1 AND product_id = $2`,
            [promotionId, productId]
        );
        return true;
    },

    async removeFromVariant(promotionId, variantId, client = pgPool) {
        await client.query(
            `DELETE FROM variant_promotions WHERE promotion_id = $1 AND variant_id = $2`,
            [promotionId, variantId]
        );
        return true;
    },

    async getActiveByProduct(productId, client = pgPool) {
        const { rows } = await client.query(
            `SELECT p.*
             FROM promotions p
             INNER JOIN product_promotions pp ON p.id = pp.promotion_id
             WHERE pp.product_id = $1
               AND p.status = 'ACTIVE'
               AND p.start_date <= NOW()
               AND p.end_date >= NOW()
             ORDER BY p.discount_value DESC
             LIMIT 1`,
            [productId]
        );
        return mapRow(rows[0]);
    },

    async getActiveByVariant(variantId, client = pgPool) {
        const { rows } = await client.query(
            `SELECT p.*
             FROM promotions p
             INNER JOIN variant_promotions vp ON p.id = vp.promotion_id
             WHERE vp.variant_id = $1
               AND p.status = 'ACTIVE'
               AND p.start_date <= NOW()
               AND p.end_date >= NOW()
             ORDER BY p.discount_value DESC
             LIMIT 1`,
            [variantId]
        );
        return mapRow(rows[0]);
    },

    async incrementUsage(id, client = pgPool) {
        const { rows } = await client.query(
            `UPDATE promotions
             SET usage_count = usage_count + 1
             WHERE id = $1
             RETURNING *`,
            [id]
        );
        return mapRow(rows[0]);
    },

    async getLinkedProducts(promotionId, client = pgPool) {
        const { rows } = await client.query(
            `SELECT p.*
             FROM products p
             INNER JOIN product_promotions pp ON p.id = pp.product_id
             WHERE pp.promotion_id = $1`,
            [promotionId]
        );
        return mapRows(rows);
    },

    async getLinkedVariants(promotionId, client = pgPool) {
        const { rows } = await client.query(
            `SELECT v.*
             FROM product_variants v
             INNER JOIN variant_promotions vp ON v.id = vp.variant_id
             WHERE vp.promotion_id = $1`,
            [promotionId]
        );
        return mapRows(rows);
    },
};