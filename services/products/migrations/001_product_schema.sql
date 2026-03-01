-- ================================================================
-- Migration 001 — Schéma "product"
-- product-service : tables products, product_variants, categories,
--   product_categories, promotions, product_promotions,
--   variant_promotions, inventory
--
-- Isolées dans le schéma "product" pour éviter toute collision avec
-- les autres services. Le search_path est positionné à "product"
-- via pgPool.on('connect'), les noms de tables sont non préfixés
-- dans le code applicatif.
-- ================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS product;

SET search_path TO product, public;

-- ── Trigger partagé ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── Types ENUM ────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE product_status_enum AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE discount_type_enum AS ENUM ('PERCENTAGE', 'FIXED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE promotion_status_enum AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ================================================================
-- TABLE : categories
-- ================================================================

CREATE TABLE IF NOT EXISTS categories (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(100) NOT NULL,
    slug       VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER update_categories_updated_at
    BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- ================================================================
-- TABLE : products
-- ================================================================

CREATE TABLE IF NOT EXISTS products (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    main_image  VARCHAR(500),
    status      product_status_enum DEFAULT 'DRAFT',
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_products_slug   ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

-- ================================================================
-- TABLE : product_variants
-- ================================================================

CREATE TABLE IF NOT EXISTS product_variants (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku        VARCHAR(100) UNIQUE NOT NULL,
    price      NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    attributes JSONB,           -- { color, size, material, image }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER update_product_variants_updated_at
    BEFORE UPDATE ON product_variants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_variants_product  ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_variants_sku      ON product_variants(sku);
CREATE INDEX IF NOT EXISTS idx_variants_attrs    ON product_variants USING gin(attributes);

-- ================================================================
-- TABLE : product_categories  (liaison N:N)
-- ================================================================

CREATE TABLE IF NOT EXISTS product_categories (
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_product  ON product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category ON product_categories(category_id);

-- ================================================================
-- TABLE : inventory
-- ================================================================

CREATE TABLE IF NOT EXISTS inventory (
    id              BIGSERIAL PRIMARY KEY,
    variant_id      UUID UNIQUE NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    available_stock INT NOT NULL DEFAULT 0 CHECK (available_stock >= 0),
    reserved_stock  INT NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE TRIGGER update_inventory_updated_at
    BEFORE UPDATE ON inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_inventory_variant    ON inventory(variant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock  ON inventory(available_stock) WHERE available_stock < 10;

-- ================================================================
-- TABLE : promotions
-- ================================================================

CREATE TABLE IF NOT EXISTS promotions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name           VARCHAR(255) NOT NULL,
    description    TEXT,
    discount_type  discount_type_enum NOT NULL,
    discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value >= 0),
    start_date     TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date       TIMESTAMP WITH TIME ZONE NOT NULL,
    max_usage      INT,
    status         promotion_status_enum DEFAULT 'ACTIVE',
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT chk_promotion_dates CHECK (end_date > start_date)
);

CREATE OR REPLACE TRIGGER update_promotions_updated_at
    BEFORE UPDATE ON promotions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status);
CREATE INDEX IF NOT EXISTS idx_promotions_dates  ON promotions(start_date, end_date);

-- ================================================================
-- TABLE : product_promotions  (promotion appliquée à un produit entier)
-- ================================================================

CREATE TABLE IF NOT EXISTS product_promotions (
    promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    PRIMARY KEY (promotion_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_promotions_product ON product_promotions(product_id);

-- ================================================================
-- TABLE : variant_promotions  (promotion appliquée à une variante)
-- ================================================================

CREATE TABLE IF NOT EXISTS variant_promotions (
    promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    variant_id   UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    PRIMARY KEY (promotion_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_variant_promotions_variant ON variant_promotions(variant_id);

-- ================================================================
-- VUE : view_inventory_status
-- Consolide produit + variante + stock pour les exports admin.
-- ================================================================

CREATE OR REPLACE VIEW view_inventory_status AS
SELECT
    p.id           AS product_id,
    p.name         AS product_name,
    p.main_image,
    pv.id          AS variant_id,
    pv.sku,
    pv.price,
    pv.attributes,
    i.available_stock,
    i.reserved_stock,
    (i.available_stock + i.reserved_stock) AS total_physical_stock,
    (pv.price * i.available_stock)          AS potential_revenue,
    p.status       AS product_status
FROM products p
JOIN product_variants pv ON p.id = pv.product_id
JOIN inventory i ON pv.id = i.variant_id;

COMMENT ON VIEW view_inventory_status IS
    'Vue consolidée produit + variante + stock — utilisée pour les exports admin.';