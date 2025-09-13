// Database helper functions

function getUserData(userId) {
  if (!global.db.data.users[userId]) {
    global.db.data.users[userId] = {
      saldo: 0,
      role: "bronze"
    }
  }
  return global.db.data.users[userId]
}

function updateUserSaldo(userId, amount) {
  const user = getUserData(userId)
  user.saldo += amount
  return user.saldo
}

function getUserSaldo(userId) {
  const user = getUserData(userId)
  return user.saldo
}

function setUserRole(userId, role) {
  const user = getUserData(userId)
  user.role = role
  return user
}

function addTransaction(data) {
  if (!global.db.data.transaksi) global.db.data.transaksi = []
  
  const transaction = {
    id: data.id || generateTransactionId(),
    userId: data.userId,
    type: data.type, // 'deposit', 'topup', 'refund'
    amount: data.amount,
    status: data.status || 'pending',
    product: data.product || null,
    target: data.target || null,
    payment_method: data.payment_method || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
  
  global.db.data.transaksi.push(transaction)
  return transaction
}

function updateTransaction(transactionId, updates) {
  const index = global.db.data.transaksi.findIndex(t => t.id === transactionId)
  if (index !== -1) {
    global.db.data.transaksi[index] = {
      ...global.db.data.transaksi[index],
      ...updates,
      updated_at: new Date().toISOString()
    }
    return global.db.data.transaksi[index]
  }
  return null
}

function getTransaction(transactionId) {
  return global.db.data.transaksi.find(t => t.id === transactionId)
}

function getUserTransactions(userId) {
  return global.db.data.transaksi.filter(t => t.userId === userId)
}

function generateTransactionId() {
  const crypto = require('crypto')
  return crypto.randomBytes(8).toString('hex').toUpperCase()
}

function getStats() {
  const users = Object.keys(global.db.data.users || {}).length
  const transactions = (global.db.data.transaksi || []).length
  const totalSaldo = Object.values(global.db.data.users || {})
    .reduce((total, user) => total + (user.saldo || 0), 0)
  
  return {
    users,
    transactions,
    totalSaldo
  }
}

module.exports = {
  getUserData,
  updateUserSaldo,
  getUserSaldo,
  setUserRole,
  addTransaction,
  updateTransaction,
  getTransaction,
  getUserTransactions,
  generateTransactionId,
  getStats
} 