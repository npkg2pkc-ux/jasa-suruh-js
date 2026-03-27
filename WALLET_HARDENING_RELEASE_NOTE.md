# Wallet Hardening Release Note

Tanggal: 2026-03-28
Scope: Real-money wallet security hardening (DB + API + frontend routing)

## Perubahan Utama
- Kunci RLS tabel finansial (`wallets`, `transactions`) untuk menutup direct-write dari client.
- Aktifkan trigger guard anti direct balance update.
- Aktifkan fungsi trusted mutation `wallet_apply_mutation` (idempotent + audit ledger).
- Endpoint finansial backend dipaksa memakai `SUPABASE_SERVICE_KEY`.
- Endpoint trusted wallet read aktif:
  - `/api/wallet/get`
  - `/api/wallet/transactions`
- Endpoint trusted wallet write/settlement aktif (single endpoint):
  - `/api/wallet/pay` operasi `pay`
  - `/api/wallet/pay` operasi `completeOrder`
  - `/api/wallet/pay` operasi `completeOrderCOD`
- Frontend adapter switch ke endpoint trusted untuk wallet read/pay/settlement.

## Validasi Yang Sudah Lulus
- Abuse test: insert direct ke `wallets`/`transactions` via anon key gagal.
- Idempotency mutation: key sama tidak menggandakan saldo.
- Wallet read API sinkron dengan saldo DB.
- `pay` trusted endpoint sukses (saldo berkurang sesuai nominal).
- `completeOrder` trusted endpoint idempotent (`alreadySettled=true` untuk order settled).
- `completeOrderCOD` trusted endpoint idempotent (`alreadySettled=true` untuk order settled).

## File Penting
- `wallet_real_money_hardening.sql`
- `wallet_reconciliation_daily.sql`
- `WALLET_SWITCH_PLAN.md`
- `api/wallet/pay.js`
- `api/wallet/get.js`
- `api/wallet/transactions.js`
- `supabase.js`

## SOP Harian Ops
1. Jalankan query pada `wallet_reconciliation_daily.sql`.
2. Pastikan:
   - `global_delta = 0`
   - Tidak ada mismatch per user
   - Tidak ada duplicate idempotency
   - Tidak ada orphan financial transaction
3. Jika ada anomali:
   - freeze settlement baru
   - investigasi root cause
   - lakukan adjustment terkontrol

## Open Item Sebelum Sign-off Final
- Uji settlement baru (non-alreadySettled) untuk `completeOrder` pada kandidat order valid.
- Uji settlement baru (non-alreadySettled) untuk `completeOrderCOD` pada kandidat order valid.
- Final smoke test lintas role (user, driver/talent, seller, owner/admin).
