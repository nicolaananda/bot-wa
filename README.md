# bot-wa

![Node.js](https://img.shields.io/badge/Node.js-CommonJS-339933?logo=nodedotjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-required-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-webhook_transport-DC382D?logo=redis&logoColor=white)
![License](https://img.shields.io/badge/license-ISC-blue)

Bot commerce WhatsApp berbasis **GOWA**, **PostgreSQL**, **Redis**, dan **Midtrans QRIS**. Proyek ini menangani stok produk digital, harga berbasis role, pembelian dengan saldo atau QRIS, deposit, booking Zoom, receipt, notifikasi operasional, serta dashboard/webhook API terpisah.

> Proyek menggunakan dua proses Node.js: `bot-wa` untuk business logic dan `api` untuk dashboard serta webhook ingress.

## Arsitektur

```text
GOWA
  └─ POST /webhook/gowa
       └─ Dashboard API
            └─ Redis channel: gowa:messages
                 └─ Bot process

Midtrans
  └─ POST /webhook/midtrans
       └─ Signature verification
            └─ PostgreSQL: midtrans_webhooks
                 └─ Durable payment worker
                      └─ Idempotent fulfillment / balance credit

PostgreSQL
  ├─ users dan saldo
  ├─ produk dan stok
  ├─ transaksi
  ├─ pending order/deposit
  └─ durable Midtrans webhook queue

Redis
  ├─ GOWA webhook transport
  ├─ transaction locks
  ├─ rate limits
  └─ cache
```

PostgreSQL adalah sumber data utama dan antrean pembayaran authoritative. Redis dipakai sebagai transport event WhatsApp, locking, rate limiting, dan cache.

## Fitur utama

- Manajemen produk dan stok akun digital.
- Harga berdasarkan role pengguna.
- Pembelian menggunakan saldo atau Midtrans QRIS.
- Deposit QRIS dengan kode unik.
- Durable payment worker dengan retry, idempotency, heartbeat, dan deteksi antrean macet.
- GOWA multi-device dengan webhook signature verification.
- Deduplication event WhatsApp.
- Booking Zoom dan pool host bertingkat.
- Receipt berbasis storage S3-compatible/R2.
- Dashboard API untuk transaksi, user, stok, receipt, dan analytics.
- Group whitelist dan kontrol akses owner/admin.
- Telegram operational alert jika dikonfigurasi.

## Prasyarat

- Node.js dan npm.
- PostgreSQL.
- Redis.
- GOWA yang aktif dan sudah terautentikasi.
- Kredensial Midtrans untuk fitur pembayaran.
- Endpoint HTTPS publik untuk webhook GOWA dan Midtrans.

Versi minimum runtime belum dikunci melalui `engines` di `package.json`. Gunakan versi Node.js LTS yang kompatibel dengan dependency proyek.

## Instalasi

```bash
git clone https://github.com/nicolaananda/bot-wa.git
cd bot-wa
npm ci
cp .env.example .env
```

Isi `.env`, buat database PostgreSQL, lalu terapkan schema:

```bash
npm run pg:schema
```

Validasi instalasi:

```bash
npm test -- --runInBand
```

## Konfigurasi

Gunakan `.env.example` sebagai inventory konfigurasi. Jangan commit `.env`.

### Runtime utama

```dotenv
USE_PG=true

PG_HOST=
PG_PORT=
PG_DATABASE=
PG_USER=
PG_PASSWORD=

REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=

GOWA_API_URL=
GOWA_USERNAME=
GOWA_PASSWORD=
GOWA_DEVICE_ID=
GOWA_WEBHOOK_SECRET=

MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_MERCHANT_ID=
MIDTRANS_IS_PRODUCTION=true

OWNER_NUMBER=
```

Nama variabel lengkap dan integrasi opsional tersedia di `.env.example`. Jangan menyalin contoh placeholder menjadi kredensial production.

### Integrasi opsional

- Telegram operational notification.
- Cloudflare R2 atau storage S3-compatible untuk receipt.
- Zoom Server-to-Server OAuth dan host pool.
- Listener backend.
- Order Kuota.
- Pricing override dan payment display details.

## PostgreSQL

Terapkan schema setelah `.env` selesai:

```bash
npm run pg:schema
```

Schema utama mencakup:

- `users`
- `transaksi`
- `produk`
- `settings`
- `kv_store`
- `midtrans_webhooks`
- `web_pos_pin`

Reference ID transaksi dan Midtrans event key memiliki uniqueness protection untuk mencegah fulfillment atau kredit ganda saat retry.

`npm run pg:dedup` adalah maintenance command. Backup database sebelum menjalankannya.

## Menjalankan aplikasi

Bot dan API berjalan sebagai proses terpisah.

Terminal 1:

```bash
npm start
```

Terminal 2:

```bash
npm run dashboard
```

`npm start` menjalankan launcher `nicola.js`, lalu memulai `main.js` dengan bounded restart dan backoff. Dashboard/webhook API menggunakan port HTTP `3002` secara default.

## Integrasi GOWA

1. Jalankan dan autentikasikan GOWA.
2. Isi URL, Basic Auth, dan device ID GOWA pada `.env`.
3. Arahkan webhook device GOWA ke:

   ```text
   POST https://<public-host>/webhook/gowa
   ```

4. Samakan `GOWA_WEBHOOK_SECRET` pada GOWA dan API.
5. Jalankan Redis, dashboard API, dan bot.

API memverifikasi HMAC menggunakan raw request bytes, lalu meneruskan event valid ke Redis channel `gowa:messages`. Bot berlangganan channel tersebut dan memproses event melalui GOWA adapter.

## Pembayaran Midtrans

Alur aktif menggunakan Midtrans Core API QRIS dan durable webhook worker:

1. Bot membuat QRIS charge.
2. Midtrans mengirim notifikasi ke:

   ```text
   POST https://<public-host>/webhook/midtrans
   ```

3. API memverifikasi signature SHA-512.
4. Event disimpan ke PostgreSQL sebelum API mengembalikan sukses.
5. Worker mengambil event dengan `FOR UPDATE SKIP LOCKED`.
6. Kegagalan diproses ulang menggunakan exponential backoff.
7. Unique transaction reference mencegah saldo atau akun terkirim dua kali.

Worker mendukung direct purchase dan deposit QRIS. Korelasi mengutamakan external order/transaction ID, dengan fallback nominal dan rentang waktu yang dibatasi.

### Monitoring worker

- Heartbeat worker berjalan setiap 30 detik.
- Webhook `received` dengan `attempts=0` lebih dari dua menit dianggap macet.
- Alert dideduplikasi sampai antrean pulih.
- Hot reload menghentikan worker lama dan memasang worker baru.

Polling transaction-list dan Redis Midtrans event bukan jalur authoritative.

## Menjalankan test

```bash
npm test
npm test -- --runInBand
npm run test:watch
npm run test:coverage
npm run test:unit
```

Test mencakup payment flow, durable webhook, deposit, PostgreSQL dirty persistence, GOWA authentication dan deduplication, reconnect controller, QRIS rendering/reporting, produk, serta group whitelist.

## Deployment dengan PM2

```bash
npm ci
npm run pg:schema
npm test -- --runInBand

pm2 start npm --name bot-wa -- start
pm2 start npm --name api -- run dashboard
pm2 save
```

Verifikasi:

```bash
pm2 show bot-wa
pm2 show api
pm2 logs bot-wa
pm2 logs api
```

Reverse proxy harus meneruskan webhook GOWA dan Midtrans ke dashboard API pada port `3002`.

### Update deployment

```bash
git pull --ff-only
npm ci
npm run pg:schema
npm test -- --runInBand
pm2 restart bot-wa api --update-env
```

Hindari deploy saat ada pembayaran aktif. Jika perlu melakukan hot reload, durable worker akan mengganti worker lama dan melanjutkan antrean PostgreSQL.

## NPM scripts

| Command | Fungsi |
|---|---|
| `npm start` | Menjalankan launcher bot dengan V8 heap limit 1024 MB |
| `npm run start:unlimited` | Menjalankan launcher tanpa heap limit eksplisit |
| `npm run dashboard` | Menjalankan dashboard dan webhook API |
| `npm run dashboard:dev` | Menjalankan API dengan `nodemon` |
| `npm test` | Menjalankan Jest |
| `npm run test:watch` | Menjalankan Jest watch mode |
| `npm run test:coverage` | Menjalankan coverage dengan global threshold |
| `npm run test:unit` | Menjalankan unit tests |
| `npm run pg:schema` | Menerapkan `options/schema.sql` |
| `npm run pg:dedup` | Menjalankan utility deduplication transaksi |
| `npm run backup` | Membuat backup |
| `npm run restore` | Menjalankan restore |
| `npm run backup-list` | Menampilkan daftar backup |
| `npm run backup-health` | Memeriksa kesehatan backup |
| `npm run start-safe` | Backup lalu menjalankan bot |
| `npm run lint` | Menjalankan ESLint untuk `index.js` |
| `npm run lint:fix` | Memperbaiki lint yang didukung |
| `npm run format` | Memformat `index.js` dengan Prettier |

## Keamanan dan operasional

- Jangan commit `.env`, token, password, QR, receipt, atau file pool Zoom.
- Gunakan HTTPS untuk seluruh webhook.
- Samakan dan lindungi `GOWA_WEBHOOK_SECRET`.
- Jangan mengekspos PostgreSQL atau Redis langsung ke internet.
- Letakkan dashboard API di belakang reverse proxy dan autentikasi.
- Rotasi kredensial jika pernah muncul di log atau Git history.
- Backup PostgreSQL sebelum schema migration atau deduplication.
- Monitor proses bot dan API; event GOWA tidak dapat mencapai bot ketika Redis mati.
- Log hanya metadata event. Jangan mencetak payload webhook atau Authorization header.

## Troubleshooting

### Bot menerima pesan tetapi tidak membalas

```bash
pm2 show bot-wa
pm2 logs bot-wa --lines 100
```

Periksa GOWA Basic Auth, `GOWA_DEVICE_ID`, dan status device.

### Webhook GOWA ditolak

- Pastikan `GOWA_WEBHOOK_SECRET` sama pada kedua sisi.
- Signature harus dihitung dari raw request body.
- Periksa reverse proxy tidak mengubah body.

### Pembayaran tidak selesai otomatis

Periksa antrean durable:

```sql
SELECT id, lifecycle_status, attempts, next_attempt_at, created_at
FROM midtrans_webhooks
WHERE processed = false
ORDER BY id DESC;
```

Jangan fulfillment manual sebelum memastikan event belum diproses. Gunakan reference ID untuk mencegah pengiriman atau kredit ganda.

### Database lambat

Startup log mencatat durasi load `users`, `transaksi`, `produk`, `settings`, dan `kv_store`. Fokus pada koneksi PostgreSQL dan ukuran tabel sebelum menambah index; full-table startup load tidak otomatis terbantu oleh index.

## Lisensi

ISC, sesuai deklarasi pada `package.json`.
