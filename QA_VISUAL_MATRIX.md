# QA Visual Matrix - JS Antar

Dokumen ini dipakai untuk validasi tampilan JS Antar agar konsisten di berbagai device sebelum rilis.

## Device Matrix

| Device Class | Viewport (w x h) | Browser Target | Priority |
| --- | --- | --- | --- |
| Small Android | 360 x 800 | Chrome Android | P0 |
| iPhone 12/13/14 | 390 x 844 | Safari iOS | P0 |
| Pixel Pro Class | 412 x 915 | Chrome Android | P0 |
| iPad Portrait | 768 x 1024 | Safari iPadOS / Chrome | P1 |
| Large Android | 480 x 960 | Chrome Android | P1 |

## Global Acceptance Criteria

1. Tidak ada elemen keluar layar horizontal.
2. Tidak ada teks terpotong tanpa ellipsis yang benar.
3. Header, map card, dan bottom sheet tetap terbaca saat browser toolbar show/hide.
4. Safe-area iOS (notch, home indicator) tidak menabrak konten penting.
5. Animasi tidak patah (jank berat) pada device kelas P0.

## Test Scenario A - First Open JS Antar

Langkah:
1. Buka aplikasi dan masuk ke halaman user.
2. Tekan layanan JS Antar.
3. Amati state awal (sebelum memilih tujuan).

Checklist:
- [ ] Header first-open tampil rapi (tema orange, tanpa subtitle berlebih).
- [ ] Search-first top card terlihat sebagai fokus utama.
- [ ] Tombol quick action dan tombol bulat sejajar dan tidak overlap.
- [ ] Input tujuan di sheet terlihat dominan dan mudah disentuh.
- [ ] Tombol Temukan Driver terlihat utuh dan proporsional.

## Test Scenario B - Setelah Pilih Tujuan

Langkah:
1. Di halaman JS Antar, ketik tujuan lalu pilih dari suggestion.
2. Amati transisi dari search-first ke route mode.

Checklist:
- [ ] Top card berpindah ke mode Titik Jemput/Titik Antar.
- [ ] Marker pickup/dropoff muncul di map.
- [ ] Route line (base + flow) tampil normal.
- [ ] Jarak/ETA/rincian biaya muncul tanpa layout shift berlebihan.

## Test Scenario C - Tracking User/Driver

Langkah:
1. Buat order JS Antar sampai status berjalan.
2. Buka halaman tracking dari user dan dari driver.

Checklist:
- [ ] Auto-follow aktif saat driver keluar safe viewport.
- [ ] Saat map digeser manual, badge berubah ke mode pause.
- [ ] Speed badge muncul ketika posisi driver bergerak.
- [ ] ETA badge tampil dan diperbarui.
- [ ] Trail driver terlihat fade/gradient tanpa menutupi marker utama.

## Test Scenario D - Gesture + Orientation

Langkah:
1. Lakukan pan, pinch zoom, dan rotate portrait/landscape.
2. Ulang pada 2 device P0 minimal.

Checklist:
- [ ] Top card collapse/expand tetap halus.
- [ ] Tidak ada stuck state pada badge Auto/Pause.
- [ ] Setelah rotate, map dan sheet tetap sinkron.
- [ ] Tidak ada flicker berat saat resize viewport.

## Regression Quick Checks

- [ ] Order Tracking non-JS Antar tidak rusak.
- [ ] Chat page tetap normal.
- [ ] Rating page tetap normal.
- [ ] Bottom nav masih bisa dipakai saat kembali dari tracking.

## Test Log Template

Isi per run test:

- Date:
- Tester:
- Build/Commit:
- Device:
- Browser:
- Result: PASS / FAIL
- Notes:
- Screenshot Link:

## Exit Criteria (Siap Rilis)

1. Semua item P0 PASS.
2. Tidak ada bug blocker visual di Scenario A, B, C.
3. Jika ada fail P1, harus ada workaround dan dicatat di release note internal.
