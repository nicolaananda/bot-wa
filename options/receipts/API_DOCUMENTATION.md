# 📋 Receipt Management API Documentation

Dokumentasi lengkap untuk API Receipt Management yang memungkinkan frontend mengakses dan mengelola file receipt transaksi.

## 🌐 Base URL
```
https://api-botwa.nicola.id
```

## 📚 API Endpoints

### 1. 📋 Get All Receipts
Mendapatkan daftar semua file receipt yang tersimpan.

**Endpoint:** `GET /api/dashboard/receipts`

**Response:**
```json
{
  "success": true,
  "data": {
    "receipts": [
      {
        "reffId": "69942B1069",
        "filename": "69942B1069.txt",
        "createdAt": "2025-09-20T11:09:42.000Z",
        "modifiedAt": "2025-09-20T11:09:42.000Z",
        "size": 1024,
        "sizeFormatted": "1.0 KB"
      },
      {
        "reffId": "ABC123DEF",
        "filename": "ABC123DEF.txt",
        "createdAt": "2025-09-21T08:15:30.000Z",
        "modifiedAt": "2025-09-21T08:15:30.000Z",
        "size": 2048,
        "sizeFormatted": "2.0 KB"
      }
    ],
    "total": 2
  }
}
```

**Frontend Usage:**
```javascript
const response = await fetch('/api/dashboard/receipts');
const data = await response.json();
console.log(`Total receipts: ${data.data.total}`);
data.data.receipts.forEach(receipt => {
  console.log(`Receipt ${receipt.reffId}: ${receipt.sizeFormatted}`);
});
```

---

### 2. 📄 Get Specific Receipt Content
Mendapatkan konten lengkap dari file receipt berdasarkan reference ID.

**Endpoint:** `GET /api/dashboard/receipts/:reffId`

**Parameters:**
- `reffId` (string, required): Reference ID transaksi

**Response:**
```json
{
  "success": true,
  "data": {
    "reffId": "69942B1069",
    "content": "*📦 Produk:* Sewa Zoom 100P 1 Jam\n*📅 Tanggal:* 20 September 2025\n*⏰ Jam:* 18:09:39 WIB\n\n│ 📧 Email: 1\n│ 🔐 Password: Tidak ada\n│ 👤 Profil: Tidak ada\n│ 🔢 Pin: Tidak ada\n│ 🔒 2FA: Tidak ada\n\n*╭────「 SYARAT & KETENTUAN 」────╮*\n\n*📋 SNK PRODUK: Sewa Zoom 100P 1 Jam*\n\nHubungi admin: Nicola, Gigi, Naga\n\n*⚠️ PENTING:*\n• Baca dan pahami SNK sebelum menggunakan akun\n• Akun yang sudah dibeli tidak dapat dikembalikan\n• Hubungi admin jika ada masalah dengan akun\n\n*╰────「 END SNK 」────╯*",
    "createdAt": "2025-09-20T11:09:42.000Z",
    "modifiedAt": "2025-09-20T11:09:42.000Z",
    "size": 1024,
    "sizeFormatted": "1.0 KB"
  }
}
```

**Frontend Usage:**
```javascript
const reffId = '69942B1069';
const response = await fetch(`/api/dashboard/receipts/${reffId}`);
const data = await response.json();

if (data.success) {
  // Tampilkan konten receipt
  document.getElementById('receipt-content').innerText = data.data.content;
} else {
  console.error('Receipt not found');
}
```

---

### 3. 🔗 Get Transaction with Receipt (Recommended)
**Endpoint yang paling direkomendasikan** - menggabungkan data transaksi dengan konten receipt dalam satu API call.

**Endpoint:** `GET /api/dashboard/transactions/:reffId/with-receipt`

**Parameters:**
- `reffId` (string, required): Reference ID transaksi

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "reffId": "69942B1069",
      "user": "6287887842985",
      "metodeBayar": "Saldo",
      "userRole": "bronze",
      "produk": "Sewa Zoom 100P 1 Jam",
      "idProduk": "zoom1j",
      "harga": 2000,
      "jumlah": 1,
      "totalBayar": 2000,
      "tanggal": "2025-09-20 18:09:42",
      "profit": 40
    },
    "receipt": {
      "exists": true,
      "content": "*📦 Produk:* Sewa Zoom 100P 1 Jam\n*📅 Tanggal:* 20 September 2025\n*⏰ Jam:* 18:09:39 WIB\n\n│ 📧 Email: 1\n│ 🔐 Password: Tidak ada\n│ 👤 Profil: Tidak ada\n│ 🔢 Pin: Tidak ada\n│ 🔒 2FA: Tidak ada\n\n*╭────「 SYARAT & KETENTUAN 」────╮*\n\n*📋 SNK PRODUK: Sewa Zoom 100P 1 Jam*\n\nHubungi admin: Nicola, Gigi, Naga\n\n*⚠️ PENTING:*\n• Baca dan pahami SNK sebelum menggunakan akun\n• Akun yang sudah dibeli tidak dapat dikembalikan\n• Hubungi admin jika ada masalah dengan akun\n\n*╰────「 END SNK 」────╯*",
      "reffId": "69942B1069"
    }
  }
}
```

**Frontend Usage (Recommended):**
```javascript
const reffId = '69942B1069';
const response = await fetch(`/api/dashboard/transactions/${reffId}/with-receipt`);
const data = await response.json();

