/**
 * Gowa Baileys Adapter
 * Creates a Baileys-compatible interface over Gowa REST API
 * 
 * This adapter allows existing Baileys code to work with Gowa without modifications
 */

const EventEmitter = require('events');
const GowaClient = require('./gowa-client');
const crypto = require('crypto');

class GowaAdapter extends EventEmitter {
    constructor(config = {}) {
        super();

        this.client = new GowaClient({
            baseUrl: config.baseUrl,
            username: config.username,
            password: config.password,
            deviceId: config.deviceId
        });
        this.config = config;

        // Bot user info (will be populated after connection)
        this.user = null;

        // Auth state (for compatibility)
        this.authState = {
            creds: {
                registered: true // Gowa handles auth separately
            }
        };

        // WebSocket stub (for compatibility)
        this.ws = {
            on: (event, handler) => {
                // Stub for call handling - will be implemented via webhook
                console.log(`[GOWA-ADAPTER] WS event registered: ${event}`);
            }
        };

        // Event processor stub
        this.ev = {
            on: (event, handler) => {
                this.on(event, handler);
            },
            process: async (callback) => {
                // Stub for event processing
                // Gowa uses webhooks instead of event processing
            }
        };

        // Connection state
        this.connectionState = 'close';

        // Message cache for deduplication
        this.processedMessages = new Set();

        console.log('[GOWA-ADAPTER] Initialized with config:', {
            baseUrl: this.client.baseUrl,
            deviceId: this.client.deviceId
        });
    }

    /**
     * Connect to Gowa service
     */
    async connect() {
        try {
            const status = await this.client.getStatus();

            // Gowa API returns: { code: "SUCCESS", message: "...", results: [{name, device}] }
            if (status.code === 'SUCCESS' && status.results && status.results.length > 0) {
                this.connectionState = 'open';

                // Extract user info from first device in results
                const device = status.results[0];
                this.user = {
                    id: device.device || device.jid || 'unknown',
                    name: device.name || 'Gowa Bot'
                };

                // Emit connection open event
                this.emit('connection.update', { connection: 'open' });

                console.log('[GOWA-ADAPTER] Connected successfully:', this.user);
                return true;
            } else {
                this.connectionState = 'close';
                this.emit('connection.update', { connection: 'close' });
                console.error('[GOWA-ADAPTER] Not connected to WhatsApp');
                console.error('[GOWA-ADAPTER] Response:', JSON.stringify(status));
                return false;
            }
        } catch (error) {
            this.connectionState = 'close';
            this.emit('connection.update', { connection: 'close' });
            console.error('[GOWA-ADAPTER] Connection error:', error.message);
            return false;
        }
    }

    /**
     * Send message (Baileys-compatible)
     */
    async sendMessage(jid, content, options = {}) {
        try {
            let response;

            // Handle different message types
            if (content.text) {
                response = await this.client.sendText(jid, content.text, options);
            } else if (content.image) {
                const imageBuffer = await this._resolveMedia(content.image);
                response = await this.client.sendImage(jid, imageBuffer, content.caption || '', options);
            } else if (content.video) {
                const videoBuffer = await this._resolveMedia(content.video);
                response = await this.client.sendVideo(jid, videoBuffer, content.caption || '', options);
            } else if (content.document) {
                const docBuffer = await this._resolveMedia(content.document);
                const filename = content.fileName || content.filename || 'document';
                response = await this.client.sendDocument(jid, docBuffer, filename, options);
            } else if (content.audio) {
                const audioBuffer = await this._resolveMedia(content.audio);
                response = await this.client.sendAudio(jid, audioBuffer, options);
            } else if (content.sticker) {
                const stickerBuffer = await this._resolveMedia(content.sticker);
                response = await this.client.sendSticker(jid, stickerBuffer, options);
            } else if (content.contacts) {
                const contacts = this._formatContacts(content.contacts);
                response = await this.client.sendContact(jid, contacts, options);
            } else if (content.location) {
                response = await this.client.sendLocation(
                    jid,
                    content.location.degreesLatitude,
                    content.location.degreesLongitude,
                    options
                );
            } else if (content.delete) {
                // Delete message
                const messageId = content.delete.id || content.delete;
                response = await this.client.deleteMessage(jid, messageId, options);
            } else {
                console.warn('[GOWA-ADAPTER] Unknown message type:', Object.keys(content));
                response = await this.client.sendText(jid, JSON.stringify(content), options);
            }

            return response;
        } catch (error) {
            console.error('[GOWA-ADAPTER] Send message error:', error.message);
            throw error;
        }
    }

