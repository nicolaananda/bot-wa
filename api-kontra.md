# Dashboard API Contract

Dokumen kontrak API untuk konsumsi frontend dashboard (Next.js, Vite, atau framework lain) terhadap layanan `options/dashboard-api.js`.

---

## 1. Informasi Umum

### Base URL

| Environment | URL |
|-------------|-----|
| Production HTTPS | `https://dash.nicola.id` |
| Production HTTP  | `http://dash.nicola.id` |
| Local Dev        | `http://localhost:3002` |
| Local HTTPS      | `https://localhost:3443` |

> Port default: HTTP `3002`, HTTPS `3443` (override via env `PORT` / `HTTPS_PORT`).

### Format Response

Seluruh endpoint mengembalikan JSON dengan amplop standar berikut.

**Sukses**
```json
{
  "success": true,
  "data": { /* payload */ },
  "message": "optional message"
}
```

**Gagal**
```json
{
  "success": false,
  "error": "human readable message",
  "message": "optional alternative field"
}
```

> Catatan: beberapa endpoint memakai field `error`, beberapa lainnya memakai `message`. Frontend disarankan menangani keduanya.

### HTTP Status Codes

| Status | Arti |
|--------|------|
| 200 | OK |
| 400 | Bad Request / payload invalid |
| 401 | Unauthorized (Bearer token salah / tidak ada) |
| 403 | Forbidden (admin tidak diizinkan) |
| 404 | Resource tidak ditemukan |
| 409 | Conflict (idempotency / duplicate) |
| 500 | Internal Server Error |

### Authentication

Sebagian besar endpoint dashboard publik (read-only) **tidak** memerlukan autentikasi.
Endpoint admin dan operasi tulis (CRUD produk, stock, saldo, role, pin) memerlukan:

```
Authorization: Bearer <DB_TOKEN>
```

Dengan `DB_TOKEN` diset via env `DB_TOKEN` atau `VITE_DB_TOKEN` di server.

Endpoint admin user-management juga memerlukan header tambahan:

```
X-Admin-User: 6281389592985   # nomor wa admin owner (digit only)
```

Hanya nomor berikut yang diizinkan sebagai admin owner:
- `6281389592985`
- `6285235540944`

### CORS

Origin yang diizinkan:
- `https://dash.nicola.id`, `http://dash.nicola.id`
- `https://pos.nicola.id`, `https://api.nicola.id`, `https://mid.nicola.id`
- `https://dash.ghzm.us`
- `http://localhost:8080`, `http://localhost:3002`, `http://localhost:5173`, `http://localhost:4173`
- Subdomain wildcard: `*.nicola.id`

`credentials: true`, methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`.

### Konvensi

- Semua amount/saldo dalam **IDR** (integer, tanpa desimal).
- Tanggal: ISO 8601 string atau `YYYY-MM-DD HH:mm:ss`.
- `userId` dapat berbentuk:
  - tanpa suffix: `6281234567890`
  - dengan suffix: `6281234567890@s.whatsapp.net`
- `role` user: `bronze | silver | gold | admin`.

---

## 2. Endpoint Index

### Dashboard Overview & Charts
- [GET /api/dashboard/overview](#21-get-apidashboardoverview)
- [GET /api/dashboard/chart/daily](#22-get-apidashboardchartdaily)
- [GET /api/dashboard/chart/monthly](#23-get-apidashboardchartmonthly)
- [GET /api/dashboard/realtime](#24-get-apidashboardrealtime)

### Users
- [GET /api/dashboard/users/activity](#31-get-apidashboardusersactivity)
- [GET /api/dashboard/users/all](#32-get-apidashboardusersall)
- [GET /api/dashboard/users/stats](#33-get-apidashboarduserstats)
- [GET /api/dashboard/users/behavior](#34-get-apidashboardusersbehavior)
- [GET /api/dashboard/users/:userId/transactions](#35-get-apidashboardusersuseridtransactions)
- [GET /api/dashboard/users/:userId/saldo/history](#36-get-apidashboardusersuseridsaldohistory)
- [GET /api/dashboard/saldo/history](#37-get-apidashboardsaldohistory)

### Transactions
- [GET /api/dashboard/transactions/recent](#41-get-apidashboardtransactionsrecent)
- [GET /api/dashboard/transactions/search/:reffId](#42-get-apidashboardtransactionssearchreffid)
- [GET /api/dashboard/transactions/:reffId/with-receipt](#43-get-apidashboardtransactionsreffidwith-receipt)

### Products
- [GET /api/dashboard/products/stats](#51-get-apidashboardproductsstats)
- [GET /api/dashboard/products/performance](#52-get-apidashboardproductsperformance)
- [POST /api/dashboard/products](#53-post-apidashboardproducts) (Auth)
- [GET /api/dashboard/products/:productId](#54-get-apidashboardproductsproductid)
- [PATCH /api/dashboard/products/:productId](#55-patch-apidashboardproductsproductid) (Auth)
- [DELETE /api/dashboard/products/:productId](#56-delete-apidashboardproductsproductid) (Auth)

### Stock Management
- [GET /api/dashboard/products/stock](#61-get-apidashboardproductsstock)
- [GET /api/dashboard/products/stock/summary](#62-get-apidashboardproductsstocksummary)
- [GET /api/dashboard/products/stock/alerts](#63-get-apidashboardproductsstockalerts)
- [GET /api/dashboard/products/stock/analytics](#64-get-apidashboardproductsstockanalytics)
- [GET /api/dashboard/products/stock/report](#65-get-apidashboardproductsstockreport)
- [GET /api/dashboard/products/stock/export](#66-get-apidashboardproductsstockexport)
- [POST /api/dashboard/products/stock/bulk-update](#67-post-apidashboardproductsstockbulk-update)
- [PUT /api/dashboard/products/:productId/stock](#68-put-apidashboardproductsproductidstock)
- [POST /api/dashboard/products/:productId/stock/item](#69-post-apidashboardproductsproductidstockitem)
- [PATCH /api/dashboard/products/:productId/stock/item](#610-patch-apidashboardproductsproductidstockitem)
- [DELETE /api/dashboard/products/:productId/stock/item](#611-delete-apidashboardproductsproductidstockitem)
- [GET /api/dashboard/products/:productId/stock/details](#612-get-apidashboardproductsproductidstockdetails)
- [GET /api/dashboard/products/:productId/stock/history](#613-get-apidashboardproductsproductidstockhistory)

### Analytics
- [GET /api/dashboard/analytics/advanced](#71-get-apidashboardanalyticsadvanced)
- [GET /api/dashboard/finance/analytics](#72-get-apidashboardfinanceanalytics)
- [GET /api/dashboard/predictions](#73-get-apidashboardpredictions)

### Receipts
- [GET /api/dashboard/receipts](#81-get-apidashboardreceipts)
- [GET /api/dashboard/receipts/:reffId](#82-get-apidashboardreceiptsreffid)
- [GET /api/dashboard/receipts/:reffId/download](#83-get-apidashboardreceiptsreffiddownload)
- [DELETE /api/dashboard/receipts/:reffId](#84-delete-apidashboardreceiptsreffid) (Auth)

### Admin User Management (Auth + X-Admin-User)
- [GET /api/admin/users](#91-get-apiadminusers)
- [PATCH /api/admin/users/:userId/saldo](#92-patch-apiadminusersuseridsaldo)
- [POST /api/admin/users/:userId/pin](#93-post-apiadminusersuseridpin)
- [PATCH /api/admin/users/:userId/role](#94-patch-apiadminusersuseridrole)
- [GET /api/admin/audit](#95-get-apiadminaudit)

### Export & Logs
- [GET /api/dashboard/export/:format](#101-get-apidashboardexportformat)
- [GET /logs](#102-get-logs)
- [GET /logs/stream](#103-get-logsstream)
- [GET /logs/sse](#104-get-logssse)

---

## 2. Dashboard Overview & Charts

### 2.1 GET /api/dashboard/overview

Mengembalikan ringkasan agregat untuk halaman utama dashboard.

**Request**
- Method: `GET`
- Auth: tidak

**Response 200**
```json
{
  "success": true,
  "data": {
    "totalUsers": 0,
    "totalTransaksi": 0,
    "totalRevenue": 0,
    "totalProfit": 0,
    "totalSaldo": 0,
    "transaksiHariIni": 0,
    "revenueHariIni": 0
  }
}
```

> Bentuk persis dari `data` mengikuti `getDashboardData()` di `options/dashboard-helper.js`.

---

### 2.2 GET /api/dashboard/chart/daily

Data chart harian (transaksi & revenue per hari).

**Response 200**
```json
{
  "success": true,
  "data": [
    { "date": "2025-05-01", "transactions": 12, "revenue": 350000, "profit": 25000 }
  ]
}
```

---

### 2.3 GET /api/dashboard/chart/monthly

Sama dengan daily namun granularity per bulan.

**Response 200**
```json
{
  "success": true,
  "data": [
    { "month": "2025-05", "transactions": 320, "revenue": 9500000, "profit": 720000 }
  ]
}
```

---

### 2.4 GET /api/dashboard/realtime

Data realtime untuk widget live dashboard.

**Response 200**
```json
{
  "success": true,
  "data": {
    "timestamp": "2025-05-18T03:00:00.000Z",
    "today": {
      "transactions": 32,
      "revenue": 850000,
      "avgOrderValue": 26562,
      "topProducts": [
        { "id": "netflix1b", "name": "Netflix 1 Bulan", "sold": 8, "revenue": 240000 }
      ]
    },
    "last24h": {
      "transactions": 41,
      "revenue": 1100000
    },
    "realtime": {
      "activeUsers": 56,
      "totalUsers": 312,
      "conversionRate": 17.94,
      "hourlyData": [
        { "hour": 0, "transactions": 0, "revenue": 0 }
      ]
    },
    "recent": {
      "transactions": [
        {
          "id": "REF-XXX",
          "product": "Netflix 1 Bulan",
          "user": "6281234567890",
          "amount": 30000,
          "method": "saldo",
          "time": "2025-05-18 02:55:01"
        }
      ]
    },
    "alerts": [
      { "type": "warning", "message": "Low daily revenue" }
    ]
  }
}
```

---

## 3. Users

### 3.1 GET /api/dashboard/users/activity

User activity feed (top 20 most-recent active users).

**Response 200**
```json
{
  "success": true,
  "data": {
    "activeUsers": 215,
    "newUsers": 12,
    "userActivity": [
      {
        "user": "6281234567890",
        "username": "User 7890",
        "totalTransaksi": 5,
        "totalSpent": 150000,
        "saldo": 25000,
        "lastActivity": "2025-05-18T02:30:00.000Z",
        "role": "silver",
        "metodeBayar": { "saldo": 3, "qris": 2, "unknown": 0 }
      }
    ],
    "activityTrends": {
      "dailyActive": [120, 135, 142, 128, 156, 149, 138],
      "weeklyActive": [890, 920, 945, 912, 978, 934, 956],
      "monthlyActive": [2800, 2950, 3100, 3020, 3180, 3050, 3120]
    }
  },
  "message": "User activity data retrieved successfully"
}
```

---

### 3.2 GET /api/dashboard/users/all

Daftar user dengan filter & pagination.

**Query**
| Param | Type | Default | Catatan |
|-------|------|---------|---------|
| `page` | int | 1 | |
| `limit` | int | 10 | max 50 |
| `search` | string | "" | match `username` atau `userId` |
| `role` | `bronze\|silver\|gold\|all` | `all` | |

**Response 200**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "userId": "6281234567890",
        "username": "User 7890",
        "phone": "6281234567890",
        "email": "user7890@example.com",
        "saldo": 25000,
        "role": "silver",
        "isActive": true,
        "lastActivity": "2025-05-18T02:30:00.000Z",
        "createdAt": "2025-01-10T10:00:00.000Z",
        "transactionCount": 5,
        "totalSpent": 150000,
        "hasTransactions": true
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 8,
      "totalUsers": 75,
      "usersPerPage": 10,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  },
  "message": "All users retrieved successfully"
}
```

---

### 3.3 GET /api/dashboard/users/stats

Statistik agregat user.

**Response 200**
```json
{
  "success": true,
  "data": {
    "totalUsers": 312,
    "totalSaldo": 12500000,
    "averageSaldo": 40064,
    "userGrowth": {
      "thisMonth": 28,
      "lastMonth": 22,
      "growthRate": 27.3
    },
    "roleDistribution": { "bronze": 250, "silver": 50, "gold": 12 },
    "balanceDistribution": { "high": 30, "medium": 80, "low": 202 }
  },
  "message": "User statistics retrieved successfully"
}
```

---

### 3.4 GET /api/dashboard/users/behavior

Analisis perilaku user (segmentasi, churn, top spender).

**Response 200** (ringkas)
```json
{
  "success": true,
  "data": {
    "segments": {
      "new":     [ /* UserAnalysis[] */ ],
      "regular": [ /* ... */ ],
      "loyal":   [ /* ... */ ],
      "vip":     [ /* ... */ ]
    },
    "segmentStats": {
      "new":     { "count": 100, "totalSpent": 0, "avgSpent": 0, "avgTransactions": 0.5, "percentage": 32.0 }
    },
    "churnAnalysis": {
      "churnedUsers": 80,
      "churnRate": 25.6,
      "recentlyActive": 232
    },
    "insights": {
      "paymentPreferences": { "vip": { "saldo": 8, "qris": 4 } },
      "mostActiveHour": { "20": 50, "21": 65 },
      "topSpenders": [ /* UserAnalysis[10] */ ],
      "mostFrequentBuyers": [ /* UserAnalysis[10] */ ]
    }
  }
}
```

`UserAnalysis`:
```ts
{
  userId: string,
  username: string,
  saldo: number,
  role: "bronze" | "silver" | "gold" | "admin",
  totalTransactions: number,
  totalSpent: number,
  avgOrderValue: number,
  daysBetweenPurchases: number,
  preferredPayment: string,
  favoriteProduct: string,
  preferredHour: number,
  lastActivity: string | null,
  createdAt: string | null
}
```

---

### 3.5 GET /api/dashboard/users/:userId/transactions

Daftar transaksi milik user tertentu.

**Path**
- `userId`: dengan atau tanpa suffix `@s.whatsapp.net`

**Response 200**
```json
{
  "success": true,
  "data": {
    "user": "User 6281234567890@s.whatsapp.net",
    "userId": "6281234567890",
    "totalTransaksi": 5,
    "totalSpent": 150000,
    "currentSaldo": 25000,
    "transaksi": [
      {
        "id": "txn_xxx",
        "referenceId": "REF-xxx",
        "reffId": "REF-xxx",
        "order_id": "ORD-xxx",
        "name": "Netflix 1 Bulan",
        "jumlah": 1,
        "price": 30000,
        "totalBayar": 30000,
        "date": "2025-05-18T02:30:00.000Z",
        "payment_method": "saldo",
        "metodeBayar": "saldo",
        "status": "completed"
      }
    ]
  }
}
```

**Errors**
- `404` user tidak ditemukan

---

### 3.6 GET /api/dashboard/users/:userId/saldo/history

Riwayat mutasi saldo per user.

**Query**
| Param | Type | Default |
|-------|------|---------|
| `limit` | int | 50 |
| `offset` | int | 0 |
| `action` | string | - |
| `method` | string | - |
| `source` | string | - |
| `search` | string | - |

**Response 200**
```json
{
  "success": true,
  "data": {
    "userId": "6281234567890",
    "total": 12,
    "limit": 50,
    "offset": 0,
    "entries": [
      {
        "id": "...",
        "userId": "6281234567890",
        "action": "topup|debit|adjust",
        "amount": 50000,
        "before": 0,
        "after": 50000,
        "method": "qris",
        "source": "midtrans",
        "note": "...",
        "timestamp": "2025-05-18T02:30:00.000Z"
      }
    ]
  }
}
```

