-- Full Supabase Data Audit + Repair (safe-conservative)
-- Date: 2026-03-28
--
-- Tujuan:
-- 1) Cek seluruh tabel utama yang dipakai aplikasi.
-- 2) Tambah row yang wajib/minimal jika belum ada.
-- 3) Hapus row orphan yang jelas tidak terpakai.
--
-- Catatan penting:
-- - Script ini TIDAK menghapus data finansial (wallets/transactions/wallet_ledger/wallet_idempotency)
--   demi audit trail.
-- - Jalankan di Supabase SQL Editor menggunakan role yang punya izin write.

begin;

create temporary table if not exists _repair_log (
    step text,
    affected_rows bigint,
    note text
);

-- ============================================================
-- A) Bootstrap tabel jika belum ada (minimum compatible columns)
-- ============================================================
create extension if not exists pgcrypto;

create table if not exists users (
    id text primary key,
    role text not null default 'user',
    nama text not null default '',
    no_hp text,
    email text,
    foto_url text,
    is_active boolean default true,
    address text,
    no_ktp text,
    jenis_kelamin text,
    alamat_lengkap text,
    jenis_motor text,
    tahun_kendaraan text,
    plat_nomor_kendaraan text,
    ktp_photo_url text,
    driver_photo_url text,
    username text,
    created_at timestamptz default now(),
    data jsonb not null default '{}'
);

alter table users add column if not exists is_active boolean default true;
alter table users add column if not exists address text;
alter table users add column if not exists no_ktp text;
alter table users add column if not exists jenis_kelamin text;
alter table users add column if not exists alamat_lengkap text;
alter table users add column if not exists jenis_motor text;
alter table users add column if not exists tahun_kendaraan text;
alter table users add column if not exists plat_nomor_kendaraan text;
alter table users add column if not exists ktp_photo_url text;
alter table users add column if not exists driver_photo_url text;

create table if not exists otp_codes (
    id uuid primary key default gen_random_uuid(),
    phone text not null,
    code text not null,
    expires_at timestamptz not null,
    verified boolean default false,
    created_at timestamptz default now()
);

create table if not exists skills (
    user_id text primary key,
    data jsonb not null default '{}'
);

create table if not exists orders (
    id text primary key,
    user_id text,
    talent_id text,
    data jsonb not null default '{}'
);

create table if not exists messages (
    id text primary key,
    order_id text not null,
    created_at bigint default 0,
    data jsonb not null default '{}'
);

create table if not exists settings (
    key text primary key,
    data jsonb not null default '{}'
);

create table if not exists stores (
    id text primary key,
    user_id text,
    data jsonb not null default '{}'
);

create table if not exists products (
    id text primary key,
    store_id text,
    data jsonb not null default '{}'
);

create table if not exists locations (
    order_id text primary key,
    lat double precision default 0,
    lng double precision default 0,
    updated_at bigint default 0
);

create table if not exists wallets (
    user_id text primary key,
    balance bigint default 0,
    updated_at bigint default 0,
    data jsonb not null default '{}',
    version bigint not null default 0
);

create table if not exists transactions (
    id text primary key,
    user_id text not null,
    type text not null default '',
    amount bigint default 0,
    created_at bigint default 0,
    data jsonb not null default '{}'
);

create table if not exists notifications (
    id text primary key,
    user_id text not null,
    created_at bigint default 0,
    data jsonb not null default '{}'
);

create table if not exists push_subscriptions (
    id text primary key,
    user_id text not null,
    endpoint text not null,
    p256dh text not null,
    auth text not null,
    is_active boolean default true,
    created_at bigint default 0,
    updated_at bigint default 0,
    data jsonb not null default '{}'
);

