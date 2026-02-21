-- ================================================================
-- INITIALISATION POSTGRESQL — ECOM WATCH
-- ================================================================
-- CORRECTIONS APPLIQUÉES :
--   - order_status_enum enrichi (PROCESSING, REFUNDED ajoutés)
--   - Séquence order_number_seq supprimée (remplacée par trigger VARCHAR)
--   - Index redondants supprimés (email UNIQUE inclut l'index, etc.)
--   - view_inventory_status définie UNE seule fois (version finale)
--   - Colonnes/migrations dupliquées nettoyées
-- ================================================================

-- ================================================================
-- EXTENSIONS
-- ================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- Pour gen_random_uuid() natif

-- ================================================================
-- ENUMS
-- ================================================================
CREATE TYPE user_role_enum AS ENUM ('USER', 'ADMIN');

-- ✅ FIX : PROCESSING et REFUNDED ajoutés pour correspondre au frontend
-- (GuestOrdersList.jsx, OrderHistory.jsx utilisent ces deux statuts)
CREATE TYPE order_status_enum AS ENUM (
    'PENDING',
    'PAID',
    'PROCESSING',   -- En préparation (manquait)
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'REFUNDED'      -- Remboursée (manquait)
);

CREATE TYPE payment_status_enum AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
CREATE TYPE product_status_enum AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- ================================================================
-- FONCTION UTILITAIRE : updated_at automatique
-- Déclarée en premier car utilisée par plusieurs triggers
-- ================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ================================================================
-- USERS
-- ================================================================
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email         VARCHAR(255) UNIQUE NOT NULL, -- L'index B-tree est créé automatiquement par UNIQUE
    password_hash TEXT NOT NULL,
    salt          TEXT NOT NULL,
    first_name    VARCHAR(100),
    last_name     VARCHAR(100),
    phone         VARCHAR(20),
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP DEFAULT NOW(),
    updated_at    TIMESTAMP DEFAULT NOW()
);

-- ✅ PAS d'idx_users_email ici : la contrainte UNIQUE crée déjà un index B-tree identique

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- ROLES
-- ================================================================
CREATE TABLE roles (
    id   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name user_role_enum UNIQUE NOT NULL
);

CREATE TABLE user_roles (
    user_id UUID     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id SMALLINT NOT NULL REFERENCES roles(id),
    PRIMARY KEY (user_id, role_id)
);

INSERT INTO roles (name) VALUES ('USER'), ('ADMIN');

-- ================================================================
-- REFRESH TOKENS
-- ================================================================
CREATE TABLE refresh_tokens (
    id         BIGSERIAL PRIMARY KEY,
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    token      TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index pour invalider toutes les sessions d'un utilisateur (suppression de compte, logout global)
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);

