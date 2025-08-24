# 💰 Cek Saldo Feature Documentation - WhatsApp Bot

## 📋 **Overview**

Fitur `ceksaldo` yang memungkinkan semua user untuk cek saldo sendiri, dan khusus owner untuk cek saldo user lain dengan reply/quote reply pesan di grup atau private chat.

## 🎯 **Fitur Utama**

### **1. Cek Saldo Sendiri (Semua User)**
- **Command:** `ceksaldo`
- **Permission:** ✅ Semua user
- **Fungsi:** Cek saldo sendiri dari database
- **Lokasi:** Bisa digunakan di private chat atau grup

### **2. Cek Saldo User Lain (Owner Only)**
- **Command:** `ceksaldo` + Reply/Quote Reply
- **Permission:** ❌ Hanya owner
- **Fungsi:** Cek saldo user lain dengan reply pesan mereka
- **Lokasi:** Bisa digunakan di private chat atau grup

## 🚀 **Cara Penggunaan**

### **Untuk Semua User - Cek Saldo Sendiri:**
```
ceksaldo
```

**Response:**
```
*💰 Cek Saldo Sendiri*

👤 *User:* User 2985
🆔 *ID:* 6281389592985
💳 *Saldo:* Rp75.000

💡 *Tips Owner:* Reply/quote reply pesan user lain untuk cek saldo mereka.
```

### **Untuk Owner - Cek Saldo User Lain:**
1. **Reply/Quote Reply** pesan user yang ingin di-cek saldonya
2. **Ketik command:** `ceksaldo`

**Response:**
```
*💰 Cek Saldo User Lain (Owner Only)*

👤 *User:* User 3399
🆔 *ID:* 6281343313399
💳 *Saldo:* Rp50.000

👑 *Checked by:* Owner
```

## 🔒 **Permission System**

### **User Biasa:**
- ✅ Bisa cek saldo sendiri
- ❌ Tidak bisa cek saldo user lain
- ❌ Tidak bisa reply/quote reply untuk cek saldo orang lain
- ✅ Bisa pakai di private chat atau grup

### **Owner:**
- ✅ Bisa cek saldo sendiri
- ✅ Bisa cek saldo user lain dengan reply/quote reply
- ✅ Akses penuh ke semua fitur
- ✅ Bisa pakai di private chat atau grup

## 📱 **Workflow Penggunaan**

### **Workflow User Biasa:**
1. **Private Chat:** Ketik `ceksaldo` → Bot reply dengan saldo sendiri
2. **Grup Chat:** Ketik `ceksaldo` → Bot reply dengan saldo sendiri
3. **Tips ditampilkan:** Informasi untuk owner

### **Workflow Owner:**
1. **Cek Saldo Sendiri:** 
   - Private/Grup: Ketik `ceksaldo`
   - Bot reply dengan saldo sendiri
2. **Cek Saldo User Lain:** 
   - Reply/quote reply pesan user di grup atau private
   - Ketik `ceksaldo`
   - Bot reply dengan saldo user tersebut

## 🚨 **Error Handling**

### **User Not Found:**
```
❌ User dengan ID 6281234567890 tidak ditemukan dalam database.

💡 *Tips:* User harus sudah pernah melakukan transaksi untuk tersimpan dalam database.
```

### **Permission Denied:**
```
❌ Maaf, hanya owner yang bisa cek saldo user lain.

💡 *Tips:* Gunakan command ini tanpa reply untuk cek saldo sendiri.
```

### **Invalid Reply:**
```
❌ Tidak bisa mendapatkan informasi user dari pesan yang di-reply.

💡 *Tips:* Reply/quote reply pesan user lain yang ingin di-cek saldonya.
```

### **No User Data:**
```
❌ Data user tidak ditemukan.

💡 *Tips:* User harus sudah pernah melakukan transaksi untuk tersimpan dalam database.
```

## 🧪 **Testing Scenarios**

### **Test Case 1: User Biasa Cek Saldo Sendiri (Private)**
- **Input:** `ceksaldo`
- **Expected:** Saldo sendiri ditampilkan
- **Permission:** ✅ Allowed

### **Test Case 2: User Biasa Cek Saldo Sendiri (Grup)**
- **Input:** `ceksaldo`
- **Expected:** Saldo sendiri ditampilkan
- **Permission:** ✅ Allowed

### **Test Case 3: User Biasa Reply untuk Cek Saldo Lain (Private/Grup)**
- **Input:** Reply pesan + `ceksaldo`
- **Expected:** Permission denied message
- **Permission:** ❌ Denied

