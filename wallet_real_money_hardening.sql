-- Wallet real-money hardening migration
-- Execute in Supabase SQL Editor after backup snapshot is created.

BEGIN;

-- 1) Lock down direct client access to wallet and transactions.
ALTER TABLE IF EXISTS wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_wallets" ON wallets;
DROP POLICY IF EXISTS "anon_all_transactions" ON transactions;

DROP POLICY IF EXISTS wallets_deny_all ON wallets;
CREATE POLICY wallets_deny_all ON wallets
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS transactions_deny_all ON transactions;
CREATE POLICY transactions_deny_all ON transactions
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

-- 2) Add immutable ledger table.
CREATE TABLE IF NOT EXISTS wallet_ledger (
	id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	direction TEXT NOT NULL CHECK (direction IN ('credit', 'debit')),
	amount BIGINT NOT NULL CHECK (amount > 0),
	balance_before BIGINT NOT NULL,
	balance_after BIGINT NOT NULL,
	ref_type TEXT NOT NULL,
	ref_id TEXT NOT NULL,
	actor_type TEXT NOT NULL,
	actor_id TEXT,
	reason TEXT NOT NULL,
	idempotency_key TEXT NOT NULL,
	created_at BIGINT NOT NULL,
	metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created
	ON wallet_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_ref
	ON wallet_ledger(ref_type, ref_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_idempotency
	ON wallet_ledger(idempotency_key);

ALTER TABLE wallet_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_ledger_deny_all ON wallet_ledger;
CREATE POLICY wallet_ledger_deny_all ON wallet_ledger
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

-- 3) Idempotency table for external/provider event dedupe.
CREATE TABLE IF NOT EXISTS wallet_idempotency (
	idempotency_key TEXT PRIMARY KEY,
	result_ledger_id TEXT NOT NULL,
	created_at BIGINT NOT NULL
);

ALTER TABLE wallet_idempotency ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_idempotency_deny_all ON wallet_idempotency;
CREATE POLICY wallet_idempotency_deny_all ON wallet_idempotency
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);

-- 4) Add optimistic lock column for wallet row.
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS version BIGINT NOT NULL DEFAULT 0;

-- 5) Guard trigger: only service_role can change balance directly.
CREATE OR REPLACE FUNCTION guard_wallet_balance_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	claim_role TEXT;
	is_internal_wallet_mutation TEXT;
BEGIN
	claim_role := COALESCE(current_setting('request.jwt.claim.role', true), '');
	is_internal_wallet_mutation := COALESCE(current_setting('app.wallet_internal_mutation', true), '0');
	IF TG_OP = 'UPDATE' AND NEW.balance IS DISTINCT FROM OLD.balance THEN
		IF claim_role <> 'service_role' AND is_internal_wallet_mutation <> '1' THEN
			RAISE EXCEPTION 'Direct wallet balance update is forbidden for role=%', claim_role;
		END IF;
	END IF;
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_wallet_balance_update ON wallets;
CREATE TRIGGER trg_guard_wallet_balance_update
BEFORE UPDATE ON wallets
FOR EACH ROW
EXECUTE FUNCTION guard_wallet_balance_update();

-- 6) Single secured mutation function (use this for all money movement).
CREATE OR REPLACE FUNCTION wallet_apply_mutation(
	p_user_id TEXT,
	p_direction TEXT,
	p_amount BIGINT,
	p_ref_type TEXT,
	p_ref_id TEXT,
	p_reason TEXT,
	p_actor_type TEXT,
	p_actor_id TEXT,
	p_idempotency_key TEXT,
	p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
	ledger_id TEXT,
	user_id TEXT,
	balance_before BIGINT,
	balance_after BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
	v_now BIGINT;
	v_balance_before BIGINT;
	v_balance_after BIGINT;
	v_ledger_id TEXT;
	v_existing_ledger_id TEXT;
BEGIN
	IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
		RAISE EXCEPTION 'p_user_id is required';
	END IF;
	IF p_direction NOT IN ('credit', 'debit') THEN
		RAISE EXCEPTION 'p_direction must be credit or debit';
	END IF;
	IF p_amount IS NULL OR p_amount <= 0 THEN
		RAISE EXCEPTION 'p_amount must be > 0';
	END IF;
	IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
		RAISE EXCEPTION 'p_idempotency_key is required';
	END IF;

	SELECT result_ledger_id INTO v_existing_ledger_id
	FROM wallet_idempotency
	WHERE idempotency_key = p_idempotency_key;

	IF v_existing_ledger_id IS NOT NULL THEN
		RETURN QUERY
		SELECT wl.id, wl.user_id, wl.balance_before, wl.balance_after
		FROM wallet_ledger wl
		WHERE wl.id = v_existing_ledger_id;
		RETURN;
	END IF;

	v_now := (extract(epoch FROM now()) * 1000)::BIGINT;

	-- Mark this transaction as trusted internal wallet mutation so trigger can allow it.
	PERFORM set_config('app.wallet_internal_mutation', '1', true);

	INSERT INTO wallets(user_id, balance, updated_at, data, version)
	VALUES (p_user_id, 0, v_now, jsonb_build_object('userId', p_user_id), 0)
	ON CONFLICT ON CONSTRAINT wallets_pkey DO NOTHING;

	SELECT balance INTO v_balance_before
	FROM wallets
	WHERE wallets.user_id = p_user_id
	FOR UPDATE;

	IF p_direction = 'debit' AND v_balance_before < p_amount THEN
		RAISE EXCEPTION 'insufficient balance';
	END IF;

	IF p_direction = 'credit' THEN
		v_balance_after := v_balance_before + p_amount;
	ELSE
		v_balance_after := v_balance_before - p_amount;
	END IF;

	UPDATE wallets
	SET
		balance = v_balance_after,
		updated_at = v_now,
		version = version + 1,
		data = jsonb_set(COALESCE(data, '{}'::jsonb), '{balance}', to_jsonb(v_balance_after), true)
	WHERE wallets.user_id = p_user_id;

	v_ledger_id := 'wl_' || substr(md5(random()::text || clock_timestamp()::text || p_user_id || p_idempotency_key), 1, 16);

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
	) VALUES (
		v_ledger_id,
		p_user_id,
		p_direction,
		p_amount,
		v_balance_before,
		v_balance_after,
		COALESCE(p_ref_type, ''),
		COALESCE(p_ref_id, ''),
		COALESCE(p_actor_type, 'system'),
		p_actor_id,
		COALESCE(p_reason, ''),
		p_idempotency_key,
		v_now,
		COALESCE(p_metadata, '{}'::jsonb)
	);

	INSERT INTO wallet_idempotency(idempotency_key, result_ledger_id, created_at)
	VALUES (p_idempotency_key, v_ledger_id, v_now);

	RETURN QUERY SELECT v_ledger_id, p_user_id, v_balance_before, v_balance_after;
END;
$$;

REVOKE ALL ON FUNCTION wallet_apply_mutation(TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wallet_apply_mutation(TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

COMMIT;

-- Post-migration validation queries
-- SELECT * FROM pg_policies WHERE tablename IN ('wallets', 'transactions', 'wallet_ledger', 'wallet_idempotency');
-- SELECT wallet_apply_mutation('u_test', 'credit', 10000, 'manual', 'seed-1', 'seed saldo', 'admin', 'owner_1', 'seed-u_test-1');
-- SELECT wallet_apply_mutation('u_test', 'debit', 5000, 'order', 'ord_1', 'pembayaran order', 'system', NULL, 'order-ord_1-payment');
