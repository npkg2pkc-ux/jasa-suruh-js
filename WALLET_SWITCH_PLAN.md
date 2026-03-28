# Wallet Switch Plan (Simulasi -> Produksi)

## Tujuan
- Mengubah sistem wallet dari mode simulasi ke mode produksi yang aman.
- Menutup celah manipulasi saldo langsung di database.
- Menjaga alur bisnis tetap stabil selama proses cutover.

## Scope
- Hardening Supabase RLS untuk `wallets` dan `transactions`.
- Pemindahan seluruh mutasi saldo ke trusted backend.
- Rekonsiliasi saldo berbasis ledger.
- Cutover, rollback, dan verifikasi pasca go-live.

## Asumsi
- Saat ini transaksi masih simulasi.
- Frontend masih menggunakan anon key untuk akses data.
- Tabel wallet sudah berjalan untuk kebutuhan pengujian.
- Belum ada kewajiban settlement uang nyata ke pihak eksternal.

## Temuan Kritis Saat Ini (Wajib Ditutup)
1. `wallets` dan `transactions` masih punya policy `anon_all_*` (full read/write dari client).
2. Jalur finansial Xendit backend masih bisa mengarah ke anon key jika env tidak dipasang benar.
3. Mutasi saldo masih memakai update langsung ke tabel `wallets` (belum single secured mutation function).

Dampak:
- Client yang dimodifikasi bisa mengubah saldo/riwayat transaksi.
- Risiko race condition dan partial update saat beban tinggi.
- Sulit audit forensik karena ledger belum immutable penuh.

## Prinsip Arsitektur Real-Money (Target)
1. Client tidak boleh write ke `wallets`, `transactions`, `wallet_ledger`.
2. Semua mutasi uang lewat backend trusted + service role.
3. Mutasi uang wajib atomic + idempotent + audit trail immutable.
4. Rekonsiliasi saldo wajib berbasis ledger, bukan angka balance semata.

## Artefak Migrasi di Repo
- SQL hardening: `wallet_real_money_hardening.sql`
- SQL rekonsiliasi harian: `wallet_reconciliation_daily.sql`
- Rencana cutover: dokumen ini

Urutan pakai:
1. Jalankan SQL backup/snapshot.
2. Deploy env `SUPABASE_SERVICE_KEY` untuk endpoint finansial.
3. Eksekusi `wallet_real_money_hardening.sql`.
4. Uji topup/withdraw/webhook di staging.
5. Baru aktifkan ke produksi.

## Status Implementasi Terkini (Update 2026-03-28)
Sudah selesai:
- Endpoint finansial Xendit dipaksa pakai service role key (`SUPABASE_SERVICE_KEY`).
- RLS finansial wallet/transaksi dikunci (deny direct client write).
- Trigger guard anti direct update balance aktif.
- Fungsi trusted mutation `wallet_apply_mutation` aktif + lulus uji idempotency.
- Endpoint trusted wallet read aktif (`/api/wallet/get`, `/api/wallet/transactions`).
- Endpoint trusted wallet pay aktif (`/api/wallet/pay`) untuk:
	- operasi `pay`
	- operasi `completeOrder`
	- operasi `completeOrderCOD`
- Frontend adapter sudah switch ke endpoint trusted untuk wallet read/pay/settlement.
- Uji abuse client write ke `wallets` dan `transactions` lulus (tidak bisa insert).

Catatan:
- Validasi `completeOrder` untuk skenario `alreadySettled` sudah lulus.
- Validasi `completeOrderCOD` untuk skenario `alreadySettled` sudah lulus.
- Skenario settlement baru (belum settled) perlu diuji saat data kandidat tersedia.

## Fase 0 - Persiapan & Freeze
1. Tetapkan jadwal cutover dan maintenance window.
2. Freeze perubahan fitur yang menyentuh wallet.
3. Backup penuh tabel: `wallets`, `transactions`, `orders`, `users`.
4. Catat baseline metric:
- total user wallet
- total saldo agregat
- jumlah transaksi per tipe
5. Tetapkan PIC: backend, database, QA, ops.

### Output Fase 0
- Snapshot backup tervalidasi.
- Baseline metric terdokumentasi.
- Jadwal dan PIC disetujui.

## Fase 1 - Hardening Database Security
1. Nonaktifkan policy terbuka anon pada `wallets` dan `transactions`.
2. Terapkan least-privilege policy:
- User hanya boleh baca wallet miliknya.
- User tidak boleh update balance secara langsung.
- Insert/update transaksi hanya dari trusted role.
3. Tambahkan guard database:
- validasi `amount` dan `type`
- trigger anti direct-write balance
4. Batasi akses dashboard DB (MFA + audit logging).

### Output Fase 1
- Tidak ada write wallet dari anon/client langsung.
- Seluruh update saldo direct dari client gagal by design.

