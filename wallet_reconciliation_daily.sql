-- Daily Wallet Reconciliation Runbook
-- Jalankan di Supabase SQL Editor (read-only checks)
-- Update nilai cutover_ms sesuai timestamp cutover produksi.

with params as (
  select 1774636847000::bigint as cutover_ms
)
select cutover_ms from params;

-- 1) Ringkasan global: total saldo wallet vs total ledger net
with ledger_net as (
  select
    user_id,
    sum(case when direction = 'credit' then amount else -amount end) as net_ledger
  from wallet_ledger
  group by user_id
),
wallet_total as (
  select coalesce(sum(balance), 0) as total_wallet_balance from wallets
),
ledger_total as (
  select coalesce(sum(net_ledger), 0) as total_ledger_balance from ledger_net
)
select
  wt.total_wallet_balance,
  lt.total_ledger_balance,
  (wt.total_wallet_balance - lt.total_ledger_balance) as global_delta
from wallet_total wt
cross join ledger_total lt;

-- 2) Mismatch per user (top 200 terbesar)
with ledger_net as (
  select
    user_id,
    sum(case when direction = 'credit' then amount else -amount end) as net_ledger
  from wallet_ledger
  group by user_id
)
select
  coalesce(w.user_id, l.user_id) as user_id,
  coalesce(w.balance, 0) as wallet_balance,
  coalesce(l.net_ledger, 0) as ledger_balance,
  coalesce(w.balance, 0) - coalesce(l.net_ledger, 0) as delta
from wallets w
full outer join ledger_net l on l.user_id = w.user_id
where coalesce(w.balance, 0) <> coalesce(l.net_ledger, 0)
order by abs(coalesce(w.balance, 0) - coalesce(l.net_ledger, 0)) desc
limit 200;

-- 3) Cek idempotency duplikat (harus 0 row)
select
  idempotency_key,
  count(*) as cnt
from wallet_ledger
group by idempotency_key
having count(*) > 1
order by cnt desc, idempotency_key asc
limit 100;

-- 4A) Cek transaksi finansial tanpa pasangan ledgerId (semua waktu)
-- Catatan: hasil query ini bisa mengandung data legacy sebelum cutover.
select
  t.id,
  t.user_id,
  t.type,
  t.amount,
  t.created_at,
  t.data
from transactions t
where t.type in ('payment', 'earning', 'commission', 'refund', 'withdraw', 'topup')
  and (t.data->>'ledgerId') is null
order by t.created_at desc
limit 200;

-- 4B) Cek transaksi finansial tanpa ledgerId PASCA-CUTOVER (harus 0 row)
with params as (
  select 1774636847000::bigint as cutover_ms
)
select
  t.id,
  t.user_id,
  t.type,
  t.amount,
  t.created_at,
  t.data
from transactions t
cross join params p
where t.type in ('payment', 'earning', 'commission', 'refund', 'withdraw', 'topup')
  and (t.data->>'ledgerId') is null
  and t.created_at >= p.cutover_ms
order by t.created_at desc
limit 200;

-- 4C) Ringkasan no-ledgerId pasca-cutover per tipe (harus semua 0)
with params as (
  select 1774636847000::bigint as cutover_ms
)
select
  t.type,
  count(*) as cnt,
  min(t.created_at) as min_created_at,
  max(t.created_at) as max_created_at
from transactions t
cross join params p
where t.type in ('payment', 'earning', 'commission', 'refund', 'withdraw', 'topup')
  and (t.data->>'ledgerId') is null
  and t.created_at >= p.cutover_ms
group by t.type
order by cnt desc, t.type asc;

-- 5) Cek ledger orphan (ledger tanpa idempotency map, harus 0 row)
select
  l.id,
  l.user_id,
  l.idempotency_key,
  l.created_at
from wallet_ledger l
left join wallet_idempotency i on i.idempotency_key = l.idempotency_key
where i.idempotency_key is null
order by l.created_at desc
limit 200;

-- Interpretasi cepat:
-- 1) global_delta = 0
-- 2) mismatch per user = 0 row
-- 3) duplicate idempotency = 0 row
-- 4) no-ledgerId pasca-cutover = 0 row
-- 5) orphan ledger = 0 row
