require('dotenv').config();
const usePg = String(process.env.USE_PG || '').toLowerCase() === 'true';
let pg; if (usePg) { pg = require('../config/postgres'); }

// Helper function untuk memastikan database tersimpan (no-op untuk PG)
async function ensureDatabaseSaved() {
  if (usePg) return true;
  try {
    if (global.db) {
      await global.db.save();
      console.log('Database saved successfully');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error saving database:', error);
    return false;
  }
}

// Helper function untuk update saldo dengan auto-save
async function updateUserSaldo(userId, amount, operation = 'add') {
  try {
    if (usePg) {
      const delta = Number(amount) || 0;
      const idWith = /@s\.whatsapp\.net$/.test(userId) ? userId : `${userId}@s.whatsapp.net`;
      const idNo = userId.replace(/@s\.whatsapp\.net$/, '');
      if (operation === 'set') {
        await pg.query(
          'INSERT INTO users(user_id, saldo, role, data) VALUES ($1,$2,COALESCE((SELECT role FROM users WHERE user_id=$1),' + "'bronze'" + '), COALESCE((SELECT data FROM users WHERE user_id=$1),' + "'{}'" + '::jsonb)) ON CONFLICT (user_id) DO UPDATE SET saldo=$2',
          [idWith, delta]
        );
      } else if (operation === 'subtract') {
        await pg.query('UPDATE users SET saldo = GREATEST(saldo - $2, 0) WHERE user_id=$1', [idWith, Math.abs(delta)]);
      } else {
        await pg.query('INSERT INTO users(user_id, saldo, role, data) VALUES ($1,$2,' + "'bronze'" + ', ' + "'{}'" + '::jsonb) ON CONFLICT (user_id) DO UPDATE SET saldo = users.saldo + EXCLUDED.saldo', [idWith, Math.abs(delta)]);
      }
      // Update in-memory snapshot for compatibility
      if (!global.db.data) global.db.data = {};
      if (!global.db.data.users) global.db.data.users = {};
      if (!global.db.data.users[idWith]) global.db.data.users[idWith] = { saldo: 0, role: 'bronze' };
      if (!global.db.data.users[idNo]) global.db.data.users[idNo] = { saldo: 0, role: 'bronze' };
      if (operation === 'set') {
        global.db.data.users[idWith].saldo = delta;
        global.db.data.users[idNo].saldo = delta;
      } else if (operation === 'subtract') {
        const nv = Math.max(0, Number(global.db.data.users[idWith].saldo || 0) - Math.abs(delta));
        global.db.data.users[idWith].saldo = nv;
        global.db.data.users[idNo].saldo = nv;
      } else {
        const nv = Number(global.db.data.users[idWith].saldo || 0) + Math.abs(delta);
        global.db.data.users[idWith].saldo = nv;
        global.db.data.users[idNo].saldo = nv;
      }
      return true;
    } else {
      if (!global.db || !global.db.data || !global.db.data.users) {
        console.error('Database not initialized');
        return false;
      }
      if (!global.db.data.users[userId]) {
        global.db.data.users[userId] = { saldo: 0, role: "bronze" };
      }
      if (operation === 'add') {
        global.db.data.users[userId].saldo += Number(amount);
      } else if (operation === 'subtract') {
        global.db.data.users[userId].saldo -= Number(amount);
        if (global.db.data.users[userId].saldo < 0) global.db.data.users[userId].saldo = 0;
      } else if (operation === 'set') {
        global.db.data.users[userId].saldo = Number(amount);
      }
      await global.db.save();
      console.log(`User ${userId} saldo updated: ${global.db.data.users[userId].saldo}`);
      return true;
    }
  } catch (error) {
    console.error('Error updating user saldo:', error);
    return false;
  }
}

// Helper function untuk get user saldo
function getUserSaldo(userId) {
  try {
    if (usePg) {
      const users = global.db && global.db.data && global.db.data.users ? global.db.data.users : {};
      const idWith = /@s\.whatsapp\.net$/.test(userId) ? userId : `${userId}@s.whatsapp.net`;
      const idNo = userId.replace(/@s\.whatsapp\.net$/, '');
      const u = users[idWith] || users[idNo];
      return u ? Number(u.saldo || 0) : 0;
    } else {
      if (!global.db || !global.db.data || !global.db.data.users) return 0;
      if (!global.db.data.users[userId]) {
        global.db.data.users[userId] = { saldo: 0, role: "bronze" };
        return 0;
      }
      return global.db.data.users[userId].saldo || 0;
    }
  } catch (error) {
    console.error('Error getting user saldo:', error);
    return 0;
  }
}

// Helper function untuk check apakah user punya saldo cukup
function hasEnoughSaldo(userId, requiredAmount) {
  const currentSaldo = getUserSaldo(userId);
  return currentSaldo >= Number(requiredAmount);
}

module.exports = {
  ensureDatabaseSaved,
  updateUserSaldo,
  getUserSaldo,
  hasEnoughSaldo
}; 