## Fase 2 - Trusted Wallet Engine
1. Sediakan endpoint trusted untuk:
- topup confirm
- withdraw request/approve
- payout order completion
- refund
2. Gunakan server-side credential (`service_role`) hanya di backend.
3. Aktifkan idempotency key untuk operasi finansial.
4. Terapkan pola atomik: tulis ledger -> update balance -> commit.
5. Simpan jejak lengkap per mutasi:
- balance before
- balance after
- actor
- reason
- reference id

### Output Fase 2
- Tidak ada jalur mutasi saldo langsung dari frontend.
- Semua mutasi memiliki jejak audit dan idempotency.

## Fase 3 - Kompatibilitas Frontend
1. Pertahankan read saldo untuk user sendiri.
2. Alihkan call mutasi wallet:
- dari update tabel langsung
- ke endpoint trusted backend
3. Tangani error operasional secara jelas:
- insufficient balance
- duplicate request
- unauthorized
4. Tambahkan loading state dan retry aman.

### Output Fase 3
- UX tetap stabil.
- Semua aksi finansial lewat backend terpercaya.

## Fase 4 - Data Integrity & Rekonsiliasi
1. Jalankan script rekonsiliasi:
- hitung ulang balance dari ledger
- bandingkan dengan `wallets.balance`
2. Klasifikasikan mismatch:
- minor drift
- major mismatch
3. Koreksi mismatch melalui jurnal adjustment terkontrol.
4. Lock write sementara saat final reconcile.

### Output Fase 4
- Balance konsisten terhadap ledger.
- Adjustment terdokumentasi dan bisa diaudit.

## Fase 5 - Cutover Produksi
1. Aktifkan policy production RLS.
2. Deploy trusted wallet endpoints.
3. Deploy frontend yang sudah switch endpoint.
4. Jalankan smoke test:
- topup
- withdraw
- order payout
- refund
5. Monitor 2-4 jam pertama:
- error rate endpoint wallet
- duplicate transaction
- mismatch saldo

### Output Fase 5
- Sistem wallet live dalam mode aman.
- Tidak ada mutasi saldo dari client langsung.

## Rollback Plan
### Trigger Rollback
- Error kritikal wallet melewati threshold.
- Mismatch saldo material.

### Langkah Rollback
1. Aktifkan maintenance mode.
2. Restore snapshot sesuai timestamp cutover.
3. Kembalikan endpoint ke versi stabil terakhir.
4. Validasi saldo pasca rollback.

### Pasca Rollback
- Lakukan root-cause analysis.
- Tentukan recutover plan.

## Definition of Done
- Policy anon terbuka untuk wallet/transaksi sudah ditutup.
- Tidak ada write balance langsung dari client.
- Semua mutasi saldo lewat trusted backend.
- Idempotency aktif untuk seluruh operasi finansial utama.
- Rekonsiliasi saldo lulus tanpa mismatch material.
- Monitoring, alert, dan SOP incident wallet tersedia.

## Checklist Eksekusi
- [x] Backup dan baseline metric selesai.
- [x] RLS secure untuk wallets dan transactions aktif.
- [x] Trusted wallet endpoints deployed.
- [x] Frontend sudah switch ke endpoint trusted.
- [x] Rekonsiliasi saldo pass.
- [x] Smoke test pass.
- [x] Monitoring go-live pass.
- [x] Sign-off backend, DB, QA, ops.

## Runbook Operasional Harian
Gunakan file `wallet_reconciliation_daily.sql` setiap hari (minimal 1x):
1. Cek ringkasan saldo wallet vs ledger.
2. Cek mismatch per user.
3. Cek transaksi finansial tanpa pasangan ledger.
4. Cek duplikasi idempotency key.

Aturan respons operasional:
- Jika total mismatch = 0 dan orphan tx = 0: status sehat.
- Jika ada mismatch atau orphan tx: freeze payout baru, investigasi, lalu lakukan adjustment terkontrol.

## Mode Solo Developer (Tanpa Team/PIC)
Jika pengembangan dijalankan sendiri, gunakan format sign-off berikut:
- Backend/DB/QA/Ops Owner: Haffez Gerryana Putra
- Tanggal Go-Live: 2026-03-28
- Checklist sign-off dianggap valid jika:
	- seluruh query rekonsiliasi harian lulus
	- uji endpoint trusted lulus
	- audit pasca-cutover no-ledgerId = 0 row

## PIC Sign-off
- Backend Lead:
- Database Lead:
- QA Lead:
- Ops Lead:
- Tanggal Go-Live:

Format alternatif (solo):
- Single Owner: Haffez Gerryana Putra
- Peran: Backend + Database + QA + Ops
- Tanggal Go-Live: 2026-03-28

## Final Validasi Cutover (2026-03-28)
- Cutover timestamp operasional: `1774636847000`
- Query audit transaksi tanpa `ledgerId` pasca-cutover: `0 row`
- Uji endpoint trusted:
	- `wallet/get`: lulus
	- `wallet/pay` operasi `pay`: lulus
	- `wallet/pay` operasi `completeOrder`: lulus (idempotent `alreadySettled=true`)
	- `wallet/pay` operasi `completeOrderCOD`: lulus (idempotent `alreadySettled=true`)
