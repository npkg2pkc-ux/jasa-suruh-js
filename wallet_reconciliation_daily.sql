-- Daily Wallet Reconciliation (single-run summary)
-- Jalankan 1x per hari di Supabase SQL Editor.
-- Hasil utama ada di kolom check_* (OK/NOT_OK).
-- no_ledger_all_time_rows_info hanya info legacy (boleh > 0).

with params as (
  select 1774701991000::bigint as cutover_ms
),
ledger_net as (
  select
    user_id,
    sum(case when direction = 'credit' then amount else -amount end) as net_ledger
  from wallet_ledger
  group by user_id
),
global_check as (
  select
    coalesce((select sum(balance) from wallets), 0) as total_wallet_balance,
    coalesce((select sum(net_ledger) from ledger_net), 0) as total_ledger_balance
),
mismatch_check as (
  select count(*)::bigint as cnt
  from (
    select
      coalesce(w.user_id, l.user_id) as user_id,
      coalesce(w.balance, 0) as wallet_balance,
      coalesce(l.net_ledger, 0) as ledger_balance
    from wallets w
    full outer join ledger_net l on l.user_id = w.user_id
    where coalesce(w.balance, 0) <> coalesce(l.net_ledger, 0)
  ) x
),
duplicate_idempotency_check as (
  select count(*)::bigint as cnt
  from (
    select idempotency_key
    from wallet_ledger
    group by idempotency_key
    having count(*) > 1
  ) d
),
no_ledger_post_cutover_check as (
  select count(*)::bigint as cnt
  from transactions t
  cross join params p
  where t.type in ('payment', 'earning', 'commission', 'refund', 'withdraw', 'topup')
    and (t.data->>'ledgerId') is null
    and t.created_at >= p.cutover_ms
),
orphan_ledger_check as (
  select count(*)::bigint as cnt
  from wallet_ledger l
  left join wallet_idempotency i on i.idempotency_key = l.idempotency_key
  where i.idempotency_key is null
),
no_ledger_all_time_info as (
  select count(*)::bigint as cnt
  from transactions t
  where t.type in ('payment', 'earning', 'commission', 'refund', 'withdraw', 'topup')
    and (t.data->>'ledgerId') is null
)
select
  g.total_wallet_balance,
  g.total_ledger_balance,
  (g.total_wallet_balance - g.total_ledger_balance) as global_delta,
  m.cnt as mismatch_user_rows,
  d.cnt as duplicate_idempotency_rows,
  p.cnt as no_ledger_post_cutover_rows,
  o.cnt as orphan_ledger_rows,
  a.cnt as no_ledger_all_time_rows_info,
  case when (g.total_wallet_balance - g.total_ledger_balance) = 0 then 'OK' else 'NOT_OK' end as check_global_delta,
  case when m.cnt = 0 then 'OK' else 'NOT_OK' end as check_mismatch_user,
  case when d.cnt = 0 then 'OK' else 'NOT_OK' end as check_duplicate_idempotency,
  case when p.cnt = 0 then 'OK' else 'NOT_OK' end as check_no_ledger_post_cutover,
  case when o.cnt = 0 then 'OK' else 'NOT_OK' end as check_orphan_ledger
from global_check g
cross join mismatch_check m
cross join duplicate_idempotency_check d
cross join no_ledger_post_cutover_check p
cross join orphan_ledger_check o
cross join no_ledger_all_time_info a;
