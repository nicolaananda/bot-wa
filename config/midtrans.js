const axios = require('axios')

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || ''
const MIDTRANS_PRODUCTION = String(process.env.MIDTRANS_PRODUCTION || process.env.MIDTRANS_IS_PRODUCTION || 'false').toLowerCase() === 'true'

const baseUrl = MIDTRANS_PRODUCTION ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com'
let transactionListFailures = 0
let transactionListRetryAt = 0

function safeChargeDiagnostic({ httpStatus, data, error } = {}) {
  const providerStatus = String(data && data.status_code || '').match(/^\d{3}$/)?.[0]
  const source = String(data && (data.status_message || data.error_messages) || error && error.code || '')
  const message = source
    .replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+|\b\d{6,}\b|(?:authorization|token|key|secret|qr)[=: ]+\S+/gi, '[redacted]')
    .replace(/[^\w .,;:()\[\]/-]/g, '?')
    .slice(0, 160)
  const classification = httpStatus === 401 || httpStatus === 403 || providerStatus === '401'
    ? 'authentication'
    : httpStatus === 429 ? 'rate_limit'
      : (httpStatus >= 500 || Number(providerStatus) >= 500) ? 'provider_unavailable'
        : (httpStatus >= 400 || Number(providerStatus) >= 400) ? 'request_rejected' : 'invalid_response'
  return { ...(Number.isInteger(httpStatus) ? { http_status: httpStatus } : {}), ...(providerStatus ? { provider_status_code: providerStatus } : {}), classification, ...(message ? { status_message: message } : {}) }
}

function chargeError(context) {
  const diagnostic = safeChargeDiagnostic(context)
  const error = new Error(`Midtrans charge failed (${diagnostic.classification})`)
  error.code = 'MIDTRANS_CHARGE_FAILED'
  error.diagnostic = diagnostic
  return error
}

function getAuthHeader() {
  const token = Buffer.from(MIDTRANS_SERVER_KEY + ':').toString('base64')
  return { Authorization: `Basic ${token}` }
}

async function createPaymentLink(params) {
  // Optional helper for invoice link (Snap). Not used heavily in current flow.
  const url = `${baseUrl}/v1/payment-links`
  const { data } = await axios.post(url, params, { headers: { ...getAuthHeader(), 'Content-Type': 'application/json' } })
  return data
}

async function getPaymentLinkStatus(id) {
  const url = `${baseUrl}/v1/payment-links/${id}`
  const { data } = await axios.get(url, { headers: getAuthHeader() })
  return data
}

async function createQRISCore(amount, orderId) {
  // Back-compat name; delegate to createQRISPayment
  return createQRISPayment(amount, orderId)
}

async function createQRISPayment(amount, orderId) {
  const url = `${baseUrl}/v2/charge`
  const acquirerEnv = (process.env.MIDTRANS_QRIS_ACQUIRER || 'gopay').toLowerCase()
  const acquirer = ['gopay', 'shopee', 'ovo'].includes(acquirerEnv) ? acquirerEnv : 'gopay'
  const payload = {
    payment_type: 'qris',
    transaction_details: {
      order_id: orderId,
      gross_amount: Number(amount)
    },
    qris: {
      acquirer
    }
  }

  let data
  try {
    ({ data } = await axios.post(url, payload, { headers: { ...getAuthHeader(), 'Content-Type': 'application/json', Accept: 'application/json' } }))
  } catch (err) {
    const resp = err.response
    throw chargeError({ httpStatus: resp && resp.status, data: resp && resp.data, error: err })
  }
  const statusCode = Number(data && data.status_code)
  if (!data || (Number.isFinite(statusCode) && (statusCode < 200 || statusCode >= 300)))
    throw chargeError({ data })
  // Normalize possible shapes
  let qrString = data.qr_string
  if (!qrString && Array.isArray(data.actions)) {
    const qrAction = data.actions.find(a => (a.name || '').toLowerCase().includes('qr') || (a.method || '').toLowerCase().includes('qr'))
    if (qrAction && (qrAction.url || qrAction.deep_link)) {
      qrString = qrAction.url || qrAction.deep_link
    }
  }
  return { ...data, qr_string: qrString }
}

async function isPaymentCompleted(orderId) {
  const url = `${baseUrl}/v2/${orderId}/status`
  const { data } = await axios.get(url, { headers: getAuthHeader() })
  // Midtrans statuses: capture/settlement = paid, pending = not yet, expire/cancel = failed
  const status = (data.transaction_status || '').toLowerCase()
  const paid = status === 'capture' || status === 'settlement'
  return {
    status: paid ? 'PAID' : status.toUpperCase(),
    paid_amount: data.gross_amount || 0,
    raw: data
  }
}

async function getTransactionStatusByOrderId(orderId) {
  const url = `${baseUrl}/v2/${orderId}/status`
  const { data } = await axios.get(url, { headers: getAuthHeader() })
  return data
}