### **Test Case 4: Owner Cek Saldo Sendiri (Private/Grup)**
- **Input:** `ceksaldo`
- **Expected:** Saldo sendiri ditampilkan
- **Permission:** ✅ Allowed

### **Test Case 5: Owner Cek Saldo User Lain (Private)**
- **Input:** Reply pesan + `ceksaldo`
- **Expected:** Saldo user lain ditampilkan
- **Permission:** ✅ Allowed

### **Test Case 6: Owner Cek Saldo User Lain (Grup)**
- **Input:** Reply pesan + `ceksaldo`
- **Expected:** Saldo user lain ditampilkan
- **Permission:** ✅ Allowed

### **Test Case 7: User Tidak Ada di Database**
- **Input:** Reply pesan user baru + `ceksaldo`
- **Expected:** User not found message
- **Permission:** ✅ Allowed (for owner)

## 🔧 **Technical Implementation**

### **Command Handler Structure:**
```javascript
case 'ceksaldo': {
  // Check if this is a reply/quote reply
  if (m.quoted) {
    // Only owner can check other people's saldo
    if (!isOwner) {
      reply(`❌ Maaf, hanya owner yang bisa cek saldo user lain.`, { quoted: m });
      return;
    }
    
    // Get quoted message sender and check their saldo
    // ... implementation details
  } else {
    // Check own saldo (all users can do this)
    // ... implementation details
  }
}
```

### **Key Features:**
1. **Reply Detection:** Menggunakan `m.quoted` untuk detect reply/quote reply
2. **Permission Check:** `isOwner` untuk restrict access
3. **User ID Extraction:** Extract user ID dari quoted message
4. **Database Lookup:** Cari user data di database
5. **Saldo Calculation:** Parse dan format saldo dengan `toRupiah()`
6. **Group Support:** Bisa digunakan di private chat dan grup

## 📊 **Database Requirements**

### **Users Table Structure:**
```javascript
{
  "6281389592985": {
    "username": "User 2985",
    "saldo": 75000,
    "role": "bronze",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

### **Required Fields:**
- `saldo`: Balance user (number)
- `username`: Nama user (string)
- `isActive`: Status aktif user (boolean)

## 📋 **Implementation Checklist**

- [x] ✅ Command handler untuk `ceksaldo`
- [x] ✅ Permission check untuk owner
- [x] ✅ Reply/quote reply detection
- [x] ✅ User ID extraction dari quoted message
- [x] ✅ Database lookup untuk user data
- [x] ✅ Saldo formatting dengan `toRupiah()`
- [x] ✅ Error handling untuk berbagai scenario
- [x] ✅ User-friendly messages dan tips
- [x] ✅ Owner-only restriction untuk cek saldo user lain
- [x] ✅ Support untuk private chat dan grup
- [x] ✅ Clean code structure tanpa duplikasi

## 🔄 **Future Enhancements**

### **Potential Features:**
1. **Admin Role:** Tambah role admin yang bisa cek saldo user lain
2. **Saldo History:** Tampilkan riwayat perubahan saldo
3. **Saldo Statistics:** Statistik saldo user (min, max, average)
4. **Bulk Check:** Owner bisa cek saldo multiple user sekaligus
5. **Saldo Alerts:** Notifikasi jika saldo user di bawah threshold

### **Security Improvements:**
1. **Rate Limiting:** Batasi jumlah request per user
2. **Audit Log:** Log semua akses ke saldo user lain
3. **Encryption:** Encrypt saldo data di database
4. **Session Management:** Timeout untuk permission owner

## 📞 **Support & Troubleshooting**

### **Common Issues:**
1. **Command tidak berfungsi:** Check apakah bot online dan command terdaftar
2. **Permission denied:** Pastikan user adalah owner
3. **User not found:** Check apakah user ada di database
4. **Saldo tidak akurat:** Sync database dengan transaksi terbaru

### **Debug Commands:**
```bash
# Check bot status
pm2 status

# Check database
npm run backup-health

# Check logs
pm2 logs bot-wa
```

## 🎉 **Status Implementasi**

**Status:** ✅ FULLY IMPLEMENTED & TESTED  
**Last Updated:** 2024-01-15  
**Maintainer:** System Administrator  
**Next Review:** 2024-02-15

### **✅ Fitur yang Sudah Selesai:**
- [x] Cek saldo sendiri untuk semua user
- [x] Cek saldo user lain untuk owner (dengan reply/quote reply)
- [x] Support private chat dan grup
- [x] Permission system yang aman
- [x] Error handling yang lengkap
- [x] Clean code structure
- [x] Dokumentasi lengkap

---

**Fitur siap digunakan! 🚀** 