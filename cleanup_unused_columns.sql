-- ============================================================
-- JASA SURUH - Cleanup Unused Columns Migration
-- Date: 2026-04-01
-- ============================================================
-- Tujuan:
-- 1) Sinkronkan data dari kolom relasional ke JSONB `data` agar tidak ada data hilang
-- 2) Hapus 13 kolom dari tabel `users` yang tidak pernah dibaca oleh kode
--    (semua data sudah tersimpan di kolom JSONB `data`)
-- 3) Hapus index yang tidak terpakai
--
-- PENTING: Jalankan di Supabase SQL Editor → role service_role
-- ============================================================

BEGIN;

-- ============================================================
-- STEP 1: Backup data dari kolom relasional ke JSONB `data`
--         Hanya merge field yang belum ada di JSONB
-- ============================================================
UPDATE users u
SET data = COALESCE(u.data, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
        'tanggal_lahir', CASE
            WHEN COALESCE(u.data->>'tanggal_lahir', '') = '' AND u.tanggal_lahir IS NOT NULL
            THEN to_char(u.tanggal_lahir, 'YYYY-MM-DD')
            ELSE NULL
        END,
        'usia', CASE
            WHEN (u.data->>'usia') IS NULL AND u.usia IS NOT NULL
            THEN u.usia
            ELSE NULL
        END,
        'agama', CASE
            WHEN COALESCE(u.data->>'agama', '') = '' AND COALESCE(u.agama, '') <> ''
            THEN u.agama
            ELSE NULL
        END,
        'is_active', CASE
            WHEN (u.data->>'is_active') IS NULL AND u.is_active IS NOT NULL
            THEN u.is_active
            ELSE NULL
        END,
        'address', CASE
            WHEN COALESCE(u.data->>'address', '') = '' AND COALESCE(u.address, '') <> ''
            THEN u.address
            ELSE NULL
        END,
        'no_ktp', CASE
            WHEN COALESCE(u.data->>'no_ktp', '') = '' AND COALESCE(u.no_ktp, '') <> ''
            THEN u.no_ktp
            ELSE NULL
        END,
        'jenis_kelamin', CASE
            WHEN COALESCE(u.data->>'jenis_kelamin', '') = '' AND COALESCE(u.jenis_kelamin, '') <> ''
            THEN u.jenis_kelamin
            ELSE NULL
        END,
        'alamat_lengkap', CASE
            WHEN COALESCE(u.data->>'alamat_lengkap', '') = '' AND COALESCE(u.alamat_lengkap, '') <> ''
            THEN u.alamat_lengkap
            ELSE NULL
        END,
        'jenis_motor', CASE
            WHEN COALESCE(u.data->>'jenis_motor', '') = '' AND COALESCE(u.jenis_motor, '') <> ''
            THEN u.jenis_motor
            ELSE NULL
        END,
        'tahun_kendaraan', CASE
            WHEN COALESCE(u.data->>'tahun_kendaraan', '') = '' AND COALESCE(u.tahun_kendaraan, '') <> ''
            THEN u.tahun_kendaraan
            ELSE NULL
        END,
        'plat_nomor_kendaraan', CASE
            WHEN COALESCE(u.data->>'plat_nomor_kendaraan', '') = '' AND COALESCE(u.plat_nomor_kendaraan, '') <> ''
            THEN u.plat_nomor_kendaraan
            ELSE NULL
        END,
        'ktp_photo_url', CASE
            WHEN COALESCE(u.data->>'ktp_photo_url', '') = '' AND COALESCE(u.ktp_photo_url, '') <> ''
            THEN u.ktp_photo_url
            ELSE NULL
        END,
        'driver_photo_url', CASE
            WHEN COALESCE(u.data->>'driver_photo_url', '') = '' AND COALESCE(u.driver_photo_url, '') <> ''
            THEN u.driver_photo_url
            ELSE NULL
        END
    ))
WHERE u.tanggal_lahir IS NOT NULL
   OR u.usia IS NOT NULL
   OR COALESCE(u.agama, '') <> ''
   OR u.is_active IS NOT NULL
   OR COALESCE(u.address, '') <> ''
   OR COALESCE(u.no_ktp, '') <> ''
   OR COALESCE(u.jenis_kelamin, '') <> ''
   OR COALESCE(u.alamat_lengkap, '') <> ''
   OR COALESCE(u.jenis_motor, '') <> ''
   OR COALESCE(u.tahun_kendaraan, '') <> ''
   OR COALESCE(u.plat_nomor_kendaraan, '') <> ''
   OR COALESCE(u.ktp_photo_url, '') <> ''
   OR COALESCE(u.driver_photo_url, '') <> '';

-- ============================================================
-- STEP 2: Drop 13 kolom yang tidak terpakai dari tabel users
-- ============================================================
ALTER TABLE users DROP COLUMN IF EXISTS tanggal_lahir;
ALTER TABLE users DROP COLUMN IF EXISTS usia;
ALTER TABLE users DROP COLUMN IF EXISTS agama;
ALTER TABLE users DROP COLUMN IF EXISTS is_active;
ALTER TABLE users DROP COLUMN IF EXISTS address;
ALTER TABLE users DROP COLUMN IF EXISTS no_ktp;
ALTER TABLE users DROP COLUMN IF EXISTS jenis_kelamin;
ALTER TABLE users DROP COLUMN IF EXISTS alamat_lengkap;
ALTER TABLE users DROP COLUMN IF EXISTS jenis_motor;
ALTER TABLE users DROP COLUMN IF EXISTS tahun_kendaraan;
ALTER TABLE users DROP COLUMN IF EXISTS plat_nomor_kendaraan;
ALTER TABLE users DROP COLUMN IF EXISTS ktp_photo_url;
ALTER TABLE users DROP COLUMN IF EXISTS driver_photo_url;

-- lat/lng kolom juga tidak ada di schema.sql dan tidak pernah dibaca
ALTER TABLE users DROP COLUMN IF EXISTS lat;
ALTER TABLE users DROP COLUMN IF EXISTS lng;

-- ============================================================
-- STEP 3: Verifikasi struktur final tabel users
-- ============================================================
-- Kolom yang tersisa seharusnya:
--   id, role, nama, no_hp, email, foto_url, username, created_at, data

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
ORDER BY ordinal_position;

-- Hitung user yang data JSONB-nya sudah lengkap
SELECT
    COUNT(*) AS total_users,
    SUM(CASE WHEN COALESCE(data->>'name', data->>'nama', '') <> '' THEN 1 ELSE 0 END) AS has_name,
    SUM(CASE WHEN COALESCE(data->>'phone', data->>'no_hp', '') <> '' THEN 1 ELSE 0 END) AS has_phone,
    SUM(CASE WHEN role = 'talent' THEN 1 ELSE 0 END) AS total_drivers,
    SUM(CASE WHEN role = 'talent' AND COALESCE(data->>'no_ktp', '') <> '' THEN 1 ELSE 0 END) AS drivers_with_ktp,
    SUM(CASE WHEN role = 'talent' AND COALESCE(data->>'jenis_motor', data->>'vehicleType', '') <> '' THEN 1 ELSE 0 END) AS drivers_with_vehicle
FROM users;

COMMIT;