---

### 3.7 GET /api/dashboard/saldo/history

Feed saldo history global, optional filter `userId`.

**Query**: sama dengan 3.6 plus `userId` (opsional).

**Response 200**: sama dengan 3.6, namun `userId` di root bisa `null`.

---

## 4. Transactions

### 4.1 GET /api/dashboard/transactions/recent

Daftar transaksi terbaru.

**Query**
- `limit` (int, default `20`)

**Response 200**
```json
{
  "success": true,
  "data": {
    "transactions": [
      {
        "id": "netflix1b",
        "name": "Netflix 1 Bulan",
        "price": 30000,
        "date": "2025-05-18 02:55:01",
        "jumlah": 1,
        "user": "6281234567890",
        "metodeBayar": "saldo",
        "totalBayar": 30000,
        "reffId": "REF-xxx",
        "user_name": "6281234567890",
        "payment_method": "saldo",
        "user_id": "6281234567890",
        "order_id": "REF-xxx"
      }
    ],
    "count": 20,
    "limit": 20
  }
}
```

---

### 4.2 GET /api/dashboard/transactions/search/:reffId

Detail transaksi berdasarkan reffId, termasuk profit, akun terkirim (jika ada), dan receipt.

**Response 200**
```json
{
  "success": true,
  "data": {
    "reffId": "REF-xxx",
    "user": "User Name",
    "metodeBayar": "saldo",
    "userRole": "silver",
    "produk": "Netflix 1 Bulan",
    "idProduk": "netflix1b",
    "harga": 30000,
    "jumlah": 1,
    "totalBayar": 30000,
    "tanggal": "2025-05-18 02:55:01",
    "profit": 600,
    "deliveredAccount": {
      "email": "buyer@netflix.com",
      "akun": null,
      "username": null,
      "password": "secret",
      "pin": "1234",
      "profile": "Profile1",
      "notes": "2FA: someValue"
    },
    "receiptExists": true,
    "receiptContent": "string of receipt content",
    "user_name": "User Name",
    "payment_method": "saldo",
    "user_id": "6281234567890",
    "order_id": "REF-xxx"
  }
}
```

**Errors**: `404` jika reffId tidak ada.

---

### 4.3 GET /api/dashboard/transactions/:reffId/with-receipt

Mengembalikan transaksi mentah + isi receipt.

**Response 200**
```json
{
  "success": true,
  "data": {
    "transaction": { /* raw transaction object */ },
    "receipt": {
      "exists": true,
      "content": "...",
      "reffId": "REF-xxx"
    }
  }
}
```

---

## 5. Products

### 5.1 GET /api/dashboard/products/stats

Statistik produk berdasar agregasi transaksi.

**Response 200**
```json
{
  "success": true,
  "data": {
    "totalProducts": 25,
    "totalSold": 980,
    "products": [
      {
        "id": "netflix1b",
        "name": "Netflix 1 Bulan",
        "totalSold": 150,
        "totalRevenue": 4500000,
        "averagePrice": 30000,
        "transactionCount": 150
      }
    ],
    "topProducts": [ /* top 10 by revenue */ ]
  }
}
```

---

### 5.2 GET /api/dashboard/products/performance

Analytics performa produk lengkap.

**Response 200** (ringkas)
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "id": "netflix1b",
        "name": "Netflix 1 Bulan",
        "description": "...",
        "category": "Streaming",
        "prices": { "bronze": 30000, "silver": 28000, "gold": 26000 },
        "stock": { "current": 5, "status": "low_stock", "items": ["..."] },
        "sales": {
          "totalSold": 150,
          "totalTransactions": 150,
          "totalRevenue": 4500000,
          "totalProfit": 90000,
          "avgOrderValue": 30000
        },
        "metrics": {
          "conversionRate": 96.77,
          "profitMargin": 2.0,
          "stockTurnover": 30.0
        },
        "lastSale": "2025-05-18 02:55:01"
      }
    ],
    "summary": {
      "totalProducts": 25,
      "totalRevenue": 25000000,
      "totalProfit": 500000,
      "bestPerformer": { /* product object */ },
      "categories": {
        "Streaming": { "totalProducts": 5, "totalRevenue": 0, "totalSold": 0, "totalProfit": 0, "avgConversionRate": 0 }
      }
    },
    "insights": {
      "topByRevenue": [ /* top 5 */ ],
      "topByProfit":  [ /* top 5 */ ],
      "topByConversion": [ /* top 5 */ ],
      "lowStock": [ /* products with low/out stock */ ]
    }
  }
}
```

---

### 5.3 POST /api/dashboard/products

Buat produk baru. **Hanya berjalan di mode PostgreSQL.**

**Headers**: `Authorization: Bearer <DB_TOKEN>`

**Body**
```json
{
  "id": "netflix1b",
  "name": "Netflix 1 Bulan",
  "desc": "Garansi 30 hari",
  "priceB": 30000,
  "priceS": 28000,
  "priceG": 26000,
  "snk": "Syarat & ketentuan",
  "minStock": 5
}
```

Validasi:
- `id`: required, regex `^[a-zA-Z0-9_-]+$`
- `name`: required

**Errors**: `400` invalid, `409` produk sudah ada.

---

### 5.4 GET /api/dashboard/products/:productId

Detail satu produk (raw data).

**Response 200**
```json
{
  "success": true,
  "data": {
    "id": "netflix1b",
    "name": "Netflix 1 Bulan",
    "desc": "...",
    "priceB": 30000, "priceS": 28000, "priceG": 26000,
    "snk": "...",
    "minStock": 5,
    "stok": ["email|password|profile|pin|notes"],
    "terjual": 150,
    "lastRestock": "2025-05-10T10:00:00.000Z"
  }
}
```

---

### 5.5 PATCH /api/dashboard/products/:productId

Update sebagian field produk. PostgreSQL only.

**Headers**: `Authorization: Bearer <DB_TOKEN>`

**Body**: subset field produk (lihat 5.4).

---

### 5.6 DELETE /api/dashboard/products/:productId

Hapus produk. PostgreSQL only.

**Headers**: `Authorization: Bearer <DB_TOKEN>`

---

## 6. Stock Management

### Format Stock Item

String dengan delimiter pipe:
```
email|password|profile|pin|notes
```

Minimum 4 segmen wajib (notes opsional di akhir).

---

### 6.1 GET /api/dashboard/products/stock

Semua produk dengan info stok.

**Response 200**
```json
{
  "success": true,
  "data": {
    "totalProducts": 25,
    "totalSold": 980,
    "products": [
      {
        "id": "netflix1b",
        "name": "Netflix 1 Bulan",
        "desc": "...",
        "priceB": 30000, "priceS": 28000, "priceG": 26000,
        "terjual": 150,
        "stockCount": 5,
        "stok": ["..."],
        "stockStatus": "low|in_stock|out_of_stock",
        "category": "Streaming",
        "minStock": 5,
        "lastRestock": "2025-05-10T10:00:00.000Z",
        "utilization": 96
      }
    ],
    "topProducts": [ /* top 5 by terjual */ ]
  }
}
```

---

### 6.2 GET /api/dashboard/products/stock/summary

**Response 200**
```json
{
  "success": true,
  "data": {
    "totalProducts": 25,
    "totalStockItems": 120,
    "lowStockProducts": 3,
    "outOfStockProducts": 1,
    "categories": ["Streaming", "Design", "Music"],
    "stockByCategory": { "Streaming": 50, "Design": 40, "Music": 30 }
  }
}
```

---

### 6.3 GET /api/dashboard/products/stock/alerts

**Response 200**
```json
{
  "success": true,
  "data": {
    "totalAlerts": 4,
    "criticalAlerts": 1,
    "highAlerts": 1,
    "mediumAlerts": 2,
    "alerts": [
      {
        "productId": "netflix1b",
        "productName": "Netflix 1 Bulan",
        "currentStock": 0,
        "threshold": 5,
        "status": "out|low",
        "category": "Streaming",
        "lastRestock": "2025-05-01T10:00:00.000Z",
        "urgency": "critical|high|medium"
      }
    ]
  }
}
```

---

### 6.4 GET /api/dashboard/products/stock/analytics

Hanya tersedia di mode JSON DB (non PostgreSQL). Berisi analytics dari `stockHelper.getStockAnalytics()`.

**Response 200 / 404**.

---

### 6.5 GET /api/dashboard/products/stock/report

Sama seperti analytics, output dari `stockHelper.generateStockReport()`. Mode JSON DB only.

---

### 6.6 GET /api/dashboard/products/stock/export

Mengembalikan **CSV** (`Content-Type: text/csv`).

Filename: `stock_report_<YYYY-MM-DD>.csv`

---

### 6.7 POST /api/dashboard/products/stock/bulk-update

Bulk add/remove stock. PostgreSQL only.

**Body**
```json
{
  "updates": [
    {
      "productId": "netflix1b",
      "action": "add",
      "stockItems": ["email|pass|profile|pin"],
      "notes": "restock batch 12"
    },
    {
      "productId": "spotify1b",
      "action": "remove",
      "stockItems": ["x"]
    }
  ]
}
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "totalUpdates": 2,
    "successfulUpdates": 1,
    "failedUpdates": 1,
    "results": [
      { "productId": "netflix1b", "success": true },
      { "productId": "spotify1b", "success": false, "error": "..." }
    ]
  }
}
```

---

### 6.8 PUT /api/dashboard/products/:productId/stock

Update stok satu produk (add atau remove batch). PostgreSQL only.

**Body**
```json
{
  "action": "add",
  "stockItems": ["email|pass|profile|pin|notes"],
  "notes": "optional"
}
```

`action`: `add | remove`.

**Response 200**
```json
{
  "success": true,
  "data": {
    "productId": "netflix1b",
    "previousStockCount": 3,
    "newStockCount": 5,
    "addedItems": 2,
    "removedItems": 0,
    "updatedAt": "2025-05-18T02:30:00.000Z",
    "notes": null
  }
}
```

---

### 6.9 POST /api/dashboard/products/:productId/stock/item

Tambah satu item stok (opsional di posisi tertentu). PostgreSQL only.

**Body**
```json
{
  "value": "email|pass|profile|pin|notes",
  "position": 0
}
```

**Response 200**: `{ success: true, data: { newStockCount: 4 } }`

---

### 6.10 PATCH /api/dashboard/products/:productId/stock/item

Edit item stok by `index` atau `match`. PostgreSQL only.

**Body**
```json
{ "index": 0, "value": "email|pass|profile|pin|notes" }
```
atau
```json
{ "match": "old|email|...", "value": "new|email|..." }
```

---

### 6.11 DELETE /api/dashboard/products/:productId/stock/item

Hapus item stok by `index` atau `match`. PostgreSQL only.

**Body**
```json
{ "index": 0 }
```

---

### 6.12 GET /api/dashboard/products/:productId/stock/details

Detail lengkap satu produk + parsed stock item.

**Response 200**
```json
{
  "success": true,
  "data": {
    "productId": "netflix1b",
    "productName": "Netflix 1 Bulan",
    "description": "...",
    "prices": { "bronze": 30000, "silver": 28000, "gold": 26000 },
    "sales": { "total": 150 },
    "stock": {
      "count": 5,
      "status": "low|in_stock|out_of_stock",
      "items": [
        {
          "raw": "email|pass|profile|pin|notes",
          "parsed": { "email": "...", "password": "...", "profile": "...", "pin": "...", "notes": "..." },
          "isValid": true
        }
      ],
      "metrics": { /* stockHelper.calculateStockMetrics() */ }
    },
    "category": "Streaming",
    "lastRestock": "2025-05-10T10:00:00.000Z",
    "terms": "..."
  }
}
```

---

### 6.13 GET /api/dashboard/products/:productId/stock/history

Riwayat restock dasar (terbatas pada `lastRestock` event).

**Response 200**
```json
{
  "success": true,
  "data": {
    "productId": "netflix1b",
    "productName": "Netflix 1 Bulan",
    "currentStock": 5,
    "history": [
      { "type": "restock", "timestamp": "2025-05-10T10:00:00.000Z", "description": "Stock added to product", "quantity": 5 }
    ],
    "message": "Note: Detailed history tracking requires additional database fields"
  }
}
```

---

## 7. Analytics

### 7.1 GET /api/dashboard/analytics/advanced

**Response 200** (ringkas)
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalUsers": 312, "totalTransactions": 980,
      "totalRevenue": 25000000, "totalProfit": 500000,
      "avgLTV": 80128
    },
    "distributions": {
      "roles": { "bronze": 250, "silver": 50, "gold": 12 },
      "paymentMethods": { "saldo": 600, "qris": 380 }
    },
    "trends": {
      "monthly": [ { "month": "2025-05", "transactions": 320, "revenue": 9500000, "profit": 720000, "uniqueUsers": 100 } ],
      "hourlyActivity": [ { "hour": 0, "transactions": 0 } ]
    },
    "topProducts": [
      { "id": "netflix1b", "name": "Netflix 1 Bulan", "totalRevenue": 4500000, "totalSold": 150, "transactionCount": 150 }
    ],
    "userMetrics": { "totalCustomers": 240, "averageOrderValue": 25510, "repeatCustomers": 120 }
  }
}
```

