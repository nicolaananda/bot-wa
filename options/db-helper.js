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
      const idWith = /@s\.whatsapp\.net$/.test(userId) ? userId : `${userId}@s.whatsapp.net`;
      const idNo = userId.replace(/@s\.whatsapp\.net$/, '');

      if (!global.db.data.users[idWith]) global.db.data.users[idWith] = { saldo: 0, role: 'bronze' };
      if (!global.db.data.users[idNo]) global.db.data.users[idNo] = { saldo: 0, role: 'bronze' };

      const applyOp = (current, op, amt) => {
        if (op === 'add') return Number(current || 0) + Number(amt);
        if (op === 'subtract') return Math.max(0, Number(current || 0) - Number(amt));
        if (op === 'set') return Number(amt);
        return Number(current || 0);
      };

      const nextSaldo = applyOp(global.db.data.users[idWith].saldo, operation, amount);
      global.db.data.users[idWith].saldo = nextSaldo;
      global.db.data.users[idNo].saldo = nextSaldo;

      await global.db.save();
      console.log(`User ${idWith}/${idNo} saldo updated: ${nextSaldo}`);
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
      
      // Check both formats in cache
      const u = users[idWith] || users[idNo];
      if (u) {
        return Number(u.saldo || 0);
      }
      
      // If not in cache, return 0 (cache should be populated by database loader)
      console.warn(`User ${userId} not found in cache, returning 0. This might indicate a cache sync issue.`);
      return 0;
    } else {
      if (!global.db || !global.db.data || !global.db.data.users) return 0;
      const users = global.db.data.users;
      const idWith = /@s\.whatsapp\.net$/.test(userId) ? userId : `${userId}@s.whatsapp.net`;
      const idNo = userId.replace(/@s\.whatsapp\.net$/, '');

      const u = users[idWith] || users[idNo];
      if (!u) {
        users[idWith] = { saldo: 0, role: 'bronze' };
        users[idNo] = { saldo: 0, role: 'bronze' };
        return 0;
      }
      if (!users[idWith]) users[idWith] = { saldo: Number(u.saldo || 0), role: u.role || 'bronze' };
      if (!users[idNo]) users[idNo] = { saldo: Number(u.saldo || 0), role: u.role || 'bronze' };
      return Number(u.saldo || 0);
    }
  } catch (error) {
    console.error('Error getting user saldo:', error);
    return 0;
  }
}

// Async version that reads directly from PostgreSQL when enabled
async function getUserSaldoAsync(userId) {
  try {
    if (usePg) {
      const idWith = /@s\.whatsapp\.net$/.test(userId) ? userId : `${userId}@s.whatsapp.net`;
      const idNo = userId.replace(/@s\.whatsapp\.net$/, '');
      try {
        const [resNo, resWith] = await Promise.all([
          pg.query('SELECT saldo FROM users WHERE user_id=$1', [idNo]),
          pg.query('SELECT saldo FROM users WHERE user_id=$1', [idWith])
        ]);
        const saldo1 = resNo.rows[0] ? Number(resNo.rows[0].saldo) : 0;
        const saldo2 = resWith.rows[0] ? Number(resWith.rows[0].saldo) : 0;

        // Update in-memory snapshot if present
        if (!global.db) global.db = { data: { users: {} } };
        if (!global.db.data) global.db.data = { users: {} };
        if (!global.db.data.users) global.db.data.users = {};
        const finalSaldo = Math.max(saldo1, saldo2);
        global.db.data.users[idWith] = Object.assign({ saldo: 0, role: 'bronze' }, global.db.data.users[idWith], { saldo: finalSaldo });
        global.db.data.users[idNo] = Object.assign({ saldo: 0, role: 'bronze' }, global.db.data.users[idNo], { saldo: finalSaldo });
        return finalSaldo;
      } catch (e) {
        // Fallback to cache
        return getUserSaldo(userId);
      }
    } else {
      return getUserSaldo(userId);
    }
  } catch (error) {
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
  getUserSaldoAsync,
  hasEnoughSaldo
}; 