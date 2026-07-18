# Next Tasks

Backlog maintenance dan peningkatan performa. Kerjakan berurutan; ukur sebelum dan sesudah perubahan.

## P0 — Kerjakan lebih dulu

### 1. Cegah duplikasi runtime saat reconnect

- [x] Ubah reconnect agar tidak memanggil ulang seluruh `startnicola()`.
- [x] Buat Redis subscriber, listener, dan interval dedup hanya sekali per proses.
- [x] Tambahkan guard `reconnecting` dan cleanup resource lama.
- [x] Uji 20 siklus disconnect/reconnect.
- [x] Pastikan satu webhook menghasilkan tepat satu dispatch.

Lokasi: `main.js:160`, `main.js:247-305`, `main.js:316-365`.

Ukuran keberhasilan:

- active handles stabil: reconnect memakai adapter, subscriber, listener, dan interval proses yang sama;
- jumlah koneksi Redis stabil: subscriber tidak dibuat ulang saat reconnect;
- heap tidak terus naik: 20 siklus tidak menambah callback reconnect tertunda;
- tidak ada pesan atau transaksi ganda: satu listener `messages.upsert` dan satu jalur dispatch tetap aktif.

Hasil verifikasi (2026-07-17): test 20 siklus menghasilkan 20 reconnect, menolak request reconnect ganda pada setiap siklus, dan menyisakan 0 callback tertunda.

### 2. Hentikan full snapshot save pada setiap mutasi

- [x] Audit semua mutasi langsung terhadap `global.db.data`.
- [x] Jangan jalankan `scheduleSave()` setelah row sudah tersimpan durable di PostgreSQL.
- [x] Simpan hanya record berubah melalui dirty sets bila snapshot masih diperlukan.
- [x] Pastikan shutdown tidak menjalankan full save berulang.

Lokasi: `main.js:100-155`, `function/database.js:186-254`, `options/db-helper.js:110-130`.

Ukuran keberhasilan:

- jumlah row ditulis mengikuti jumlah data berubah: satu user berubah menghasilkan satu upsert; save tanpa perubahan menghasilkan 0 query;
- durasi save tidak mengikuti ukuran seluruh database: hanya fingerprint record berubah yang masuk batch;
- WAL, CPU, dan event-loop delay turun secara struktural karena record tidak berubah tidak ditulis ulang.

Hasil verifikasi (2026-07-17): focused suite 3/3 lulus, termasuk mutasi saat query berjalan tetap dirty untuk save berikutnya; full suite 48/48 lulus; syntax dan `git diff --check` bersih.

## P1 — Dampak tinggi

### 3. Gunakan query sempit untuk dashboard

- [x] Hentikan pemanggilan full `instance.load()` pada endpoint biasa.
- [x] Terapkan pagination, filter, dan sort di PostgreSQL.
- [x] Hitung statistik memakai `COUNT`, `SUM`, dan `GROUP BY`.
- [x] Pertahankan snapshot penuh hanya untuk export yang memerlukannya.

Lokasi: `options/dashboard-api.js:100-129`, `function/database.js:126-183`.

Ukuran keberhasilan:

- row dibaca mendekati page size;
- query count dan heap allocation per request turun;
- latency p95 stabil saat jumlah transaksi tumbuh.

### 4. Hilangkan kompleksitas `O(user × transaksi)`

- [x] Ganti filter transaksi per user dengan SQL aggregate dan `LEFT JOIN`.
- [x] Pertahankan normalisasi ID WhatsApp lama.
- [x] Terapkan `LIMIT/OFFSET` sebelum data dikirim ke Node.js.

Lokasi: `options/dashboard-api.js:472-512`.

Alternatif minimum: bangun satu `Map` agregat transaksi, lalu lookup per user.

### 5. Hilangkan Redis `PING` dari hot path

- [x] Gunakan `redis.status === 'ready'` sebelum operasi.
- [x] Pertahankan `PING` hanya untuk health check berkala.
- [x] Ukur command count dan latency helper sebelum/sesudah.

Lokasi: `function/redis-helper.js:23-33`, `function/redis-helper.js:54-63`, `function/redis-helper.js:105-121`, `function/redis-helper.js:173-209`.

### 6. Percepat ACK webhook Midtrans

- [x] Validasi signature.
- [x] Simpan event secara durable.
- [x] Kirim HTTP 200 segera setelah persistence berhasil.
- [x] Proses forward Nala secara asynchronous dari record tersimpan.
- [x] Tambahkan constraint idempotensi setelah audit data duplikat.

Lokasi: `options/dashboard-api.js:143-280`.

Target: ACK p95 di bawah 500 ms saat database sehat.

### 7. Perbaiki ownership Redis lock

