-- Wallet Ledger Reconciliation Repair (safe backfill)
-- Tujuan: menyamakan net ledger per user dengan wallets.balance TANPA mengubah wallets.balance.
-- Pakai sekali saat check_global_delta/check_mismatch_user = NOT_OK karena legacy/opening balance belum terledger.
-- Aman diulang: idempotency key per user akan mencegah duplikasi backfill.

BEGIN;

WITH ledger_net AS (
  SELECT
    user_id,
    SUM(CASE WHEN direction = 'credit' THEN amount ELSE -amount END) AS net_ledger
  FROM wallet_ledger
  GROUP BY user_id
),
mismatch AS (
  SELECT
    COALESCE(w.user_id, l.user_id) AS user_id,
    COALESCE(w.balance, 0)::bigint AS wallet_balance,
    COALESCE(l.net_ledger, 0)::bigint AS ledger_balance,
    (COALESCE(w.balance, 0)::bigint - COALESCE(l.net_ledger, 0)::bigint) AS delta
  FROM wallets w
  FULL OUTER JOIN ledger_net l ON l.user_id = w.user_id
  WHERE COALESCE(w.balance, 0)::bigint <> COALESCE(l.net_ledger, 0)::bigint
),
prepared AS (
  SELECT
    ('wl_recon_' || substr(md5('recon_balance:' || user_id), 1, 16))::text AS ledger_id,
    user_id,
    CASE WHEN delta > 0 THEN 'credit' ELSE 'debit' END::text AS direction,
    ABS(delta)::bigint AS amount,
    ledger_balance::bigint AS balance_before,
    wallet_balance::bigint AS balance_after,
    'balance_recon'::text AS ref_type,
    'cutover_2026_03_29'::text AS ref_id,
    'system'::text AS actor_type,
    'sql_reconcile'::text AS actor_id,
    'Backfill reconciliation to align ledger net with current wallet balance'::text AS reason,
    ('recon:balance:' || user_id)::text AS idempotency_key,
    (extract(epoch FROM now()) * 1000)::bigint AS created_at,
    jsonb_build_object(
      'source', 'wallet_reconciliation_repair.sql',
      'walletBalance', wallet_balance,
      'ledgerBalanceBefore', ledger_balance,
      'delta', delta,
      'executedAt', (extract(epoch FROM now()) * 1000)::bigint
    ) AS metadata
  FROM mismatch
)
INSERT INTO wallet_ledger (
  id,
  user_id,
  direction,
  amount,
  balance_before,
  balance_after,
  ref_type,
  ref_id,
  actor_type,
  actor_id,
  reason,
  idempotency_key,
  created_at,
  metadata
)
SELECT
  p.ledger_id,
  p.user_id,
  p.direction,
  p.amount,
  p.balance_before,
  p.balance_after,
  p.ref_type,
  p.ref_id,
  p.actor_type,
  p.actor_id,
  p.reason,
  p.idempotency_key,
  p.created_at,
  p.metadata
FROM prepared p
ON CONFLICT (idempotency_key) DO NOTHING;

WITH inserted AS (
  SELECT id, idempotency_key, created_at
  FROM wallet_ledger
  WHERE ref_type = 'balance_recon'
    AND ref_id = 'cutover_2026_03_29'
)
INSERT INTO wallet_idempotency (idempotency_key, result_ledger_id, created_at)
SELECT i.idempotency_key, i.id, i.created_at
FROM inserted i
ON CONFLICT (idempotency_key) DO NOTHING;

COMMIT;

-- Verifikasi cepat (jalankan setelah script):
-- 1) Cek mismatch global dan per-user
--    -> jalankan wallet_reconciliation_daily.sql
-- 2) Cek daftar backfill yang dibuat
-- SELECT id, user_id, direction, amount, balance_before, balance_after, idempotency_key
-- FROM wallet_ledger
-- WHERE ref_type = 'balance_recon'
-- ORDER BY created_at DESC;