    /**
     * Download media from message
     */
    async downloadMedia(message) {
        try {
            // Extract message ID from message object
            const messageId = message.id || message.key?.id || message;

            if (!messageId) {
                throw new Error('Invalid message ID for download');
            }

            return await this.client.downloadMedia(messageId);
        } catch (error) {
            console.error('[GOWA-ADAPTER] Download media error:', error.message);
            throw error;
        }
    }

    /**
     * Get group metadata
     */
    async groupMetadata(groupId) {
        return await this.client.groupMetadata(groupId);
    }

    /**
     * Get group invite code
     */
    async groupInviteCode(groupId) {
        return await this.client.groupInviteCode(groupId);
    }

    /**
     * Update group subject
     */
    async groupUpdateSubject(groupId, subject) {
        return await this.client.groupUpdateSubject(groupId, subject);
    }

    /**
     * Update group description
     */
    async groupUpdateDescription(groupId, description) {
        return await this.client.groupUpdateDescription(groupId, description);
    }

    /**
     * Update group participants
     */
    async groupParticipantsUpdate(groupId, participants, action) {
        return await this.client.groupParticipantsUpdate(groupId, participants, action);
    }

    /**
     * Revoke group invite
     */
    async groupRevokeInvite(groupId) {
        return await this.client.groupRevokeInvite(groupId);
    }

    /**
     * Leave group
     */
    async groupLeave(groupId) {
        return await this.client.groupLeave(groupId);
    }

    /**
     * Update group settings
     */
    async groupSettingUpdate(groupId, setting) {
        return await this.client.groupSettingUpdate(groupId, setting);
    }

    /**
     * Baileys compatible readMessages
     * @param {Array} keys - Array of message keys to mark as read
     */
    async readMessages(keys) {
        // Gowa service handles read receipts automatically or via different endpoint
        // Stub implementation to prevent crash
        return true;
    }

    /**
     * Get profile picture URL
     */
    async profilePictureUrl(jid, type = 'image') {
        if (!jid) return null;
        return await this.client.profilePictureUrl(jid, type);
    }

    /**
     * Update block status
     */
    async updateBlockStatus(jid, action) {
        return await this.client.updateBlockStatus(jid, action);
    }

    /**
     * Send presence update
     */
    async sendPresenceUpdate(presence, jid = null) {
        return await this.client.sendPresenceUpdate(presence, jid);
    }

