## Migrasi options/database.json ke Postgres

1) Siapkan Postgres (contoh lokal)

```bash
createdb bot_wa
createuser -P botwa  # isi password sesuai PG_PASSWORD
psql -d bot_wa -c "GRANT ALL PRIVILEGES ON DATABASE bot_wa TO botwa;"
```

2) Konfigurasi environment

Edit `config/env.example` menjadi `.env` dan set:

```ini
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=bot_wa
PG_USER=botwa
PG_PASSWORD=changeme
USE_PG=true
```

3) Apply schema

```bash
npm run pg:schema
```

4) Jalankan migrasi dari `options/database.json`

```bash
npm run pg:migrate
```

5) Verifikasi jumlah data (opsional)

```sql
-- via psql
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM transaksi;
SELECT COUNT(*) FROM produk;
```

Catatan: Aplikasi saat ini masih membaca `options/database.json`. Setelah migrasi, langkah berikutnya adalah mengganti akses baca/tulis ke Postgres menggunakan modul `config/postgres.js` atau adapter kompatibel `Database` jika diperlukan.


