/**
 * Context Helper for Bot Commands
 * Provides unified interface for command execution
 */

class CommandContext {
    constructor(ronzz, m, mek, messageData) {
        // Bot instance
        this.ronzz = ronzz;
        this.m = m;
        this.mek = mek;
        
        // Extract message data
        Object.assign(this, messageData);
        
        // Bind reply functions
        this.reply = this.reply.bind(this);
        this.Reply = this.Reply.bind(this);
    }

    /**
     * Send a reply message
     */
    async reply(text, options = {}) {
        return this.ronzz.sendMessage(this.from, { 
            text: text, 
            ...options 
        }, { quoted: this.m });
    }

    /**
     * Send a styled reply message
     */
    async Reply(text) {
        const { Styles, parseMention } = require('../../function/myfunc');
        const fs = require('fs');
        
        return this.ronzz.sendMessage(this.from, { 
            text: Styles(text), 
            contextInfo: { 
                mentionedJid: parseMention(text), 
                externalAdReply: { 
                    showAdAttribution: true, 
                    title: ${global.botName} © , 
                    body: global.ownerName + global.botName, 
                    thumbnail: fs.readFileSync(global.thumbnail), 
                    sourceUrl: global.linkGroup, 
                    mediaType: 1, 
                    renderLargerThumbnail: true 
                } 
            } 
        }, { quoted: this.m });
    }

    /**
     * Send message with interactive buttons
     */
    async sendInteractive(options) {
        return this.ronzz.sendMessage(this.from, options, { quoted: this.m });
    }

    /**
     * Download and save media
     */
    async downloadMedia(type, filename) {
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const fs = require('fs');
        
        let stream;
        switch (type) {
            case 'image':
                stream = await downloadContentFromMessage(
                    this.m.message.imageMessage || this.m.message.extendedTextMessage?.contextInfo.quotedMessage.imageMessage, 
                    'image'
                );
                break;
            case 'video':
                stream = await downloadContentFromMessage(
                    this.m.message.videoMessage || this.m.message.extendedTextMessage?.contextInfo.quotedMessage.videoMessage, 
                    'video'
                );
                break;
            case 'audio':
                stream = await downloadContentFromMessage(
                    this.m.message.audioMessage || this.m.message.extendedTextMessage?.contextInfo.quotedMessage.audioMessage, 
                    'audio'
                );
                break;
            case 'sticker':
                stream = await downloadContentFromMessage(
                    this.m.message.stickerMessage || this.m.message.extendedTextMessage?.contextInfo.quotedMessage.stickerMessage, 
                    'sticker'
                );
                break;
            default:
                throw new Error('Unsupported media type');
        }

        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }
        
        if (filename) {
            fs.writeFileSync(filename, buffer);
            return filename;
        }
        
        return buffer;
    }

    /**
     * Get user database data
     */
    getUserData() {
        if (!global.db.data.users[this.sender]) {
            global.db.data.users[this.sender] = {
                saldo: 0,
                role: 'bronze'
            };
        }
        return global.db.data.users[this.sender];
    }

    /**
     * Update user saldo
     */
    async updateSaldo(amount, operation = 'add') {
        const userData = this.getUserData();
        
        switch (operation) {
            case 'add':
                userData.saldo += Number(amount);
                break;
            case 'subtract':
                userData.saldo -= Number(amount);
                if (userData.saldo < 0) userData.saldo = 0;
                break;
            case 'set':
                userData.saldo = Number(amount);
                break;
        }
        
        await global.db.save();
        return userData.saldo;
    }

    /**
     * Check if user has enough saldo
     */
    hasEnoughSaldo(amount) {
        const userData = this.getUserData();
        return userData.saldo >= amount;
    }

    /**
     * Get product data
     */
    getProduct(productId) {
        return global.db.data.produk[productId];
    }

    /**
     * Check if product exists and has stock
     */
    isProductAvailable(productId, quantity = 1) {
        const product = this.getProduct(productId);
        if (!product) return { available: false, reason: 'Product not found' };
        if (!Array.isArray(product.stok)) return { available: false, reason: 'Invalid stock data' };
        if (product.stok.length === 0) return { available: false, reason: 'Out of stock' };
        if (product.stok.length < quantity) return { available: false, reason: 'Insufficient stock' };
        return { available: true };
    }
}

module.exports = CommandContext;
