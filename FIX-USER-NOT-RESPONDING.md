# 🔧 Panduan Mengatasi Bot Tidak Merespon User Tertentu

## 📝 Gejala Masalah
- Bot aktif di grup tapi tidak merespon di private chat
- User lain bisa menggunakan bot, tapi satu user tertentu tidak bisa
- Command seperti `buy`, `ceksaldo`, dll tidak dibalas bot

## 🔍 Penyebab Umum

### 1. **User Terblokir** (Paling Sering!)
Bot memiliki fitur auto-block pada user yang:
- Menelepon bot (Anti-call feature di `main.js` line 218-225)
- Di-block manual oleh owner menggunakan command `.block`

### 2. **Message dari Bot Sendiri**
Bot mengabaikan pesan dari dirinya sendiri (`fromMe` check di `index.js` line 132)

### 3. **Database Corruption**
User data corrupt atau tidak ter-load dengan benar

## ✅ Solusi Step-by-Step

### **Solusi 1: Unblock User (PALING MUDAH)**

#### Cara A - Menggunakan Command Bot:
```
1. Kirim command ke bot dari akun owner:
   .unblock 6281234567890
   
   (ganti 6281234567890 dengan nomor user yang bermasalah)

2. Test apakah user sudah bisa chat bot:
   - Minta user kirim command: .ping
```

#### Cara B - Menggunakan Script Otomatis:
```bash
# 1. Cek status user terlebih dahulu
node check-user-status.js 6281234567890

# 2. Unblock user secara langsung
node fix-unblock-user.js 6281234567890

# 3. Test dari user
```

---

### **Solusi 2: Restart Bot**

Jika unblock tidak berhasil, coba restart bot:

```bash
# Jika menggunakan PM2
pm2 restart <nama-app>

# Atau
pm2 restart all

# Jika menjalankan manual dengan node
# CTRL+C untuk stop, lalu jalankan lagi:
node main.js
```

---

### **Solusi 3: Clear Session & Re-login**

Jika masalah masih berlanjut, hapus session dan login ulang:

```bash
# BACKUP dulu session lama (penting!)
cp -r session session-backup-$(date +%Y%m%d)

# Hapus session
rm -rf session

# Jalankan bot lagi - akan minta scan QR code/pairing code
node main.js
```

---

### **Solusi 4: Cek Database User**

Gunakan script diagnostic:

```bash
node check-user-status.js 6281234567890
```

Output akan menampilkan:
- ✅ Status owner
- 📊 Data user di database (saldo, role, dll)
- 📦 Riwayat transaksi
- 💡 Saran solusi

---

## 🛠️ Troubleshooting Lanjutan

### Cek Log Bot

Perhatikan log saat user mengirim pesan:

```
# Di console akan muncul:
->[\x1b[1;32mCMD\x1b[1;37m] [timestamp] .buy [0] from [nama_user] in [nama_grup/private]
```

Jika log TIDAK muncul saat user kirim command = user terblokir atau ada masalah koneksi

### Cek Anti-Call Setting

Jika user pernah menelepon bot, bot otomatis block user tersebut.

**Cara menonaktifkan anti-call:**

Edit di bot dengan command owner:
```
# Cek setting
.ceksetting

# (Untuk menonaktifkan anti-call, perlu edit code di main.js)
```

Atau edit manual di `main.js` baris 218-225:
```javascript
ronzz.ws.on('CB:call', async (json) => {
  const callerId = json.content[0].attrs['call-creator']
  // COMMENT ATAU HAPUS BAGIAN INI:
  // if (db.data.setting[ronzz.user?.["id"]["split"](":")[0] + "@s.whatsapp.net"].anticall && json.content[0].tag == 'offer') {
  //   ronzz.sendMessage(callerId, { text: `...` })
  //   setTimeout(() => {
  //     ronzz.updateBlockStatus(callerId, 'block')
  //   }, 1000)
  // }
})
```

---

## 📋 Checklist Debugging

- [ ] Coba command `.unblock <nomor>`
- [ ] Restart bot dengan `pm2 restart all`
- [ ] Jalankan `node check-user-status.js <nomor>`
- [ ] Cek apakah user pernah menelepon bot (anti-call)
- [ ] Pastikan nomor user tidak ada di blacklist
- [ ] Test dengan command sederhana: `.ping` atau `.menu`
- [ ] Cek log console saat user kirim pesan
- [ ] Jika perlu, hapus session dan re-login

---

## 🆘 Jika Semua Solusi Gagal

1. **Backup database:**
   ```bash
   cp options/database.json options/database-backup-$(date +%Y%m%d).json
   ```

2. **Check file permissions:**
   ```bash
   ls -la options/database.json
   ls -la session/
   ```

3. **Reinstall dependencies:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

4. **Update bot ke versi terbaru** (jika ada update)

---

## 📞 Nomor untuk Test

Gunakan nomor ini untuk test unblock:
```
# Contoh sesuai kasus Stefhany Poei:
# Cari nomor user dari chat/grup, lalu:

node check-user-status.js 628XXXXXXXXXX
node fix-unblock-user.js 628XXXXXXXXXX
```

---

## 🔐 Prevention (Mencegah Masalah)

1. **Disable auto-block pada call** (jika tidak perlu)
2. **Buat whitelist untuk user penting**
3. **Log semua block/unblock action**
4. **Regular backup database**

---

## 📝 Script yang Tersedia

1. **check-user-status.js** - Cek status user di database
2. **fix-unblock-user.js** - Unblock user secara otomatis
3. **check-all-users.js** - Cek semua user di database
4. **debug-payment.js** - Debug transaksi payment

---

## ✨ Tips

- Selalu test dengan command sederhana seperti `.ping` dulu
- Pastikan bot dalam kondisi online (cek di WhatsApp Web/Desktop)
- Jika user di grup bisa tapi di private tidak bisa = kemungkinan besar user terblokir
- Backup database sebelum melakukan perubahan besar

---

**Dibuat untuk troubleshooting bot WhatsApp**
**Last updated:** $(date)

