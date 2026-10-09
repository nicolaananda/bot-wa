const assert = require('assert')
const axios = require('axios')

async function run() {
  const original = axios.post
  const midtrans = require('../../config/midtrans')
  try {
    axios.post = async () => ({ data: { status_code: '201', order_id: 'MID-EXACT-01', transaction_id: 'tx-exact-02', qr_string: '000201-realistic-qr' } })
    const success = await midtrans.createQRISPayment(12500, 'MID-EXACT-01')
    assert.strictEqual(success.order_id, 'MID-EXACT-01')
    assert.strictEqual(success.transaction_id, 'tx-exact-02')

    axios.post = async () => ({ data: { status_code: '401', status_message: 'Access denied token=supersecret customer 628123456789 https://private.test', transaction_id: 'must-not-pass' } })
    await assert.rejects(
      midtrans.createQRISPayment(12500, 'MID-FAIL-01'),
      error => error.code === 'MIDTRANS_CHARGE_FAILED' &&
        error.diagnostic.classification === 'authentication' &&
        error.diagnostic.provider_status_code === '401' &&
        !JSON.stringify(error).includes('supersecret') &&
        !JSON.stringify(error.diagnostic).includes('628123456789')
    )

    axios.post = async () => { const error = new Error('socket detail'); error.response = { status: 503, data: { status_code: '503', status_message: 'Temporarily unavailable' } }; throw error }
    await assert.rejects(midtrans.createQRISPayment(12500, 'MID-FAIL-02'), error => error.diagnostic.http_status === 503 && error.diagnostic.classification === 'provider_unavailable')
    console.log('midtrans charge offline tests passed')
  } finally {
    axios.post = original
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })