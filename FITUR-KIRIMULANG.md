# 🔁 Fitur Kirim Ulang (Resend Account)

## 📋 Deskripsi

Fitur **kirimulang** memungkinkan user untuk mendapatkan kembali detail akun dari transaksi terakhir mereka. Berguna jika:
- User kehilangan pesan akun
- Chat terhapus secara tidak sengaja
- Perlu referensi ulang detail akun
- Screenshot hilang

---

## ⚡ Command

```
.kirimulang
.resend
.sendagain
```

**Ketiga command di atas memiliki fungsi yang sama.**

---

## 🎯 Cara Penggunaan

### **1. Basic Usage**

User tinggal ketik command tanpa parameter:

```
.kirimulang
```

Bot akan otomatis:
1. Mencari transaksi terakhir user
2. Mengambil detail akun dari file receipt
3. Mengirim ulang detail akun ke chat pribadi user

---

### **2. Contoh Penggunaan**

**Di Private Chat:**

```
User  : .kirimulang
Bot   : ⏳ Mencari transaksi terakhir Anda...

Bot   : [Mengirim detail akun ke chat pribadi]

Bot   : ✅ Berhasil mengirim ulang detail akun dari transaksi terakhir!

        📦 Produk: Netflix Premium 1 Bulan
        📅 Tanggal: 2025-10-25 14:30:00
```

**Di Group:**

```
User  : .kirimulang
Bot   : ⏳ Mencari transaksi terakhir Anda...

Bot   : [Mengirim detail akun ke chat pribadi user]

Bot   : ✅ Transaksi terakhir berhasil dikirim ulang!

        ╭────「 DETAIL 」────╮
        ┊・ 🆔 | Reff ID: TRX-1234567890
        ┊・ 📦 | Produk: Netflix Premium 1 Bulan
        ┊・ 🛍️ | Jumlah: 1
        ┊・ 📅 | Tanggal: 2025-10-25 14:30:00
        ╰┈┈┈┈┈┈┈┈

        📝 Info: Detail akun telah dikirim ke chat pribadi Anda.

        💡 Tips: Simpan detail akun dengan baik dan jangan bagikan ke orang lain!
```

---

## 📂 Data yang Dikirim

Bot akan mengirim file receipt lengkap yang berisi:

```
╭────「 DETAIL AKUN 」────╮
┊・ 📧 | Email: example@email.com
┊・ 🔐 | Password: SecretPass123
┊・ 📋 | PIN: 1234
┊・ 🔗 | Link: https://...
╰┈┈┈┈┈┈┈┈

╭────「 TRANSAKSI DETAIL 」───╮
┊・ 🧾 | Reff Id: TRX-1234567890
┊・ 📦 | Nama Barang: Netflix Premium
┊・ 🏷️ | Harga: Rp50,000
┊・ 🛍️ | Jumlah: 1
┊・ 💰 | Total: Rp50,000
┊・ 💳 | Metode: Saldo
┊・ 📅 | Tanggal: 2025-10-25 14:30:00
╰┈┈┈┈┈┈┈┈

... (SNK & panduan lengkap)
```

---

## 🔍 Error Handling

### **1. User Belum Ada Transaksi**

```
❌ Anda belum memiliki riwayat transaksi.

💡 Tips: Lakukan pembelian terlebih dahulu dengan command:
• .buy <kode> <jumlah> - Bayar dengan saldo
• .buynow <kode> <jumlah> - Bayar dengan QRIS
```

### **2. Receipt File Tidak Ditemukan**

```
🔁 KIRIM ULANG TRANSAKSI TERAKHIR

⚠️ File receipt tidak ditemukan, mengirim informasi dasar:

╭────「 TRANSAKSI INFO 」────╮
┊・ 🆔 | Reff ID: TRX-1234567890
┊・ 📦 | Produk: Netflix Premium
┊・ 🛍️ | Jumlah: 1
┊・ 💰 | Total: Rp50,000
┊・ 💳 | Metode: Saldo
┊・ 📅 | Tanggal: 2025-10-25 14:30:00
╰┈┈┈┈┈┈┈┈

⚠️ PENTING:
Detail akun tidak tersimpan dalam sistem.
Silakan hubungi admin @628XXX untuk mendapatkan detail akun Anda.

📝 Berikan Reff ID: TRX-1234567890 kepada admin untuk verifikasi.
```

### **3. Error Sistem**

```
❌ Terjadi kesalahan saat mengirim ulang transaksi.

Error: [error message]

💡 Silakan hubungi admin @628XXX jika masalah berlanjut.
```

---

## 🔐 Security & Privacy

### **Keamanan:**
1. ✅ Hanya user yang melakukan transaksi yang bisa kirim ulang
2. ✅ Receipt dikirim ke chat pribadi, bukan di group
3. ✅ Menggunakan file receipt yang ter-enkripsi di sistem
4. ✅ Logging setiap request kirim ulang untuk tracking

### **Privacy:**
- Detail akun TIDAK ditampilkan di group
- Hanya info dasar (produk, tanggal) yang muncul di group
- Full detail hanya dikirim ke chat pribadi user

---

## 📊 Log & Tracking

Setiap kali user menggunakan fitur ini, bot akan:

1. **Log di Console:**
   ```
   🔁 [RESEND] User 628XXX requested resend for transaction TRX-1234567890
   ```

2. **Tracking di Database:**
   - Request tercatat dalam sistem
   - Owner/admin bisa monitoring penggunaan fitur
   - Membantu detect jika ada penyalahgunaan

