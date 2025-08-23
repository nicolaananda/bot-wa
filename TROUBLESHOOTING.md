# 🔧 Troubleshooting WhatsApp Bot

## ❌ Error: "SessionError: No sessions"

### **Masalah:**
Bot bisa chat ke personal tapi tidak bisa ke grup, dengan error:
```
SessionError: No sessions
at /root/bot-wa/node_modules/libsignal/src/session_cipher.js:71
```

### **Penyebab:**
1. **Session kosong** - Directory `session/` tidak memiliki file autentikasi
2. **Group metadata access** - Bot mencoba mengakses info grup tanpa session valid
3. **Libsignal library** - Error encrypt/decrypt pesan grup

### **Solusi:**

#### **1. Reset Session (Recommended)**
```bash
# Jalankan script reset
node reset-session-simple.js

# Atau manual:
# 1. Stop bot (Ctrl+C)
# 2. Hapus semua file di folder session/
# 3. Restart bot: npm start
# 4. Scan QR code atau gunakan pairing code
```

#### **2. Periksa Permission Bot di Grup**
- ✅ Bot sudah di-invite ke grup
- ✅ Bot punya permission baca pesan
- ✅ Bot tidak di-block oleh grup
- ✅ Bot adalah admin (untuk fitur tertentu)

#### **3. Verifikasi Konfigurasi**
Pastikan di `setting.js`:
```javascript
global.pairingCode = true  // Gunakan pairing code
global.sessionName = "session"  // Nama folder session
```

### **Langkah-langkah Fix:**

1. **Stop Bot**
   ```bash
   # Tekan Ctrl+C untuk stop bot
   ```

2. **Clear Session**
   ```bash
   # Jalankan reset script
   node reset-session-simple.js
   ```

3. **Restart Bot**
   ```bash
   npm start
   ```

4. **Authenticate**
   - Scan QR code, atau
   - Masukkan nomor HP + pairing code

5. **Test Grup**
   - Chat ke grup untuk memastikan bot merespon

### **Prevention:**
- Jangan hapus folder `session/` saat bot jalan
- Backup session files secara berkala
- Monitor log untuk error session

### **Jika Masih Error:**
1. Check log untuk error detail
2. Pastikan semua dependencies terinstall
3. Coba downgrade @whiskeysockets/baileys
4. Restart server/computer

---

**Note:** Error ini biasanya terjadi karena session expired atau corrupt. Reset session adalah solusi paling efektif. 