async function getTransactionStatusByTransactionId(transactionId) {
  const url = `${baseUrl}/v2/${transactionId}/status`
  const { data } = await axios.get(url, { headers: getAuthHeader() })
  return data
}

/**
 * Cari transaksi QRIS statis berdasarkan nominal dan waktu
 * Untuk QRIS statis, kita tidak punya order_id, jadi search berdasarkan amount dan time range
 * @param {number} amount - Nominal yang dicari (dengan kode unik)
 * @param {number} startTime - Timestamp mulai pencarian (milliseconds)
 * @param {number} endTime - Timestamp akhir pencarian (milliseconds), default: sekarang
 * @returns {Promise<Object|null>} Transaction data jika ditemukan, null jika tidak
 */
async function findStaticQRISTransaction(amount, startTime, endTime = Date.now()) {
  if (Date.now() < transactionListRetryAt) return null
  try {
    // Midtrans Transaction List API (jika tersedia)
    // Format: GET /v2/transactions?from=timestamp&to=timestamp
    const fromTimestamp = Math.floor(startTime / 1000) // Convert to seconds
    const toTimestamp = Math.floor(endTime / 1000)
    
    // Coba ambil transaksi dalam rentang waktu
    const url = `${baseUrl}/v2/transactions?from=${fromTimestamp}&to=${toTimestamp}&limit=100`
    
    try {
      const { data } = await axios.get(url, { headers: getAuthHeader() })
      
      // Data bisa berupa array atau object dengan property transactions
      const transactions = Array.isArray(data) ? data : (data.transactions || [])
      
      // Cari transaksi yang match dengan amount dan payment_type = qris
      const match = transactions.find(tx => {
        const txAmount = Number(tx.gross_amount || tx.amount || 0)
        const txType = (tx.payment_type || '').toLowerCase()
        const txStatus = (tx.transaction_status || '').toLowerCase()
        
        // Match jika amount sama dan payment type adalah qris, dan status settlement/capture
        return txAmount === Number(amount) && 
               txType === 'qris' && 
               (txStatus === 'settlement' || txStatus === 'capture')
      })
      
      if (match) {
        console.log(`✅ [Midtrans] Found static QRIS transaction: ${match.transaction_id || match.order_id}`)
        return match
      }
      
      return null
    } catch (apiError) {
      if (apiError.response && apiError.response.status === 503) {
        transactionListFailures = Math.min(transactionListFailures + 1, 6)
        transactionListRetryAt = Date.now() + Math.min(1000 * (2 ** transactionListFailures), 60000)
      }
      return null
    }
  } catch (error) {
    console.error(`❌ [Midtrans] Error finding static QRIS transaction:`, error.message)
    return null
  }
}

/**
 * Check apakah pembayaran QRIS statis sudah masuk via API
 * @param {number} totalAmount - Total amount dengan kode unik
 * @param {number} createdAtTimestamp - Timestamp saat order dibuat (milliseconds)
 * @returns {Promise<Object>} { found: boolean, transaction: Object|null, status: string }
 */
async function checkStaticQRISPayment(totalAmount, createdAtTimestamp) {
  try {
    // Cari transaksi dalam rentang waktu (dari order dibuat sampai sekarang + 5 menit buffer)
    const endTime = Date.now() + (5 * 60 * 1000) // 5 menit ke depan
    
    const transaction = await findStaticQRISTransaction(totalAmount, createdAtTimestamp, endTime)
    
    if (transaction) {
      const status = (transaction.transaction_status || '').toLowerCase()
      const isPaid = status === 'settlement' || status === 'capture'
      
      return {
        found: true,
        paid: isPaid,
        transaction: transaction,
        status: status.toUpperCase(),
        transaction_id: transaction.transaction_id,
        order_id: transaction.order_id,
        gross_amount: transaction.gross_amount || transaction.amount || 0,
        settlement_time: transaction.settlement_time || transaction.transaction_time
      }
    }
    
    return {
      found: false,
      paid: false,
      transaction: null,
      status: 'NOT_FOUND'
    }
  } catch (error) {
    console.error(`❌ [Midtrans] Error checking static QRIS payment:`, error.message)
    return {
      found: false,
      paid: false,
      transaction: null,
      status: 'ERROR',
      error: error.message
    }
  }
}

const core = {
  serverKey: MIDTRANS_SERVER_KEY,
  baseUrl
}

const isProduction = MIDTRANS_PRODUCTION

module.exports = {
  // exported helpers used by index.js
  createPaymentLink,
  getPaymentLinkStatus,
  isPaymentCompleted,
  createQRISCore,
  createQRISPayment,
  getTransactionStatusByOrderId,
  getTransactionStatusByTransactionId,
  findStaticQRISTransaction,
  checkStaticQRISPayment,
  safeChargeDiagnostic,
  core,
  isProduction
}