---

### 7.2 GET /api/dashboard/finance/analytics

**Response 200** (ringkas)
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalRevenue": 25000000, "totalProfit": 500000,
      "profitMargin": 2.0, "avgOrderValue": 25510,
      "totalTransactions": 980, "revenueGrowthRate": 8.5
    },
    "distributions": {
      "byPaymentMethod": { "saldo": 15000000, "qris": 10000000 },
      "byUserRole":      { "bronze": 18000000, "silver": 6000000, "gold": 1000000 },
      "profitByRole":    { "bronze": 360000, "silver": 120000, "gold": 20000 }
    },
    "trends": {
      "daily": [
        { "date": "2025-05-01", "revenue": 350000, "profit": 7000, "transactions": 12, "avgOrderValue": 29166 }
      ],
      "monthly": { "current": 2500000, "previous": 2300000, "growthRate": 8.5 }
    },
    "userFinances": {
      "totalBalance": 12500000,
      "avgBalance": 40064,
      "balanceDistribution": { "high": 30, "medium": 80, "low": 202 }
    },
    "topProducts": [
      { "id": "netflix1b", "name": "Netflix 1 Bulan", "revenue": 4500000, "profit": 90000, "transactions": 150 }
    ],
    "insights": {
      "healthScore": 32.0,
      "recommendations": ["Consider optimizing profit margins"]
    }
  }
}
```

---

### 7.3 GET /api/dashboard/predictions

**Response 200** (ringkas)
```json
{
  "success": true,
  "data": {
    "revenue": {
      "historical": [{ "month": "2025-05", "revenue": 9500000 }],
      "predicted":  { "nextMonth": 10200000, "confidence": "medium|high" }
    },
    "users": {
      "historical": [{ "month": "2025-05", "users": 28 }],
      "predicted":  { "nextMonthNewUsers": 30, "totalPredicted": 342 }
    },
    "inventory": {
      "stockPredictions": [
        { "productId": "netflix1b", "name": "Netflix 1 Bulan", "avgWeeklySales": 35, "predictedMonthlySales": 152, "recommendedStock": 182 }
      ],
      "totalRecommendedStock": 500
    },
    "churnRisk": {
      "highRisk": 12, "mediumRisk": 30,
      "usersAtRisk": [
        { "userId": "...", "username": "...", "daysSinceLastPurchase": 45, "riskLevel": "medium", "totalSpent": 250000, "transactionCount": 5 }
      ]
    },
    "trends": {
      "categories": { "Streaming": { "2025-05": 320 } },
      "insights": ["Streaming services show consistent demand"]
    },
    "recommendations": ["High churn risk detected - focus on customer engagement"]
  }
}
```

---

## 8. Receipts

### 8.1 GET /api/dashboard/receipts

Daftar file receipt yang ada di disk lokal (folder `options/receipts`).

**Response 200**
```json
{
  "success": true,
  "data": {
    "receipts": [
      {
        "reffId": "REF-xxx",
        "filename": "REF-xxx.txt",
        "createdAt": "2025-05-18T02:30:00.000Z",
        "modifiedAt": "2025-05-18T02:30:00.000Z",
        "size": 1024,
        "sizeFormatted": "1 KB"
      }
    ],
    "total": 1
  }
}
```

---

### 8.2 GET /api/dashboard/receipts/:reffId

Isi receipt sebagai JSON. Sumber: R2 atau lokal.

**Response 200**
```json
{
  "success": true,
  "data": {
    "reffId": "REF-xxx",
    "content": "Receipt text...",
    "createdAt": "2025-05-18T02:30:00.000Z",
    "modifiedAt": "2025-05-18T02:30:00.000Z",
    "size": 512,
    "sizeFormatted": "512 Bytes",
    "storage": "r2|local|unknown"
  }
}
```

**Errors**: `404` not found.

---

### 8.3 GET /api/dashboard/receipts/:reffId/download

Mengembalikan file `.txt` sebagai attachment download.

Headers response:
```
Content-Type: text/plain; charset=utf-8
Content-Disposition: attachment; filename="REF-xxx.txt"
```

---

### 8.4 DELETE /api/dashboard/receipts/:reffId

Hapus receipt.

**Headers**: `Authorization: Bearer <DB_TOKEN>` (perlindungan operasi tulis disarankan).

**Response 200**
```json
{ "success": true, "message": "Receipt deleted successfully" }
```

---

## 9. Admin User Management

Semua endpoint butuh:
```
Authorization: Bearer <DB_TOKEN>
X-Admin-User: 6281389592985
```

### 9.1 GET /api/admin/users

List user untuk admin.

**Query**
| Param | Type | Default | Catatan |
|-------|------|---------|---------|
| `search` | string | "" | match userId/username |
| `role` | `bronze\|silver\|gold\|admin\|all` | `all` | |
| `minSaldo` | int | - | |
| `maxSaldo` | int | - | |
| `page` | int | 1 | |
| `limit` | int | 20 | max 100 |

**Response 200**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "userId": "6281234567890",
        "username": "User 7890",
        "saldo": 25000,
        "role": "silver",
        "isActive": true,
        "lastActivity": "2025-05-18T02:30:00.000Z",
        "createdAt": "2025-01-10T10:00:00.000Z",
        "transactionCount": 5,
        "totalSpent": 150000
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 4,
      "totalUsers": 75,
      "usersPerPage": 20,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

---

### 9.2 PATCH /api/admin/users/:userId/saldo

Adjust saldo user (boleh negatif). PostgreSQL only.

**Body**
```json
{
  "amount": 50000,
  "reason": "Topup manual",
  "idempotencyKey": "uuid-v4"
}
```
- `amount`: number (delta, boleh negatif)
- `idempotencyKey`: opsional, TTL 5 menit. Jika dikirim ulang dengan key sama → `409`.

**Response 200**
```json
{
  "success": true,
  "data": {
    "userId": "6281234567890",
    "before": 25000,
    "after": 75000,
    "delta": 50000,
    "auditId": "AUD-20250518-ABC123"
  }
}
```

**Errors**
- `400` payload invalid
- `409` idempotency conflict

---

### 9.3 POST /api/admin/users/:userId/pin

Set PIN user. PostgreSQL only.

**Body**
```json
{ "pin": "1234" }
```
Validasi: 4-6 digit numerik.

**Response 200**
```json
{ "success": true, "data": { "userId": "6281234567890", "updatedAt": "2025-05-18T02:30:00.000Z" } }
```

---

### 9.4 PATCH /api/admin/users/:userId/role

Ubah role user. PostgreSQL only.

**Body**
```json
{ "role": "silver" }
```
- `role`: `bronze | silver | gold | admin`. Hanya admin owner yang boleh set ke `admin`.

**Response 200**
```json
{
  "success": true,
  "data": { "userId": "6281234567890", "oldRole": "bronze", "newRole": "silver" }
}
```

---

### 9.5 GET /api/admin/audit

Query log audit.

**Query**
| Param | Type | Default | Catatan |
|-------|------|---------|---------|
| `admin` | string | - | substring match nomor admin |
| `userId` | string | - | substring match userId |
| `action` | string | - | exact match (`saldo.adjust`, `pin.update`, `role.update`) |
| `dateFrom` | ISO date | - | |
| `dateTo`   | ISO date | - | |
| `page` | int | 1 | |
| `limit` | int | 50 | max 200 |

**Response 200**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "AUD-20250518-ABC123",
        "admin": "6281389592985",
        "userId": "6281234567890",
        "action": "saldo.adjust",
        "delta": 50000,
        "reason": "Topup manual",
        "before": 25000,
        "after": 75000,
        "timestamp": "2025-05-18T02:30:00.000Z",
        "ip": "1.2.3.4"
      }
    ],
    "pagination": { "currentPage": 1, "totalPages": 5, "total": 250 }
  }
}
```