    /**
     * Decode JID
     */
    decodeJid(jid) {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            const parts = jid.split(':');
            if (parts.length >= 2) {
                const userServer = parts[1].split('@');
                return userServer[0] + '@' + userServer[1];
            }
        }
        return jid;
    }

    /**
     * Get contact name
     */
    getName(jid, withoutContact = false) {
        // Simplified version - just return phone number formatted
        const phone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
        return phone;
    }

    /**
     * Send contact (helper)
     */
    async sendContact(jid, contacts, quoted = '', opts = {}) {
        const contactList = Array.isArray(contacts) ? contacts : [contacts];
        const formattedContacts = contactList.map(contact => ({
            phone: contact.replace('@s.whatsapp.net', ''),
            name: this.getName(contact + '@s.whatsapp.net')
        }));

        return await this.client.sendContact(jid, formattedContacts, opts);
    }

    /**
     * Send image (helper)
     */
    async sendImage(jid, path, caption = '', quoted = '', options = {}) {
        const buffer = await this._resolveMedia(path);
        return await this.client.sendImage(jid, buffer, caption, options);
    }

    /**
     * Send image as sticker
     */
    async sendImageAsSticker(jid, path, quoted, options = {}) {
        const buffer = await this._resolveMedia(path);
        return await this.client.sendSticker(jid, buffer, options);
    }

    /**
     * Send video as sticker
     */
    async sendVideoAsSticker(jid, path, quoted, options = {}) {
        const buffer = await this._resolveMedia(path);
        return await this.client.sendSticker(jid, buffer, options);
    }

    /**
     * Handle incoming webhook from Gowa
     */
    handleWebhook(webhookData) {
        try {
            // Convert Gowa webhook to Baileys message format
            const baileysMessage = this._convertToBaileysFormat(webhookData);

            if (!baileysMessage) {
                console.warn('[GOWA-ADAPTER] Invalid webhook data, skipping');
                return;
            }

            // Check for duplicates
            const messageId = baileysMessage.key?.id;
            if (messageId && this.processedMessages.has(messageId)) {
                console.log('[GOWA-ADAPTER] Duplicate message, skipping:', messageId);
                return;
            }

            if (messageId) {
                this.processedMessages.add(messageId);

                // Clean up old messages (keep last 1000)
                if (this.processedMessages.size > 1000) {
                    const toDelete = Array.from(this.processedMessages).slice(0, 100);
                    toDelete.forEach(id => this.processedMessages.delete(id));
                }
            }

            // Emit messages.upsert event
            this.emit('messages.upsert', {
                messages: [baileysMessage],
                type: 'notify'
            });

            console.log('[GOWA-ADAPTER] Message processed:', messageId);
        } catch (error) {
            console.error('[GOWA-ADAPTER] Webhook handling error:', error.message);
        }
    }

    /**
     * Convert Gowa webhook format to Baileys message format
     */
    _convertToBaileysFormat(webhookData) {
        try {
            // Extract JID from top-level or inner message
            // Gowa webhook: { chat_id, from, message: {...} }
            let remoteJid = webhookData.from ||
                webhookData.chat_id ||
                webhookData.chat ||
                (webhookData.message && (webhookData.message.from || webhookData.message.chat || webhookData.message.jid));

            const messageContent = webhookData.message || webhookData;
            const messageId = webhookData.id || (messageContent && (messageContent.id || messageContent.messageId)) || this._generateMessageId();

            // Determine fromMe
            const fromMe = webhookData.fromMe || (messageContent && messageContent.fromMe) || false;

            // Determine participant (for groups)
            let participant = webhookData.participant || (messageContent && messageContent.participant);

            // Handle "sender in group" format (e.g. "628xxx@s.whatsapp.net in 123xxx@g.us")
            if (typeof remoteJid === 'string' && remoteJid.includes(' in ')) {
                const parts = remoteJid.split(' in ');
                if (parts.length === 2) {
                    participant = parts[0];
                    remoteJid = parts[1];
                }
            }

            return {
                key: {
                    remoteJid: this._formatJid(remoteJid),
                    fromMe: fromMe,
                    id: messageId,
                    participant: participant ? this._formatJid(participant) : undefined
                },
                message: this._buildMessageContent(messageContent),
                messageTimestamp: messageContent.timestamp || Math.floor(Date.now() / 1000),
                pushName: messageContent.pushName || messageContent.senderName || 'Unknown'
            };
        } catch (error) {
            console.error('[GOWA-ADAPTER] Message conversion error:', error.message);
            return null;
        }
    }

    /**
     * Build message content from webhook data
     */
    _buildMessageContent(message) {
        const content = {};

        if (message.text || message.body) {
            content.conversation = message.text || message.body;
        } else if (message.type === 'image' && message.imageMessage) {
            content.imageMessage = message.imageMessage;
        } else if (message.type === 'video' && message.videoMessage) {
            content.videoMessage = message.videoMessage;
        } else if (message.type === 'document' && message.documentMessage) {
            content.documentMessage = message.documentMessage;
        } else if (message.type === 'audio' && message.audioMessage) {
            content.audioMessage = message.audioMessage;
        } else if (message.type === 'sticker' && message.stickerMessage) {
            content.stickerMessage = message.stickerMessage;
        }

        return content;
    }

    /**
     * Resolve media (buffer, URL, or file path)
     */
    async _resolveMedia(media) {
        if (Buffer.isBuffer(media)) {
            return media;
        } else if (typeof media === 'object' && media.url) {
            // Download from URL
            const axios = require('axios');
            const response = await axios.get(media.url, { responseType: 'arraybuffer' });
            return Buffer.from(response.data);
        } else if (typeof media === 'string') {
            // File path or URL
            if (media.startsWith('http')) {
                const axios = require('axios');
                const response = await axios.get(media, { responseType: 'arraybuffer' });
                return Buffer.from(response.data);
            } else {
                const fs = require('fs');
                return fs.readFileSync(media);
            }
        }

        throw new Error('Invalid media format');
    }

    /**
     * Format contacts for Gowa API
     */
    _formatContacts(contacts) {
        const displayName = contacts.displayName || 'Contact';
        const contactList = contacts.contacts || [];

        return contactList.map(contact => {
            // Parse vCard
            const vcard = contact.vcard || '';
            const phoneMatch = vcard.match(/waid=(\d+)/);
            const nameMatch = vcard.match(/FN:(.+)/);

            return {
                phone: phoneMatch ? phoneMatch[1] : '',
                name: nameMatch ? nameMatch[1] : displayName
            };
        });
    }

    /**
     * Generate random message ID
     */
    _generateMessageId() {
        return 'GOWA' + crypto.randomBytes(8).toString('hex').toUpperCase();
    }

    /**
     * Helper to format JID
     */
    _formatJid(jid) {
        if (!jid) return '';
        if (typeof jid !== 'string') return '';
        // If it's just a number, assume private chat
        if (/^\d+$/.test(jid)) return jid + '@s.whatsapp.net';
        return jid;
    }
}

module.exports = GowaAdapter;
