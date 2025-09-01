/**
 * Owner Commands - Add Saldo
 */

const { sleep, toRupiah } = require('../../../function/myfunc');

module.exports = {
    name: ['addsaldo'],
    description: 'Add saldo to user',
    category: 'owner',
    usage: 'addsaldo <nomor>,<nominal>',
    ownerOnly: true,
    
    async execute(ctx) {
        const { q, reply, ronzz, sender } = ctx;
        
        if (!q) return reply(\Contoh: \addsaldo 628xx,20000\);
        if (!q.split(',')[0]) return reply(\Contoh: \addsaldo 628xx,20000\);
        if (!q.split(',')[1]) return reply(\Contoh: \addsaldo 628xx,20000\);
        
        let targetNumber = q.split(',')[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
        let nominal = Number(q.split(',')[1]);
        
        // Check if user exists, if not create them
        if (!global.db.data.users[targetNumber]) {
            global.db.data.users[targetNumber] = {
                saldo: 0,
                role: 'bronze'
            };
        }
        
        global.db.data.users[targetNumber].saldo += nominal;
        await global.db.save(); // Force save database
        await sleep(50);
        
        // Notify admin
        await ronzz.sendMessage(ctx.from, { 
            text: \*SALDO BERHASIL DITAMBAHKAN!*\\n\\n👤 *User:* @\\\n💰 *Nominal:* Rp\\\n💳 *Saldo Sekarang:* Rp\\, 
            mentions: [targetNumber] 
        }, { quoted: ctx.m });
        
        // Notify user
        await ronzz.sendMessage(targetNumber, { 
            text: \💰 *SALDO BERHASIL DITAMBAHKAN!*\\n\\n👤 *User:* @\\\n💰 *Nominal:* Rp\\\n💳 *Saldo Sekarang:* Rp\\\n\\n*By:* @\\, 
            mentions: [targetNumber, sender] 
        });
        
        // Notify admin numbers
        const adminNumbers = ['6281389592985@s.whatsapp.net', '6285235540944@s.whatsapp.net'];
        for (const adminJid of adminNumbers) {
            await ronzz.sendMessage(adminJid, { 
                text: \💰 *SALDO BERHASIL DITAMBAHKAN!*\\n\\n👤 *User:* @\\\n💰 *Nominal:* Rp\\\n💳 *Saldo Sekarang:* Rp\\\n\\n*By:* @\\, 
                mentions: [targetNumber, sender] 
            });
        }
    }
};
