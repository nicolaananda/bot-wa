# Receipt Management

Folder ini berisi file receipt transaksi yang disimpan otomatis setiap kali ada transaksi berhasil.

## Format File
- Nama file: `{reffId}.txt`
- Format: Text file dengan struktur receipt yang rapi
- Encoding: UTF-8

## API Endpoints

### 1. Get All Receipts
```
GET /api/dashboard/receipts
```
Mengembalikan daftar semua receipt dengan informasi metadata.

**Response:**
```json
{
  "success": true,
  "data": {
    "receipts": [
      {
        "reffId": "ABC123",
        "filename": "ABC123.txt",
        "createdAt": "2024-01-01T10:00:00.000Z",
        "modifiedAt": "2024-01-01T10:00:00.000Z",
        "size": 1024,
        "sizeFormatted": "1.0 KB"
      }
    ],
    "total": 1
  }
}
```

### 2. Get Specific Receipt Content
```
GET /api/dashboard/receipts/:reffId
```
Mengembalikan konten receipt berdasarkan reference ID.

**Response:**
```json
{
  "success": true,
  "data": {
    "reffId": "ABC123",
    "content": "Receipt content here...",
    "createdAt": "2024-01-01T10:00:00.000Z",
    "modifiedAt": "2024-01-01T10:00:00.000Z",
    "size": 1024,
    "sizeFormatted": "1.0 KB"
  }
}
```

### 3. Download Receipt File
```
GET /api/dashboard/receipts/:reffId/download
```
Mengunduh file receipt dalam format .txt

### 4. Get Transaction with Receipt Content
```
GET /api/dashboard/transactions/:reffId/with-receipt
```
Menggabungkan data transaksi dengan isi receipt untuk kemudahan frontend.

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction": {
      "reffId": "ABC123",
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
      "content": "Receipt content here...",
      "reffId": "ABC123"
    }
  }
}
```

### 5. Delete Receipt
```
DELETE /api/dashboard/receipts/:reffId
```
Menghapus file receipt berdasarkan reference ID.

**Response:**
```json
{
  "success": true,
  "message": "Receipt deleted successfully"
}
```

## Struktur Receipt

Setiap receipt berisi:
- Informasi transaksi (ID, produk, harga, dll)
- Detail akun yang dibeli
- Syarat & Ketentuan (SNK)
- Timestamp pembuatan receipt

**Catatan Penting:** Receipt menggunakan format yang sama persis dengan `detailAkunCustomer` yang dikirim ke customer via WhatsApp, sehingga memastikan konsistensi antara pesan yang diterima customer dan file receipt yang disimpan.

## Authentication
Semua endpoint dapat diakses tanpa authentication karena dashboard tidak memiliki fitur login.
