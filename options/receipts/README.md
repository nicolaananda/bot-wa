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

### 4. Delete Receipt
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

## Authentication
Semua endpoint dapat diakses tanpa authentication karena dashboard tidak memiliki fitur login.