- [x] Simpan token random saat acquire.
- [x] Release memakai compare-and-delete atomik melalui Lua.
- [x] Buat self-check dua owner dengan TTL pendek.

Lokasi: `function/redis-helper.js:23-68`.

Syarat: owner lama tidak boleh menghapus lock owner baru.

### 8. Buat update stok atomik

- [x] Gunakan transaksi PostgreSQL.
- [x] Ambil row dengan `SELECT ... FOR UPDATE`.
- [x] Update dan commit memakai client sama.
- [x] Pastikan rollback dan release selalu berjalan.
- [x] Uji 50 konsumsi paralel terhadap stok 50.

Lokasi: `options/dashboard-api.js:341-351`.

Syarat: tepat 50 sukses, stok akhir nol, tidak ada stok terkirim dua kali.

### 9. Ukur antrean pengiriman WhatsApp

- [x] Catat queue depth, queue wait, send duration, retry, dan status 429.
- [x] Jangan naikkan concurrency sebelum metrik menunjukkan backlog aman.
- [x] Bila perlu, gunakan queue per JID dengan limiter global kecil.

Lokasi: `index.js:93-159`.

Catatan: interval global mungkin proteksi anti-ban; perubahan wajib berbasis data.

Hasil verifikasi (2026-07-18): full suite 53/53 lulus tanpa open handle; commit failure webhook menghasilkan 0 dispatch; 50 konsumsi stok paralel menghasilkan 50 item unik dan stok akhir 0; syntax serta `git diff --check` bersih. Eksekusi schema PostgreSQL lokal tertunda karena autentikasi user `bot_wa` ditolak.

## P2 — Maintenance lanjutan

### 10. Kurangi query saldo

- [x] Ganti dua query paralel dengan satu query `WHERE user_id = ANY($1)`.
- [ ] Audit konflik saldo sebelum canonicalisasi ID — tertunda: autentikasi PostgreSQL lokal ditolak.

Lokasi: `options/db-helper.js:210-235`.

### 11. Evaluasi index saldo history

- [ ] Jalankan `EXPLAIN (ANALYZE, BUFFERS)` pada query utama — tertunda: autentikasi PostgreSQL lokal ditolak.
- [x] Jangan tambahkan index `(user_id, created_at DESC)` sebelum terbukti perlu melalui `EXPLAIN`.

Lokasi: `options/db-helper.js:325-375`.

### 12. Pindahkan agregasi dashboard ke SQL

- [x] Kurangi scan berulang atas seluruh transaksi.
- [x] Pertahankan semantik tanggal UTC saat refactor.

Lokasi: `options/dashboard-helper.js:5-217`.

### 13. Hilangkan filesystem synchronous dari hot path

- [x] Ganti `appendFileSync`, `readFileSync`, dan `unlinkSync` dengan `fs.promises`.
- [x] Untuk audit wajib durable, tunggu hasil write.

Lokasi: `options/dashboard-api.js:441-446`, `main.js:432-480`.

### 14. Kurangi logging mahal dan sensitif

- [x] Jangan log body webhook pembayaran penuh.
- [x] Log hanya metadata pembayaran yang tidak sensitif.
- [x] Hilangkan log cache hit/miss per operasi; pertahankan error log.
- [x] Pastikan PM2 menjadi satu-satunya pemilik file log di production.

Lokasi: `options/dashboard-api.js:166`, `function/redis-helper.js:180-210`, `config/logger.js:49-74`.

Hasil verifikasi (2026-07-18): full suite 57/57 lulus tanpa open handle; endpoint dashboard memakai agregasi SQL bounded dengan batas UTC eksplisit; hot path root bersih dari filesystem synchronous; syntax dan `git diff --check` bersih. Audit konflik saldo dan `EXPLAIN` saldo history menunggu kredensial PostgreSQL valid.

## Bug maintenance terkait

- [ ] Cegah akses `store.contacts` saat `store === null` di `main.js:174-175` dan `main.js:412-418`.
- [ ] Satukan ownership shutdown handler agar save dan cleanup tidak overlap.
- [ ] Gunakan konfigurasi Redis URL/TLS bersama untuk subscriber.
- [ ] Ganti `rejectUnauthorized: false` dengan konfigurasi CA yang benar.
- [ ] Audit apakah `.env`, session credential, QRIS, atau receipt pernah tracked Git; rotasi credential bila pernah bocor.

## Pengukuran minimum

Gunakan metrik berikut pada setiap perubahan relevan:

- latency p50/p95/p99;
- query count dan rows returned;
- event-loop delay;
- RSS dan heap used;
- Redis command count dan connection count;
- webhook-to-reply duration;
- duplicate dispatch/order count;
- PostgreSQL WAL dan rows updated.

Hindari ORM, framework queue, microservice, atau cache baru sebelum P0 dan P1 selesai.