---

## 10. Export & Logs

### 10.1 GET /api/dashboard/export/:format

Export data dashboard. **Stub**: hanya mengembalikan info filename, belum men-generate file.

**Path**
- `format`: `csv | json | xlsx`

**Response 200**
```json
{
  "success": true,
  "message": "Data berhasil diexport ke format csv",
  "filename": "dashboard_2025-05-18T02-30-00.csv"
}
```

---

### 10.2 GET /logs

Mengembalikan 100 baris terakhir `journalctl -u bot-wa --no-pager -r` sebagai `text/plain`.

---

### 10.3 GET /logs/stream

Streaming log realtime (chunked `text/plain`).

---

### 10.4 GET /logs/sse

Streaming log via Server-Sent Events.

```
Content-Type: text/event-stream
```

Event format:
```
data: <log line>

```

Auto-retry interval `2000ms`. Keepalive ping setiap 15s (`: ping`).

> Tersedia juga viewer HTML di `GET /logs/view`.

---

## 11. Webhooks (Internal)

> Endpoint ini bukan untuk konsumsi frontend, tapi disediakan untuk referensi.

### 11.1 POST /webhook/midtrans
Webhook Midtrans (signature SHA-512 verifikasi).

### 11.2 GET /webhook/midtrans/test
Health-check.

