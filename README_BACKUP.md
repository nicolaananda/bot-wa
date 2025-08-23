# Backup System

## Overview
Sistem backup otomatis telah dimodifikasi untuk menyimpan file backup secara lokal di folder `./backup/` alih-alih mengirim ke WhatsApp.

## Fitur
- **Auto Backup**: Backup otomatis setiap 12 jam (sesuai setting `jamBackup` di `setting.js`)
- **Manual Backup**: Command `/backup` untuk backup manual
- **Auto Cleanup**: Backup lama (>7 hari) otomatis dihapus
- **Timestamp**: Setiap backup memiliki timestamp unik

## Lokasi Backup
- Folder: `./backup/`
- Format nama: `SC-TOPUP-ORKUT-BUTTON-YYYY-MM-DDTHH-MM-SS-sssZ.zip`

## Konfigurasi
- Interval backup: Ubah nilai `jamBackup` di `setting.js`
- Retensi backup: Saat ini 7 hari (bisa diubah di kode)

## Command
- `/backup` - Backup manual (owner only)

## Struktur File
```
backup/
├── SC-TOPUP-ORKUT-BUTTON-2024-01-15T10-30-00-000Z.zip
├── SC-TOPUP-ORKUT-BUTTON-2024-01-15T22-30-00-000Z.zip
└── ...
```

## Catatan
- Folder backup otomatis dibuat jika belum ada
- File yang di-exclude: `node_modules`, `session`, `package-lock.json`, `yarn.lock`, `.npm`, `.cache`, `backup`
- Backup disimpan secara lokal, tidak dikirim ke WhatsApp 