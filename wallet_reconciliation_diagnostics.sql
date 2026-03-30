-- Wallet Reconciliation Diagnostics
-- Jalankan saat check harian menunjukkan NOT_OK.

-- 1) Detail user mismatch wallet vs ledger
with ledger_net as (
  select
    user_id,
    sum(case when direction = 'credit' then amount else -amount end) as net_ledger
  from wallet_ledger
  group by user_id
)
select
  coalesce(w.user_id, l.user_id) as user_id,
  coalesce(w.balance, 0)::bigint as wallet_balance,
  coalesce(l.net_ledger, 0)::bigint as ledger_balance,
  (coalesce(w.balance, 0)::bigint - coalesce(l.net_ledger, 0)::bigint) as delta
from wallets w
full outer join ledger_net l on l.user_id = w.user_id
where coalesce(w.balance, 0)::bigint <> coalesce(l.net_ledger, 0)::bigint
order by abs(coalesce(w.balance, 0)::bigint - coalesce(l.net_ledger, 0)::bigint) desc,
         coalesce(w.user_id, l.user_id)
limit 200;

-- 2) Detail transaksi post-cutover yang seharusnya punya ledgerId tetapi kosong
with params as (
  select 1774636847000::bigint as cutover_ms
)
select
  t.id,
  t.user_id,
  t.type,
  t.amount,
  t.created_at,
  t.data->>'status' as status,
  t.data->>'orderId' as order_id,
  t.data->>'idempotencyKey' as idempotency_key,
  t.data->>'description' as description
from transactions t
cross join params p
where t.type in ('payment', 'earning', 'commission', 'refund', 'withdraw', 'topup')
  and (
    t.type <> 'topup'
    or lower(coalesce(t.data->>'status', '')) in ('paid', 'completed', 'success')
  )
  and (t.data->>'ledgerId') is null
  and t.created_at >= p.cutover_ms
order by t.created_at desc
limit 200;

-- 3) Info topup pending/expired tanpa ledgerId (normal, bukan mismatch)
with params as (
  select 1774636847000::bigint as cutover_ms
)
select
  t.id,
  t.user_id,
  t.amount,
  t.created_at,
  lower(coalesce(t.data->>'status', '')) as status,
  t.data->>'xenditInvoiceId' as xendit_invoice_id
from transactions t
cross join params p
where t.type = 'topup'
  and (t.data->>'ledgerId') is null
  and t.created_at >= p.cutover_ms
  and lower(coalesce(t.data->>'status', '')) not in ('paid', 'completed', 'success')
order by t.created_at desc
limit 200;

-- 4) Orphan ledger entries (ledger tanpa idempotency row)
select
  l.id,
  l.user_id,
  l.direction,
  l.amount,
  l.idempotency_key,
  l.ref_type,
  l.ref_id,
  l.created_at
from wallet_ledger l
left join wallet_idempotency i on i.idempotency_key = l.idempotency_key
where i.idempotency_key is null
order by l.created_at desc
limit 200;
