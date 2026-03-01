-- ================================================================
-- Migration 002 — Index de performance
-- Séparé de 001 pour pouvoir être rejoué indépendamment (REINDEX).
-- ================================================================

SET search_path TO product, public;

-- ── Index composites products ─────────────────────────────────────────────────

-- Tri catalogue par date (le plus récent en premier) avec filtre status
CREATE INDEX IF NOT EXISTS idx_products_status_created
    ON products(status, created_at DESC);

-- ── Index composites product_variants ────────────────────────────────────────

-- Recherche par prix croissant pour l'affichage catalogue
CREATE INDEX IF NOT EXISTS idx_variants_product_price
    ON product_variants(product_id, price ASC);

-- ── Index composite promotions ────────────────────────────────────────────────

-- Promotions actives dans une plage de dates — la jointure la plus fréquente
CREATE INDEX IF NOT EXISTS idx_promotions_active_dates
    ON promotions(status, start_date, end_date)
    WHERE status = 'ACTIVE';

-- ── Index full-text search ────────────────────────────────────────────────────

-- Recherche textuelle sur le nom et la description des produits
CREATE INDEX IF NOT EXISTS idx_products_search
    ON products USING gin(to_tsvector('french', coalesce(name, '') || ' ' || coalesce(description, '')));

COMMENT ON INDEX idx_products_search IS
    'Full-text search sur name + description en français';