create table if not exists staff (
    id uuid primary key default gen_random_uuid(),
    nama text not null,
    no_hp text unique not null,
    email text,
    role text not null,
    foto_url text,
    ktp_url text,
    jenis_kelamin text,
    tanggal_lahir date,
    alamat text,
    kota text,
    pendidikan text,
    pengalaman text,
    keahlian text,
    catatan text,
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- wallet hardening tables
create table if not exists wallet_ledger (
    id text primary key,
    user_id text not null,
    direction text not null,
    amount bigint not null,
    balance_before bigint not null,
    balance_after bigint not null,
    ref_type text not null,
    ref_id text not null,
    actor_type text not null,
    actor_id text,
    reason text not null,
    idempotency_key text not null,
    created_at bigint not null,
    metadata jsonb not null default '{}'
);

create table if not exists wallet_idempotency (
    idempotency_key text primary key,
    result_ledger_id text not null,
    created_at bigint not null
);

insert into _repair_log(step, affected_rows, note)
values ('bootstrap_tables', 0, 'CREATE TABLE IF NOT EXISTS selesai');

-- ============================================================
-- B) Backfill row wajib / sinkronisasi kolom indeks
-- ============================================================

-- 1) settings row default
with ins as (
    insert into settings(key, data)
    values ('config', '{}'::jsonb)
    on conflict (key) do nothing
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'settings_config_seed', count(*), 'Tambah config jika belum ada' from ins;

with ins as (
    insert into settings(key, data)
    values ('account_delete_cooldowns', '{}'::jsonb)
    on conflict (key) do nothing
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'settings_cooldown_seed', count(*), 'Tambah account_delete_cooldowns jika belum ada' from ins;

-- 2) users.data normalize minimal
with upd as (
    update users u
    set data = coalesce(u.data, '{}'::jsonb)
        || jsonb_build_object(
            'id', u.id,
            'role', coalesce(u.role, 'user'),
            'name', coalesce(u.nama, ''),
            'phone', coalesce(u.no_hp, ''),
            'email', coalesce(u.email, ''),
            'foto_url', coalesce(u.foto_url, ''),
            'is_active', case
                when lower(coalesce(u.data->>'is_active', '')) in ('true', '1', 'yes') then true
                when lower(coalesce(u.data->>'is_active', '')) in ('false', '0', 'no') then false
                else coalesce(u.is_active, true)
            end,
            'address', coalesce(nullif(u.address, ''), nullif(u.alamat_lengkap, ''), coalesce(u.data->>'address', '')),
            'no_ktp', coalesce(nullif(u.no_ktp, ''), coalesce(u.data->>'no_ktp', '')),
            'jenis_kelamin', coalesce(nullif(u.jenis_kelamin, ''), coalesce(u.data->>'jenis_kelamin', '')),
            'alamat_lengkap', coalesce(nullif(u.alamat_lengkap, ''), nullif(u.address, ''), coalesce(u.data->>'alamat_lengkap', ''), coalesce(u.data->>'address', '')),
            'jenis_motor', coalesce(nullif(u.jenis_motor, ''), coalesce(u.data->>'jenis_motor', ''), coalesce(u.data->>'vehicleType', '')),
            'tahun_kendaraan', coalesce(nullif(u.tahun_kendaraan, ''), coalesce(u.data->>'tahun_kendaraan', ''), coalesce(u.data->>'vehicleYear', '')),
            'plat_nomor_kendaraan', coalesce(nullif(u.plat_nomor_kendaraan, ''), coalesce(u.data->>'plat_nomor_kendaraan', ''), coalesce(u.data->>'plateNo', '')),
            'ktp_photo_url', coalesce(nullif(u.ktp_photo_url, ''), coalesce(u.data->>'ktp_photo_url', '')),
            'driver_photo_url', coalesce(nullif(u.driver_photo_url, ''), nullif(u.foto_url, ''), coalesce(u.data->>'driver_photo_url', ''), coalesce(u.data->>'foto_url', '')),
            'vehicleType', coalesce(nullif(u.jenis_motor, ''), coalesce(u.data->>'vehicleType', ''), coalesce(u.data->>'jenis_motor', '')),
            'vehicleYear', coalesce(nullif(u.tahun_kendaraan, ''), coalesce(u.data->>'vehicleYear', ''), coalesce(u.data->>'tahun_kendaraan', '')),
            'plateNo', coalesce(nullif(u.plat_nomor_kendaraan, ''), coalesce(u.data->>'plateNo', ''), coalesce(u.data->>'plat_nomor_kendaraan', ''))
        )
    where coalesce(u.data, '{}'::jsonb) is distinct from (
        coalesce(u.data, '{}'::jsonb)
        || jsonb_build_object(
            'id', u.id,
            'role', coalesce(u.role, 'user'),
            'name', coalesce(u.nama, ''),
            'phone', coalesce(u.no_hp, ''),
            'email', coalesce(u.email, ''),
            'foto_url', coalesce(u.foto_url, ''),
            'is_active', case
                when lower(coalesce(u.data->>'is_active', '')) in ('true', '1', 'yes') then true
                when lower(coalesce(u.data->>'is_active', '')) in ('false', '0', 'no') then false
                else coalesce(u.is_active, true)
            end,
            'address', coalesce(nullif(u.address, ''), nullif(u.alamat_lengkap, ''), coalesce(u.data->>'address', '')),
            'no_ktp', coalesce(nullif(u.no_ktp, ''), coalesce(u.data->>'no_ktp', '')),
            'jenis_kelamin', coalesce(nullif(u.jenis_kelamin, ''), coalesce(u.data->>'jenis_kelamin', '')),
            'alamat_lengkap', coalesce(nullif(u.alamat_lengkap, ''), nullif(u.address, ''), coalesce(u.data->>'alamat_lengkap', ''), coalesce(u.data->>'address', '')),
            'jenis_motor', coalesce(nullif(u.jenis_motor, ''), coalesce(u.data->>'jenis_motor', ''), coalesce(u.data->>'vehicleType', '')),
            'tahun_kendaraan', coalesce(nullif(u.tahun_kendaraan, ''), coalesce(u.data->>'tahun_kendaraan', ''), coalesce(u.data->>'vehicleYear', '')),
            'plat_nomor_kendaraan', coalesce(nullif(u.plat_nomor_kendaraan, ''), coalesce(u.data->>'plat_nomor_kendaraan', ''), coalesce(u.data->>'plateNo', '')),
            'ktp_photo_url', coalesce(nullif(u.ktp_photo_url, ''), coalesce(u.data->>'ktp_photo_url', '')),
            'driver_photo_url', coalesce(nullif(u.driver_photo_url, ''), nullif(u.foto_url, ''), coalesce(u.data->>'driver_photo_url', ''), coalesce(u.data->>'foto_url', '')),
            'vehicleType', coalesce(nullif(u.jenis_motor, ''), coalesce(u.data->>'vehicleType', ''), coalesce(u.data->>'jenis_motor', '')),
            'vehicleYear', coalesce(nullif(u.tahun_kendaraan, ''), coalesce(u.data->>'vehicleYear', ''), coalesce(u.data->>'tahun_kendaraan', '')),
            'plateNo', coalesce(nullif(u.plat_nomor_kendaraan, ''), coalesce(u.data->>'plateNo', ''), coalesce(u.data->>'plat_nomor_kendaraan', ''))
        )
    )
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'users_data_normalize', count(*), 'Sinkron data JSON user' from upd;

-- 2b) Sinkron kolom user untuk field driver agar query berbasis kolom tetap konsisten.
with upd as (
    update users u
    set is_active = case
            when lower(coalesce(u.data->>'is_active', '')) in ('true', '1', 'yes') then true
            when lower(coalesce(u.data->>'is_active', '')) in ('false', '0', 'no') then false
            else coalesce(u.is_active, true)
        end,
        address = coalesce(nullif(u.data->>'address', ''), nullif(u.data->>'alamat_lengkap', ''), u.address),
        no_ktp = coalesce(nullif(u.data->>'no_ktp', ''), u.no_ktp),
        jenis_kelamin = coalesce(nullif(u.data->>'jenis_kelamin', ''), u.jenis_kelamin),
        alamat_lengkap = coalesce(nullif(u.data->>'alamat_lengkap', ''), nullif(u.data->>'address', ''), u.alamat_lengkap),
        jenis_motor = coalesce(nullif(u.data->>'jenis_motor', ''), nullif(u.data->>'vehicleType', ''), u.jenis_motor),
        tahun_kendaraan = coalesce(nullif(u.data->>'tahun_kendaraan', ''), nullif(u.data->>'vehicleYear', ''), u.tahun_kendaraan),
        plat_nomor_kendaraan = coalesce(nullif(u.data->>'plat_nomor_kendaraan', ''), nullif(u.data->>'plateNo', ''), u.plat_nomor_kendaraan),
        ktp_photo_url = coalesce(nullif(u.data->>'ktp_photo_url', ''), u.ktp_photo_url),
        driver_photo_url = coalesce(nullif(u.data->>'driver_photo_url', ''), nullif(u.data->>'foto_url', ''), u.driver_photo_url),
        foto_url = coalesce(nullif(u.foto_url, ''), nullif(u.data->>'driver_photo_url', ''), nullif(u.data->>'foto_url', ''))
    where lower(coalesce(u.role, '')) = 'talent'
      and (
        coalesce(u.no_ktp, '') = ''
        or coalesce(u.jenis_kelamin, '') = ''
        or coalesce(u.alamat_lengkap, '') = ''
        or coalesce(u.jenis_motor, '') = ''
        or coalesce(u.tahun_kendaraan, '') = ''
        or coalesce(u.plat_nomor_kendaraan, '') = ''
        or coalesce(u.ktp_photo_url, '') = ''
        or coalesce(u.driver_photo_url, '') = ''
      )
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'users_driver_columns_sync', count(*), 'Sinkron kolom driver dari data JSON' from upd;

-- 3) skills seed untuk semua user yang belum punya row
with ins as (
    insert into skills(user_id, data)
    select u.id, '{"skills":[]}'::jsonb
    from users u
    left join skills s on s.user_id = u.id
    where s.user_id is null
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'skills_seed', count(*), 'Tambah row skills kosong untuk user tanpa row' from ins;

-- 4) sinkron kolom indeks orders/stores/products/messages/notifications
with upd as (
    update orders o
    set user_id = nullif(coalesce(o.data->>'userId', o.user_id), ''),
        talent_id = nullif(coalesce(o.data->>'talentId', o.talent_id), '')
    where coalesce(o.user_id, '') is distinct from coalesce(nullif(o.data->>'userId', ''), o.user_id, '')
       or coalesce(o.talent_id, '') is distinct from coalesce(nullif(o.data->>'talentId', ''), o.talent_id, '')
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'orders_index_sync', count(*), 'Sinkron user_id/talent_id dari data JSON' from upd;

with upd as (
    update stores s
    set user_id = nullif(coalesce(s.data->>'userId', s.user_id), '')
    where coalesce(s.user_id, '') is distinct from coalesce(nullif(s.data->>'userId', ''), s.user_id, '')
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'stores_index_sync', count(*), 'Sinkron user_id store dari data JSON' from upd;

with upd as (
    update products p
    set store_id = nullif(coalesce(p.data->>'storeId', p.store_id), ''),
        data = jsonb_set(
            jsonb_set(coalesce(p.data, '{}'::jsonb), '{isActive}',
                to_jsonb(case when p.data ? 'isActive' then (lower(coalesce(p.data->>'isActive','true')) in ('true','1','yes')) else true end), true),
            '{isAvailable}',
            to_jsonb(case when p.data ? 'isAvailable' then (lower(coalesce(p.data->>'isAvailable','true')) in ('true','1','yes')) else true end), true
        )
    where coalesce(p.store_id, '') is distinct from coalesce(nullif(p.data->>'storeId', ''), p.store_id, '')
       or not (coalesce(p.data, '{}'::jsonb) ? 'isActive')
       or not (coalesce(p.data, '{}'::jsonb) ? 'isAvailable')
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'products_index_and_flags_sync', count(*), 'Sinkron store_id + default isActive/isAvailable' from upd;

with upd as (
    update messages m
    set order_id = coalesce(nullif(m.data->>'orderId', ''), m.order_id),
        created_at = case
            when coalesce((m.data->>'createdAt') ~ '^[0-9]+$', false)
                then greatest(m.created_at, (m.data->>'createdAt')::bigint)
            else m.created_at
        end
    where coalesce(m.data->>'orderId', '') <> ''
      and (
            m.order_id is distinct from coalesce(nullif(m.data->>'orderId', ''), m.order_id)
            or (coalesce((m.data->>'createdAt') ~ '^[0-9]+$', false) and m.created_at < (m.data->>'createdAt')::bigint)
          )
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'messages_index_sync', count(*), 'Sinkron order_id/created_at pesan' from upd;

with upd as (
    update notifications n
    set user_id = coalesce(nullif(n.data->>'userId', ''), n.user_id),
        created_at = case
            when coalesce((n.data->>'createdAt') ~ '^[0-9]+$', false)
                then greatest(n.created_at, (n.data->>'createdAt')::bigint)
            else n.created_at
        end
    where (
            coalesce(n.data->>'userId', '') <> ''
            and n.user_id is distinct from coalesce(nullif(n.data->>'userId', ''), n.user_id)
          )
       or (coalesce((n.data->>'createdAt') ~ '^[0-9]+$', false) and n.created_at < (n.data->>'createdAt')::bigint)
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'notifications_index_sync', count(*), 'Sinkron user_id/created_at notifikasi' from upd;

-- 5) wallets seed untuk user yang belum punya (saldo awal 0)
with ins as (
    insert into wallets(user_id, balance, updated_at, data, version)
    select u.id, 0, (extract(epoch from now()) * 1000)::bigint,
           jsonb_build_object('userId', u.id), 0
    from users u
    left join wallets w on w.user_id = u.id
    where w.user_id is null
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'wallets_seed', count(*), 'Tambah wallet kosong untuk user tanpa wallet' from ins;

-- ============================================================
-- C) Hapus row tidak terpakai (orphan cleanup)
-- ============================================================

-- lokasi tanpa order aktif
with del as (
    delete from locations l
    where not exists (select 1 from orders o where o.id = l.order_id)
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'delete_orphan_locations', count(*), 'Hapus lokasi yang order-nya sudah tidak ada' from del;

-- pesan tanpa order
with del as (
    delete from messages m
    where not exists (select 1 from orders o where o.id = m.order_id)
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'delete_orphan_messages', count(*), 'Hapus pesan orphan (tanpa order)' from del;

-- produk tanpa store
with del as (
    delete from products p
    where p.store_id is null
       or not exists (select 1 from stores s where s.id = p.store_id)
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'delete_orphan_products', count(*), 'Hapus produk orphan (tanpa store valid)' from del;

-- store tanpa owner user
with del as (
    delete from stores s
    where s.user_id is null
       or not exists (select 1 from users u where u.id = s.user_id)
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'delete_orphan_stores', count(*), 'Hapus store orphan (tanpa user owner)' from del;

-- notifikasi tanpa user
with del as (
    delete from notifications n
    where not exists (select 1 from users u where u.id = n.user_id)
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'delete_orphan_notifications', count(*), 'Hapus notifikasi orphan (tanpa user)' from del;

-- push subscription tanpa user
with del as (
    delete from push_subscriptions p
    where not exists (select 1 from users u where u.id = p.user_id)
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'delete_orphan_push_subscriptions', count(*), 'Hapus push subscription orphan (tanpa user)' from del;

-- push subscription nonaktif lama (>90 hari)
with del as (
    delete from push_subscriptions p
    where coalesce(p.is_active, false) = false
      and coalesce(p.updated_at, 0) > 0
      and coalesce(p.updated_at, 0) < ((extract(epoch from now()) * 1000)::bigint - (90::bigint * 24 * 60 * 60 * 1000))
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'delete_stale_inactive_push_subscriptions', count(*), 'Hapus push nonaktif >90 hari' from del;

-- otp lama dan kedaluwarsa (>7 hari)
with del as (
    delete from otp_codes o
    where o.expires_at < (now() - interval '7 days')
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'delete_old_expired_otp', count(*), 'Hapus OTP kedaluwarsa >7 hari' from del;

-- ============================================================
-- D) Output audit akhir
-- ============================================================

select * from _repair_log order by step;

select
    (select count(*) from users) as users_count,
    (select count(*) from skills) as skills_count,
    (select count(*) from orders) as orders_count,
    (select count(*) from messages) as messages_count,
    (select count(*) from settings) as settings_count,
    (select count(*) from stores) as stores_count,
    (select count(*) from products) as products_count,
    (select count(*) from locations) as locations_count,
    (select count(*) from wallets) as wallets_count,
    (select count(*) from transactions) as transactions_count,
    (select count(*) from notifications) as notifications_count,
    (select count(*) from push_subscriptions) as push_subscriptions_count,
    (select count(*) from staff) as staff_count,
    (select count(*) from wallet_ledger) as wallet_ledger_count,
    (select count(*) from wallet_idempotency) as wallet_idempotency_count;

-- ringkasan kelengkapan data driver (talent)
select
    count(*) as total_driver,
    sum(case when coalesce(no_ktp, '') = '' then 1 else 0 end) as kosong_no_ktp,
    sum(case when coalesce(jenis_kelamin, '') = '' then 1 else 0 end) as kosong_jenis_kelamin,
    sum(case when coalesce(alamat_lengkap, '') = '' then 1 else 0 end) as kosong_alamat_lengkap,
    sum(case when coalesce(jenis_motor, '') = '' then 1 else 0 end) as kosong_jenis_motor,
    sum(case when coalesce(tahun_kendaraan, '') = '' then 1 else 0 end) as kosong_tahun_kendaraan,
    sum(case when coalesce(plat_nomor_kendaraan, '') = '' then 1 else 0 end) as kosong_plat_nomor,
    sum(case when coalesce(ktp_photo_url, '') = '' then 1 else 0 end) as kosong_ktp_photo,
    sum(case when coalesce(driver_photo_url, '') = '' then 1 else 0 end) as kosong_driver_photo
from users
where lower(coalesce(role, '')) = 'talent';

-- daftar driver yang field intinya masih kosong
select
    id,
    coalesce(nama, '') as nama,
    coalesce(no_hp, '') as no_hp,
    coalesce(no_ktp, '') as no_ktp,
    coalesce(jenis_kelamin, '') as jenis_kelamin,
    coalesce(alamat_lengkap, '') as alamat_lengkap,
    coalesce(jenis_motor, '') as jenis_motor,
    coalesce(tahun_kendaraan, '') as tahun_kendaraan,
    coalesce(plat_nomor_kendaraan, '') as plat_nomor_kendaraan,
    coalesce(ktp_photo_url, '') as ktp_photo_url,
    coalesce(driver_photo_url, '') as driver_photo_url
from users
where lower(coalesce(role, '')) = 'talent'
  and (
      coalesce(no_ktp, '') = ''
      or coalesce(jenis_kelamin, '') = ''
      or coalesce(alamat_lengkap, '') = ''
      or coalesce(jenis_motor, '') = ''
      or coalesce(tahun_kendaraan, '') = ''
      or coalesce(plat_nomor_kendaraan, '') = ''
      or coalesce(ktp_photo_url, '') = ''
      or coalesce(driver_photo_url, '') = ''
  )
order by nama, id;

-- cek orphan sisa (harus 0 kalau bersih)
select
    (select count(*) from locations l where not exists (select 1 from orders o where o.id = l.order_id)) as orphan_locations,
    (select count(*) from messages m where not exists (select 1 from orders o where o.id = m.order_id)) as orphan_messages,
    (select count(*) from products p where p.store_id is null or not exists (select 1 from stores s where s.id = p.store_id)) as orphan_products,
    (select count(*) from stores s where s.user_id is null or not exists (select 1 from users u where u.id = s.user_id)) as orphan_stores,
    (select count(*) from notifications n where not exists (select 1 from users u where u.id = n.user_id)) as orphan_notifications,
    (select count(*) from push_subscriptions p where not exists (select 1 from users u where u.id = p.user_id)) as orphan_push_subscriptions;

commit;
