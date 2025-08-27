# Transaction API Contract

## GET /api/dashboard/transactions/:reffId
- Description: Get full transaction detail by reference ID.
- Params: `reffId` (string)
- Response:
```json
{
  "success": true,
  "data": {
    "reffId": "ABC12345",
    "user": "628xxxx@s.whatsapp.net",
    "userId": "628xxxx@s.whatsapp.net",
    "userRole": "bronze",
    "metodeBayar": "Saldo",
    "produk": "Nama Produk",
    "idProduk": "PROD01",
    "hargaSatuan": 10000,
    "jumlah": 2,
    "totalBayar": 20000,
    "tanggal": "2025-08-27 14:01:02",
    "profit": 200,
    "deliveredAccounts": [
      {
        "email": "user@example.com",
        "password": "pass123",
        "profile": "profile1",
        "pin": "1234",
        "twofa": "codes or notes"
      }
    ]
  }
}
```

## GET /api/dashboard/transactions/search/:reffId
- Description: Search a transaction and return normalized fields. Includes `deliveredAccounts` if found in `options/database-transaksi.json` (fallback parses `options/TRX-<reffId>.txt`).
- Params: `reffId` (string)
- Response:
```json
{
  "success": true,
  "data": {
    "reffId": "ABC12345",
    "user": "628xxxx@s.whatsapp.net",
    "metodeBayar": "Saldo",
    "userRole": "bronze",
    "produk": "Nama Produk",
    "idProduk": "PROD01",
    "harga": 10000,
    "jumlah": 2,
    "totalBayar": 20000,
    "tanggal": "2025-08-27 14:01:02",
    "profit": 200,
    "deliveredAccount": null,
    "deliveredAccounts": [
      {
        "email": "user@example.com",
        "password": "pass123",
        "profile": "profile1",
        "pin": "1234",
        "twofa": "codes or notes"
      }
    ],
    "user_name": "628xxxx@s.whatsapp.net",
    "payment_method": "Saldo",
    "user_id": "628xxxx@s.whatsapp.net",
    "order_id": "ABC12345"
  }
}
```

## Storage File
- Path: `options/database-transaksi.json`
- Structure: Array of records keyed by `reffId`:
```json
[
  {
    "reffId": "ABC12345",
    "user": "628xxxx@s.whatsapp.net",
    "idProduk": "PROD01",
    "produk": "Nama Produk",
    "hargaSatuan": 10000,
    "jumlah": 2,
    "totalBayar": 20000,
    "metodeBayar": "Saldo",
    "tanggal": "2025-08-27 14:01:02",
    "userRole": "bronze",
    "deliveredAccounts": [
      { "email": "...", "password": "...", "profile": "...", "pin": "...", "twofa": "..." }
    ]
  }
]
``` 