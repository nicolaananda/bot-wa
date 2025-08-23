# Dashboard API Documentation

Dashboard API yang membaca data dari `database.json` untuk menampilkan statistik dan informasi transaksi.

## Fitur

- 📊 **Dashboard Overview** - Ringkasan total transaksi, pendapatan, dan statistik harian
- 📈 **Chart Data** - Data harian dan bulanan untuk grafik
- 👥 **User Management** - Statistik user, aktivitas, dan transaksi per user
- 🛍️ **Product Analytics** - Statistik produk dan penjualan
- 🔍 **Transaction Search** - Pencarian transaksi berdasarkan reff ID
- 📤 **Data Export** - Export data ke berbagai format
- ⚡ **Real-time Data** - Data langsung dari database.json

## Instalasi

1. Install dependencies:
```bash
npm install express cors
```

2. Pastikan file `database.json` ada di folder yang sama dengan `dashboard-api.js`

## Cara Menjalankan

```bash
node dashboard-api.js
```

Server akan berjalan di port 3000 (atau port yang didefinisikan di environment variable PORT).

## API Endpoints

### 1. Dashboard Overview
```
GET /api/dashboard/overview
```
**Response:**
```json
{
  "success": true,
  "data": {
    "totalTransaksi": 150,
    "totalPendapatan": 2500000,
    "transaksiHariIni": 12,
    "pendapatanHariIni": 180000,
    "metodeBayar": {
      "saldo": 89,
      "qris": 61,
      "unknown": 0
    },
    "topUsers": [...]
  }
}
```

### 2. Daily Chart Data
```
GET /api/dashboard/chart/daily
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2025-01-20",
      "transaksi": 5,
      "pendapatan": 75000
    }
  ]
}
```

### 3. Monthly Chart Data
```
GET /api/dashboard/chart/monthly
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "month": "2025-01",
      "transaksi": 45,
      "pendapatan": 675000
    }
  ]
}
```

### 4. User Activity
```
GET /api/dashboard/users/activity
```
**Response:**
```json
{
  "success": true,
  "data": [
    {
      "user": "6281234567890",
      "totalTransaksi": 15,
      "totalSpent": 250000,
      "lastActivity": "2025-01-22 15:30:00",
      "metodeBayar": {
        "saldo": 10,
        "qris": 5,
        "unknown": 0
      }
    }
  ]
}
```

### 5. User Transactions
```
GET /api/dashboard/users/:userId/transactions
```
**Response:**
```json
{
  "success": true,
  "data": {
    "user": "6281234567890",
    "totalTransaksi": 15,
    "totalSpent": 250000,
    "transaksi": [...]
  }
}
```

### 6. Search Transaction by Reff ID
```
GET /api/dashboard/transactions/search/:reffId
```
**Response:**
```json
{
  "success": true,
  "data": {
    "reffId": "ABC123",
    "user": "6281234567890",
    "userRole": "bronze",
    "produk": "NETFLIX 1 BULAN",
    "harga": 13700,
    "profit": 274
  }
}
```

### 7. Export Data
```
GET /api/dashboard/export/:format
```
**Format yang didukung:** `json`, `csv`

### 8. User Statistics
```
GET /api/dashboard/users/stats
```
**Response:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 25,
    "totalSaldo": 5000000,
    "userStats": {
      "bronze": {
        "count": 20,
        "totalSaldo": 4000000
      }
    },
    "averageSaldo": 200000
  }
}
```

### 9. Product Statistics
```
GET /api/dashboard/products/stats
```
**Response:**
```json
{
  "success": true,
  "data": {
    "totalProducts": 5,
    "totalSold": 150,
    "products": [...],
    "topProducts": [...]
  }
}
```

### 10. Recent Transactions
```
GET /api/dashboard/transactions/recent?limit=20
```
**Query Parameters:**
- `limit` (optional): Jumlah transaksi yang ditampilkan (default: 20)

## Struktur Database

API mengharapkan struktur `database.json` dengan format:

```json
{
  "transaksi": [
    {
      "id": "product_id",
      "name": "Product Name",
      "price": "13700",
      "date": "2025-01-22 15:30:00",
      "jumlah": 1,
      "user": "6281234567890",
      "metodeBayar": "Saldo",
      "totalBayar": 13700,
      "reffId": "ABC123"
    }
  ],
  "users": {
    "6281234567890": {
      "saldo": 100000,
      "role": "bronze"
    }
  },
  "profit": {
    "bronze": 1000,
    "silver": 500,
    "gold": 250
  },
  "persentase": {
    "bronze": 2,
    "silver": 1,
    "gold": 1
  }
}
```

## Testing

Untuk test API, jalankan:

```bash
npm install axios
node test-dashboard-api.js
```

## Error Handling

API akan mengembalikan error response dengan format:

```json
{
  "success": false,
  "error": "Error message"
}
```

## CORS

API sudah dikonfigurasi dengan CORS untuk memungkinkan akses dari frontend yang berbeda domain.

## Notes

- API akan otomatis handle missing fields dengan default values
- Data diambil secara real-time dari `database.json`
- Semua endpoint mengembalikan response dengan format yang konsisten
- Error handling yang robust untuk berbagai skenario 