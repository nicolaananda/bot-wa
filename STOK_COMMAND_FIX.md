# 🔧 Fix Command Stok WhatsApp Bot

## 📋 **Masalah yang Ditemukan**

Command `stok` tidak berfungsi meskipun:
- ✅ **Buy/ceksaldo** - Berfungsi normal
- ❌ **Command "stok"** - Tidak berfungsi

## 🔍 **Root Cause Analysis**

### **1. Database Access Issues**
- Akses tidak aman ke `db.data.produk`
- Tidak ada error handling untuk database yang rusak
- Property access tanpa validasi

### **2. Function Dependencies**
- `hargaProduk()` function mungkin tidak tersedia
- `toRupiah()` function mungkin error
- User role tidak terdefinisi dengan benar

### **3. Error Handling**
- Tidak ada try-catch untuk command execution
- Silent failures pada product processing
- Tidak ada logging untuk debugging

## 🛠️ **Solusi yang Diterapkan**

### **1. Enhanced Error Handling**
```javascript
case 'stok': case 'stock': {
  try {
    console.log('🔄 Executing stok command...');
    
    // Check database structure
    if (!db || !db.data || !db.data.produk) {
      console.log('❌ Database tidak tersedia');
      return reply("❌ Database tidak tersedia atau rusak");
    }
    
    // ... rest of the code
    
  } catch (error) {
    console.error('❌ Error in stok command:', error);
    reply(`❌ Terjadi kesalahan pada command stok: ${error.message}`)
  }
}
```

### **2. Safe Property Access**
```javascript
// Before (unsafe)
teks += `*┊・ 🔐| Kode:* ${db.data.produk[i].id}`

// After (safe)
const produk = db.data.produk[i];
if (!produk) return;

const name = produk.name || 'Unknown';
const id = produk.id || i;
const desc = produk.desc || 'Tidak ada deskripsi';
const stokLength = produk.stok && Array.isArray(produk.stok) ? produk.stok.length : 0;
```

### **3. Function Validation**
```javascript
// Get price safely
let harga = 'Harga tidak tersedia';
try {
  if (typeof hargaProduk === 'function') {
    const userRole = db.data.users && db.data.users[sender] ? db.data.users[sender].role : 'bronze';
    const hargaValue = hargaProduk(i, userRole);
    if (hargaValue && typeof toRupiah === 'function') {
      harga = `Rp${toRupiah(hargaValue)}`;
    }
  }
} catch (error) {
  console.log('⚠️ Error getting price for product', i, ':', error.message);
  harga = 'Harga tidak tersedia';
}
```

## 🚀 **Cara Menggunakan Fix**

### **1. Jalankan Test Script**
```bash
chmod +x test-stok-command.sh
sudo ./test-stok-command.sh
```

### **2. Test Command Manual**
```
📱 Kirim pesan ke bot:
.stok
```

### **3. Monitor Logs**
```bash
pm2 logs bot-wa --lines 100
```

## 📊 **Expected Output**

### **Success Case**
```
🔄 Executing stok command...
✅ Stok command executed successfully
```

### **Error Case**
```
❌ Database tidak tersedia
⚠️ Error getting price for product netflix: hargaProduk is not defined
```

## 🔧 **Troubleshooting Steps**

### **Step 1: Check Database**
```bash
# Check if database exists
ls -la database.json

# Check database size
du -h database.json

# Validate JSON
python3 -m json.tool database.json
```

### **Step 2: Check Bot Status**
```bash
pm2 status
pm2 logs bot-wa --lines 50
```

### **Step 3: Test Individual Functions**
```bash
# Check if functions exist
grep -n "function hargaProduk" index.js
grep -n "function toRupiah" index.js
```

### **Step 4: Restart Bot**
```bash
pm2 restart bot-wa
```

## 📋 **Checklist Verifikasi**

- [ ] **Database Structure** - `db.data.produk` exists
- [ ] **Product Data** - At least one product in database
- [ ] **Function Dependencies** - `hargaProduk` and `toRupiah` available
- [ ] **User Role** - User has valid role (bronze/silver/gold)
- [ ] **Error Handling** - Try-catch blocks working
- [ ] **Logging** - Console logs showing execution

## 🚨 **Common Issues & Solutions**

### **Issue 1: "Database tidak tersedia"**
**Solution:**
```bash
# Check database file
ls -la database.json

# Restart bot
pm2 restart bot-wa
```

### **Issue 2: "hargaProduk is not defined"**
**Solution:**
```bash
# Check function definition
grep -n "function hargaProduk" index.js

# Restart bot to reload functions
pm2 restart bot-wa
```

### **Issue 3: "toRupiah is not defined"**
**Solution:**
```bash
# Check function definition
grep -n "function toRupiah" index.js

# Restart bot to reload functions
pm2 restart bot-wa
```

### **Issue 4: "No products in database"**
**Solution:**
```bash
# Add test product
echo '{"produk":{"test":{"id":"test","name":"Test Product","desc":"Test","priceB":1000,"priceS":800,"priceG":600,"profit":100,"terjual":0,"stok":["item1","item2"]}}}' > database.json

# Restart bot
pm2 restart bot-wa
```

## 📱 **Testing Commands**

### **Basic Test**
```
.stok
```

### **With Debug Info**
```
.debug stok
```

### **Check Database**
```
.checkdb
```

## 🔄 **Maintenance**

### **Daily**
- [ ] Check bot status: `pm2 status`
- [ ] Monitor logs: `pm2 logs bot-wa --lines 50`
- [ ] Test stok command: `.stok`

### **Weekly**
- [ ] Restart bot: `pm2 restart bot-wa`
- [ ] Check database integrity
- [ ] Review error logs

### **Monthly**
- [ ] Update bot code
- [ ] Backup database
- [ ] Review performance

## 📞 **Support**

Jika masih mengalami masalah:

1. **Check logs:** `pm2 logs bot-wa --lines 100`
2. **Verify database:** Check `database.json` structure
3. **Test functions:** Verify `hargaProduk` and `toRupiah`
4. **Restart bot:** `pm2 restart bot-wa`
5. **Contact support:** Share error logs

## 📚 **Related Files**

- `index.js` - Main bot file with stok command
- `fix-stok-command.js` - Debug and fix functions
- `test-stok-command.sh` - Testing script
- `database.json` - Product database
- `setting.js` - Bot configuration

---

**Last Updated:** $(date)
**Version:** 1.0.0
**Status:** ✅ Fixed
**Maintainer:** System Administrator 