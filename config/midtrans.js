const axios = require('axios')

const MIDTRANS_SERVER_KEY = process.env.MIDTRANS_SERVER_KEY || ''
const MIDTRANS_PRODUCTION = String(process.env.MIDTRANS_PRODUCTION || process.env.MIDTRANS_IS_PRODUCTION || 'false').toLowerCase() === 'true'

const baseUrl = MIDTRANS_PRODUCTION ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com'

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
    const detail = resp ? (typeof resp.data === 'object' ? JSON.stringify(resp.data) : String(resp.data)) : err.message
    throw new Error(`Midtrans charge failed: ${detail}`)
  }
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
  core,
  isProduction
}


