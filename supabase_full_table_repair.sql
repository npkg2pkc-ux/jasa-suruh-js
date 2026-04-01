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
    username text,
    created_at timestamptz default now(),
    data jsonb not null default '{}'
);

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

create table if not exists marketing_contents (
    id text primary key,
    content_type text not null check (content_type in ('promo', 'info')),
    badge text not null default 'INFO',
    title text not null,
    description text not null default '',
    image_url text not null default '',
    emoji text not null default '✨',
    date_text text,
    link_url text not null default '',
    sort_order int not null default 0,
    is_active boolean not null default true,
    legacy_id text,
    meta jsonb not null default '{}',
    created_by text,
    updated_by text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists idx_marketing_contents_type_active_sort
    on marketing_contents(content_type, is_active, sort_order, created_at desc);
create index if not exists idx_marketing_contents_created_at
    on marketing_contents(created_at desc);
create unique index if not exists uq_marketing_contents_legacy
    on marketing_contents(content_type, legacy_id) where legacy_id is not null;

create or replace function set_marketing_contents_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_marketing_contents_updated_at on marketing_contents;
create trigger trg_marketing_contents_updated_at
before update on marketing_contents
for each row
execute function set_marketing_contents_updated_at();

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

-- 1b) backfill marketing table from legacy settings JSON (home_promos/home_news)
with cfg as (
    select data from settings where key = 'config' limit 1
), promo_rows as (
    select
        coalesce(nullif(trim(item.value->>'id'), ''), 'mkt_' || replace(gen_random_uuid()::text, '-', '')) as id,
        'promo'::text as content_type,
        coalesce(nullif(trim(item.value->>'badge'), ''), 'PROMO') as badge,
        coalesce(nullif(trim(item.value->>'title'), ''), 'Promo Jasa Suruh') as title,
        coalesce(nullif(trim(item.value->>'description'), ''), '-') as description,
        coalesce(nullif(trim(item.value->>'imageUrl'), ''), coalesce(item.value->>'image', '')) as image_url,
        coalesce(nullif(trim(item.value->>'emoji'), ''), '✨') as emoji,
        coalesce(nullif(trim(item.value->>'dateText'), ''), nullif(trim(item.value->>'date'), '')) as date_text,
        coalesce(nullif(trim(item.value->>'linkUrl'), ''), coalesce(item.value->>'link', '')) as link_url,
        coalesce(item.ordinality, 1)::int as sort_order,
        true as is_active,
        nullif(trim(item.value->>'id'), '') as legacy_id,
        item.value as meta,
        now() as created_at,
        now() as updated_at
    from cfg
    cross join lateral jsonb_array_elements(coalesce(cfg.data->'home_promos', '[]'::jsonb)) with ordinality as item(value, ordinality)
), info_rows as (
    select
        coalesce(nullif(trim(item.value->>'id'), ''), 'mkt_' || replace(gen_random_uuid()::text, '-', '')) as id,
        'info'::text as content_type,
        coalesce(nullif(trim(item.value->>'badge'), ''), 'INFO') as badge,
        coalesce(nullif(trim(item.value->>'title'), ''), 'Info Jasa Suruh') as title,
        coalesce(nullif(trim(item.value->>'description'), ''), '-') as description,
        coalesce(nullif(trim(item.value->>'imageUrl'), ''), coalesce(item.value->>'image', '')) as image_url,
        coalesce(nullif(trim(item.value->>'emoji'), ''), '📰') as emoji,
        coalesce(nullif(trim(item.value->>'dateText'), ''), nullif(trim(item.value->>'date'), '')) as date_text,
        coalesce(nullif(trim(item.value->>'linkUrl'), ''), coalesce(item.value->>'link', '')) as link_url,
        coalesce(item.ordinality, 1)::int as sort_order,
        true as is_active,
        nullif(trim(item.value->>'id'), '') as legacy_id,
        item.value as meta,
        now() as created_at,
        now() as updated_at
    from cfg
    cross join lateral jsonb_array_elements(coalesce(cfg.data->'home_news', '[]'::jsonb)) with ordinality as item(value, ordinality)
), merged as (
    select * from promo_rows
    union all
    select * from info_rows
), ins as (
    insert into marketing_contents (
        id, content_type, badge, title, description, image_url, emoji,
        date_text, link_url, sort_order, is_active, legacy_id, meta,
        created_at, updated_at
    )
    select
        m.id, m.content_type, m.badge, m.title, m.description, m.image_url, m.emoji,
        m.date_text, m.link_url, m.sort_order, m.is_active, m.legacy_id, m.meta,
        m.created_at, m.updated_at
    from merged m
    where not exists (
        select 1
        from marketing_contents x
        where x.content_type = m.content_type
          and x.legacy_id is not null
          and x.legacy_id = m.legacy_id
    )
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'marketing_backfill', count(*), 'Backfill marketing_contents dari settings.config' from ins;

-- 2) users.data normalize minimal (semua data talent disimpan di JSONB data)
with upd as (
    update users u
    set data = coalesce(u.data, '{}'::jsonb)
        || jsonb_build_object(
            'id', u.id,
            'role', coalesce(u.role, 'user'),
            'name', coalesce(u.nama, ''),
            'phone', coalesce(u.no_hp, ''),
            'email', coalesce(u.email, ''),
            'foto_url', coalesce(u.foto_url, '')
        )
    where coalesce(u.data->>'id', '') is distinct from u.id
       or coalesce(u.data->>'role', '') is distinct from coalesce(u.role, 'user')
       or coalesce(u.data->>'name', '') is distinct from coalesce(u.nama, '')
       or coalesce(u.data->>'phone', '') is distinct from coalesce(u.no_hp, '')
    returning 1
)
insert into _repair_log(step, affected_rows, note)
select 'users_data_normalize', count(*), 'Sinkron data JSON user (kolom inti saja)' from upd;

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

-- ringkasan kelengkapan data driver (talent) - data dibaca dari JSONB
select
    count(*) as total_driver,
    sum(case when coalesce(data->>'no_ktp', '') = '' then 1 else 0 end) as kosong_no_ktp,
    sum(case when coalesce(data->>'jenis_kelamin', '') = '' then 1 else 0 end) as kosong_jenis_kelamin,
    sum(case when coalesce(data->>'alamat_lengkap', data->>'address', '') = '' then 1 else 0 end) as kosong_alamat,
    sum(case when coalesce(data->>'jenis_motor', data->>'vehicleType', '') = '' then 1 else 0 end) as kosong_jenis_motor,
    sum(case when coalesce(data->>'ktp_photo_url', '') = '' then 1 else 0 end) as kosong_ktp_photo,
    sum(case when coalesce(data->>'driver_photo_url', data->>'foto_url', '') = '' then 1 else 0 end) as kosong_driver_photo
from users
where lower(coalesce(role, '')) = 'talent';

-- cek orphan sisa (harus 0 kalau bersih)
select
    (select count(*) from locations l where not exists (select 1 from orders o where o.id = l.order_id)) as orphan_locations,
    (select count(*) from messages m where not exists (select 1 from orders o where o.id = m.order_id)) as orphan_messages,
    (select count(*) from products p where p.store_id is null or not exists (select 1 from stores s where s.id = p.store_id)) as orphan_products,
    (select count(*) from stores s where s.user_id is null or not exists (select 1 from users u where u.id = s.user_id)) as orphan_stores,
    (select count(*) from notifications n where not exists (select 1 from users u where u.id = n.user_id)) as orphan_notifications,
    (select count(*) from push_subscriptions p where not exists (select 1 from users u where u.id = p.user_id)) as orphan_push_subscriptions;

commit;
