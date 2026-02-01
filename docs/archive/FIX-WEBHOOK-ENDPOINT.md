# 🔧 Fix Webhook Endpoint Test

## Masalah
Endpoint `/webhook/midtrans/test` mengembalikan error "Endpoint not found"

## Solusi

### 1. Restart Server Dashboard API

Endpoint sudah ada di code, tapi server perlu di-restart:

```bash
# Cek apakah dashboard-api running
pm2 list | grep dashboard

# Jika ada, restart
pm2 restart dashboard-api

# Atau jika tidak ada, start
pm2 start options/dashboard-api.js --name dashboard-api

# Atau jika menggunakan nama lain, cek dulu
pm2 list
```

### 2. Test Langsung ke Port (Bypass Nginx)

Test langsung ke port dashboard-api (3002):

```bash
# Test langsung ke port
curl http://localhost:3002/webhook/midtrans/test

# Atau dari server lain
curl http://YOUR_SERVER_IP:3002/webhook/midtrans/test
```

### 3. Cek Nginx Configuration

Jika test langsung ke port berhasil tapi via domain tidak, cek Nginx config:

```bash
# Cek Nginx config untuk api.nicola.id
sudo nano /etc/nginx/sites-available/api.nicola.id
# atau
sudo nano /etc/nginx/sites-enabled/api.nicola.id
```

Pastikan ada konfigurasi untuk `/webhook`:

```nginx
location /webhook {
    proxy_pass http://localhost:3002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Setelah edit, reload Nginx:
```bash
sudo nginx -t  # Test config
sudo systemctl reload nginx  # Reload jika OK
```

### 4. Test Setelah Restart

```bash
# Test via domain
curl https://api.nicola.id/webhook/midtrans/test

# Harus return:
# {
#   "success": true,
#   "status": "ok",
#   "message": "Webhook endpoint is accessible",
#   ...
# }
```

### 5. Cek Log Server

Monitor log untuk melihat request:

```bash
# PM2 logs
pm2 logs dashboard-api

# Atau jika menggunakan nama lain
pm2 logs | grep webhook
```

## Troubleshooting

### Jika masih error setelah restart:

1. **Cek apakah endpoint terdaftar:**
   ```bash
   # Di server, cek apakah route terdaftar
   grep -n "webhook/midtrans/test" options/dashboard-api.js
   ```

2. **Cek apakah server listening di port 3002:**
   ```bash
   netstat -tulpn | grep 3002
   # atau
   ss -tulpn | grep 3002
   ```

3. **Test POST endpoint webhook:**
   ```bash
   curl -X POST https://api.nicola.id/webhook/midtrans \
     -H "Content-Type: application/json" \
     -d '{"test": "manual"}'
   ```
   
   Harus return error "Invalid signature" (normal untuk test manual)

## Quick Fix

Jika ingin cepat, test langsung ke port:

```bash
# Di server
curl http://localhost:3002/webhook/midtrans/test
```

Jika ini berhasil, berarti masalahnya di Nginx routing, bukan di endpoint.

