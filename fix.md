# Perbaikan `addstok` dan Rotasi Log PM2

## Ringkasan insiden

Pada 25 Juli 2026, perintah `addstok` beberapa kali harus dikirim dua kali sebelum pengguna melihat hasilnya.

Contoh log:

```text
25/07/2026 12:02:59 addstok [1] from Admin Nz in GH bot BARU
25/07/2026 12:03:16 addstok [1] from Admin Nz in GH bot BARU

25/07/2026 17:08:34 addstok [1] from Admin Nz in GH bot BARU
25/07/2026 17:08:38 addstok [1] from Admin Nz in GH bot BARU
```

Kedua pesan diterima Redis/webhook dan mencapai command handler. Masalah bukan pada penerimaan pesan WhatsApp.

## Temuan kode

Handler saat ini berada di `index.js`, sekitar baris 4934:

```js
case 'addstok': {
  if (!isOwner) return reply(mess.owner)
  let data = q.split(',')
  if (!data[1]) return reply('...')
  if (!db.data.produk[data[0]]) return reply(`Produk dengan ID *${data[0]}* tidak ada`)

  let dataStok = data[1].split('\n').map((i) => i.trim())
  db.data.produk[data[0]].stok.push(...dataStok)

  reply(`Berhasil menambahkan stok sebanyak ${dataStok.length}`)
}
```

Masalah:

1. Perubahan stok hanya dilakukan pada objek memori dan tidak memanggil `global.scheduleSave()`. Stok dapat belum tersimpan ke database/storage persisten.
2. `reply()` tidak memakai `await`. Kegagalan pengiriman balasan tidak tercatat pada alur handler, sehingga proses terlihat tidak berjalan.
3. Tidak ada log `start`, `success`, dan `error` khusus `addstok`.
4. Tidak ada pencegahan stok duplikat. Pengiriman ulang dapat memasukkan akun yang sama dua kali.
5. Input kosong tetap dapat masuk karena hasil `split()` tidak difilter.

## Perbaikan minimum yang disarankan

Ganti handler `addstok` dengan alur berikut:

```js
case 'addstok': {
  if (!isOwner) return reply(mess.owner)

  const separator = q.indexOf(',')
  if (separator < 1) {
    return reply(
      `Contoh: ${prefix + command} idproduk,email1@gmail.com|password1|profil1|pin1|2fa1\nemail2@gmail.com|password2|profil2|pin2|2fa2\n\n*NOTE*\nJika tidak ada Profil, Pin, 2FA, kosongkan saja atau dikasih tanda strip (-)`
    )
  }

  const productId = q.slice(0, separator).trim().toLowerCase()
  const product = db.data.produk[productId]
  if (!product) return reply(`Produk dengan ID *${productId}* tidak ada`)

  const incoming = q
    .slice(separator + 1)
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)

  if (!incoming.length) return reply('Stok tidak boleh kosong')

  const existing = new Set(product.stok || [])
  const newStock = incoming.filter((item) => !existing.has(item))
  const duplicateCount = incoming.length - newStock.length

  console.log('[ADDSTOK] Start', {
    messageId: m.key?.id,
    productId,
    received: incoming.length,
    newStock: newStock.length,
    duplicateCount,
  })

  if (!newStock.length) {
    return reply(`Tidak ada stok baru. ${duplicateCount} data sudah tersedia.`)
  }

  product.stok ??= []
  product.stok.push(...newStock)

  if (typeof global.scheduleSave === 'function') global.scheduleSave()

  console.log('[ADDSTOK] Success', {
    messageId: m.key?.id,
    productId,
    added: newStock.length,
    total: product.stok.length,
  })

  await reply(
    `✅ Berhasil menambahkan ${newStock.length} stok ke *${productId}*.` +
      (duplicateCount ? `\n⚠️ ${duplicateCount} data duplikat dilewati.` : '')
  )
}
break
```

`ponytail:` deduplikasi di atas memakai kecocokan seluruh baris. Jika identitas akun harus berdasarkan email, normalisasi dan deduplikasi berdasarkan bagian sebelum karakter `|`.

## Penanganan error

Pastikan dispatcher utama mencatat exception command tanpa mematikan proses:

```js
try {
  // dispatch command
} catch (error) {
  console.error('[COMMAND] Failed', {
    command,
    messageId: m.key?.id,
    error: error.stack || error.message,
  })
  await reply('❌ Perintah gagal diproses. Jangan kirim ulang sebelum admin memeriksa log.')
}
```

Jangan otomatis melakukan retry mutasi stok. Retry tanpa idempotensi dapat menambah stok dua kali.

## Pemeriksaan setelah perubahan

1. Catat jumlah awal dengan `cek net2u`.
2. Kirim satu `addstok net2u,...` berisi satu akun uji.
3. Pastikan muncul satu log `[ADDSTOK] Success` dengan `messageId` yang sama.
4. Jalankan `cek net2u`; jumlah harus bertambah satu.
5. Kirim ulang data akun uji yang sama; jumlah tidak boleh bertambah.
6. Restart bot, lalu jalankan `cek net2u`; jumlah harus tetap sama untuk membuktikan persistensi.

## Rotasi log PM2 setiap hari

Ukuran saat pemeriksaan:

```text
/root/.pm2/logs/bot-wa-out.log   sekitar 2,48 GB
/root/.pm2/logs/bot-wa-error.log sekitar 28,8 MB
```

Gunakan modul resmi `pm2-logrotate` agar PM2 tetap memegang file log dengan benar:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
pm2 set pm2-logrotate:dateFormat 'YYYY-MM-DD_HH-mm-ss'
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:max_size 500M
pm2 set pm2-logrotate:workerInterval 30
pm2 save
```

Konfigurasi tersebut:

- merotasi log setiap pukul 00:00 waktu server;
- tetap merotasi lebih awal jika ukuran mencapai 500 MB;
- menyimpan 14 file rotasi;
- mengompres file lama.

Verifikasi:

```bash
pm2 conf | grep pm2-logrotate
pm2 ls
pm2 logs pm2-logrotate --lines 50
```

Untuk memutar file besar saat ini setelah modul terpasang:

```bash
pm2 trigger pm2-logrotate rotate
```

Jangan menghapus atau memindahkan log aktif secara manual saat proses berjalan. PM2 dapat tetap menulis ke file descriptor lama dan ruang disk belum tentu langsung kembali.

## Error eksternal terkait

Log juga menunjukkan gangguan GOWA yang dapat membuat balasan gagal:

```text
upload failed with status code 429
[GOWA-ADAPTER] Send message error: Request failed with status code 500
read ECONNRESET
```

Tambahkan retry terbatas dengan backoff hanya untuk operasi kirim pesan yang aman diulang. Jangan menerapkan retry yang sama pada mutasi stok tanpa idempotency key berbasis `messageId`.