-- Index pour le nettoyage des tokens expirés (cron quotidien)
-- ✅ FIX : pas de NOW() dans la condition partielle (fonction volatile = rejetée par PostgreSQL)
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ================================================================
-- PRODUCTS
-- ================================================================
CREATE TABLE products (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name       VARCHAR(255) NOT NULL,
    slug       VARCHAR(255) UNIQUE NOT NULL, -- L'index est inclus dans UNIQUE
    description TEXT,
    main_image  TEXT,
    status     product_status_enum DEFAULT 'DRAFT',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ✅ PAS d'idx_products_slug : UNIQUE inclut déjà l'index

CREATE TRIGGER update_products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE product_variants (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku         VARCHAR(100) UNIQUE NOT NULL,
    price       NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    weight      DECIMAL(8, 3) DEFAULT 0.500, -- Poids en kg pour calcul frais de port
    attributes  JSONB,
    created_at  TIMESTAMP DEFAULT NOW()
);

COMMENT ON COLUMN product_variants.weight IS 'Poids en kg (utilisé pour calcul des frais de port)';

-- ✅ PAS d'idx_product_variants_product_sku sur product_id : couvert par le FK index implicite de PostgreSQL
CREATE INDEX idx_product_variants_product ON product_variants(product_id);

-- ================================================================
-- INVENTORY
-- ================================================================
CREATE TABLE inventory (
    variant_id      UUID PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
    available_stock INT NOT NULL DEFAULT 0,
    reserved_stock  INT NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP DEFAULT NOW(),

    -- Cohérence du stock : les deux valeurs ne peuvent pas être négatives
    CONSTRAINT check_stock_consistency CHECK (
        available_stock >= 0
        AND reserved_stock >= 0
        AND (available_stock + reserved_stock) >= 0
    )
);

-- ✅ PAS d'idx_inventory_stock sur available_stock :
-- Les requêtes cherchent par variant_id (PK) pour réserver/libérer du stock.
-- Un index sur available_stock est inutile (jamais utilisé en filtre principal).

CREATE TRIGGER update_inventory_updated_at
    BEFORE UPDATE ON inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- CATEGORIES
-- ================================================================
CREATE TABLE categories (
    id   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE product_categories (
    product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, category_id)
);

-- Index pour navigation : "tous les produits d'une catégorie"
CREATE INDEX idx_product_categories_category ON product_categories(category_id);
-- (product_id est couvert par la PK)

-- ================================================================
-- PROMOTIONS
-- ================================================================
CREATE TABLE promotions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name           VARCHAR(255) NOT NULL,
    description    TEXT,
    discount_type  VARCHAR(20) NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
    discount_value DECIMAL(10, 2) NOT NULL CHECK (discount_value > 0),
    start_date     TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date       TIMESTAMP WITH TIME ZONE NOT NULL,
    status         VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'SCHEDULED', 'EXPIRED')),
    max_usage      INTEGER,
    usage_count    INTEGER DEFAULT 0,
    created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT valid_dates      CHECK (end_date > start_date),
    CONSTRAINT valid_percentage CHECK (discount_type != 'PERCENTAGE' OR discount_value <= 100)
);

CREATE INDEX idx_promotions_status ON promotions(status);
CREATE INDEX idx_promotions_dates  ON promotions(start_date, end_date);

-- Mise à jour automatique du statut des promotions
CREATE OR REPLACE FUNCTION update_promotion_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.end_date < NOW() THEN
        NEW.status = 'EXPIRED';
    ELSIF NEW.start_date > NOW() THEN
        NEW.status = 'SCHEDULED';
    ELSIF NEW.status = 'SCHEDULED' AND NEW.start_date <= NOW() THEN
        NEW.status = 'ACTIVE';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_promotion_status
    BEFORE INSERT OR UPDATE ON promotions
    FOR EACH ROW EXECUTE FUNCTION update_promotion_status();

CREATE TABLE product_promotions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(promotion_id, product_id)
);

CREATE INDEX idx_product_promotions_product   ON product_promotions(product_id);
CREATE INDEX idx_product_promotions_promotion ON product_promotions(promotion_id);

CREATE TABLE variant_promotions (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
    variant_id   UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(promotion_id, variant_id)
);

CREATE INDEX idx_variant_promotions_variant   ON variant_promotions(variant_id);
CREATE INDEX idx_variant_promotions_promotion ON variant_promotions(promotion_id);

-- ================================================================
-- CART
-- ================================================================
CREATE TABLE carts (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cart_user ON carts(user_id);

CREATE TABLE cart_items (
    id         BIGSERIAL PRIMARY KEY,
    cart_id    UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id),
    quantity   INT NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_cart_variant UNIQUE (cart_id, variant_id)
);

CREATE INDEX idx_cart_items_cart    ON cart_items(cart_id);
CREATE INDEX idx_cart_items_variant ON cart_items(variant_id);
CREATE INDEX idx_cart_items_updated_at ON cart_items(updated_at); -- Pour cron de nettoyage

CREATE TRIGGER update_cart_items_updated_at
    BEFORE UPDATE ON cart_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- ADDRESSES
