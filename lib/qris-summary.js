const moment = require('moment-timezone')

const SUCCESS_STATUSES = new Set(['completed', 'success', 'successful', 'paid', 'settlement', 'capture'])
const FAILED_STATUSES = new Set(['pending', 'failed', 'failure', 'cancel', 'cancelled', 'deny', 'denied', 'expire', 'expired', 'refund', 'refunded'])

function transactionDateWib(transaction) {
  const value = transaction.date || transaction.created_at || transaction.createdAt
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}(?: |$)/.test(String(value))) {
    const parsed = moment.tz(String(value), ['YYYY-MM-DD HH:mm:ss', 'YYYY-MM-DD'], true, 'Asia/Jakarta')
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null
  }
  const parsed = moment(value)
  return parsed.isValid() ? parsed.tz('Asia/Jakarta').format('YYYY-MM-DD') : null
}

function isSuccessful(transaction) {
  const status = String(transaction.status || transaction.transaction_status || '').toLowerCase()
  if (!status) return true // ponytail: legacy records have no status; require status after data migration.
  if (FAILED_STATUSES.has(status)) return false
  return SUCCESS_STATUSES.has(status)
}

function isDeposit(transaction) {
  return String(transaction.type || '').toLowerCase() === 'deposit' ||
    String(transaction.metodeBayar || '').toLowerCase() === 'deposit'
}

function paymentMethod(transaction) {
  const explicit = transaction.payment_method || transaction.paymentMethod || transaction.payment ||
    (String(transaction.metodeBayar || '').toLowerCase() !== 'deposit' && transaction.metodeBayar)
  if (explicit) return String(explicit).toUpperCase()
  // Legacy QRIS deposit completion records use a DEP-* reference without a method field.
  const ref = transaction.ref_id || transaction.reffId || transaction.order_id || transaction.orderId || ''
  return isDeposit(transaction) && String(ref).startsWith('DEP-') ? 'QRIS' : ''
}

function amount(transaction) {
  for (const value of [transaction.amount, transaction.totalBayar, transaction.price]) {
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return 0
}

function transactionKey(transaction, index) {
  return transaction.ref_id || transaction.reffId || transaction.order_id || transaction.orderId || `row:${index}`
}

function summarizeQris(transactions, startDate, endDate = startDate) {
  const seen = new Set()
  const summary = { salesCount: 0, salesAmount: 0, depositCount: 0, depositAmount: 0, totalCount: 0, totalAmount: 0 }

  ;(transactions || []).forEach((transaction, index) => {
    const date = transactionDateWib(transaction)
    const key = transactionKey(transaction, index)
    if (!date || date < startDate || date > endDate || seen.has(key) || !isSuccessful(transaction)) return
    seen.add(key)
    if (paymentMethod(transaction) !== 'QRIS') return

    const value = amount(transaction)
    if (isDeposit(transaction)) {
      summary.depositCount++
      summary.depositAmount += value
    } else {
      summary.salesCount++
      summary.salesAmount += value
    }
  })
  summary.totalCount = summary.salesCount + summary.depositCount
  summary.totalAmount = summary.salesAmount + summary.depositAmount
  return summary
}

module.exports = { summarizeQris, transactionDateWib }
