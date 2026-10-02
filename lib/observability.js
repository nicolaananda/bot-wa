'use strict'

const crypto = require('crypto')

function correlationId(value) {
  const clean = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)
  return clean || crypto.randomUUID()
}

function safeError(error, fields = {}) {
  const allowed = ['stage', 'provider', 'orderId', 'refId', 'status', 'attempts']
  return Object.fromEntries([
    ['level', 'error'],
    ['correlationId', correlationId(fields.correlationId || fields.orderId || fields.refId)],
    ['event', String(fields.event || 'operation_failed').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64)],
    ['error', String(error?.message || error || 'unknown error').replace(/[\r\n]/g, ' ').slice(0, 300)],
    ...allowed.filter((key) => fields[key] !== undefined).map((key) => [key, String(fields[key]).slice(0, 100)]),
  ])
}

function logError(error, fields) {
  console.error(JSON.stringify(safeError(error, fields)))
}

module.exports = { correlationId, logError, safeError }
