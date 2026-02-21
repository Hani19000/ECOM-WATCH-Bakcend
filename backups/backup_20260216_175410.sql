--
-- PostgreSQL database dump
--

\restrict xgAjMjuPu9wIuLuGJacEI8LZYohpZNtL2PKZW27H0YHUYwrHJ2vgW7UysZYgiEc

-- Dumped from database version 15.15
-- Dumped by pg_dump version 15.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: order_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.order_status_enum AS ENUM (
    'PENDING',
    'PAID',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED'
);


ALTER TYPE public.order_status_enum OWNER TO postgres;

--
-- Name: payment_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.payment_status_enum AS ENUM (
    'PENDING',
    'SUCCESS',
    'FAILED'
);


ALTER TYPE public.payment_status_enum OWNER TO postgres;

--
-- Name: product_status_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.product_status_enum AS ENUM (
    'DRAFT',
    'ACTIVE',
    'ARCHIVED'
);


ALTER TYPE public.product_status_enum OWNER TO postgres;

--
-- Name: user_role_enum; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.user_role_enum AS ENUM (
    'USER',
    'ADMIN'
);


ALTER TYPE public.user_role_enum OWNER TO postgres;

--
-- Name: generate_order_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_order_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Format : ORD + Année en cours + Timestamp (secondes)
    -- Exemple résultat : ORD-2026-1708097550
    NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYY') || '-' || (EXTRACT(EPOCH FROM NOW())::BIGINT);
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.generate_order_number() OWNER TO postgres;

--
-- Name: update_promotion_status(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_promotion_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


ALTER FUNCTION public.update_promotion_status() OWNER TO postgres;

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: addresses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.addresses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title character varying(50),
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    street character varying(255) NOT NULL,
    city character varying(100) NOT NULL,
    zip_code character varying(20) NOT NULL,
    country character varying(100) DEFAULT 'France'::character varying,
    phone character varying(20),
    is_default boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.addresses OWNER TO postgres;

--
-- Name: cart_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cart_items (
    id bigint NOT NULL,
    cart_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    quantity integer NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT cart_items_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.cart_items OWNER TO postgres;

--
-- Name: cart_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.cart_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.cart_items_id_seq OWNER TO postgres;

--
-- Name: cart_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.cart_items_id_seq OWNED BY public.cart_items.id;


--
-- Name: carts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.carts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    user_id uuid,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.carts OWNER TO postgres;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- Name: inventory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory (
    variant_id uuid NOT NULL,
    available_stock integer DEFAULT 0 NOT NULL,
    reserved_stock integer DEFAULT 0 NOT NULL,
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT positive_stock CHECK ((available_stock >= 0))
);


ALTER TABLE public.inventory OWNER TO postgres;

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id bigint NOT NULL,
    order_id uuid NOT NULL,
    variant_id uuid,
    product_name character varying(255) NOT NULL,
    variant_attributes jsonb,
    unit_price numeric(10,2) NOT NULL,
    quantity integer NOT NULL,
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.order_items_id_seq OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: order_number_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_number_seq
    START WITH 100000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.order_number_seq OWNER TO postgres;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    order_number character varying(50) DEFAULT nextval('public.order_number_seq'::regclass) NOT NULL,
    user_id uuid,
    status public.order_status_enum DEFAULT 'PENDING'::public.order_status_enum,
    subtotal_amount numeric(10,2) NOT NULL,
    shipping_cost numeric(10,2) DEFAULT 0.00,
    shipping_method character varying(50),
    tax_amount numeric(10,2) DEFAULT 0.00,
    tax_rate numeric(5,2) DEFAULT 0.00,
    discount_amount numeric(10,2) DEFAULT 0,
    total_amount numeric(10,2) NOT NULL,
    shipping_address jsonb NOT NULL,
    billing_address jsonb,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: COLUMN orders.subtotal_amount; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.orders.subtotal_amount IS 'Total produits HT (avant frais et taxes)';


--
-- Name: COLUMN orders.shipping_cost; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.orders.shipping_cost IS 'Frais de port HT';


--
-- Name: COLUMN orders.shipping_method; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.orders.shipping_method IS 'Mode de livraison (STANDARD, EXPRESS, RELAY)';


--
-- Name: COLUMN orders.tax_amount; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.orders.tax_amount IS 'Montant de la TVA calculée';


--
-- Name: COLUMN orders.tax_rate; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.orders.tax_rate IS 'Taux de TVA appliqué (en pourcentage)';


--
-- Name: COLUMN orders.total_amount; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.orders.total_amount IS 'Montant total TTC (produits + frais + TVA - réductions)';


--
-- Name: payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payments (
    id bigint NOT NULL,
    order_id uuid NOT NULL,
    provider character varying(50),
    payment_intent_id character varying(255),
    status public.payment_status_enum DEFAULT 'PENDING'::public.payment_status_enum,
    amount numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    currency character varying(3) DEFAULT 'EUR'::character varying,
    metadata jsonb
);


ALTER TABLE public.payments OWNER TO postgres;

--
-- Name: COLUMN payments.currency; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.payments.currency IS 'Devise du paiement (EUR, USD, etc.)';


--
-- Name: COLUMN payments.metadata; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.payments.metadata IS 'Données additionnelles (erreurs, détails provider, etc.)';


--
-- Name: payments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.payments_id_seq OWNER TO postgres;

--
-- Name: payments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.payments_id_seq OWNED BY public.payments.id;


--
-- Name: product_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_categories (
    product_id uuid NOT NULL,
    category_id uuid NOT NULL
);


ALTER TABLE public.product_categories OWNER TO postgres;

--
-- Name: product_promotions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_promotions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    promotion_id uuid NOT NULL,
    product_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.product_promotions OWNER TO postgres;

--
-- Name: product_variants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_variants (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    sku character varying(100) NOT NULL,
    price numeric(10,2) NOT NULL,
    weight numeric(8,3) DEFAULT 0.500,
    attributes jsonb,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.product_variants OWNER TO postgres;

--
-- Name: COLUMN product_variants.weight; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.product_variants.weight IS 'Poids en kg (utilisé pour calcul des frais de port)';


--
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    slug character varying(255) NOT NULL,
    description text,
    status public.product_status_enum DEFAULT 'DRAFT'::public.product_status_enum,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    main_image text
);


ALTER TABLE public.products OWNER TO postgres;

--
-- Name: promotions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.promotions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    discount_type character varying(20) NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    start_date timestamp with time zone NOT NULL,
    end_date timestamp with time zone NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    max_usage integer,
    usage_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT promotions_discount_type_check CHECK (((discount_type)::text = ANY ((ARRAY['PERCENTAGE'::character varying, 'FIXED'::character varying])::text[]))),
    CONSTRAINT promotions_discount_value_check CHECK ((discount_value > (0)::numeric)),
    CONSTRAINT promotions_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying, 'SCHEDULED'::character varying, 'EXPIRED'::character varying])::text[]))),
    CONSTRAINT valid_dates CHECK ((end_date > start_date)),
    CONSTRAINT valid_percentage CHECK ((((discount_type)::text <> 'PERCENTAGE'::text) OR (discount_value <= (100)::numeric)))
);


ALTER TABLE public.promotions OWNER TO postgres;

