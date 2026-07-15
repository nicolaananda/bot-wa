# Next Tasks

Backlog maintenance dan peningkatan performa. Kerjakan berurutan; ukur sebelum dan sesudah perubahan.

## P0 — Kerjakan lebih dulu

### 1. Cegah duplikasi runtime saat reconnect

- [ ] Ubah reconnect agar tidak memanggil ulang seluruh `startnicola()`.
- [ ] Buat Redis subscriber, listener, dan interval dedup hanya sekali per proses.
- [ ] Tambahkan guard `reconnecting` dan cleanup resource lama.
- [ ] Uji 20 siklus disconnect/reconnect.
- [ ] Pastikan satu webhook menghasilkan tepat satu dispatch.

Lokasi: `main.js:160`, `main.js:247-305`, `main.js:316-365`.

Ukuran keberhasilan:

- active handles stabil;
- jumlah koneksi Redis stabil;
- heap tidak terus naik;
- tidak ada pesan atau transaksi ganda.

### 2. Hentikan full snapshot save pada setiap mutasi

- [ ] Audit semua mutasi langsung terhadap `global.db.data`.
- [ ] Jangan jalankan `scheduleSave()` setelah row sudah tersimpan durable di PostgreSQL.
- [ ] Simpan hanya record berubah melalui dirty sets bila snapshot masih diperlukan.
- [ ] Pastikan shutdown tidak menjalankan full save berulang.

Lokasi: `main.js:100-155`, `function/database.js:186-254`, `options/db-helper.js:110-130`.

Ukuran keberhasilan:

- jumlah row ditulis mengikuti jumlah data berubah;
- durasi save tidak mengikuti ukuran seluruh database;
- WAL, CPU, dan event-loop delay turun.

## P1 — Dampak tinggi

### 3. Gunakan query sempit untuk dashboard

- [ ] Hentikan pemanggilan full `instance.load()` pada endpoint biasa.
- [ ] Terapkan pagination, filter, dan sort di PostgreSQL.
- [ ] Hitung statistik memakai `COUNT`, `SUM`, dan `GROUP BY`.
- [ ] Pertahankan snapshot penuh hanya untuk export yang memerlukannya.

Lokasi: `options/dashboard-api.js:100-129`, `function/database.js:126-183`.

Ukuran keberhasilan:

- row dibaca mendekati page size;
- query count dan heap allocation per request turun;
- latency p95 stabil saat jumlah transaksi tumbuh.

### 4. Hilangkan kompleksitas `O(user × transaksi)`

- [ ] Ganti filter transaksi per user dengan SQL aggregate dan `LEFT JOIN`.
- [ ] Pertahankan normalisasi ID WhatsApp lama.
- [ ] Terapkan `LIMIT/OFFSET` sebelum data dikirim ke Node.js.

Lokasi: `options/dashboard-api.js:472-512`.

Alternatif minimum: bangun satu `Map` agregat transaksi, lalu lookup per user.

### 5. Hilangkan Redis `PING` dari hot path

- [ ] Gunakan `redis.status === 'ready'` sebelum operasi.
- [ ] Pertahankan `PING` hanya untuk health check berkala.
- [ ] Ukur command count dan latency helper sebelum/sesudah.

Lokasi: `function/redis-helper.js:23-33`, `function/redis-helper.js:54-63`, `function/redis-helper.js:105-121`, `function/redis-helper.js:173-209`.

### 6. Percepat ACK webhook Midtrans

- [ ] Validasi signature.
- [ ] Simpan event secara durable.
- [ ] Kirim HTTP 200 segera setelah persistence berhasil.
- [ ] Proses forward Nala secara asynchronous dari record tersimpan.
- [ ] Tambahkan constraint idempotensi setelah audit data duplikat.

Lokasi: `options/dashboard-api.js:143-280`.

Target: ACK p95 di bawah 500 ms saat database sehat.

### 7. Perbaiki ownership Redis lock

- [ ] Simpan token random saat acquire.
- [ ] Release memakai compare-and-delete atomik melalui Lua.
- [ ] Buat self-check dua owner dengan TTL pendek.

Lokasi: `function/redis-helper.js:23-68`.

Syarat: owner lama tidak boleh menghapus lock owner baru.

### 8. Buat update stok atomik

- [ ] Gunakan transaksi PostgreSQL.
- [ ] Ambil row dengan `SELECT ... FOR UPDATE`.
- [ ] Update dan commit memakai client sama.
- [ ] Pastikan rollback dan release selalu berjalan.
- [ ] Uji 50 konsumsi paralel terhadap stok 50.

Lokasi: `options/dashboard-api.js:341-351`.

Syarat: tepat 50 sukses, stok akhir nol, tidak ada stok terkirim dua kali.

### 9. Ukur antrean pengiriman WhatsApp

- [ ] Catat queue depth, queue wait, send duration, retry, dan status 429.
- [ ] Jangan naikkan concurrency sebelum metrik menunjukkan backlog aman.
- [ ] Bila perlu, gunakan queue per JID dengan limiter global kecil.

Lokasi: `index.js:93-159`.

Catatan: interval global mungkin proteksi anti-ban; perubahan wajib berbasis data.

## P2 — Maintenance lanjutan

### 10. Kurangi query saldo

- [ ] Ganti dua query paralel dengan satu query `WHERE user_id = ANY($1)`.
- [ ] Audit konflik saldo sebelum canonicalisasi ID.

Lokasi: `options/db-helper.js:210-235`.

### 11. Evaluasi index saldo history

- [ ] Jalankan `EXPLAIN (ANALYZE, BUFFERS)` pada query utama.
- [ ] Tambahkan index `(user_id, created_at DESC)` hanya bila terbukti perlu.

Lokasi: `options/db-helper.js:325-375`.

### 12. Pindahkan agregasi dashboard ke SQL

- [ ] Kurangi scan berulang atas seluruh transaksi.
- [ ] Pertahankan semantik tanggal UTC saat refactor.

Lokasi: `options/dashboard-helper.js:5-217`.

### 13. Hilangkan filesystem synchronous dari hot path

- [ ] Ganti `appendFileSync`, `readFileSync`, dan `unlinkSync` dengan `fs.promises`.
- [ ] Untuk audit wajib durable, tunggu hasil write.

Lokasi: `options/dashboard-api.js:441-446`, `main.js:432-480`.

### 14. Kurangi logging mahal dan sensitif

- [ ] Jangan log body webhook pembayaran penuh.
- [ ] Log hanya order ID, status, latency, dan correlation ID.
- [ ] Pindahkan cache hit/miss ke debug atau counter periodik.
- [ ] Pastikan output PM2 dan Winston tidak menggandakan file log.

Lokasi: `options/dashboard-api.js:166`, `function/redis-helper.js:180-210`, `config/logger.js:49-74`.

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
