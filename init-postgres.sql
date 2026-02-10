-- ===============================
-- EXTENSIONS
-- ===============================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ===============================
-- ENUMS
-- ===============================
CREATE TYPE user_role_enum AS ENUM ('USER','ADMIN');
CREATE TYPE order_status_enum AS ENUM ('PENDING','PAID','SHIPPED','DELIVERED','CANCELLED');
CREATE TYPE payment_status_enum AS ENUM ('PENDING','SUCCESS','FAILED');
CREATE TYPE product_status_enum AS ENUM ('DRAFT','ACTIVE','ARCHIVED');

-- ===============================
-- USERS
-- ===============================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- ===============================
-- ROLES
-- ===============================
CREATE TABLE roles (
    id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name user_role_enum UNIQUE NOT NULL
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id SMALLINT NOT NULL REFERENCES roles(id),
    PRIMARY KEY (user_id, role_id)
);

INSERT INTO roles (name) VALUES ('USER'), ('ADMIN');
-- ===============================
-- REFRESH TOKENS
-- ===============================
CREATE TABLE refresh_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ===============================
-- PRODUCTS
-- ===============================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    status product_status_enum DEFAULT 'DRAFT',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku VARCHAR(100) UNIQUE NOT NULL,
    price NUMERIC(10,2) NOT NULL,
    attributes JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ===============================
-- INVENTORY (PERF CRITICAL)
-- ===============================
CREATE TABLE inventory (
    variant_id UUID PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
    available_stock INT NOT NULL DEFAULT 0,
    reserved_stock INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE inventory ADD CONSTRAINT positive_stock CHECK (available_stock >= 0);
-- ===============================
-- CATEGORIES
-- ===============================
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE product_categories (
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, category_id)
);

-- ===============================
-- CART
-- ===============================
CREATE TABLE carts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cart_items (
    id BIGSERIAL PRIMARY KEY,
    cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES product_variants(id),
    quantity INT NOT NULL CHECK (quantity > 0)
);

ALTER TABLE cart_items ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE cart_items ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE cart_items 
ADD CONSTRAINT unique_cart_variant UNIQUE (cart_id, variant_id);


-- ===============================
-- ORDERS
-- ===============================

-- Sequence order number (FAST)
CREATE SEQUENCE order_number_seq START 100000;

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number BIGINT UNIQUE NOT NULL DEFAULT nextval('order_number_seq'),

    user_id UUID REFERENCES users(id),
    status order_status_enum DEFAULT 'PENDING',

    subtotal_amount NUMERIC(10,2) NOT NULL,
    tax_amount NUMERIC(10,2) DEFAULT 0,
    shipping_amount NUMERIC(10,2) DEFAULT 0,
    discount_amount NUMERIC(10,2) DEFAULT 0,
    total_amount NUMERIC(10,2) NOT NULL,

    shipping_address JSONB NOT NULL,
    billing_address JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES product_variants(id),

    product_name VARCHAR(255) NOT NULL,
    variant_attributes JSONB,
    unit_price NUMERIC(10,2) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0)
);

ALTER TABLE orders ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
-- ===============================
-- PAYMENTS
-- ===============================
CREATE TABLE payments (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider VARCHAR(50),
    payment_intent_id VARCHAR(255),
    status payment_status_enum DEFAULT 'PENDING',
    amount NUMERIC(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ===============================
-- SHIPPING
-- ===============================
CREATE TABLE shipments (
    id BIGSERIAL PRIMARY KEY,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    carrier VARCHAR(100),
    tracking_number VARCHAR(255),
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP
);

ALTER TABLE shipments ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE shipments ADD CONSTRAINT unique_order_id UNIQUE (order_id);

CREATE TABLE addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(50), -- ex: 'Maison', 'Bureau'
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    street VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    zip_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) DEFAULT 'France',
    phone VARCHAR(20),
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index pour accélérer la recherche par utilisateur
CREATE INDEX idx_addresses_user_id ON addresses(user_id);
-- ===============================
-- INDEXES (CRITICAL PERFORMANCE)
-- ===============================

-- USERS
CREATE INDEX idx_users_email ON users(email);

-- PRODUCTS
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_product_variants_product ON product_variants(product_id);

-- INVENTORY
CREATE INDEX idx_inventory_stock ON inventory(available_stock);

-- CATEGORIES
CREATE INDEX idx_product_categories_product ON product_categories(product_id);
CREATE INDEX idx_product_categories_category ON product_categories(category_id);

-- CART
CREATE INDEX idx_cart_user ON carts(user_id);
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);
CREATE INDEX idx_cart_items_variant ON cart_items(variant_id);

-- ORDERS
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created ON orders(created_at);

-- ORDER ITEMS
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_variant ON order_items(variant_id);

-- PAYMENTS
CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);

-- SHIPMENTS
CREATE INDEX idx_shipments_order ON shipments(order_id);

--code pour tester le corn 

-- 1. Créer une commande PENDING vieille de 25h
INSERT INTO users (id, email, password_hash, salt, first_name, last_name)
VALUES (
    '296d9436-9f63-4aeb-a295-421c31ebc675', 
    'test@example.com', 
    'hash_bidon', 
    'salt_bidon', 
    'John', 
    'Doe'
);

-- 2. Créer un produit de test
INSERT INTO products (id, name, slug, description, status)
VALUES (
    '11111111-1111-1111-1111-111111111111', 
    'Montre H1 Gold', 
    'montre-h1-gold', 
    'Une montre élégante', 
    'ACTIVE'
);

-- 3. Créer le variant et l'inventaire associé
INSERT INTO product_variants (id, product_id, sku, price)
VALUES (
    '2d90458e-9445-4cac-a736-b29485b7fedf', 
    '11111111-1111-1111-1111-111111111111', 
    'H1-GOLD-001', 
    199.99
);

INSERT INTO inventory (variant_id, available_stock, reserved_stock)
VALUES ('2d90458e-9445-4cac-a736-b29485b7fedf', 10, 0);


--une VIEW pour voir les stock combiné avec les produits 

-- 1. On supprime l'ancienne version
DROP VIEW IF EXISTS view_inventory_status;

-- 2. On recrée la vue avec toutes les colonnes, incluant le CA potentiel
CREATE VIEW view_inventory_status AS
SELECT 
    p.id AS product_id,
    p.name AS product_name,
    pv.id AS variant_id, -- On la garde pour éviter les conflits futurs
    pv.sku,
    pv.price,
    i.available_stock,
    i.reserved_stock,
    (i.available_stock + i.reserved_stock) AS total_physical_stock,
    (pv.price * i.available_stock) AS potential_revenue, -- La nouvelle colonne
    p.status AS product_status
FROM products p
JOIN product_variants pv ON p.id = pv.product_id
JOIN inventory i ON pv.id = i.variant_id
ORDER BY p.name ASC, pv.sku ASC;


SELECT p.*, 
       MIN(v.price) as starting_price,
       COUNT(v.id) as variant_count
FROM products p
LEFT JOIN product_variants v ON p.id = v.product_id
${joinClause}
${whereClause}
GROUP BY p.id
ORDER BY p.created_at DESC
LIMIT $1 OFFSET $2