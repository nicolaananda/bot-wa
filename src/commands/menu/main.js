/**
 * Menu Commands
 * Display various menus for the bot
 */

const fs = require('fs');

module.exports = {
    name: ['menu', 'help'],
    description: 'Display main menu',
    category: 'menu',
    usage: 'menu',
    
    async execute(ctx) {
        const { ronzz, from, m, sender, pushname, prefix, parseMention } = ctx;
        
        let teks = global.menu(prefix, sender, pushname);
        
        await ronzz.sendMessage(from, {
            footer: \\ © \\,
            buttons: [
                {
                    buttonId: '.saldo', 
                    buttonText: { displayText: 'Saldo 📥' }, 
                    type: 1,
                }, 
                {
                    buttonId: '.owner', 
                    buttonText: { displayText: 'Owner 👤' }, 
                    type: 1,
                },
                {
                    buttonId: 'action',
                    buttonText: { displayText: 'ini pesan interactiveMeta' },
                    type: 4,
                    nativeFlowInfo: {
                        name: 'single_select',
                        paramsJson: JSON.stringify({
                            title: 'Click To List',
                            sections: [
                                {
                                    title: 'INFORMATION',
                                    rows: [
                                        {
                                            title: 'Saldo 💳',
                                            description: 'Menampilkan saldo kamu',
                                            id: '.saldo'
                                        },
                                        {
                                            title: 'List Harga 💰',
                                            description: 'Menampilkan list harga layanan',
                                            id: '.listharga'
                                        }
                                    ]
                                },
                                {
                                    title: 'LIST MENU',
                                    highlight_label: 'Recommend',
                                    rows: [
                                        {
                                            title: 'All Menu 📚',
                                            description: 'Menampilkan semua menu',
                                            id: '.allmenu'
                                        },
                                        {
                                            title: 'Group Menu 🏢',
                                            description: 'Menampilkan menu group',
                                            id: '.groupmenu'
                                        },
                                        {
                                            title: 'Info Bot 📌',
                                            description: 'Menampilkan info bot',
                                            id: '.infobot'
                                        },
                                        {
                                            title: 'Order Menu 🛍️',
                                            description: 'Menampilkan menu auto order',
                                            id: '.ordermenu'
                                        },
                                        {
                                            title: 'Owner Menu 🔑',
                                            description: 'Menampilkan menu owner',
                                            id: '.ownermenu'
                                        }
                                    ]
                                }
                            ]
                        })
                    }
                }
            ],
            headerType: 1,
            viewOnce: true,
            image: fs.readFileSync(global.thumbnail),
            caption: teks,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true,
                mentionedJid: parseMention(teks),
                externalAdReply: {
                    title: global.botName,
                    body: \By \\,
                    thumbnailUrl: ctx.ppuser,
                    sourceUrl: '',
                    mediaType: 1,
                    renderLargerThumbnail: false
                }
            }
        }, { quoted: m });
    }
};