if (data.success) {
  const transaction = data.data.transaction;
  const receipt = data.data.receipt;
  
  // Tampilkan data transaksi
  console.log(`Produk: ${transaction.produk}`);
  console.log(`Harga: Rp${transaction.harga.toLocaleString()}`);
  console.log(`Tanggal: ${transaction.tanggal}`);
  
  // Tampilkan receipt jika ada
  if (receipt.exists) {
    document.getElementById('receipt-content').innerText = receipt.content;
  } else {
    console.log('Receipt tidak tersedia');
  }
}
```

---

### 4. 📥 Download Receipt File
Mengunduh file receipt dalam format .txt.

**Endpoint:** `GET /api/dashboard/receipts/:reffId/download`

**Parameters:**
- `reffId` (string, required): Reference ID transaksi

**Response:** File .txt akan diunduh langsung

**Frontend Usage:**
```javascript
const reffId = '69942B1069';
const link = document.createElement('a');
link.href = `/api/dashboard/receipts/${reffId}/download`;
link.download = `${reffId}.txt`;
link.click();
```

---

### 5. 🗑️ Delete Receipt
Menghapus file receipt berdasarkan reference ID.

**Endpoint:** `DELETE /api/dashboard/receipts/:reffId`

**Parameters:**
- `reffId` (string, required): Reference ID transaksi

**Response:**
```json
{
  "success": true,
  "message": "Receipt deleted successfully"
}
```

**Frontend Usage:**
```javascript
const reffId = '69942B1069';
const response = await fetch(`/api/dashboard/receipts/${reffId}`, {
  method: 'DELETE'
});
const data = await response.json();

if (data.success) {
  console.log('Receipt berhasil dihapus');
} else {
  console.error('Gagal menghapus receipt');
}
```

---

## 🎯 Best Practices untuk Frontend

### 1. **Gunakan Endpoint Gabungan**
```javascript
// ✅ RECOMMENDED: Gunakan endpoint gabungan
const response = await fetch(`/api/dashboard/transactions/${reffId}/with-receipt`);

// ❌ AVOID: Multiple API calls
const transactionResponse = await fetch(`/api/dashboard/transactions/search/${reffId}`);
const receiptResponse = await fetch(`/api/dashboard/receipts/${reffId}`);
```

### 2. **Error Handling**
```javascript
try {
  const response = await fetch(`/api/dashboard/transactions/${reffId}/with-receipt`);
  const data = await response.json();
  
  if (!data.success) {
    throw new Error(data.message || 'API request failed');
  }
  
  // Process data
  console.log(data.data);
} catch (error) {
  console.error('Error:', error.message);
  // Show user-friendly error message
}
```

### 3. **Loading States**
```javascript
const [loading, setLoading] = useState(false);
const [receiptData, setReceiptData] = useState(null);

const fetchReceipt = async (reffId) => {
  setLoading(true);
  try {
    const response = await fetch(`/api/dashboard/transactions/${reffId}/with-receipt`);
    const data = await response.json();
    setReceiptData(data.data);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    setLoading(false);
  }
};
```

### 4. **Format Receipt Content**
```javascript
// Receipt content sudah dalam format yang siap ditampilkan
const formatReceiptForDisplay = (content) => {
  return content
    .replace(/\*([^*]+)\*/g, '<strong>$1</strong>') // Bold text
    .replace(/\n/g, '<br>') // Line breaks
    .replace(/│/g, '&nbsp;&nbsp;│'); // Indentation
};
```

---

## 📊 Response Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 404 | Receipt/Transaction not found |
| 500 | Internal server error |

---

## 🔧 Testing

### Test dengan cURL:
```bash
# Get all receipts
curl -X GET "https://api-botwa.nicola.id/api/dashboard/receipts"

# Get specific receipt
curl -X GET "https://api-botwa.nicola.id/api/dashboard/receipts/69942B1069"

# Get transaction with receipt
curl -X GET "https://api-botwa.nicola.id/api/dashboard/transactions/69942B1069/with-receipt"

# Download receipt
curl -X GET "https://api-botwa.nicola.id/api/dashboard/receipts/69942B1069/download" -o receipt.txt
```

---

## 📝 Notes

- Semua endpoint **tidak memerlukan authentication**
- Receipt content menggunakan format yang sama dengan pesan WhatsApp
- File receipt disimpan dengan encoding UTF-8
- Receipt otomatis dibuat saat transaksi berhasil
- Format receipt konsisten dengan `detailAkunCustomer`

---

## 🆘 Support

Jika ada masalah dengan API, silakan hubungi:
- **Developer**: Nicola Ananda
- **Repository**: https://github.com/nicolaananda/bot-wa
- **API Base**: https://api-botwa.nicola.id