- Abuse test direct write client ke tabel finansial: lulus (ditolak by design)

Status: **GO** untuk mode wallet hardening real-money, dengan monitoring harian aktif.

## Rencana Eksekusi Harian (Day 1 - Day 5)

### Day 1 - Security Baseline Lock (P0)
Tujuan:
- Menutup jalur write langsung dari client ke wallet/transaksi.

Task:
1. Update RLS `wallets` dan `transactions`:
- hapus policy `anon_all_wallets`
- hapus policy `anon_all_transactions`
- buat policy read-only wallet milik sendiri
- write khusus trusted backend
2. Batasi akses dashboard Supabase untuk tim inti (MFA + least privilege).
3. Simpan backup snapshot sebelum policy change.

Output:
- RLS sudah ketat untuk tabel finansial.
- Tidak ada write dari anon/client ke saldo.

PIC:
- DB Lead + Backend Lead

Checklist Day 1:
- [ ] Policy lama dihapus.
- [ ] Policy baru aktif.
- [ ] Uji anon write gagal.
- [ ] Backup snapshot tersimpan.

---

### Day 2 - Backend Integrity Guard (P0)
Tujuan:
- Mencegah manipulasi field finansial lewat update order umum.

Task:
1. Tambahkan whitelist field di jalur update order umum.
2. Blok mutasi field finansial dari endpoint generic:
- `price`, `deliveryFee`, `fee`, `totalCost`, `paidAmount`, `walletSettled`, `refundDone`, `adminReviewStatus`, `pendingAdminReview`.
3. Pisahkan endpoint khusus untuk perubahan finansial yang tervalidasi.

Output:
- Update order non-finansial tetap jalan.
- Update order finansial via jalur generic ditolak.

PIC:
- Backend Lead

Checklist Day 2:
- [ ] Whitelist update order aktif.
- [ ] Payload manipulasi finansial ditolak.
- [ ] Endpoint finansial khusus tersedia.

---

### Day 3 - COD Settlement Safety (P0)
Tujuan:
- Memastikan COD tidak bisa settle jika debit driver gagal.

Task:
1. Ubah flow COD:
- debit driver wajib sukses dulu
- baru owner dapat credit
- baru tandai `walletSettled=true`
2. Jika debit gagal:
- jangan credit owner
- jangan settle order
- kembalikan order ke state bisa retry
3. Tambahkan notifikasi operasional yang jelas untuk admin.

Output:
- Tidak ada mint saldo dari jalur COD gagal.

PIC:
- Backend Lead + QA Lead

Checklist Day 3:
- [ ] Simulasi saldo driver kurang tidak settle.
- [ ] Owner tidak menerima dana saat debit gagal.
- [ ] Retry setelah top up berjalan.

---

### Day 4 - Idempotency & Atomic Payout (P0/P1)
Tujuan:
- Mencegah double payout dan partial payout.

Task:
1. Tambahkan idempotency key payout per order.
2. Terapkan proses atomik (single transaction/RPC).
3. Hindari race condition approve/retry pada admin review.
4. Satukan payment charge dan penandaan paid agar konsisten.

Output:
- Double click approve tidak menyebabkan double payout.
- Error di tengah proses tidak menghasilkan partial credit.

PIC:
- Backend Lead

Checklist Day 4:
- [ ] Idempotency key aktif.
- [ ] Atomic payout aktif.
- [ ] Double approve test pass.
- [ ] Partial failure test pass.

---

### Day 5 - QA Finansial, Rekonsiliasi, Go/No-Go
Tujuan:
- Menentukan readiness migrasi berdasarkan bukti tes.

Task:
1. Jalankan test wajib:
- manipulasi payload finansial
- double approve
- COD debit gagal
- refund sekali saja
- mismatch detection
2. Rekonsiliasi `wallets.balance` vs ledger transaksi.
3. Review hasil + sign-off lintas fungsi.
4. Putuskan status:
- Go jika seluruh P0 pass dan rekonsiliasi bersih
- No-Go jika ada 1 critical gagal

Output:
- Berita acara Go/No-Go.
- Daftar temuan residual (jika ada).

PIC:
- QA Lead + DB Lead + Backend Lead + Ops Lead

Checklist Day 5:
- [ ] Semua test wajib pass.
- [ ] Rekonsiliasi pass.
- [ ] Sign-off lengkap.
- [ ] Keputusan Go/No-Go terdokumentasi.

## Aturan Eksekusi
1. Jangan lanjut ke hari berikutnya jika checklist hari ini belum lulus.
2. Setiap perubahan finansial wajib punya test case negatif (abuse case).
3. Jika terjadi regresi pada wallet, aktifkan rollback plan di dokumen ini.
4. Semua perubahan harus masuk changelog internal harian.

## Template Standup Harian
Gunakan format ini di akhir setiap hari:
- Hari:
- Progress selesai:
- Blokir utama:
- Risiko baru:
- Keputusan lanjut/tunda:
- Owner aksi besok:
