// Helper function untuk memastikan database tersimpan
async function ensureDatabaseSaved() {
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
    if (!global.db || !global.db.data || !global.db.data.users) {
      console.error('Database not initialized');
      return false;
    }

    if (!global.db.data.users[userId]) {
      global.db.data.users[userId] = {
        saldo: 0,
        role: "bronze"
      };
    }

    if (operation === 'add') {
      global.db.data.users[userId].saldo += Number(amount);
    } else if (operation === 'subtract') {
      global.db.data.users[userId].saldo -= Number(amount);
      if (global.db.data.users[userId].saldo < 0) {
        global.db.data.users[userId].saldo = 0;
      }
    } else if (operation === 'set') {
      global.db.data.users[userId].saldo = Number(amount);
    }

    // Force save database
    await global.db.save();
    console.log(`User ${userId} saldo updated: ${global.db.data.users[userId].saldo}`);
    return true;
  } catch (error) {
    console.error('Error updating user saldo:', error);
    return false;
  }
}

// Helper function untuk get user saldo
function getUserSaldo(userId) {
  try {
    if (!global.db || !global.db.data || !global.db.data.users) {
      return 0;
    }

    if (!global.db.data.users[userId]) {
      global.db.data.users[userId] = {
        saldo: 0,
        role: "bronze"
      };
      return 0;
    }

    return global.db.data.users[userId].saldo || 0;
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