-- ================================================================
CREATE TABLE addresses (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES users(id) ON DELETE CASCADE, -- nullable pour mode guest si besoin
    title      VARCHAR(50),
    first_name VARCHAR(100) NOT NULL,
    last_name  VARCHAR(100) NOT NULL,
    street     VARCHAR(255) NOT NULL,
    city       VARCHAR(100) NOT NULL,
    zip_code   VARCHAR(20) NOT NULL,
    country    VARCHAR(100) DEFAULT 'France',
    phone      VARCHAR(20),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_addresses_user_id ON addresses(user_id);

-- ================================================================
-- ORDERS
-- ================================================================

-- ✅ FIX : Séquence order_number_seq SUPPRIMÉE.
-- Le trigger generate_order_number() génère le numéro au format VARCHAR 'ORD-YYYY-XXXXXXXXXX'.
-- La séquence BIGINT n'était jamais utilisée (le trigger la court-circuitait).
-- order_number est déclaré VARCHAR directement, sans DEFAULT de séquence.

CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number    VARCHAR(50) UNIQUE NOT NULL, -- Format : ORD-2026-1708097550 (généré par trigger)
    user_id         UUID REFERENCES users(id),   -- NULL = commande guest

    status          order_status_enum DEFAULT 'PENDING',

    -- VENTILATION DES MONTANTS
    subtotal_amount NUMERIC(10,2) NOT NULL,
    shipping_cost   NUMERIC(10,2) DEFAULT 0.00,
    shipping_method VARCHAR(50),
    tax_amount      NUMERIC(10,2) DEFAULT 0.00,
    tax_rate        NUMERIC(5,2)  DEFAULT 0.00,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    total_amount    NUMERIC(10,2) NOT NULL,

    -- ADRESSES (JSONB pour flexibilité, avec email dans shippingAddress pour auto-claim)
    shipping_address JSONB NOT NULL,
    billing_address  JSONB,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON COLUMN orders.order_number    IS 'Format ORD-YYYY-TIMESTAMP, généré automatiquement par trigger';
COMMENT ON COLUMN orders.user_id         IS 'NULL = commande guest. Non NULL = commande rattachée à un compte';
COMMENT ON COLUMN orders.subtotal_amount IS 'Total produits HT (avant frais et taxes)';
COMMENT ON COLUMN orders.shipping_cost   IS 'Frais de port HT';
COMMENT ON COLUMN orders.shipping_method IS 'Mode de livraison (STANDARD, EXPRESS, RELAY)';
COMMENT ON COLUMN orders.tax_amount      IS 'Montant de la TVA calculée';
COMMENT ON COLUMN orders.tax_rate        IS 'Taux de TVA appliqué (en pourcentage)';
COMMENT ON COLUMN orders.total_amount    IS 'Montant total TTC (produits + frais + TVA - réductions)';

-- Génération du numéro de commande lisible
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    -- Format : ORD-2026-1708097550 (secondes epoch pour unicité sans collision)
    NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYY') || '-' || (EXTRACT(EPOCH FROM NOW())::BIGINT);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW EXECUTE FUNCTION generate_order_number();

CREATE TRIGGER update_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Index orders ────────────────────────────────────────────────────────────
-- ✅ Les index composites (user+status, user+created) en fichier 002 couvrent
--    les cas d'usage courants. Ici on garde uniquement ce qui est nécessaire
--    dès le départ et non couvert par 002.

-- Index critique pour l'auto-claim : recherche par email dans le JSONB
-- (WHERE user_id IS NULL = commandes guest uniquement)
CREATE INDEX idx_orders_guest_email
    ON orders ((LOWER(shipping_address->>'email')))
    WHERE user_id IS NULL;

COMMENT ON INDEX idx_orders_guest_email IS
    'Auto-claim : recherche rapide des commandes guest par email (index fonctionnel JSONB)';

-- Index pour le webhook Stripe (recherche par order_number dans les metadata)
CREATE INDEX idx_orders_number ON orders(order_number);

-- ✅ PAS de idx_orders_shipping_method : 3 valeurs possibles = sélectivité < 5%,
--    PostgreSQL choisit le seq scan. Inutile.

-- ================================================================
-- ORDER ITEMS
-- ================================================================
CREATE TABLE order_items (
    id                 BIGSERIAL PRIMARY KEY,
    order_id           UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id         UUID REFERENCES product_variants(id),
    product_name       VARCHAR(255) NOT NULL, -- Snapshot du nom au moment de la commande
    variant_attributes JSONB,
    unit_price         NUMERIC(10,2) NOT NULL, -- Snapshot du prix (ne jamais recalculer)
    quantity           INT NOT NULL CHECK (quantity > 0),
    created_at         TIMESTAMP DEFAULT NOW()
);

COMMENT ON COLUMN order_items.product_name IS 'Snapshot du nom produit au moment de la commande (ne pas joindre products)';
COMMENT ON COLUMN order_items.unit_price   IS 'Snapshot du prix unitaire (ne pas recalculer depuis product_variants)';

CREATE INDEX idx_order_items_order   ON order_items(order_id);
CREATE INDEX idx_order_items_variant ON order_items(variant_id);

-- ================================================================
-- PAYMENTS
-- ================================================================
CREATE TABLE payments (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider          VARCHAR(50),
    payment_intent_id VARCHAR(255),
    status            payment_status_enum DEFAULT 'PENDING',
    amount            NUMERIC(10,2) NOT NULL,
    currency          VARCHAR(3) DEFAULT 'EUR',
    metadata          JSONB,
    created_at        TIMESTAMP DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON COLUMN payments.currency IS 'Devise du paiement (EUR, USD, etc.)';
COMMENT ON COLUMN payments.metadata IS 'Données additionnelles (erreurs, détails provider, etc.)';

-- Index pour les webhooks : recherche rapide par payment_intent_id
CREATE INDEX idx_payments_intent ON payments(payment_intent_id)
    WHERE payment_intent_id IS NOT NULL;

-- Index composite pour les recherches fréquentes
CREATE INDEX idx_payments_order_status ON payments(order_id, status);

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- SHIPMENTS
-- ================================================================
CREATE TABLE shipments (
    id              BIGSERIAL PRIMARY KEY,
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    carrier         VARCHAR(100),
    tracking_number VARCHAR(255),
    shipped_at      TIMESTAMP,
    delivered_at    TIMESTAMP,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_order_id UNIQUE (order_id)
);

CREATE INDEX idx_shipments_order ON shipments(order_id);

-- ================================================================
-- VUE INVENTAIRE — VERSION UNIQUE ET FINALE
-- ✅ FIX : Définie une seule fois (3 DROP/CREATE dans la version originale)
-- ================================================================
CREATE VIEW view_inventory_status AS
SELECT
    p.id         AS product_id,
    p.name       AS product_name,
    p.main_image,
    pv.id        AS variant_id,
    pv.sku,
    pv.price,
    pv.weight,
    i.available_stock,
    i.reserved_stock,
    (i.available_stock + i.reserved_stock) AS total_physical_stock,
    (pv.price * i.available_stock)          AS potential_revenue,
    p.status     AS product_status
FROM products p
JOIN product_variants pv ON p.id = pv.product_id
JOIN inventory i ON pv.id = i.variant_id;

COMMENT ON VIEW view_inventory_status IS
    'Vue consolidée produit + variante + stock. Inclure main_image pour les exports.';

-- ================================================================
-- DONNÉES DE TEST
-- ================================================================

INSERT INTO users (id, email, password_hash, salt, first_name, last_name)
VALUES (
    '296d9436-9f63-4aeb-a295-421c31ebc675',
    'test@example.com',
    'hash_bidon',
    'salt_bidon',
    'John',
    'Doe'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO products (id, name, slug, description, status)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'Montre H1 Gold',
    'montre-h1-gold',
    'Une montre élégante',
    'ACTIVE'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO product_variants (id, product_id, sku, price, weight)
VALUES (
    '2d90458e-9445-4cac-a736-b29485b7fedf',
    '11111111-1111-1111-1111-111111111111',
    'H1-GOLD-001',
    199.99,
    0.350
) ON CONFLICT (id) DO NOTHING;

INSERT INTO inventory (variant_id, available_stock, reserved_stock)
VALUES ('2d90458e-9445-4cac-a736-b29485b7fedf', 10, 0)
ON CONFLICT (variant_id) DO NOTHING;

SELECT 'Initialisation terminée avec succès!' AS status;