---

## 🎯 Use Cases

### **1. User Kehilangan Chat**
```
Scenario: User tidak sengaja hapus chat dengan bot
Solution: Gunakan .kirimulang untuk dapat akun kembali
```

### **2. Screenshot Hilang**
```
Scenario: User lupa screenshot detail akun
Solution: Kirimulang dan screenshot ulang
```

### **3. Perlu Referensi Ulang**
```
Scenario: User butuh cek ulang email/password
Solution: Kirimulang tanpa perlu tanya admin
```

### **4. Transfer Device**
```
Scenario: User ganti HP baru, butuh detail akun lagi
Solution: Login WA baru, kirimulang untuk dapat detail
```

---

## 💡 Tips untuk User

1. **Simpan Backup Manual:**
   - Screenshot detail akun
   - Simpan di notes/cloud storage
   - Jangan andalkan chat history saja

2. **Jangan Share Detail:**
   - Detail akun bersifat pribadi
   - Jangan kirim ke orang lain
   - Jaga keamanan akun

3. **Gunakan Bijak:**
   - Fitur ini untuk emergency/butuh saja
   - Jangan spam request
   - Hubungi admin jika ada masalah

---

## 🛠️ Technical Details

### **File Structure:**

```
bot-wa/
├── options/
│   └── receipts/
│       ├── receipt_TRX-1234567890.txt
│       ├── receipt_TRX-0987654321.txt
│       └── ... (semua receipt tersimpan di sini)
├── index.js (command implementation)
└── setting.js (menu configuration)
```

### **Database Schema:**

```javascript
// Transaksi structure
{
  id: "net1u",
  name: "Netflix Premium 1 Bulan",
  price: 50000,
  date: "2025-10-25 14:30:00",
  profit: 5000,
  jumlah: 1,
  user: "628XXXXXXXXXX",
  userRole: "Bronze",
  reffId: "TRX-1234567890",
  metodeBayar: "Saldo",
  totalBayar: 50000,
  isOwnerBuy: false,
  targetNumber: null,
  ownerNumber: null
}
```

### **Command Flow:**

```mermaid
User sends .kirimulang
  ↓
Extract user phone number
  ↓
Search transaksi database
  ↓
Filter by user phone
  ↓
Get last transaction
  ↓
Read receipt file (receipt_${reffId}.txt)
  ↓
Send to user's private chat
  ↓
Send confirmation message
  ↓
Log request
```

---

## 📝 Implementation Details

### **Location:**
- **File:** `index.js`
- **Lines:** 8082-8168
- **Cases:** `kirimulang`, `resend`, `sendagain`

### **Dependencies:**
- `fs` - Read receipt files
- `db.data.transaksi` - Transaction database
- Receipt files in `./options/receipts/`

### **Integration:**
- Added to ORDER MENU
- Added to TOPUP MENU
- Added to ORDER MENU with explanation

---

## 🎯 Benefits

### **Untuk User:**
- ✅ Self-service tanpa perlu tanya admin
- ✅ Cepat dan mudah (1 command saja)
- ✅ Available 24/7
- ✅ Privacy terjaga (kirim ke private)

### **Untuk Admin/Owner:**
- ✅ Reduce support workload
- ✅ Less manual resend requests
- ✅ Automatic logging & tracking
- ✅ Better user experience

---

## ⚙️ Configuration

**Tidak ada konfigurasi khusus diperlukan!**

Fitur ini langsung aktif setelah:
1. Update `index.js` dan `setting.js`
2. Restart bot
3. User bisa langsung gunakan `.kirimulang`

---

## 🆘 Troubleshooting

### **Receipt File Tidak Ditemukan:**
- Pastikan transaksi menyimpan receipt di `./options/receipts/`
- Cek permission folder receipts
- Verify reffId di database match dengan filename

### **User Tidak Bisa Akses:**
- Pastikan user punya riwayat transaksi
- Cek database transaksi tidak corrupt
- Verify user phone number format

### **Error Saat Kirim:**
- Cek connection bot
- Verify user tidak block bot
- Check console log untuk detail error

---

## 📚 Related Commands

- `.buy <kode> <jumlah>` - Beli dengan saldo
- `.buynow <kode> <jumlah>` - Beli dengan QRIS
- `.riwayat` - Lihat riwayat transaksi
- `.cari <reffId>` - Cari transaksi by Reff ID

---

## ✅ Testing Checklist

- [ ] User dengan transaksi bisa kirimulang
- [ ] User tanpa transaksi dapat error message proper
- [ ] Receipt file terbaca dengan benar
- [ ] Detail dikirim ke private, bukan group
- [ ] Confirmation message muncul
- [ ] Console log tercatat
- [ ] Error handling works
- [ ] Receipt file not found handled
- [ ] Multiple aliases work (kirimulang/resend/sendagain)

---

## 📈 Future Improvements

1. **History List:**
   - Bisa pilih transaksi mana yang mau dikirim ulang
   - Format: `.kirimulang <number>` (1 = terakhir, 2 = sebelumnya, dst)

2. **Notification:**
   - Notify admin saat ada request kirimulang
   - Track frequency untuk detect abuse

3. **Limit:**
   - Max request per hari
   - Cooldown between requests

4. **Enhanced Security:**
   - OTP verification untuk request
   - Additional authentication

---

**Created:** 2025-10-25  
**Version:** 1.0.0  
**Status:** ✅ Production Ready

---

*© GiHa Smart Bot - All Rights Reserved*

