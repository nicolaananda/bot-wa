# 🚀 BuyMidtrans Feature Documentation

## Overview
The `buymidtrans` command allows users to purchase digital products using Midtrans payment gateway with QRIS and multiple payment options.

## 🔧 Configuration
### Midtrans Credentials
```
Merchant ID: G636278165
Client Key: Mid-client-nAhxrcVaalVHQMkv
Server Key: Mid-server-gKkldwQbOCiluq1JardRR_bk
Environment: Sandbox (for testing)
```

## 💳 Available Payment Methods
- **QRIS** - Universal QR Code for all e-wallets
- **E-Wallets**: DANA, GoPay, ShopeePay, OVO, LinkAja
- **Virtual Account**: BCA, BNI, BRI, Permata, Mandiri
- **Internet Banking**: BCA KlikBCA, BRI E-Pay, Mandiri ClickPay, CIMB Clicks, Danamon Online
- **Credit Card**: Visa, MasterCard, JCB
- **Other**: Telkomsel Cash, Akulaku

## 📋 Usage

### Command Syntax
```
.buymidtrans <product_id> <quantity>
```

### Examples
```bash
# Buy 1 Netflix account
.buymidtrans netflix01 1

# Buy 2 Canva accounts  
.buymidtrans canva01 2

# Buy 5 Spotify accounts
.buymidtrans spotify01 5
```

## 🔄 Process Flow

1. **Order Validation**
   - Check if user has pending orders
   - Validate product ID and stock availability
   - Verify quantity is positive integer

2. **QRIS Payment Creation**
   - Calculate total amount (price × quantity + unique code)
   - Generate unique order ID and reference ID
   - Create Midtrans Core API QRIS payment only

3. **Payment Notification**
   - Download and display QRIS image from Midtrans
   - Show supported e-wallets (GoPay, OVO, DANA, ShopeePay, LinkAja)
   - Set 30-minute expiration timer
   - Store order data in database

4. **Payment Monitoring**
   - Check QRIS payment status every 5-10 seconds (optimized)
   - Cache TTL reduced to 30 seconds for faster updates
   - Handle payment completion or expiration

5. **Order Completion**
   - Deduct stock and update sold count
   - Send account details to buyer's private chat
   - Send terms & conditions
   - Notify admins of QRIS payment completion
   - Add transaction to database as "Midtrans QRIS"

## 📱 User Experience

### Payment Message Format
```
🧾 MENUNGGU PEMBAYARAN MIDTRANS 🧾

Produk ID: netflix01
Nama Produk: Netflix Premium Account
Harga: Rp15.000
Jumlah: 1
Subtotal: Rp15.000
Kode Unik: 45
Total: Rp15.045
Waktu: 30 menit

🔗 Link Pembayaran:
https://app.sandbox.midtrans.com/snap/v4/redirection/xxxxx

Metode Pembayaran Tersedia:
• 💳 QRIS (Semua E-Wallet)
• 🏦 Virtual Account (BCA, BNI, BRI, dll)
• 🌐 Internet Banking
• 💰 E-Wallet (DANA, GoPay, ShopeePay, dll)
• 💳 Credit Card

Klik link di atas sebelum 14:30 untuk melakukan pembayaran.

Jika ingin membatalkan, ketik .batal
```

## 🔒 Security Features

- **Unique Order ID**: `TRX-{REFF_ID}-{TIMESTAMP}`
- **Payment Token**: Secure Midtrans Snap token
- **Expiration Timer**: 30-minute payment window
- **Order Validation**: Prevent duplicate orders
- **Stock Management**: Real-time stock updates

## 📊 Transaction Tracking

### Database Fields
```javascript
{
  id: "netflix01",
  name: "Netflix Premium Account", 
  price: 15000,
  date: "2024-01-06 14:25:30",
  profit: 5000,
  jumlah: 1,
  user: "628123456789",
  userRole: "member",
  reffId: "A1B2C3",
  metodeBayar: "Midtrans",
  totalBayar: 15045,
  paymentType: "qris" // or "bca_va", "gopay", etc.
}
```

## 🚨 Error Handling

### Common Errors
- **Invalid Product ID**: Product not found in database
- **Insufficient Stock**: Requested quantity exceeds available stock
- **Payment Creation Failed**: Midtrans API error
- **Expired Payment**: 30-minute timeout reached
- **Network Error**: Connection issues with Midtrans

### Error Messages
```bash
❌ "Produk dengan ID netflix01 tidak ditemukan."
❌ "Stok tersedia 3, jumlah pesanan tidak boleh melebihi stok."
❌ "Gagal membuat link pembayaran Midtrans. Silakan coba lagi."
❌ "Pembayaran dibatalkan karena melewati batas waktu 30 menit."
```

## 🔧 Admin Features

### Owner Notifications
```
Hai Owner,
Ada transaksi MIDTRANS yang telah selesai!

╭────「 TRANSAKSI DETAIL 」───
┊・ 🧾| Reff Id: A1B2C3
┊・ 📮| Nomor: @628123456789
┊・ 📦| Nama Barang: Netflix Premium Account
┊・ 🏷️| Harga Barang: Rp15.000
┊・ 🛍️| Jumlah Order: 1
┊・ 💰| Total Bayar: Rp15.045
┊・ 💳| Metode Bayar: MIDTRANS
┊・ 🎯| Payment Type: qris
┊・ 📅| Tanggal: 06 Januari 2024
┊・ ⏰| Jam: 14:25:30 WIB
╰┈┈┈┈┈┈┈┈
```

### Stock Alerts
- Automatic low stock warnings
- Out-of-stock notifications to admins
- Restocking recommendations

## 🧪 Testing

Run the test script to verify functionality:
```bash
node test-buymidtrans.js
```

### Test Results
- ✅ Service Status Check
- ✅ Payment Creation 
- ✅ Payment Status Monitoring
- ✅ Multiple Payment Methods Available

## 🚀 Production Deployment

### Environment Variables
Create a `.env` file in the `config/` directory:
```env
MIDTRANS_SERVER_KEY=Mid-server-your-production-key
MIDTRANS_CLIENT_KEY=Mid-client-your-production-key  
MIDTRANS_MERCHANT_ID=your-merchant-id
MIDTRANS_IS_PRODUCTION=true
MIDTRANS_BASE_URL=https://api.midtrans.com
```

### Go Live Checklist
- [ ] Update credentials to production keys
- [ ] Set `MIDTRANS_IS_PRODUCTION=true`
- [ ] Update base URL to production endpoint
- [ ] Test with small amounts first
- [ ] Monitor transaction logs
- [ ] Set up webhook notifications (optional)

## 📞 Support

For issues or questions:
- Check Midtrans documentation: https://docs.midtrans.com
- Verify credentials in Midtrans Dashboard
- Review transaction logs for debugging
- Contact Midtrans support for payment issues

---

**Created:** January 6, 2024  
**Version:** 1.0.0  
**Status:** Ready for Production 