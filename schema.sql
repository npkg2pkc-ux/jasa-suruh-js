-- ============================================================
-- JASA SURUH - Supabase Database Schema
-- Jalankan SQL ini di Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Tabel Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    data JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- 2. Tabel Skills
CREATE TABLE IF NOT EXISTS skills (
    user_id TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '{}'
);

-- 3. Tabel Orders
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    talent_id TEXT,
    data JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_talent_id ON orders(talent_id);

-- 4. Tabel Messages
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    created_at BIGINT DEFAULT 0,
    data JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_messages_order_id ON messages(order_id);
CREATE INDEX IF NOT EXISTS idx_messages_order_created ON messages(order_id, created_at);

-- 5. Tabel Settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY DEFAULT 'config',
    data JSONB NOT NULL DEFAULT '{}'
);

-- 6. Tabel Stores
CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    data JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_stores_user_id ON stores(user_id);

-- 7. Tabel Products
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    store_id TEXT,
    data JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);

-- 8. Tabel Locations (realtime tracking, pengganti Firebase RTDB)
CREATE TABLE IF NOT EXISTS locations (
    order_id TEXT PRIMARY KEY,
    lat DOUBLE PRECISION DEFAULT 0,
    lng DOUBLE PRECISION DEFAULT 0,
    updated_at BIGINT DEFAULT 0
);

-- 9. Tabel Wallets (saldo per user)
CREATE TABLE IF NOT EXISTS wallets (
    user_id TEXT PRIMARY KEY,
    balance BIGINT DEFAULT 0,
    updated_at BIGINT DEFAULT 0,
    data JSONB NOT NULL DEFAULT '{}'
);

-- 10. Tabel Transactions (riwayat transaksi wallet)
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
-- Row Level Security (RLS) — Policies untuk akses publik (anon)
-- Sama seperti keamanan Firebase sebelumnya.
-- PENTING: Tambahkan RLS yang lebih ketat saat app production!
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all_users" ON users;
CREATE POLICY "anon_all_users" ON users FOR ALL TO anon USING (true) WITH CHECK (true);

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

-- ============================================================
-- Aktifkan Supabase Realtime untuk tabel yang butuh listener
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
END $$;

-- Set REPLICA IDENTITY agar realtime bisa kirim data lengkap
ALTER TABLE orders REPLICA IDENTITY FULL;
ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE locations REPLICA IDENTITY FULL;
ALTER TABLE wallets REPLICA IDENTITY FULL;
