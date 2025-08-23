# 🔍 FITUR TRACKING TRANSAKSI

## 📋 **Overview**
Fitur tracking transaksi telah diperbaiki untuk mengatasi masalah **tidak ada user info** dalam database transaksi. Sekarang setiap transaksi akan menyimpan informasi lengkap user.

## 🆕 **Command Baru**

### 1. **`riwayat <nomor>`**
- **Fungsi**: Melihat riwayat transaksi user berdasarkan nomor
- **Contoh**: `.riwayat 6281234567890`
- **Output**: Menampilkan semua transaksi user dengan detail lengkap

### 2. **`cari <reff_id>`**
- **Fungsi**: Mencari transaksi berdasarkan Reff ID
- **Contoh**: `.cari ABC123`
- **Output**: Detail lengkap transaksi termasuk user info

### 3. **`statistik`** (Owner Only)
- **Fungsi**: Melihat statistik transaksi keseluruhan
- **Output**: 
  - Total transaksi
  - Total user unik
  - Breakdown metode pembayaran
  - Top 5 user aktif
  - Total pendapatan

### 4. **`export <format>`** (Owner Only)
- **Fungsi**: Export data transaksi ke file
- **Format**: `json`, `csv`, `txt`
- **Contoh**: `.export json`

## 🗄️ **Struktur Database Baru**

### **Sebelum (Lama):**
```json
{
  "id": "net2u",
  "name": "NETFLIX 1 BULAN",
  "price": "13700",
  "date": "2025-08-23 22:57:46",
  "jumlah": 1
}
```

### **Sesudah (Baru):**
```json
{
  "id": "net2u",
  "name": "NETFLIX 1 BULAN",
  "price": "13700",
  "date": "2025-08-23 22:57:46",
  "profit": "1000",
  "jumlah": 1,
  "user": "6281234567890",
  "userRole": "bronze",
  "reffId": "ABC123",
  "metodeBayar": "Saldo",
  "totalBayar": 13700
}
```

## 🔧 **Perbaikan yang Dilakukan**

### **Case `buy` (Pembelian dengan Saldo):**
- ✅ Tambah `user` (nomor user)
- ✅ Tambah `userRole` (role user)
- ✅ Tambah `reffId` (ID referensi)
- ✅ Tambah `metodeBayar` ("Saldo")
- ✅ Tambah `totalBayar` (total harga)

### **Case `buynow` (Pembelian dengan QRIS):**
- ✅ Tambah `user` (nomor user)
- ✅ Tambah `userRole` (role user)
- ✅ Tambah `reffId` (ID referensi)
- ✅ Tambah `metodeBayar` ("QRIS")
- ✅ Tambah `totalBayar` (total harga + fee)

## 📊 **Cara Tracking User**

### **1. Melalui Nomor User:**
```bash
.riwayat 6281234567890
```

### **2. Melalui Reff ID:**
```bash
.cari ABC123
```

### **3. Melalui Statistik:**
```bash
.statistik
```

## 🎯 **Manfaat Perbaikan**

1. **User Tracking**: Bisa melacak semua transaksi user tertentu
2. **Audit Trail**: Reff ID untuk tracking transaksi spesifik
3. **Analytics**: Statistik user aktif dan metode pembayaran
4. **Data Export**: Bisa export data untuk analisis lanjutan
5. **Customer Service**: Mudah membantu user dengan masalah transaksi

## ⚠️ **Catatan Penting**

- **Transaksi lama** tidak akan memiliki field baru (akan ditampilkan sebagai "Tidak diketahui")
- **Transaksi baru** akan otomatis memiliki semua field lengkap
- Command `statistik` dan `export` hanya bisa digunakan oleh Owner
- Semua command tracking bisa digunakan oleh user biasa (kecuali yang owner only)

## 🚀 **Penggunaan**

### **Untuk User:**
```bash
.riwayat 6281234567890    # Lihat riwayat sendiri
.cari ABC123              # Cari transaksi berdasarkan reff ID
```

### **Untuk Owner:**
```bash
.statistik                # Lihat statistik keseluruhan
.export json              # Export data ke JSON
.export csv               # Export data ke CSV
.export txt               # Export data ke TXT
``` 