--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.refresh_tokens (
    id bigint NOT NULL,
    user_id uuid,
    token text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.refresh_tokens OWNER TO postgres;

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.refresh_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.refresh_tokens_id_seq OWNER TO postgres;

--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.refresh_tokens_id_seq OWNED BY public.refresh_tokens.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.roles (
    id smallint NOT NULL,
    name public.user_role_enum NOT NULL
);


ALTER TABLE public.roles OWNER TO postgres;

--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.roles ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: shipments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shipments (
    id bigint NOT NULL,
    order_id uuid NOT NULL,
    carrier character varying(100),
    tracking_number character varying(255),
    shipped_at timestamp without time zone,
    delivered_at timestamp without time zone,
    updated_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.shipments OWNER TO postgres;

--
-- Name: shipments_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.shipments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.shipments_id_seq OWNER TO postgres;

--
-- Name: shipments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.shipments_id_seq OWNED BY public.shipments.id;


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_id smallint NOT NULL
);


ALTER TABLE public.user_roles OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    salt text NOT NULL,
    first_name character varying(100),
    last_name character varying(100),
    phone character varying(20),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: variant_promotions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.variant_promotions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    promotion_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.variant_promotions OWNER TO postgres;

--
-- Name: view_inventory_status; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.view_inventory_status AS
 SELECT p.id AS product_id,
    p.name AS product_name,
    p.main_image,
    pv.id AS variant_id,
    pv.sku,
    pv.price,
    pv.weight,
    i.available_stock,
    i.reserved_stock,
    p.status AS product_status
   FROM ((public.products p
     JOIN public.product_variants pv ON ((p.id = pv.product_id)))
     JOIN public.inventory i ON ((pv.id = i.variant_id)));


ALTER TABLE public.view_inventory_status OWNER TO postgres;

--
-- Name: cart_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cart_items ALTER COLUMN id SET DEFAULT nextval('public.cart_items_id_seq'::regclass);


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: payments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments ALTER COLUMN id SET DEFAULT nextval('public.payments_id_seq'::regclass);


--
-- Name: refresh_tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN id SET DEFAULT nextval('public.refresh_tokens_id_seq'::regclass);


--
-- Name: shipments id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shipments ALTER COLUMN id SET DEFAULT nextval('public.shipments_id_seq'::regclass);


--
-- Data for Name: addresses; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.addresses (id, user_id, title, first_name, last_name, street, city, zip_code, country, phone, is_default, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: cart_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.cart_items (id, cart_id, variant_id, quantity, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: carts; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.carts (id, user_id, created_at) FROM stdin;
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.categories (id, name, slug) FROM stdin;
6a2c2151-92f3-44bb-88af-31432e1cbfb4	Vintage	vintage
951b2c29-9670-4841-b0b1-20379c6f8127	Luxe	luxe
47d6251d-179d-4b22-93ce-a49403a4b753	Sport	sport
\.


--
-- Data for Name: inventory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.inventory (variant_id, available_stock, reserved_stock, updated_at) FROM stdin;
1305deb5-efd3-4279-ab8e-b31f23f89abf	5	0	2026-02-13 15:27:33.142767
307e4f43-7bcd-44f2-bd23-509916f4a62c	0	0	2026-02-13 15:52:05.04238
15b3b108-e4c5-4b14-9418-70b30d3a247e	1	2	2026-02-14 14:54:02.237106
65f28cbd-2a2c-4143-b50c-14ca780f31b7	1	26	2026-02-15 22:12:26.973347
3707f3e7-707f-48dd-bca8-937259f32851	0	4	2026-02-13 22:01:13.370399
60a874c3-2394-4a76-9e59-5f6b00b97b94	0	4	2026-02-13 23:02:21.358917
a20f6790-8d47-4db6-a769-c731664f1b32	1	1	2026-02-13 23:03:41.704491
9968401b-da69-4ce1-a98b-5c1e7f989cc8	19	16	2026-02-16 16:42:22.838359
\.


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, order_id, variant_id, product_name, variant_attributes, unit_price, quantity) FROM stdin;
1	1252f81c-94b8-4adf-bf8d-2e059d476129	3707f3e7-707f-48dd-bca8-937259f32851	Tudor Black Bay 58	{"size": "39mm", "color": "#000000"}	4100.00	1
2	2b61ec20-6cff-4951-8892-21bfd49ca56c	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
3	6247254c-cf68-4f21-9210-03e77043d837	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
4	c3c8fc6a-c246-4a36-9fc0-f7708a22cd55	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
5	e9a39fb2-a397-4462-8c19-55c9a28b150b	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
6	482eeb68-1a7b-46d2-b6df-04a95fdabe73	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
7	33ac18c1-ec49-4dc8-8dbd-9f4293830ef9	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
8	72c1f0e7-06f0-4918-aad6-dafc9c2ac235	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
9	ebb43b8c-e635-45cc-9e40-5c6c11cd783e	60a874c3-2394-4a76-9e59-5f6b00b97b94	GMT Master II	{"size": "40mm", "color": "#00205B"}	15000.00	1
10	bfa2343c-172e-490f-9c59-5440af8e882d	3707f3e7-707f-48dd-bca8-937259f32851	Tudor Black Bay 58	{"size": "39mm", "color": "#000000"}	4100.00	1
11	3d7b6f48-9000-4f49-964a-f223f42cb152	3707f3e7-707f-48dd-bca8-937259f32851	Tudor Black Bay 58	{"size": "39mm", "color": "#000000"}	4100.00	1
12	e3348458-4a6e-4392-af8b-33a10d1e46c5	3707f3e7-707f-48dd-bca8-937259f32851	Tudor Black Bay 58	{"size": "39mm", "color": "#000000"}	4100.00	1
13	0690d8d5-d2e7-4bf2-8538-b5b858585938	60a874c3-2394-4a76-9e59-5f6b00b97b94	GMT Master II	{"size": "40mm", "color": "#00205B"}	15000.00	1
14	37915d16-f07b-4980-a748-0a39bfe50c8c	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
15	69d363e0-f5e6-4d32-8bbb-900c56c5bfb4	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
16	de0c6c90-03aa-4811-821a-7a2ff29b4445	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
17	e67d9e50-7ddd-4a16-ba78-49720eab1ab7	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
18	f1734dc1-8c74-4334-bde9-b6406ff08f6b	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
19	6a95e823-8802-4384-926e-07b9eb8d15a8	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
20	6a95e823-8802-4384-926e-07b9eb8d15a8	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
21	6ce38515-080f-4983-b452-eab282d4cb1e	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
22	6ce38515-080f-4983-b452-eab282d4cb1e	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
23	a6d6bc7d-b748-490a-807a-2b18bd8c6bbf	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
24	03f965fc-c423-413c-b5a1-910615179433	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
25	03f965fc-c423-413c-b5a1-910615179433	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
26	6957ec17-d5b0-4c1f-b4af-87f1fa0a6940	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
27	6957ec17-d5b0-4c1f-b4af-87f1fa0a6940	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
28	5c43efd7-bfa4-4c56-936c-20ecde2d96c0	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
29	5c43efd7-bfa4-4c56-936c-20ecde2d96c0	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
30	52b0b34b-66b8-4588-bd48-cf8f7242add2	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
31	52b0b34b-66b8-4588-bd48-cf8f7242add2	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
32	4cdc3f23-d901-4a47-983e-0abe8b052cf8	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
33	4cdc3f23-d901-4a47-983e-0abe8b052cf8	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
34	8bdcb878-39fc-4e09-9c68-dfc2e7c95fe0	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
35	8bdcb878-39fc-4e09-9c68-dfc2e7c95fe0	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
36	6060f967-2a59-4bfa-bf22-a579b7940618	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
37	005fcbed-7258-4da3-ae5a-f9ff9b942e2b	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
38	b82bffab-eacb-49f4-b55a-60ce8312fa21	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
39	8da0718b-2c5f-41e9-9daa-0435bc3ef4b0	3707f3e7-707f-48dd-bca8-937259f32851	Tudor Black Bay 58	{"size": "39mm", "color": "#000000"}	4100.00	1
40	7878cbd6-09a5-4034-ad77-aaebc88b9652	3707f3e7-707f-48dd-bca8-937259f32851	Tudor Black Bay 58	{"size": "39mm", "color": "#000000"}	4100.00	1
41	9c19d24e-d909-4767-a5a4-f9da2facf942	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
42	f49cd71e-bebd-4385-9953-c3f32131646f	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
43	8c6d7298-d1ca-4ef6-96e3-3ee130f9da17	60a874c3-2394-4a76-9e59-5f6b00b97b94	GMT Master II	{"size": "40mm", "color": "#00205B"}	15000.00	1
44	14c4754a-1353-470f-b481-fb28534b0638	a20f6790-8d47-4db6-a769-c731664f1b32	GMT Master II	{"size": "44mm", "color": "#000000"}	14500.00	1
45	05db5358-0bf6-4f09-bbdd-6a1e768baca8	a20f6790-8d47-4db6-a769-c731664f1b32	GMT Master II	{"size": "44mm", "color": "#000000"}	14500.00	1
46	b504cc47-adab-4361-9ce3-4be04e4b18d2	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
47	d9124a55-1011-48fb-9e9c-dc47dbc5a594	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
48	63c0ce70-9046-4aca-9519-e6aac3a81330	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
49	4a5319f3-4a82-484a-867b-884458a6edbc	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
50	253425a0-3062-4520-a3ad-b9ddc978e5bb	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
51	cb19fb47-0590-4ae1-a7b6-dbda33527833	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
52	eacc4d77-8026-4e6f-8930-d381c10fd274	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
53	5385ac60-db7c-49cc-a0b9-1fced985fb57	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
54	57c4c863-b4ef-422c-9e77-444323b85c6f	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
55	8f17a2cf-4e8c-4f0a-86f9-a9a85ec1e935	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
56	b7d76ea4-0136-4fdb-8038-dd327d80d4df	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
57	8da78d3f-4d63-4e61-9974-6e0deef6fe6a	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
58	fae20565-523a-4d49-b1a7-d44d5695b532	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
59	3451acfa-44bf-4ba8-8999-863322ada9b3	15b3b108-e4c5-4b14-9418-70b30d3a247e	omega 	{"size": "33mm", "color": "#D4AF37"}	12000.00	1
60	10ac984b-eec9-4133-b9d7-34111bac47d7	15b3b108-e4c5-4b14-9418-70b30d3a247e	omega 	{"size": "33mm", "color": "#D4AF37"}	12000.00	1
61	6b09034e-0e87-4d28-9602-267161cc5ddf	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
62	42f6a6e8-9d31-4f9d-920b-bbe797efe082	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
63	21e50208-b77c-41b1-998b-a1900900c7d0	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
64	039c3fe6-a453-49c7-b183-f104531bdfe8	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
65	e4130a78-58ef-4661-8175-860ca5a91cfc	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
66	08e6ed56-3be0-4077-ae23-a3e51e3d0f9d	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
67	98168b18-83f5-4985-bddc-74f064d980d4	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
68	a7263f72-6ce9-4f56-a268-347bba594b90	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
69	a2dc78da-0e84-4f99-80de-9ce9284d2a3d	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
70	9a9c6b86-2cab-4831-8e0f-5229a61a0c5e	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
71	1056744e-1c17-4c8b-8d67-eb18357426af	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
72	f9ed6385-d4bb-4c89-bc82-511ff4d9403d	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
73	31819e0b-1587-4b60-9837-5aafc0ae54fb	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
74	11e66a63-a46e-4d16-8072-b153722418df	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
75	a37b37e7-f10c-4671-a419-07840dcdf1bc	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
76	e43d8f10-b8ce-4ff1-937e-f34b561ba294	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
77	9bd87a90-0c40-4dc0-8ac8-501bbc792a01	65f28cbd-2a2c-4143-b50c-14ca780f31b7	Fossil Grant	{"size": "38mm", "color": "#2C2C2C"}	160.00	1
78	1cb62ec2-4922-46df-b805-08d1e50c8c01	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
79	95df002f-783f-427f-a669-33d117222ce9	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
80	2ff9c69f-2052-439e-ba15-5df24c1391ff	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
81	3d822c22-3644-4cdd-b1a3-9ad009503f83	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
82	25a4353b-054a-4faa-9e89-1f5413db5076	9968401b-da69-4ce1-a98b-5c1e7f989cc8	Fossil Grant	{"size": "44mm", "color": "#4B3621"}	150.00	1
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, order_number, user_id, status, subtotal_amount, shipping_cost, shipping_method, tax_amount, tax_rate, discount_amount, total_amount, shipping_address, billing_address, created_at, updated_at) FROM stdin;
2ff9c69f-2052-439e-ba15-5df24c1391ff	ORD-2026-1771258433	\N	PENDING	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-16 16:13:52.859845	2026-02-16 16:13:52.859845+00
25a4353b-054a-4faa-9e89-1f5413db5076	ORD-2026-1771260129	a232e965-2d97-4fa5-83dd-72ac3909c2d8	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider2@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-16 16:42:08.748559	2026-02-16 16:43:25.399314+00
3d822c22-3644-4cdd-b1a3-9ad009503f83	ORD-2026-1771258604	\N	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-16 16:16:44.083439	2026-02-16 16:16:57.856878+00
b504cc47-adab-4361-9ce3-4be04e4b18d2	ORD-2026-100039	a232e965-2d97-4fa5-83dd-72ac3909c2d8	PAID	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "email": "hanider2@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 23:05:57.64078	2026-02-16 16:43:25.403021+00
1252f81c-94b8-4adf-bf8d-2e059d476129	ORD-2026-100002	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PENDING	4100.00	0.00	\N	0.00	0.00	0.00	4920.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 17:31:52.062751	2026-02-16 15:40:41.882832+00
2b61ec20-6cff-4951-8892-21bfd49ca56c	ORD-2026-100003	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PENDING	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 17:44:14.898624	2026-02-16 15:40:41.882832+00
6247254c-cf68-4f21-9210-03e77043d837	ORD-2026-100004	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PENDING	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 17:45:40.691704	2026-02-16 15:40:41.882832+00
c3c8fc6a-c246-4a36-9fc0-f7708a22cd55	ORD-2026-100005	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PENDING	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 17:48:19.665121	2026-02-16 15:40:41.882832+00
e9a39fb2-a397-4462-8c19-55c9a28b150b	ORD-2026-100006	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PENDING	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 18:15:30.714252	2026-02-16 15:40:41.882832+00
482eeb68-1a7b-46d2-b6df-04a95fdabe73	ORD-2026-100007	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PAID	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 18:33:14.575225	2026-02-16 15:40:41.882832+00
33ac18c1-ec49-4dc8-8dbd-9f4293830ef9	ORD-2026-100008	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PAID	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 18:42:38.614359	2026-02-16 15:40:41.882832+00
72c1f0e7-06f0-4918-aad6-dafc9c2ac235	ORD-2026-100009	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PENDING	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 18:49:51.496245	2026-02-16 15:40:41.882832+00
ebb43b8c-e635-45cc-9e40-5c6c11cd783e	ORD-2026-100010	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PENDING	15000.00	0.00	\N	0.00	0.00	0.00	18000.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 19:10:20.459399	2026-02-16 15:40:41.882832+00
bfa2343c-172e-490f-9c59-5440af8e882d	ORD-2026-100011	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PENDING	4100.00	0.00	\N	0.00	0.00	0.00	4920.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 19:15:35.657937	2026-02-16 15:40:41.882832+00
3d7b6f48-9000-4f49-964a-f223f42cb152	ORD-2026-100012	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PENDING	4100.00	0.00	\N	0.00	0.00	0.00	4920.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 19:19:58.004974	2026-02-16 15:40:41.882832+00
e3348458-4a6e-4392-af8b-33a10d1e46c5	ORD-2026-100013	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PENDING	4100.00	0.00	\N	0.00	0.00	0.00	4920.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 19:24:57.618271	2026-02-16 15:40:41.882832+00
0690d8d5-d2e7-4bf2-8538-b5b858585938	ORD-2026-100014	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PAID	15000.00	0.00	\N	0.00	0.00	0.00	18000.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 19:27:12.385107	2026-02-16 15:40:41.882832+00
37915d16-f07b-4980-a748-0a39bfe50c8c	ORD-2026-100015	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PENDING	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 19:57:11.40585	2026-02-16 15:40:41.882832+00
69d363e0-f5e6-4d32-8bbb-900c56c5bfb4	ORD-2026-100016	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PAID	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 20:22:11.090139	2026-02-16 15:40:41.882832+00
de0c6c90-03aa-4811-821a-7a2ff29b4445	ORD-2026-100017	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PAID	150.00	0.00	\N	0.00	0.00	0.00	180.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 20:28:56.034994	2026-02-16 15:40:41.882832+00
e67d9e50-7ddd-4a16-ba78-49720eab1ab7	ORD-2026-100018	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PAID	150.00	0.00	\N	0.00	0.00	0.00	180.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 20:31:22.938418	2026-02-16 15:40:41.882832+00
f1734dc1-8c74-4334-bde9-b6406ff08f6b	ORD-2026-100019	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PAID	150.00	0.00	\N	0.00	0.00	0.00	180.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 20:34:58.683141	2026-02-16 15:40:41.882832+00
6a95e823-8802-4384-926e-07b9eb8d15a8	ORD-2026-100020	\N	PENDING	310.00	0.00	\N	0.00	0.00	0.00	372.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 21:01:49.131287	2026-02-16 15:40:41.882832+00
6ce38515-080f-4983-b452-eab282d4cb1e	ORD-2026-100021	\N	PENDING	310.00	0.00	\N	0.00	0.00	0.00	372.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 21:02:20.04702	2026-02-16 15:40:41.882832+00
a6d6bc7d-b748-490a-807a-2b18bd8c6bbf	ORD-2026-100022	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PENDING	150.00	0.00	\N	0.00	0.00	0.00	180.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 21:02:52.685756	2026-02-16 15:40:41.882832+00
03f965fc-c423-413c-b5a1-910615179433	ORD-2026-100023	\N	PENDING	310.00	0.00	\N	0.00	0.00	0.00	372.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 21:03:16.042206	2026-02-16 15:40:41.882832+00
6957ec17-d5b0-4c1f-b4af-87f1fa0a6940	ORD-2026-100024	\N	PENDING	310.00	0.00	\N	0.00	0.00	0.00	372.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 21:34:43.614012	2026-02-16 15:40:41.882832+00
5c43efd7-bfa4-4c56-936c-20ecde2d96c0	ORD-2026-100025	\N	PENDING	310.00	0.00	\N	0.00	0.00	0.00	372.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 21:35:03.049581	2026-02-16 15:40:41.882832+00
52b0b34b-66b8-4588-bd48-cf8f7242add2	ORD-2026-100026	\N	PENDING	310.00	0.00	\N	0.00	0.00	0.00	372.00	{"city": "venissieux", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 21:35:39.009333	2026-02-16 15:40:41.882832+00
4cdc3f23-d901-4a47-983e-0abe8b052cf8	ORD-2026-100027	\N	PENDING	310.00	0.00	\N	0.00	0.00	0.00	372.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 21:39:45.537925	2026-02-16 15:40:41.882832+00
8bdcb878-39fc-4e09-9c68-dfc2e7c95fe0	ORD-2026-100028	\N	PAID	310.00	0.00	\N	0.00	0.00	0.00	372.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 21:47:39.203052	2026-02-16 15:40:41.882832+00
6060f967-2a59-4bfa-bf22-a579b7940618	ORD-2026-100029	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PAID	150.00	0.00	\N	0.00	0.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 21:48:30.056821	2026-02-16 15:40:41.882832+00
005fcbed-7258-4da3-ae5a-f9ff9b942e2b	ORD-2026-100030	\N	PAID	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 21:52:30.907197	2026-02-16 15:40:41.882832+00
b82bffab-eacb-49f4-b55a-60ce8312fa21	ORD-2026-100031	\N	PAID	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 21:56:36.514799	2026-02-16 15:40:41.882832+00
8da0718b-2c5f-41e9-9daa-0435bc3ef4b0	ORD-2026-100032	\N	PAID	4100.00	0.00	\N	0.00	0.00	0.00	4920.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 21:59:13.73832	2026-02-16 15:40:41.882832+00
7878cbd6-09a5-4034-ad77-aaebc88b9652	ORD-2026-100033	\N	PAID	4100.00	0.00	\N	0.00	0.00	0.00	4920.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 22:00:58.035326	2026-02-16 15:40:41.882832+00
9c19d24e-d909-4767-a5a4-f9da2facf942	ORD-2026-100034	\N	PAID	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 22:11:02.816861	2026-02-16 15:40:41.882832+00
f49cd71e-bebd-4385-9953-c3f32131646f	ORD-2026-100035	\N	PAID	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 22:13:28.036673	2026-02-16 15:40:41.882832+00
8c6d7298-d1ca-4ef6-96e3-3ee130f9da17	ORD-2026-100036	\N	PENDING	15000.00	0.00	\N	0.00	0.00	0.00	18000.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 23:02:21.358917	2026-02-16 15:40:41.882832+00
14c4754a-1353-470f-b481-fb28534b0638	ORD-2026-100037	\N	PENDING	14500.00	0.00	\N	0.00	0.00	0.00	17400.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 23:03:12.462395	2026-02-16 15:40:41.882832+00
05db5358-0bf6-4f09-bbdd-6a1e768baca8	ORD-2026-100038	\N	PAID	14500.00	0.00	\N	0.00	0.00	0.00	17400.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 23:03:28.03321	2026-02-16 15:40:41.882832+00
d9124a55-1011-48fb-9e9c-dc47dbc5a594	ORD-2026-100040	\N	PAID	160.00	0.00	\N	0.00	0.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 23:11:08.231897	2026-02-16 15:40:41.882832+00
63c0ce70-9046-4aca-9519-e6aac3a81330	ORD-2026-100076	\N	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 23:20:39.030228	2026-02-16 15:40:41.882832+00
4a5319f3-4a82-484a-867b-884458a6edbc	ORD-2026-100077	\N	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 23:25:18.754199	2026-02-16 15:40:41.882832+00
253425a0-3062-4520-a3ad-b9ddc978e5bb	ORD-2026-100078	\N	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 23:28:17.155179	2026-02-16 15:40:41.882832+00
cb19fb47-0590-4ae1-a7b6-dbda33527833	ORD-2026-100079	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 23:29:12.307497	2026-02-16 15:40:41.882832+00
eacc4d77-8026-4e6f-8930-d381c10fd274	ORD-2026-100080	\N	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 23:30:52.767071	2026-02-16 15:40:41.882832+00
5385ac60-db7c-49cc-a0b9-1fced985fb57	ORD-2026-100081	\N	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 23:49:03.694203	2026-02-16 15:40:41.882832+00
57c4c863-b4ef-422c-9e77-444323b85c6f	ORD-2026-100082	\N	PENDING	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-13 23:59:46.062569	2026-02-16 15:40:41.882832+00
8f17a2cf-4e8c-4f0a-86f9-a9a85ec1e935	ORD-2026-100083	\N	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 00:00:13.54281	2026-02-16 15:40:41.882832+00
b7d76ea4-0136-4fdb-8038-dd327d80d4df	ORD-2026-100084	\N	PENDING	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 00:01:01.103879	2026-02-16 15:40:41.882832+00
8da78d3f-4d63-4e61-9974-6e0deef6fe6a	ORD-2026-100085	\N	PENDING	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 00:10:12.949256	2026-02-16 15:40:41.882832+00
fae20565-523a-4d49-b1a7-d44d5695b532	ORD-2026-100086	\N	PENDING	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 00:10:46.957731	2026-02-16 15:40:41.882832+00
3451acfa-44bf-4ba8-8999-863322ada9b3	ORD-2026-100087	\N	PENDING	12000.00	0.00	STANDARD	2400.00	20.00	0.00	14400.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 14:44:52.547221	2026-02-16 15:40:41.882832+00
10ac984b-eec9-4133-b9d7-34111bac47d7	ORD-2026-100088	\N	PENDING	12000.00	0.00	STANDARD	2400.00	20.00	0.00	14400.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 14:54:02.237106	2026-02-16 15:40:41.882832+00
6b09034e-0e87-4d28-9602-267161cc5ddf	ORD-2026-100089	\N	PENDING	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 14:57:19.227043	2026-02-16 15:40:41.882832+00
42f6a6e8-9d31-4f9d-920b-bbe797efe082	ORD-2026-100090	\N	PENDING	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 14:58:38.820856	2026-02-16 15:40:41.882832+00
21e50208-b77c-41b1-998b-a1900900c7d0	ORD-2026-100091	\N	PENDING	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 14:59:35.796901	2026-02-16 15:40:41.882832+00
039c3fe6-a453-49c7-b183-f104531bdfe8	ORD-2026-100092	\N	PAID	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 15:05:14.206094	2026-02-16 15:40:41.882832+00
e4130a78-58ef-4661-8175-860ca5a91cfc	ORD-2026-100093	\N	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 15:06:12.587324	2026-02-16 15:40:41.882832+00
08e6ed56-3be0-4077-ae23-a3e51e3d0f9d	ORD-2026-100094	\N	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 15:16:21.564086	2026-02-16 15:40:41.882832+00
98168b18-83f5-4985-bddc-74f064d980d4	ORD-2026-100095	\N	PAID	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 17:50:06.512168	2026-02-16 15:40:41.882832+00
a7263f72-6ce9-4f56-a268-347bba594b90	ORD-2026-100096	\N	PAID	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 17:59:18.558028	2026-02-16 15:40:41.882832+00
a2dc78da-0e84-4f99-80de-9ce9284d2a3d	ORD-2026-100097	\N	PAID	160.00	0.00	RELAY	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-14 18:17:25.339367	2026-02-16 15:40:41.882832+00
9a9c6b86-2cab-4831-8e0f-5229a61a0c5e	ORD-2026-100098	\N	PENDING	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-15 21:46:52.166609	2026-02-16 15:40:41.882832+00
1056744e-1c17-4c8b-8d67-eb18357426af	ORD-2026-100099	\N	PENDING	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-15 21:47:06.208049	2026-02-16 15:40:41.882832+00
f9ed6385-d4bb-4c89-bc82-511ff4d9403d	ORD-2026-100100	\N	PAID	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-15 21:49:02.412267	2026-02-16 15:40:41.882832+00
31819e0b-1587-4b60-9837-5aafc0ae54fb	ORD-2026-100101	\N	PAID	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-15 22:01:41.361206	2026-02-16 15:40:41.882832+00
11e66a63-a46e-4d16-8072-b153722418df	ORD-2026-100102	\N	PAID	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-15 22:08:18.460127	2026-02-16 15:40:41.882832+00
a37b37e7-f10c-4671-a419-07840dcdf1bc	ORD-2026-100103	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-15 22:10:24.923082	2026-02-16 15:40:41.882832+00
e43d8f10-b8ce-4ff1-937e-f34b561ba294	ORD-2026-100104	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-15 22:11:27.911213	2026-02-16 15:40:41.882832+00
9bd87a90-0c40-4dc0-8ac8-501bbc792a01	ORD-2026-100105	\N	PAID	160.00	0.00	STANDARD	32.00	20.00	0.00	192.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-15 22:12:13.206357	2026-02-16 15:40:41.882832+00
1cb62ec2-4922-46df-b805-08d1e50c8c01	ORD-2026-100106	\N	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-15 22:51:40.379437	2026-02-16 15:40:41.882832+00
95df002f-783f-427f-a669-33d117222ce9	ORD-2026-100107	\N	PAID	150.00	0.00	STANDARD	30.00	20.00	0.00	180.00	{"city": "venissieux", "email": "hanider27@gmail.com", "phone": "0765749402", "street": "18 avenue maurice thorez", "country": "France", "zipCode": "69200", "lastName": "Derrouiche", "firstName": "Hani"}	\N	2026-02-15 23:08:52.977835	2026-02-16 15:40:41.882832+00
\.


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.payments (id, order_id, provider, payment_intent_id, status, amount, created_at, updated_at, currency, metadata) FROM stdin;
1	e9a39fb2-a397-4462-8c19-55c9a28b150b	STRIPE	cs_test_a1F1CKcNGfY44VdJZSNL3FNinw7BEp5HKqOZOKJek0jZPr8bDZOaxv3qYU	PENDING	192.00	2026-02-13 18:15:31.259389	2026-02-13 18:15:31.259389+00	EUR	\N
2	482eeb68-1a7b-46d2-b6df-04a95fdabe73	STRIPE	cs_test_a1wSnR3k8v5FcrHswV0a158f4SJ9oNjRqrTfuEmm3LWeexSjWV0S36J8Po	PENDING	192.00	2026-02-13 18:33:15.12917	2026-02-13 18:33:15.12917+00	EUR	\N
3	33ac18c1-ec49-4dc8-8dbd-9f4293830ef9	STRIPE	cs_test_a1Ifu6IJsHscXMDC7zVlyHMhIqHcU0v20ATBOwS5lxCgwQxDLP6ZQrf2B6	PENDING	192.00	2026-02-13 18:42:39.168374	2026-02-13 18:42:39.168374+00	EUR	\N
4	33ac18c1-ec49-4dc8-8dbd-9f4293830ef9	STRIPE	pi_3T0RKMFQ4B72UhJZ1E9QFeLI	SUCCESS	192.00	2026-02-13 18:42:56.75452	2026-02-13 18:42:56.75452+00	EUR	\N
5	72c1f0e7-06f0-4918-aad6-dafc9c2ac235	STRIPE	cs_test_a17sedKm7epGZAeJk1lHEev60CqByH7UnrJlplOeDj1tps9lLwJYks0va7	PENDING	192.00	2026-02-13 18:49:52.015002	2026-02-13 18:49:52.015002+00	EUR	\N
6	ebb43b8c-e635-45cc-9e40-5c6c11cd783e	STRIPE	cs_test_a1xhItOeNewuhAY9dsP6mntMjDNlKPJUC2Wn6Om6NSVRU4qlKxJNJI2skj	PENDING	18000.00	2026-02-13 19:10:22.221621	2026-02-13 19:10:22.221621+00	EUR	\N
7	bfa2343c-172e-490f-9c59-5440af8e882d	STRIPE	cs_test_a1eFvcbzumxxf5BwauzUlmcRUz9CSiImbHB56aZKPXPq0wjdogA4ZQ45Qd	PENDING	4920.00	2026-02-13 19:15:36.289358	2026-02-13 19:15:36.289358+00	EUR	\N
8	3d7b6f48-9000-4f49-964a-f223f42cb152	STRIPE	cs_test_a1KzYIbePPdDC7sG2vAPXK04jxBF2iVewJ4HSvLAVDvvlB1u7oNkjzbF1v	PENDING	4920.00	2026-02-13 19:19:58.495134	2026-02-13 19:19:58.495134+00	EUR	\N
9	e3348458-4a6e-4392-af8b-33a10d1e46c5	STRIPE	cs_test_a1dxNgmcWwnU7EvLrWsRIEVIM1xqPK29o9i4Z5C1ZetyAHFhF9wG7SxuR1	PENDING	4920.00	2026-02-13 19:24:58.186628	2026-02-13 19:24:58.186628+00	EUR	\N
10	0690d8d5-d2e7-4bf2-8538-b5b858585938	STRIPE	cs_test_a1kFXdIzntG2n5yPyT7MPSVOyPmIYM1ewdUwB7t75hdG0bxZL3BCIhQgxe	PENDING	18000.00	2026-02-13 19:27:12.893493	2026-02-13 19:27:12.893493+00	EUR	\N
11	0690d8d5-d2e7-4bf2-8538-b5b858585938	STRIPE	pi_3T0S1TFQ4B72UhJZ02L9uS4u	SUCCESS	18000.00	2026-02-13 19:27:29.170092	2026-02-13 19:27:29.170092+00	EUR	\N
12	37915d16-f07b-4980-a748-0a39bfe50c8c	STRIPE	cs_test_a16uQr2WCPIaa83XQ28ovxM6uLu5xDbF12KSVoBQnwR2hIQ9BjCajarr10	PENDING	192.00	2026-02-13 19:57:12.060426	2026-02-13 19:57:12.060426+00	EUR	\N
13	69d363e0-f5e6-4d32-8bbb-900c56c5bfb4	STRIPE	cs_test_a1QwqxLOBj6OZMFQZhMYMdVVkXoX1AywO96sDlYdfscZyS7RSXzUbMTLaK	PENDING	192.00	2026-02-13 20:22:11.619687	2026-02-13 20:22:11.619687+00	EUR	\N
14	69d363e0-f5e6-4d32-8bbb-900c56c5bfb4	STRIPE	pi_3T0SsiFQ4B72UhJZ0HKnQDoi	SUCCESS	192.00	2026-02-13 20:22:30.496264	2026-02-13 20:22:30.496264+00	EUR	\N
15	de0c6c90-03aa-4811-821a-7a2ff29b4445	STRIPE	cs_test_a1blo8XfZeK89O4PAyyAlghGQf0T2K36pP785T2FIuWUN9LdaZJrudXiYv	PENDING	180.00	2026-02-13 20:28:56.569668	2026-02-13 20:28:56.569668+00	EUR	\N
16	de0c6c90-03aa-4811-821a-7a2ff29b4445	STRIPE	pi_3T0SzBFQ4B72UhJZ1UhFheul	SUCCESS	180.00	2026-02-13 20:29:11.304639	2026-02-13 20:29:11.304639+00	EUR	\N
17	e67d9e50-7ddd-4a16-ba78-49720eab1ab7	STRIPE	cs_test_a18vVNPTVl0RCd6Slq6bD80GAnJpxXmMGhkrRDMIxfCKjeb1JyrYqjlWck	PENDING	180.00	2026-02-13 20:31:23.501996	2026-02-13 20:31:23.501996+00	EUR	\N
18	e67d9e50-7ddd-4a16-ba78-49720eab1ab7	STRIPE	pi_3T0T1XFQ4B72UhJZ0CMbBwTA	SUCCESS	180.00	2026-02-13 20:31:37.816437	2026-02-13 20:31:37.816437+00	EUR	\N
19	f1734dc1-8c74-4334-bde9-b6406ff08f6b	STRIPE	cs_test_a1oGTupQfzAx5xNJn6wtsoz8bUdMadofuPb3zrfhIlnbwuQcLTZiE7zlmI	PENDING	180.00	2026-02-13 20:34:59.221719	2026-02-13 20:34:59.221719+00	EUR	\N
20	f1734dc1-8c74-4334-bde9-b6406ff08f6b	STRIPE	pi_3T0T52FQ4B72UhJZ15eG4oSb	SUCCESS	180.00	2026-02-13 20:35:13.940572	2026-02-13 20:35:13.940572+00	EUR	\N
21	a6d6bc7d-b748-490a-807a-2b18bd8c6bbf	STRIPE	cs_test_a15ROmNTCFJBbn1Lgh3Yc9wIPcbZO20c7AwtmvZ2lCmHV6VOMnH0EGnM5H	PENDING	180.00	2026-02-13 21:02:53.121067	2026-02-13 21:02:53.121067+00	EUR	\N
22	8bdcb878-39fc-4e09-9c68-dfc2e7c95fe0	STRIPE	cs_test_a1jRQ1P5gcvO8WwMYAlJzG81XALRTSbZLKeLhOMb4oXuKTcv7g9fkI7ZWL	PENDING	372.00	2026-02-13 21:47:39.762684	2026-02-13 21:47:39.762684+00	EUR	\N
23	8bdcb878-39fc-4e09-9c68-dfc2e7c95fe0	STRIPE	pi_3T0UDRFQ4B72UhJZ1tb3goGS	SUCCESS	372.00	2026-02-13 21:48:00.160199	2026-02-13 21:48:00.160199+00	EUR	\N
24	6060f967-2a59-4bfa-bf22-a579b7940618	STRIPE	cs_test_a1LkcuQolSgujj0zl7gpEgrVJQXereH9NKdvBBoadJIQDYYqVYKNk6s0LD	PENDING	180.00	2026-02-13 21:48:30.469404	2026-02-13 21:48:30.469404+00	EUR	\N
25	6060f967-2a59-4bfa-bf22-a579b7940618	STRIPE	pi_3T0UEGFQ4B72UhJZ1Yp0zpoF	SUCCESS	180.00	2026-02-13 21:48:51.41714	2026-02-13 21:48:51.41714+00	EUR	\N
26	005fcbed-7258-4da3-ae5a-f9ff9b942e2b	STRIPE	cs_test_a1gb3Ti3vXYnYLCO19G9yDyyKHeFBNpciJYPYlXhd1ID26rFlEk3ftBGvu	PENDING	192.00	2026-02-13 21:52:31.623706	2026-02-13 21:52:31.623706+00	EUR	\N
27	005fcbed-7258-4da3-ae5a-f9ff9b942e2b	STRIPE	pi_3T0UI4FQ4B72UhJZ042zIxyp	SUCCESS	192.00	2026-02-13 21:52:46.231771	2026-02-13 21:52:46.231771+00	EUR	\N
28	b82bffab-eacb-49f4-b55a-60ce8312fa21	STRIPE	cs_test_a1zz4XCAzzM5QNcJSGLLgm0PFyCuaUntD43gMQ6AeUy32FSg7I9QE9tg3j	PENDING	192.00	2026-02-13 21:56:37.058982	2026-02-13 21:56:37.058982+00	EUR	\N
29	b82bffab-eacb-49f4-b55a-60ce8312fa21	STRIPE	pi_3T0UM2FQ4B72UhJZ1a10jcLs	SUCCESS	192.00	2026-02-13 21:56:52.154204	2026-02-13 21:56:52.154204+00	EUR	\N
30	8da0718b-2c5f-41e9-9daa-0435bc3ef4b0	STRIPE	cs_test_a1a3BWgyDHDs6AM0lUCDUqAt4YMUSiay3VwZfTUBMSenFKZqCKSXg1PDhA	PENDING	4920.00	2026-02-13 21:59:14.279254	2026-02-13 21:59:14.279254+00	EUR	\N
31	8da0718b-2c5f-41e9-9daa-0435bc3ef4b0	STRIPE	pi_3T0UOcFQ4B72UhJZ0AgHggV7	SUCCESS	4920.00	2026-02-13 21:59:32.914194	2026-02-13 21:59:32.914194+00	EUR	\N
32	7878cbd6-09a5-4034-ad77-aaebc88b9652	STRIPE	cs_test_a1I4FZbPVt1sERuC1uS1haNa5w5Md3H6Iu2jfAp1nYQP99QKXCeRRcHLp2	PENDING	4920.00	2026-02-13 22:00:58.580826	2026-02-13 22:00:58.580826+00	EUR	\N
33	7878cbd6-09a5-4034-ad77-aaebc88b9652	STRIPE	pi_3T0UQFFQ4B72UhJZ0vlwsGpk	SUCCESS	4920.00	2026-02-13 22:01:13.365661	2026-02-13 22:01:13.365661+00	EUR	\N
34	9c19d24e-d909-4767-a5a4-f9da2facf942	STRIPE	cs_test_a1aDhDmVATxHR6E5WZKZh9ECx4XRQ9apigD7mdhFyP9K5KndM7vOlvNqsl	PENDING	192.00	2026-02-13 22:11:03.351212	2026-02-13 22:11:03.351212+00	EUR	\N
35	9c19d24e-d909-4767-a5a4-f9da2facf942	STRIPE	pi_3T0Ua2FQ4B72UhJZ0S5BbjKL	SUCCESS	192.00	2026-02-13 22:11:20.664767	2026-02-13 22:11:20.664767+00	EUR	\N
36	f49cd71e-bebd-4385-9953-c3f32131646f	STRIPE	cs_test_a1c9ZjvtJYOuWRH0acf3vZBCRjiyNSIfuTNvYA5TE8CKrh3Tn7MCBhpLT7	PENDING	192.00	2026-02-13 22:13:28.565688	2026-02-13 22:13:28.565688+00	EUR	\N
37	f49cd71e-bebd-4385-9953-c3f32131646f	STRIPE	pi_3T0UcMFQ4B72UhJZ0U141cnx	SUCCESS	192.00	2026-02-13 22:13:45.527828	2026-02-13 22:13:45.527828+00	EUR	\N
38	8c6d7298-d1ca-4ef6-96e3-3ee130f9da17	STRIPE	cs_test_a1S0JVAKSZGNbhmV7jgKcJ5QxQ33ipL2y2hHBRWlCf9Ab8CHvaCeZocnhM	PENDING	18000.00	2026-02-13 23:02:21.923966	2026-02-13 23:02:21.923966+00	EUR	\N
39	14c4754a-1353-470f-b481-fb28534b0638	STRIPE	cs_test_a1cLZ9cCDg2zEg5AZiCzCrGCLeKrMQq4FROwlfLgEzNjcAWDAFMhpptc0j	PENDING	17400.00	2026-02-13 23:03:12.877964	2026-02-13 23:03:12.877964+00	EUR	\N
40	05db5358-0bf6-4f09-bbdd-6a1e768baca8	STRIPE	cs_test_a1GEMBWmJFbdbasbtj3sQ5Gz7q77EFTeYwUx9R45H0rsr6wQ7aLjH8hsrs	PENDING	17400.00	2026-02-13 23:03:28.436978	2026-02-13 23:03:28.436978+00	EUR	\N
41	05db5358-0bf6-4f09-bbdd-6a1e768baca8	STRIPE	pi_3T0VOhFQ4B72UhJZ00hHw1Ux	SUCCESS	17400.00	2026-02-13 23:03:41.696043	2026-02-13 23:03:41.696043+00	EUR	\N
42	b504cc47-adab-4361-9ce3-4be04e4b18d2	STRIPE	cs_test_a1a0dlvTFgpv4uNy75f6J263TbMgZgJq8otm7u2YZbUI0juETHsyspF1tm	PENDING	192.00	2026-02-13 23:05:58.145486	2026-02-13 23:05:58.145486+00	EUR	\N
43	b504cc47-adab-4361-9ce3-4be04e4b18d2	STRIPE	pi_3T0VR8FQ4B72UhJZ1lHfLBkK	SUCCESS	192.00	2026-02-13 23:06:13.033651	2026-02-13 23:06:13.033651+00	EUR	\N
44	d9124a55-1011-48fb-9e9c-dc47dbc5a594	STRIPE	cs_test_a1dRRLTJrRmGX0mYPrPOwZvY9mTq8Plf9U7bC4E16gntzXPJMrF2Najs3e	PENDING	192.00	2026-02-13 23:11:08.7673	2026-02-13 23:11:08.7673+00	EUR	\N
45	d9124a55-1011-48fb-9e9c-dc47dbc5a594	STRIPE	pi_3T0VW9FQ4B72UhJZ0aNynji2	SUCCESS	192.00	2026-02-13 23:11:23.747281	2026-02-13 23:11:23.747281+00	EUR	\N
46	63c0ce70-9046-4aca-9519-e6aac3a81330	STRIPE	cs_test_a1AFa8Vo1hSJanql0p7tnhTO20VbapS3CLUw7okdwnuHvFY47uCXhqmOnB	PENDING	180.00	2026-02-13 23:20:39.573531	2026-02-13 23:20:39.573531+00	EUR	{}
47	63c0ce70-9046-4aca-9519-e6aac3a81330	STRIPE	pi_3T0VfMFQ4B72UhJZ0acGKGkQ	SUCCESS	180.00	2026-02-13 23:20:54.479291	2026-02-13 23:20:54.479291+00	EUR	\N
48	4a5319f3-4a82-484a-867b-884458a6edbc	STRIPE	cs_test_a14beZ5ci9UPEJRILPLyFZfJG05K5B0AnIg01abS0hoGGaVSw8lWPLGSQN	PENDING	180.00	2026-02-13 23:25:19.268815	2026-02-13 23:25:19.268815+00	EUR	{}
49	4a5319f3-4a82-484a-867b-884458a6edbc	STRIPE	pi_3T0VjpFQ4B72UhJZ0IBF7slX	SUCCESS	180.00	2026-02-13 23:25:31.731796	2026-02-13 23:25:31.731796+00	EUR	\N
50	253425a0-3062-4520-a3ad-b9ddc978e5bb	STRIPE	cs_test_a15gUv4x617jmTyjMw3BdzroQdrA3QfN63RaEHy9nUbygaqy76ObeRak72	PENDING	180.00	2026-02-13 23:28:17.685319	2026-02-13 23:28:17.685319+00	EUR	{}
51	253425a0-3062-4520-a3ad-b9ddc978e5bb	STRIPE	pi_3T0VmkFQ4B72UhJZ0egBAyMB	SUCCESS	180.00	2026-02-13 23:28:36.480009	2026-02-13 23:28:36.480009+00	EUR	\N
52	cb19fb47-0590-4ae1-a7b6-dbda33527833	STRIPE	cs_test_a14vL6ivkxqOHsOYyBFOVBOrEceGgdDiyuZALZlyr4CS44LTn7lBTJy9tS	PENDING	180.00	2026-02-13 23:29:12.729022	2026-02-13 23:29:12.729022+00	EUR	{}
53	cb19fb47-0590-4ae1-a7b6-dbda33527833	STRIPE	pi_3T0VnbFQ4B72UhJZ0Gq3TZkn	SUCCESS	180.00	2026-02-13 23:29:25.033701	2026-02-13 23:29:25.033701+00	EUR	\N
54	eacc4d77-8026-4e6f-8930-d381c10fd274	STRIPE	cs_test_a16jLuqUmRzJRPxzLWjQvVBcdDja7iDyKdMeTbly8NAkvGcA3kfvL9TRWA	PENDING	180.00	2026-02-13 23:30:53.287201	2026-02-13 23:30:53.287201+00	EUR	{}
55	eacc4d77-8026-4e6f-8930-d381c10fd274	STRIPE	pi_3T0VpHFQ4B72UhJZ1NWRUWQc	SUCCESS	180.00	2026-02-13 23:31:09.22188	2026-02-13 23:31:09.22188+00	EUR	\N
56	5385ac60-db7c-49cc-a0b9-1fced985fb57	STRIPE	cs_test_a1XjkxCpAO91MaC5SRo3SBkcfoc3rh0CHCK5X7Q2aI1o5eJUudGQ5LjoES	PENDING	180.00	2026-02-13 23:49:04.350732	2026-02-13 23:49:04.350732+00	EUR	{}
57	5385ac60-db7c-49cc-a0b9-1fced985fb57	STRIPE	pi_3T0W6pFQ4B72UhJZ0AN7W5Fh	SUCCESS	180.00	2026-02-13 23:49:18.005602	2026-02-13 23:49:18.005602+00	EUR	\N
58	57c4c863-b4ef-422c-9e77-444323b85c6f	STRIPE	cs_test_a1Ob5YdGulwYFV3SU5qM9a8EEmAWlFskQr483OofqQoNnTh4L0eycbZKE8	PENDING	180.00	2026-02-13 23:59:46.585185	2026-02-13 23:59:46.585185+00	EUR	{}
59	8f17a2cf-4e8c-4f0a-86f9-a9a85ec1e935	STRIPE	cs_test_a1ZeAJnAfvn8x69qiiLWPAtELba48wiekDIz7r80apjtMv5MrPDFtu98OA	PENDING	180.00	2026-02-14 00:00:14.023068	2026-02-14 00:00:14.023068+00	EUR	{}
60	8f17a2cf-4e8c-4f0a-86f9-a9a85ec1e935	STRIPE	pi_3T0WHdFQ4B72UhJZ1XdHfeSL	SUCCESS	180.00	2026-02-14 00:00:27.114674	2026-02-14 00:00:27.114674+00	EUR	\N
61	b7d76ea4-0136-4fdb-8038-dd327d80d4df	STRIPE	cs_test_a1aw6cZJ41EDgePJte1BU2BuXLxjvX4Xept83AVHZXHGNlygYYnIlYHKJi	PENDING	180.00	2026-02-14 00:01:01.539871	2026-02-14 00:01:01.539871+00	EUR	{}
62	8da78d3f-4d63-4e61-9974-6e0deef6fe6a	STRIPE	cs_test_a1c0bkYTtRjV5hlqHbYKdpCD888GPAf2uXjRVKPKNSUFMOhEE9otI7hTtB	PENDING	192.00	2026-02-14 00:10:13.451586	2026-02-14 00:10:13.451586+00	EUR	{}
63	fae20565-523a-4d49-b1a7-d44d5695b532	STRIPE	cs_test_a1aZTrvLLGdzpKIEJMfwCltqCTYQPDy94QCzVwbABawBYuHqshe6hprZ2C	PENDING	192.00	2026-02-14 00:10:47.362784	2026-02-14 00:10:47.362784+00	EUR	{}
64	3451acfa-44bf-4ba8-8999-863322ada9b3	STRIPE	cs_test_a1eINPPdV82zjXvQxGAZU3HD4ibBc8AEsgr4aMciNbBSdolm0oHYWLXBYf	PENDING	14400.00	2026-02-14 14:44:53.129512	2026-02-14 14:44:53.129512+00	EUR	{}
65	10ac984b-eec9-4133-b9d7-34111bac47d7	STRIPE	cs_test_a1EPaGLwBnMJXLetWG0rtZ0E2a9C32sy54J1W5dqdgWTZ3VJhywfEBjjTm	PENDING	14400.00	2026-02-14 14:54:02.768101	2026-02-14 14:54:02.768101+00	EUR	{}
66	6b09034e-0e87-4d28-9602-267161cc5ddf	STRIPE	cs_test_a1ZNlj7NOgj42v5VZrFVBhbCWDZZ286JOqrFr8zV2pyFQGxYQ7FzMoX3Qi	PENDING	192.00	2026-02-14 14:57:19.731416	2026-02-14 14:57:19.731416+00	EUR	{}
67	42f6a6e8-9d31-4f9d-920b-bbe797efe082	STRIPE	cs_test_a1eAljPR3DZXrvVJwIppVT4Mcg9C6CGICRItbSwZGuetTACg3pSdbBWVpI	PENDING	192.00	2026-02-14 14:58:39.316597	2026-02-14 14:58:39.316597+00	EUR	{}
68	21e50208-b77c-41b1-998b-a1900900c7d0	STRIPE	cs_test_a10NcdrIWNxg22jKmJmVvLhpR6N4gNIPEf8wfbzDhpQdR0UGuG4R5WuoUC	PENDING	192.00	2026-02-14 14:59:36.202329	2026-02-14 14:59:36.202329+00	EUR	{}
69	039c3fe6-a453-49c7-b183-f104531bdfe8	STRIPE	cs_test_a1nvvwuw9AcNiuzw34LceuCDwaj4tiL125ZET6aQq8IHLfHP9akHpWgZ6t	PENDING	192.00	2026-02-14 15:05:14.686254	2026-02-14 15:05:14.686254+00	EUR	{}
70	039c3fe6-a453-49c7-b183-f104531bdfe8	STRIPE	pi_3T0kPTFQ4B72UhJZ0bidbuim	SUCCESS	192.00	2026-02-14 15:05:28.994834	2026-02-14 15:05:28.994834+00	EUR	\N
71	e4130a78-58ef-4661-8175-860ca5a91cfc	STRIPE	cs_test_a1hdkch5iVuv9SNM62OgX8oVu5exVQxi4nkUMynN9rKOKRieFNNRZh2TX8	PENDING	180.00	2026-02-14 15:06:12.994831	2026-02-14 15:06:12.994831+00	EUR	{}
72	e4130a78-58ef-4661-8175-860ca5a91cfc	STRIPE	pi_3T0kQRFQ4B72UhJZ0Ab9Pkyk	SUCCESS	180.00	2026-02-14 15:06:29.712442	2026-02-14 15:06:29.712442+00	EUR	\N
73	08e6ed56-3be0-4077-ae23-a3e51e3d0f9d	STRIPE	cs_test_a1oNYDbjcN4TS752P4c3UgppwHGjzgJ2TQoDn11TP7GsgpL1gacafGZ50w	PENDING	180.00	2026-02-14 15:16:22.056982	2026-02-14 15:16:22.056982+00	EUR	{}
74	08e6ed56-3be0-4077-ae23-a3e51e3d0f9d	STRIPE	pi_3T0kaDFQ4B72UhJZ1x6OPuTE	SUCCESS	180.00	2026-02-14 15:16:35.307148	2026-02-14 15:16:35.307148+00	EUR	\N
75	98168b18-83f5-4985-bddc-74f064d980d4	STRIPE	cs_test_a1QM4zpMAWr0sTsYZaoV4mQQ8arRtMYa4SAYMt6jHbx6ynATPNd4zUTdct	PENDING	192.00	2026-02-14 17:50:07.029779	2026-02-14 17:50:07.029779+00	EUR	{}
76	98168b18-83f5-4985-bddc-74f064d980d4	STRIPE	pi_3T0mz4FQ4B72UhJZ1ddh2XlU	SUCCESS	192.00	2026-02-14 17:50:24.00842	2026-02-14 17:50:24.00842+00	EUR	\N
77	a7263f72-6ce9-4f56-a268-347bba594b90	STRIPE	cs_test_a1zntdTBHdDnwAbsRpNVsS9s7jvoVLQ79Nb1LSMsGYQhK1PtXRb3h9btwT	PENDING	192.00	2026-02-14 17:59:19.061119	2026-02-14 17:59:19.061119+00	EUR	{}
78	a7263f72-6ce9-4f56-a268-347bba594b90	STRIPE	pi_3T0n80FQ4B72UhJZ1c4jVngG	SUCCESS	192.00	2026-02-14 17:59:38.142947	2026-02-14 17:59:38.142947+00	EUR	\N
79	a2dc78da-0e84-4f99-80de-9ce9284d2a3d	STRIPE	cs_test_a10NBhVZOVYzsIaS3VHPW38x4cVZyt56FSCbXHKxqJnW1DhlMMVDIG0zKy	PENDING	192.00	2026-02-14 18:17:25.825208	2026-02-14 18:17:25.825208+00	EUR	{}
80	a2dc78da-0e84-4f99-80de-9ce9284d2a3d	STRIPE	pi_3T0nPZFQ4B72UhJZ0nkp6ou1	SUCCESS	192.00	2026-02-14 18:17:47.972423	2026-02-14 18:17:47.972423+00	EUR	\N
81	9a9c6b86-2cab-4831-8e0f-5229a61a0c5e	STRIPE	cs_test_a1Wwe7r4U8oSZmGPZ7TsWQ9qx24JpH92C7p9lh6Ok71GwKiKZyvz1ghFhl	PENDING	192.00	2026-02-15 21:46:52.946171	2026-02-15 21:46:52.946171+00	EUR	{}
82	1056744e-1c17-4c8b-8d67-eb18357426af	STRIPE	cs_test_a1Z77mY4KiVQNwI6ZDpMgzU2gfWlR6VRuE3h4WDnnwJbquI2iOirpYo7se	PENDING	192.00	2026-02-15 21:47:06.634139	2026-02-15 21:47:06.634139+00	EUR	{}
83	f9ed6385-d4bb-4c89-bc82-511ff4d9403d	STRIPE	cs_test_a1h5xDW0xmbcONROILFpMobHvCucSWQvNTQ2ge0VXGOUTczsXd2iQvPk3O	PENDING	192.00	2026-02-15 21:49:02.950478	2026-02-15 21:49:02.950478+00	EUR	{}
84	f9ed6385-d4bb-4c89-bc82-511ff4d9403d	STRIPE	pi_3T1DBpFQ4B72UhJZ1l9kRQ6t	SUCCESS	192.00	2026-02-15 21:49:19.689058	2026-02-15 21:49:19.689058+00	EUR	\N
85	31819e0b-1587-4b60-9837-5aafc0ae54fb	STRIPE	cs_test_a1AmR6DS31F9rkIk5UR1ZjiGtxu9JadrgYobFXdRCPdF97W9WXHJaYL6AH	PENDING	192.00	2026-02-15 22:01:41.86519	2026-02-15 22:01:41.86519+00	EUR	{}
86	31819e0b-1587-4b60-9837-5aafc0ae54fb	STRIPE	pi_3T1DO1FQ4B72UhJZ1EFSzTVP	SUCCESS	192.00	2026-02-15 22:01:55.478439	2026-02-15 22:01:55.478439+00	EUR	\N
87	11e66a63-a46e-4d16-8072-b153722418df	STRIPE	cs_test_a1oA25sTCyYRWVZnvU1c3BhugJWqjwYF9Qzuzwpt36wrkCDU7hwUyJdbgj	PENDING	192.00	2026-02-15 22:08:19.003134	2026-02-15 22:08:19.003134+00	EUR	{}
88	11e66a63-a46e-4d16-8072-b153722418df	STRIPE	pi_3T1DUSFQ4B72UhJZ0ZSbG08N	SUCCESS	192.00	2026-02-15 22:08:34.283512	2026-02-15 22:08:34.283512+00	EUR	\N
89	a37b37e7-f10c-4671-a419-07840dcdf1bc	STRIPE	cs_test_a1QyR1LEHqU0UzuAGSS08DFtoxQ2HeeAHYqQKcPEBNhwd4zHGBoNKBHVhI	PENDING	180.00	2026-02-15 22:10:25.454605	2026-02-15 22:10:25.454605+00	EUR	{}
90	a37b37e7-f10c-4671-a419-07840dcdf1bc	STRIPE	pi_3T1DWUFQ4B72UhJZ1qkjryVV	SUCCESS	180.00	2026-02-15 22:10:39.550491	2026-02-15 22:10:39.550491+00	EUR	\N
91	e43d8f10-b8ce-4ff1-937e-f34b561ba294	STRIPE	cs_test_a1MlqYa7ExhhdaXsZgkAMxOWiMJSMKGKJTirYZxfF5Uex7azkxKWzUpwmJ	PENDING	180.00	2026-02-15 22:11:28.333086	2026-02-15 22:11:28.333086+00	EUR	{}
92	e43d8f10-b8ce-4ff1-937e-f34b561ba294	STRIPE	pi_3T1DXTFQ4B72UhJZ1acfm3JJ	SUCCESS	180.00	2026-02-15 22:11:40.799927	2026-02-15 22:11:40.799927+00	EUR	\N
93	9bd87a90-0c40-4dc0-8ac8-501bbc792a01	STRIPE	cs_test_a1QPvIl81aa7i0HmLd8ySMojefR5SwM4YGDURfUSyoQfJ4n2rXrjKYRSY2	PENDING	192.00	2026-02-15 22:12:13.65143	2026-02-15 22:12:13.65143+00	EUR	{}
94	9bd87a90-0c40-4dc0-8ac8-501bbc792a01	STRIPE	pi_3T1DYDFQ4B72UhJZ0TCFl80H	SUCCESS	192.00	2026-02-15 22:12:26.968985	2026-02-15 22:12:26.968985+00	EUR	\N
95	1cb62ec2-4922-46df-b805-08d1e50c8c01	STRIPE	cs_test_a1ogGTMpAhXXi7VkBlIes7AYxy32hzHeHr0vkbAyTdYT5kpEYBQJJ6fQEc	PENDING	180.00	2026-02-15 22:51:40.941674	2026-02-15 22:51:40.941674+00	EUR	{}
96	1cb62ec2-4922-46df-b805-08d1e50c8c01	STRIPE	pi_3T1EANFQ4B72UhJZ1zbsaoVP	SUCCESS	180.00	2026-02-15 22:51:53.979592	2026-02-15 22:51:53.979592+00	EUR	\N
97	95df002f-783f-427f-a669-33d117222ce9	STRIPE	cs_test_a1hz7R0BxNsrwh3KzhPxYmP0DBVOdBhhmavMkZFuE26y4okfotGTFomY28	PENDING	180.00	2026-02-15 23:08:53.548635	2026-02-15 23:08:53.548635+00	EUR	{}
98	95df002f-783f-427f-a669-33d117222ce9	STRIPE	pi_3T1ER2FQ4B72UhJZ13kHXvS8	SUCCESS	180.00	2026-02-15 23:09:06.528005	2026-02-15 23:09:06.528005+00	EUR	\N
99	2ff9c69f-2052-439e-ba15-5df24c1391ff	STRIPE	cs_test_a1W4E2iHTzMiSdQWD1EhkrlXtiIUqu4T9ic5WqEeSkYe5N9pLAjh1ZNJeL	PENDING	180.00	2026-02-16 16:13:53.445957	2026-02-16 16:13:53.445957+00	EUR	{}
100	3d822c22-3644-4cdd-b1a3-9ad009503f83	STRIPE	cs_test_a12tgblepBrL9ECQprwk5YQToX3BdrFlvVRodxGpU0E8AZLPGzTii3wP82	PENDING	180.00	2026-02-16 16:16:44.624722	2026-02-16 16:16:44.624722+00	EUR	{}
101	3d822c22-3644-4cdd-b1a3-9ad009503f83	STRIPE	pi_3T1UTjFQ4B72UhJZ0O6ID8aE	SUCCESS	180.00	2026-02-16 16:16:57.856878	2026-02-16 16:16:57.856878+00	EUR	\N
102	25a4353b-054a-4faa-9e89-1f5413db5076	STRIPE	cs_test_a12nzOnVlmycPNztXMxq6WBfLFTswoBUYS1D6HhogvWJGgqprqr8o1QxGH	PENDING	180.00	2026-02-16 16:42:09.295455	2026-02-16 16:42:09.295455+00	EUR	{}
103	25a4353b-054a-4faa-9e89-1f5413db5076	STRIPE	pi_3T1UsLFQ4B72UhJZ0GCNfA6o	SUCCESS	180.00	2026-02-16 16:42:22.834039	2026-02-16 16:42:22.834039+00	EUR	\N
\.


--
-- Data for Name: product_categories; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_categories (product_id, category_id) FROM stdin;
7a3e024f-8489-4ae8-834e-f5eba6b7bb64	951b2c29-9670-4841-b0b1-20379c6f8127
7a3e024f-8489-4ae8-834e-f5eba6b7bb64	47d6251d-179d-4b22-93ce-a49403a4b753
c7605811-7679-478a-9eed-3e94cd0c62ff	951b2c29-9670-4841-b0b1-20379c6f8127
c7605811-7679-478a-9eed-3e94cd0c62ff	47d6251d-179d-4b22-93ce-a49403a4b753
59a2c10e-bea6-4272-ae07-fffbf0c7cf8d	951b2c29-9670-4841-b0b1-20379c6f8127
f83e8cef-0546-45c0-aa44-06b6faa69130	951b2c29-9670-4841-b0b1-20379c6f8127
68c3cae3-6740-4e1b-8330-c189af36c3c4	6a2c2151-92f3-44bb-88af-31432e1cbfb4
68c3cae3-6740-4e1b-8330-c189af36c3c4	47d6251d-179d-4b22-93ce-a49403a4b753
\.


--
-- Data for Name: product_promotions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_promotions (id, promotion_id, product_id, created_at) FROM stdin;
\.


--
-- Data for Name: product_variants; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.product_variants (id, product_id, sku, price, weight, attributes, created_at) FROM stdin;
1305deb5-efd3-4279-ab8e-b31f23f89abf	c7605811-7679-478a-9eed-3e94cd0c62ff	RLX-SUB-BLK	10500.00	0.500	{"size": "41mm", "color": "#000000", "image": "https://res.cloudinary.com/da0ye1z2e/image/upload/v1770996452/fburger/qe9uuemvwauilhfcunkl.avif", "material": "Oystersteel"}	2026-02-13 15:27:33.142767
15b3b108-e4c5-4b14-9418-70b30d3a247e	f83e8cef-0546-45c0-aa44-06b6faa69130	CRT-TNK-GOL	12000.00	0.500	{"size": "33mm", "color": "#D4AF37", "image": "https://res.cloudinary.com/da0ye1z2e/image/upload/v1770996995/fburger/zgy2chkzafzyczptgwrn.avif", "material": "Or Jaune"}	2026-02-13 15:36:36.082085
60a874c3-2394-4a76-9e59-5f6b00b97b94	59a2c10e-bea6-4272-ae07-fffbf0c7cf8d	GMT-PEPSI-01	15000.00	0.500	{"size": "40mm", "bezel": "Blue/Red", "color": "#00205B", "image": "https://res.cloudinary.com/da0ye1z2e/image/upload/v1770997063/fburger/witrckzbe9o3ewyjzxqu.avif"}	2026-02-13 15:37:44.729129
9968401b-da69-4ce1-a98b-5c1e7f989cc8	68c3cae3-6740-4e1b-8330-c189af36c3c4	FSL-GR-BRN	150.00	0.500	{"size": "44mm", "color": "#4B3621", "image": "https://res.cloudinary.com/da0ye1z2e/image/upload/v1770997406/fburger/uf84udmx1tljhtxe91j1.png", "strap": "Leather"}	2026-02-13 15:43:27.251897
65f28cbd-2a2c-4143-b50c-14ca780f31b7	68c3cae3-6740-4e1b-8330-c189af36c3c4	FSL-GR-BLK	160.00	0.500	{"size": "38mm", "color": "#2C2C2C", "image": "https://res.cloudinary.com/da0ye1z2e/image/upload/v1770997558/fburger/mefpb1tdpbpwcscnqouc.webp"}	2026-02-13 15:45:58.716392
307e4f43-7bcd-44f2-bd23-509916f4a62c	f83e8cef-0546-45c0-aa44-06b6faa69130	OMG-CTL-SIL	11500.00	0.500	{"size": "35", "color": "#C0C0C0", "image": "https://res.cloudinary.com/da0ye1z2e/image/upload/v1770997924/fburger/ta8n6to3ryw0igoerstj.avif"}	2026-02-13 15:52:05.039013
a20f6790-8d47-4db6-a769-c731664f1b32	59a2c10e-bea6-4272-ae07-fffbf0c7cf8d	GMT-BAT-02	14500.00	0.500	{"size": "44mm", "bezel": "Blue/Black", "color": "#000000", "image": "https://res.cloudinary.com/da0ye1z2e/image/upload/v1770998436/fburger/c45eohbfhoqx7y3xu4nn.avif"}	2026-02-13 16:00:37.171298
3707f3e7-707f-48dd-bca8-937259f32851	7a3e024f-8489-4ae8-834e-f5eba6b7bb64	TUD-58-B	4100.00	0.500	{"size": "39mm", "bezel": "Blue/Black", "color": "#000000", "image": "https://res.cloudinary.com/da0ye1z2e/image/upload/v1770998843/fburger/txvg0k3jbwlnw2dx8ouc.avif"}	2026-02-13 16:07:24.643995
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.products (id, name, slug, description, status, created_at, updated_at, main_image) FROM stdin;
c7605811-7679-478a-9eed-3e94cd0c62ff	Rolex Submariner	rolex-submariner-date	La référence mondiale des montres de plongée.	ACTIVE	2026-02-13 15:27:33.142767	2026-02-13 15:27:33.142767	\N
f83e8cef-0546-45c0-aa44-06b6faa69130	omega 	omega-constellation	L'icône de l'élégance géométrique.	ACTIVE	2026-02-13 15:36:36.082085	2026-02-13 15:36:36.082085	\N
59a2c10e-bea6-4272-ae07-fffbf0c7cf8d	GMT Master II	gmt-master-ii-pepsi	Conçue pour afficher l'heure de deux fuseaux horaires différents.	ACTIVE	2026-02-13 15:37:44.729129	2026-02-13 15:37:44.729129	\N
68c3cae3-6740-4e1b-8330-c189af36c3c4	Fossil Grant	fossil-grant-chronograph	Un style intemporel inspiré de l'horlogerie vintage.	ACTIVE	2026-02-13 15:43:27.251897	2026-02-13 15:43:27.251897	\N
7a3e024f-8489-4ae8-834e-f5eba6b7bb64	Tudor Black Bay 58	tudor-bb58-navy-blue	Montre de plongée inspirée des modèles historiques Tudor des années 50.	ACTIVE	2026-02-13 16:07:24.643995	2026-02-13 16:07:24.643995	\N
\.


--
-- Data for Name: promotions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.promotions (id, name, description, discount_type, discount_value, start_date, end_date, status, max_usage, usage_count, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.refresh_tokens (id, user_id, token, expires_at, created_at) FROM stdin;
2	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhYWI0Mzc3YS02ZWVjLTRkNDItYTc0Zi04MWZlM2E0Y2JiY2UiLCJpYXQiOjE3NzA5OTM5MzIsImV4cCI6MTc3MTU5ODczMn0.pzyCYED1XVvlCf8iXfSWkDZntfA1Yu1hvaAKeSvNyw0	2026-02-20 14:45:32.129	2026-02-13 14:45:32.129622
3	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhYWI0Mzc3YS02ZWVjLTRkNDItYTc0Zi04MWZlM2E0Y2JiY2UiLCJpYXQiOjE3NzA5OTYzMDMsImV4cCI6MTc3MTYwMTEwM30.8sCNOGSIrpagauwBUg3WrxD9XwCxBRq5pcbRs2-Ia-s	2026-02-20 15:25:03.78	2026-02-13 15:25:03.781258
4	aab4377a-6eec-4d42-a74f-81fe3a4cbbce	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhYWI0Mzc3YS02ZWVjLTRkNDItYTc0Zi04MWZlM2E0Y2JiY2UiLCJpYXQiOjE3NzA5OTgyMjMsImV4cCI6MTc3MTYwMzAyM30.30za5GBqh7lN4pvtgggHDb69fcx-LDXMcklt3Dqr7RI	2026-02-20 15:57:03.717	2026-02-13 15:57:03.717543
32	a232e965-2d97-4fa5-83dd-72ac3909c2d8	eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhMjMyZTk2NS0yZDk3LTRmYTUtODNkZC03MmFjMzkwOWMyZDgiLCJpYXQiOjE3NzEyNjAyMDUsImV4cCI6MTc3MTg2NTAwNX0.lwas7ElEjJv4tCdhP9Urxpt9WghDciJCM9NLFrtRUCY	2026-02-23 16:43:25.408	2026-02-16 16:43:25.409
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.roles (id, name) FROM stdin;
1	USER
2	ADMIN
\.


--
-- Data for Name: shipments; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.shipments (id, order_id, carrier, tracking_number, shipped_at, delivered_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_roles; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.user_roles (user_id, role_id) FROM stdin;
aab4377a-6eec-4d42-a74f-81fe3a4cbbce	2
da204105-6e01-46b8-9e90-0b5f9025755c	1
6b00f0ee-3a43-4b0f-84a4-53ddf6e4435d	1
a232e965-2d97-4fa5-83dd-72ac3909c2d8	1
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, email, password_hash, salt, first_name, last_name, phone, is_active, created_at, updated_at) FROM stdin;
da204105-6e01-46b8-9e90-0b5f9025755c	islam@gmail.com	fa6a0d7b5f31c983a7dcc1f726bb645efbddd550717c5b9e1da441595cbc12578f78258b1c739ebfd8b38aac88dc38154330959a0fdffe0ade09e3ffbe6829f9	890354395997b8c49080de027f7068bf	islam	Derrouiche	\N	t	2026-02-13 20:54:53.647614	2026-02-13 20:54:53.647614
aab4377a-6eec-4d42-a74f-81fe3a4cbbce	hanider27@gmail.com	16d728224be037a1688dbd35d877d4a6e6be59e8b8f5a0a2ef4993dd7597774032ff11d8e8166dce9fa641144464cad700a7d3dd9c29cd8653969f9ad5d266ca	4f9da7378056a03678dc3a02a570fee5	Hani	\N	\N	t	2026-02-13 14:45:06.981914	2026-02-15 20:39:04.192956
6b00f0ee-3a43-4b0f-84a4-53ddf6e4435d	manoudb@yahoo.fr	4abcb66cec0969590e6acb2be6efce3c87015eaa58a73d7d84c5b71fd6fc7d4193bfd6becfe9d65c88585d2d0097f8c4844264a13c3a6ce576c2ee55a76a56fe	ee579e0f8e3fa4921fce9926230238fd	badr	Derrouiche	\N	t	2026-02-16 16:25:46.328173	2026-02-16 16:25:46.328173
a232e965-2d97-4fa5-83dd-72ac3909c2d8	hanider2@gmail.com	867fcbbdc716c385b021b99e4054aafb437addaf3da1c99320443f270e2644337e664fb89f125a5c5fd53962051c892bc2370d8d78ab2152bd9b22ba7ee19864	9658ebe47fb9e95c40bafc587515d762	gesg	Derrouiche	\N	t	2026-02-16 16:43:25.381861	2026-02-16 16:43:25.381861
\.


--
-- Data for Name: variant_promotions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.variant_promotions (id, promotion_id, variant_id, created_at) FROM stdin;
\.


--
-- Name: cart_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.cart_items_id_seq', 1, false);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_items_id_seq', 82, true);


--
-- Name: order_number_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_number_seq', 100110, true);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.payments_id_seq', 103, true);


--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.refresh_tokens_id_seq', 32, true);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.roles_id_seq', 3, true);


