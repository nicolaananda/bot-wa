/**
 * Balance/Saldo Commands
 */

module.exports = {
    name: ['saldo', 'ceksaldo', 'balance'],
    description: 'Check user balance',
    category: 'general',
    usage: 'saldo [nomor]',
    ownerOnly: false,
    
    async execute(ctx) {
        const { args, isOwner, sender, reply } = ctx;
        
        // Check if there's a phone number parameter
        if (args.length > 0) {
            // Only owner can check other people's saldo by phone number
            if (!isOwner) {
                return reply('❌ Maaf, hanya owner yang bisa cek saldo user lain dengan nomor HP.\\n\\n💡 *Tips:* Gunakan command ini tanpa parameter untuk cek saldo sendiri.');
            }
            
            let phoneNumber = args[0];
            
            // Clean phone number (remove +, -, spaces, etc)
            phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
            
            // Check both formats: with and without @s.whatsapp.net suffix
            const cleanPhoneNumber = phoneNumber;
            const targetUserIdWithSuffix = phoneNumber + '@s.whatsapp.net';
            
            // Try to find user in database with both formats
            let targetUser = null;
            let foundKey = null;
            
            if (global.db.data.users && global.db.data.users[cleanPhoneNumber]) {
                targetUser = global.db.data.users[cleanPhoneNumber];
                foundKey = cleanPhoneNumber;
            } else if (global.db.data.users && global.db.data.users[targetUserIdWithSuffix]) {
                targetUser = global.db.data.users[targetUserIdWithSuffix];
                foundKey = targetUserIdWithSuffix;
            }
            
            if (targetUser) {
                // Try to get saldo from cache first for better performance
                const { getCachedSaldo, setCachedSaldo } = require('../../../index');
                let saldo = getCachedSaldo(foundKey);
                if (saldo === null) {
                    // If not in cache, get from database and cache it
                    saldo = parseInt(targetUser.saldo) || 0;
                    setCachedSaldo(foundKey, saldo);
                }
                
                const username = targetUser.username || \User \\;
                const { toRupiah } = require('../../../function/myfunc');
                
                return reply(\*💰 Cek Saldo User (Owner Only)*\\n\\n👤 *User:* \\\n📱 *Nomor HP:* \\\n💳 *Saldo:* Rp\\\n\\n👑 *Checked by:* Owner\);
            } else {
                // User not found, create new user with 0 saldo
                if (!global.db.data.users) global.db.data.users = {};
                
                // Create user with both formats
                global.db.data.users[cleanPhoneNumber] = {
                    saldo: 0,
                    role: 'bronze',
                    username: \User \\,
                    createdAt: new Date().toISOString()
                };
                
                // Also create with suffix format for consistency
                global.db.data.users[targetUserIdWithSuffix] = {
                    saldo: 0,
                    role: 'bronze',
                    username: \User \\,
                    createdAt: new Date().toISOString()
                };
                
                await global.db.save();
                const { toRupiah } = require('../../../function/myfunc');
                
                return reply(\*💰 Cek Saldo User (Owner Only)*\\n\\n�� *User:* User \\\n📱 *Nomor HP:* \\\n💳 *Saldo:* Rp0\\n\\n👑 *Checked by:* Owner\\n\\n💡 *Info:* User baru dibuat dengan saldo 0\);
            }
        }
        
        // Check own saldo
        const userData = ctx.getUserData();
        const { toRupiah } = require('../../../function/myfunc');
        
        return reply(\*💰 Cek Saldo Sendiri*\\n\\n👤 *User:* \\\n🆔 *ID:* \\\n💳 *Saldo:* Rp\\\n\\n💡 *Saldo hanya untuk transaksi dibot ini.*\);
    }
};