### 11.3 POST /webhook/gowa
Webhook WhatsApp Gowa (HMAC SHA-256 jika `GOWA_WEBHOOK_SECRET` diset).

### 11.4 GET /webhook/gowa/test
Health-check.

---

## 12. Tipe TypeScript (Saran)

```ts
// Standard envelope
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Pagination
export interface Pagination {
  currentPage: number;
  totalPages: number;
  totalUsers?: number;
  total?: number;
  usersPerPage?: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// User
export type UserRole = 'bronze' | 'silver' | 'gold' | 'admin';

export interface DashboardUser {
  userId: string;
  username: string;
  phone?: string;
  email?: string;
  saldo: number;
  role: UserRole;
  isActive: boolean;
  lastActivity: string | null;
  createdAt: string | null;
  transactionCount: number;
  totalSpent: number;
  hasTransactions?: boolean;
}

// Transaction
export interface Transaction {
  id: string;
  referenceId?: string;
  reffId: string;
  order_id?: string;
  name: string;
  jumlah: number;
  price: number;
  totalBayar: number;
  date: string;
  payment_method: string;
  metodeBayar: string;
  status?: string;
  user?: string;
  user_name?: string;
  user_id?: string;
}

// Product
export interface Product {
  id: string;
  name: string;
  desc?: string;
  priceB: number;
  priceS: number;
  priceG: number;
  terjual: number;
  stockCount?: number;
  stok?: string[];
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock' | 'low' | 'out';
  category?: string;
  minStock?: number;
  lastRestock?: string | null;
  utilization?: number;
  snk?: string;
}

// Stock alerts
export interface StockAlert {
  productId: string;
  productName: string;
  currentStock: number;
  threshold: number;
  status: 'low' | 'out';
  category: string;
  lastRestock: string | null;
  urgency: 'critical' | 'high' | 'medium';
}
```

---

## 13. Contoh Pemakaian (Next.js / fetch)

```ts
// lib/api.ts
const BASE = process.env.NEXT_PUBLIC_DASHBOARD_API ?? 'https://dash.nicola.id';
const TOKEN = process.env.DASHBOARD_API_TOKEN;        // server-only

async function request<T>(
  path: string,
  init: RequestInit = {},
  auth: 'public' | 'bearer' | 'admin' = 'public',
  adminUser?: string,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  if (auth !== 'public') {
    if (!TOKEN) throw new Error('Missing DASHBOARD_API_TOKEN');
    headers.Authorization = `Bearer ${TOKEN}`;
  }
  if (auth === 'admin') {
    if (!adminUser) throw new Error('Missing admin user');
    headers['X-Admin-User'] = adminUser;
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || json.message || `HTTP ${res.status}`);
  }
  return json.data as T;
}

// Usage
export const getOverview     = () => request('/api/dashboard/overview');
export const getDailyChart   = () => request('/api/dashboard/chart/daily');
export const getRealtime     = () => request('/api/dashboard/realtime');

export const adjustSaldo = (userId: string, amount: number, reason?: string) =>
  request(
    `/api/admin/users/${userId}/saldo`,
    { method: 'PATCH', body: JSON.stringify({ amount, reason, idempotencyKey: crypto.randomUUID() }) },
    'admin',
    '6281389592985',
  );
```

---

## 14. Catatan Migrasi & Mode

- Banyak endpoint tulis (CRUD produk, stock, saldo, role, pin) hanya berfungsi saat `USE_PG=true`. Endpoint akan mengembalikan `500 PostgreSQL mode is required` jika tidak.
- Endpoint analytics stock (`/products/stock/analytics`, `/stock/report`, `/stock/export`) hanya tersedia di mode JSON DB (saat `USE_PG=false`).
- Format tanggal di transaksi mungkin tidak konsisten (`ISO` vs `YYYY-MM-DD HH:mm:ss`); frontend disarankan parsing toleran.
- `userId` di beberapa response masih membawa suffix `@s.whatsapp.net`. Strip jika diperlukan untuk display.

---

## 15. Versi

- Kontrak ini dibuat dari `options/dashboard-api.js` per `2026-05-18`.
- Bila ada perubahan signature endpoint, update dokumen ini sebelum merge.