--
-- Name: shipments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.shipments_id_seq', 1, false);


--
-- Name: addresses addresses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_pkey PRIMARY KEY (id);


--
-- Name: cart_items cart_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_pkey PRIMARY KEY (id);


--
-- Name: carts carts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_pkey PRIMARY KEY (id);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: categories categories_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_slug_key UNIQUE (slug);


--
-- Name: inventory inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_pkey PRIMARY KEY (variant_id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: product_categories product_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_pkey PRIMARY KEY (product_id, category_id);


--
-- Name: product_promotions product_promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_promotions
    ADD CONSTRAINT product_promotions_pkey PRIMARY KEY (id);


--
-- Name: product_promotions product_promotions_promotion_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_promotions
    ADD CONSTRAINT product_promotions_promotion_id_product_id_key UNIQUE (promotion_id, product_id);


--
-- Name: product_variants product_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_pkey PRIMARY KEY (id);


--
-- Name: product_variants product_variants_sku_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_sku_key UNIQUE (sku);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_slug_key UNIQUE (slug);


--
-- Name: promotions promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_key UNIQUE (token);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: shipments shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_pkey PRIMARY KEY (id);


--
-- Name: cart_items unique_cart_variant; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT unique_cart_variant UNIQUE (cart_id, variant_id);


--
-- Name: shipments unique_order_id; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT unique_order_id UNIQUE (order_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (user_id, role_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: variant_promotions variant_promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.variant_promotions
    ADD CONSTRAINT variant_promotions_pkey PRIMARY KEY (id);


--
-- Name: variant_promotions variant_promotions_promotion_id_variant_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.variant_promotions
    ADD CONSTRAINT variant_promotions_promotion_id_variant_id_key UNIQUE (promotion_id, variant_id);


--
-- Name: idx_addresses_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_addresses_user_id ON public.addresses USING btree (user_id);


--
-- Name: idx_cart_items_cart; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cart_items_cart ON public.cart_items USING btree (cart_id);


--
-- Name: idx_cart_items_variant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cart_items_variant ON public.cart_items USING btree (variant_id);


--
-- Name: idx_cart_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cart_user ON public.carts USING btree (user_id);


--
-- Name: idx_inventory_stock; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_stock ON public.inventory USING btree (available_stock);


--
-- Name: idx_order_items_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_order_items_variant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_order_items_variant ON public.order_items USING btree (variant_id);


--
-- Name: idx_orders_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_created ON public.orders USING btree (created_at);


--
-- Name: idx_orders_shipping_method; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_shipping_method ON public.orders USING btree (shipping_method);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_orders_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_user ON public.orders USING btree (user_id);


--
-- Name: idx_payments_intent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_intent_id ON public.payments USING btree (payment_intent_id);


--
-- Name: idx_payments_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_order ON public.payments USING btree (order_id);


--
-- Name: idx_payments_order_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_order_status ON public.payments USING btree (order_id, status);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status);


--
-- Name: idx_product_categories_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_categories_category ON public.product_categories USING btree (category_id);


--
-- Name: idx_product_categories_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_categories_product ON public.product_categories USING btree (product_id);


--
-- Name: idx_product_promotions_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_promotions_product ON public.product_promotions USING btree (product_id);


--
-- Name: idx_product_promotions_promotion; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_promotions_promotion ON public.product_promotions USING btree (promotion_id);


--
-- Name: idx_product_variants_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_product_variants_product ON public.product_variants USING btree (product_id);


--
-- Name: idx_products_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_products_slug ON public.products USING btree (slug);


--
-- Name: idx_promotions_dates; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_promotions_dates ON public.promotions USING btree (start_date, end_date);


--
-- Name: idx_promotions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_promotions_status ON public.promotions USING btree (status);


--
-- Name: idx_shipments_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_shipments_order ON public.shipments USING btree (order_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_variant_promotions_promotion; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_variant_promotions_promotion ON public.variant_promotions USING btree (promotion_id);


--
-- Name: idx_variant_promotions_variant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_variant_promotions_variant ON public.variant_promotions USING btree (variant_id);


--
-- Name: orders trigger_generate_order_number; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_generate_order_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();


--
-- Name: promotions trigger_update_promotion_status; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trigger_update_promotion_status BEFORE INSERT OR UPDATE ON public.promotions FOR EACH ROW EXECUTE FUNCTION public.update_promotion_status();


--
-- Name: orders update_orders_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: payments update_payments_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: addresses addresses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.addresses
    ADD CONSTRAINT addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE;


--
-- Name: cart_items cart_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cart_items
    ADD CONSTRAINT cart_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: carts carts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.carts
    ADD CONSTRAINT carts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: inventory inventory_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory
    ADD CONSTRAINT inventory_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id);


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: payments payments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: product_categories product_categories_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE;


--
-- Name: product_categories product_categories_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_categories
    ADD CONSTRAINT product_categories_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_promotions product_promotions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_promotions
    ADD CONSTRAINT product_promotions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_promotions product_promotions_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_promotions
    ADD CONSTRAINT product_promotions_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- Name: product_variants product_variants_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_variants
    ADD CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: shipments shipments_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shipments
    ADD CONSTRAINT shipments_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: variant_promotions variant_promotions_promotion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.variant_promotions
    ADD CONSTRAINT variant_promotions_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id) ON DELETE CASCADE;


--
-- Name: variant_promotions variant_promotions_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.variant_promotions
    ADD CONSTRAINT variant_promotions_variant_id_fkey FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict xgAjMjuPu9wIuLuGJacEI8LZYohpZNtL2PKZW27H0YHUYwrHJ2vgW7UysZYgiEc

