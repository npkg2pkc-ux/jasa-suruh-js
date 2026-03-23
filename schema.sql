-- ============================================================
-- JASA SURUH - Supabase Schema (Updated for latest app flow)
-- ============================================================
-- Catatan:
-- 1) Aplikasi ini menyimpan data utama pada kolom JSONB `data`.
-- 2) Kolom relational dipakai untuk filter/index cepat (user_id, store_id, dll).
-- 3) Flow produk terbaru memakai status `isAvailable` (tersedia/habis), bukan stok angka.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1) USERS
-- ============================================================
-- Penting: gunakan TEXT id agar kompatibel dengan id non-UUID dari frontend.
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'user',
    nama TEXT NOT NULL DEFAULT '',
    no_hp TEXT,
    email TEXT,
    foto_url TEXT,
    username TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    data JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS nama TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS no_hp TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_no_hp ON users(no_hp);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================
-- 2) OTP CODES (WA OTP)
-- ============================================================
CREATE TABLE IF NOT EXISTS otp_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes(phone);
CREATE INDEX IF NOT EXISTS idx_otp_phone_verified_created ON otp_codes(phone, verified, created_at DESC);

-- ============================================================
-- 3) SKILLS
-- ============================================================
CREATE TABLE IF NOT EXISTS skills (
    user_id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'
);

-- ============================================================
-- 4) ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    talent_id TEXT,
    data JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_talent_id ON orders(talent_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id_json ON orders((data->>'sellerId'));
CREATE INDEX IF NOT EXISTS idx_orders_status_json ON orders((data->>'status'));

-- ============================================================
-- 5) MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    created_at BIGINT DEFAULT 0,
    data JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_order_created ON messages(order_id, created_at);

-- ============================================================
-- 6) SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY DEFAULT 'config',
    data JSONB NOT NULL DEFAULT '{}'
);

-- ============================================================
-- 7) STORES
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    data JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_stores_user_id ON stores(user_id);

-- ============================================================
-- 8) PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    store_id TEXT,
    data JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_active_json ON products((data->>'isActive'));
CREATE INDEX IF NOT EXISTS idx_products_available_json ON products((data->>'isAvailable'));

-- Migrasi flow lama -> baru:
-- ubah `stock` menjadi `isAvailable`, lalu hapus key stock agar data lebih bersih.
UPDATE products
SET data = jsonb_set(
    data,
    '{isAvailable}',
    to_jsonb(
        CASE
            WHEN data ? 'isAvailable' THEN (lower(coalesce(data->>'isAvailable', 'true')) IN ('true', '1', 'yes'))
            WHEN data ? 'stock' THEN (
                COALESCE(NULLIF(regexp_replace(coalesce(data->>'stock', '0'), '[^0-9-]', '', 'g'), ''), '0')::int > 0
            )
            ELSE true
        END
    ),
    true
)
WHERE data IS NOT NULL;

UPDATE products
SET data = data - 'stock'
WHERE data ? 'stock';

-- ============================================================
-- 9) LOCATIONS (realtime tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS locations (
    order_id TEXT PRIMARY KEY,
    lat DOUBLE PRECISION DEFAULT 0,
    lng DOUBLE PRECISION DEFAULT 0,
    updated_at BIGINT DEFAULT 0
);

-- ============================================================
-- 10) WALLETS
-- ============================================================
CREATE TABLE IF NOT EXISTS wallets (
    user_id TEXT PRIMARY KEY,
    balance BIGINT DEFAULT 0,
    updated_at BIGINT DEFAULT 0,
    data JSONB NOT NULL DEFAULT '{}'
);

-- ============================================================
-- 11) TRANSACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT '',
    amount BIGINT DEFAULT 0,
    created_at BIGINT DEFAULT 0,
    data JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(user_id, created_at);

-- ============================================================
-- 12) NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at BIGINT DEFAULT 0,
    data JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(user_id, created_at);

-- ============================================================
-- 13) STAFF
-- ============================================================
CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nama TEXT NOT NULL,
    no_hp TEXT UNIQUE NOT NULL,
    email TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'cs')),
    foto_url TEXT,
    ktp_url TEXT,
    jenis_kelamin TEXT,
    tanggal_lahir DATE,
    alamat TEXT,
    kota TEXT,
    pendidikan TEXT,
    pengalaman TEXT,
    keahlian TEXT,
    catatan TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_no_hp ON staff(no_hp);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role);

-- ============================================================
-- RLS (current app uses anon-style open access like previous implementation)
-- ============================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_users" ON users;
DROP POLICY IF EXISTS "Users can view all profiles" ON users;
DROP POLICY IF EXISTS "Users can update own profile" ON users;
DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "anon_all_users" ON users FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_otp" ON otp_codes;
CREATE POLICY "anon_otp" ON otp_codes FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_skills" ON skills;
CREATE POLICY "anon_all_skills" ON skills FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_orders" ON orders;
CREATE POLICY "anon_all_orders" ON orders FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_messages" ON messages;
CREATE POLICY "anon_all_messages" ON messages FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_settings" ON settings;
CREATE POLICY "anon_all_settings" ON settings FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_stores" ON stores;
CREATE POLICY "anon_all_stores" ON stores FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_products" ON products;
CREATE POLICY "anon_all_products" ON products FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_locations" ON locations;
CREATE POLICY "anon_all_locations" ON locations FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_wallets" ON wallets;
CREATE POLICY "anon_all_wallets" ON wallets FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_transactions" ON transactions;
CREATE POLICY "anon_all_transactions" ON transactions FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_notifications" ON notifications;
CREATE POLICY "anon_all_notifications" ON notifications FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_staff" ON staff;
CREATE POLICY "anon_all_staff" ON staff FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- Realtime publication
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='orders') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='locations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE locations;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='wallets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE wallets;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE locations REPLICA IDENTITY FULL;
ALTER TABLE wallets REPLICA IDENTITY FULL;
ALTER TABLE notifications REPLICA IDENTITY FULL;
