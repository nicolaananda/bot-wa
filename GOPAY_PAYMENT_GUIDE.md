# Gopay Payment Integration Guide

## Overview
Case `gopay` telah berhasil diimplementasikan menggunakan Midtrans API untuk pembayaran Gopay. Feature ini memungkinkan customer untuk membeli produk menggunakan Gopay dengan deeplink atau QR code.

## Usage

### Command Format
```
.gopay <product_id> <quantity>
```

### Examples
```
.gopay vid3u 1
.gopay netflix1m 2
.gopay zoom1j 1
```

## Features

### 1. **Midtrans Gopay Integration**
- Menggunakan Midtrans Core API untuk payment
- Support deeplink dan QR code
- Auto-detection pembayaran
- 30 menit timeout

### 2. **Enhanced User Experience**
- Error handling yang comprehensive
- Clear instructions untuk pembayaran
- Automatic payment detection
- Real-time status updates

### 3. **Payment Flow**
1. User ketik: `.gopay vid3u 1`
2. System validates product dan stock
3. Generate Gopay payment via Midtrans
4. Send payment instructions dengan deeplink/QR
5. Monitor payment status setiap 5-10 detik
6. Auto-process order setelah payment confirmed
7. Send account details dengan enhanced delivery system

### 4. **Enhanced Delivery System**
- **Attempt 1**: Send complete account details + SNK
- **Attempt 2**: Send in multiple separate messages
- **Attempt 3**: Send basic notification
- **Admin Alert**: Notify admin jika delivery gagal

## Technical Implementation

### 1. **Midtrans Configuration**
File: `config/midtrans.js`
- Added `createGopayPayment()` function
- Handles deeplink dan QR code generation
- Integrated dengan existing payment monitoring

### 2. **Payment Data Structure**
```javascript
{
  transaction_id: "string",
  order_id: "GOPAY-XXXXX-timestamp",
  amount: number,
  status: "pending",
  deeplink: "gojek://gopay/merchant/...",
  qr_string: "https://api.midtrans.com/qr/...",
  payment_type: "gopay"
}
```

### 3. **Order Tracking**
```javascript
db.data.order[sender] = {
  id: productId,
  jumlah: quantityNum,
  orderId: "GOPAY-XXXXX-timestamp",
  reffId: "XXXXX",
  totalAmount: amount + uniqueCode,
  metode: 'Gopay',
  deeplink: paymentData.deeplink
}
```

## Payment Instructions

### For Customers:
1. **With Deeplink** (Priority):
   - Click the provided link
   - Akan otomatis membuka Gopay app
   - Konfirmasi pembayaran di app

2. **With QR Code** (Fallback):
   - Buka aplikasi Gopay
   - Pilih "Bayar" atau "Scan"
   - Scan QR code yang diberikan

### Payment Detection:
- Auto-check setiap 5-10 detik
- Using Midtrans `isPaymentCompleted()` API
- Timeout setelah 30 menit

## Error Handling

### 1. **Validation Errors**
- Invalid product ID
- Insufficient stock
- Invalid quantity
- Missing parameters

### 2. **Payment Errors**
- Midtrans API failures
- Network issues
- Invalid payment data

### 3. **Delivery Errors**
- Customer message delivery failures
- Admin alerts untuk manual intervention
- Multiple fallback attempts

## Monitoring & Debugging

### Logs to Monitor:
```
🔄 Sedang membuat link pembayaran Gopay...
Creating Gopay payment: GOPAY-XXXXX - Amount: 50000
Gopay Payment Status: PAID
✅ Pembayaran Gopay berhasil! Data akun akan segera diproses.
🚀 STARTING CUSTOMER MESSAGE SEND PROCESS (GOPAY CASE)
✅ SUCCESS: Account details sent to customer!
🏁 CUSTOMER MESSAGE SEND RESULT (GOPAY CASE): SUCCESS
```

### Admin Notifications:
- Transaction notifications ke owner
- Stock empty alerts
- Customer delivery failure alerts

## Configuration Required

### 1. **Environment Variables**
```env
MIDTRANS_SERVER_KEY=Mid-server-xxxxx
MIDTRANS_CLIENT_KEY=Mid-client-xxxxx
MIDTRANS_MERCHANT_ID=Gxxxxxx
MIDTRANS_IS_PRODUCTION=false
```

### 2. **Dependencies**
- Midtrans configuration sudah ada
- Enhanced delivery system sudah implemented
- Database structure compatible

## Testing

### Test Cases:
1. **Valid Purchase**: `.gopay vid3u 1`
2. **Invalid Product**: `.gopay invalid 1`
3. **Insufficient Stock**: `.gopay vid3u 999`
4. **Invalid Quantity**: `.gopay vid3u -1`
5. **Payment Timeout**: Wait 30+ minutes
6. **Payment Success**: Complete Gopay payment

### Expected Results:
- ✅ Clear error messages untuk invalid inputs
- ✅ Proper payment instructions with deeplink/QR
- ✅ Auto-detection of successful payments
- ✅ Account details delivered dengan fallback system
- ✅ Transaction recorded in database
- ✅ Stock updated properly

## Benefits

### For Customers:
- ✅ Native Gopay experience dengan deeplink
- ✅ No need untuk manual amount entry
- ✅ Auto-detection pembayaran
- ✅ Instant account delivery

### For Admins:
- ✅ Automated payment processing
- ✅ Enhanced delivery tracking
- ✅ Comprehensive error handling
- ✅ Admin alerts untuk manual intervention

## Future Enhancements

1. **Webhook Integration**: Real-time payment notifications
2. **Payment Method Selection**: OVO, DANA, ShopeePay
3. **Refund System**: Automated refund processing
4. **Payment Analytics**: Detailed payment reports

---
*Implemented: September 12, 2025*
*Status: Ready for Production* 