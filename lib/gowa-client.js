/**
 * Gowa WhatsApp API Client
 * Low-level HTTP client for go-whatsapp-web-multidevice API
 * 
 * API Documentation: https://github.com/aldinokemal/go-whatsapp-web-multidevice
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

class GowaClient {
    constructor(config = {}) {
        this.baseUrl = config.baseUrl || process.env.GOWA_API_URL || 'http://localhost:3000';
        this.username = config.username || process.env.GOWA_USERNAME || 'admin';
        this.password = config.password || process.env.GOWA_PASSWORD || '';
        this.deviceId = config.deviceId || process.env.GOWA_DEVICE_ID || 'default';

        // Create axios instance with default config
        this.axios = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            },
            // Basic Authentication
            auth: {
                username: this.username,
                password: this.password
            }
        });

        // Add response interceptor for error handling
        this.axios.interceptors.response.use(
            response => response,
            error => {
                console.error('[GOWA-CLIENT] API Error:', error.response?.data || error.message);
                throw error;
            }
        );
    }

    /**
     * Get connection status
     */
    async getStatus() {
        try {
            const response = await this.axios.get('/app/devices');
            return response.data;
        } catch (error) {
            return { connected: false, error: error.message };
        }
    }

    /**
     * Send text message
     * @param {string} jid - WhatsApp JID (e.g., "628123456789@s.whatsapp.net")
     * @param {string} text - Message text
     * @param {object} options - Additional options
     */
    async sendText(jid, text, options = {}) {
        const phone = this._jidToPhone(jid);
        const payload = {
            phone: phone,
            message: text,
            ...options
        };

        const response = await this.axios.post('/send/message', payload);
        return this._formatMessageResponse(response.data, jid);
    }

    /**
     * Send image message
     * @param {string} jid - WhatsApp JID
     * @param {Buffer|string} image - Image buffer or base64 string
     * @param {string} caption - Image caption
     * @param {object} options - Additional options
     */
    async sendImage(jid, image, caption = '', options = {}) {
        const phone = this._jidToPhone(jid);
        const form = new FormData();

        form.append('phone', phone);
        if (caption) form.append('caption', caption);

        // Handle buffer or file path
        if (Buffer.isBuffer(image)) {
            form.append('image', image, { filename: 'image.jpg' });
        } else if (typeof image === 'string' && fs.existsSync(image)) {
            form.append('image', fs.createReadStream(image));
        } else {
            throw new Error('Invalid image format. Expected Buffer or file path.');
        }

        const response = await this.axios.post('/send/image', form, {
            headers: form.getHeaders()
        });

        return this._formatMessageResponse(response.data, jid);
    }

    /**
     * Send video message
     */
    async sendVideo(jid, video, caption = '', options = {}) {
        const phone = this._jidToPhone(jid);
        const form = new FormData();

        form.append('phone', phone);
        if (caption) form.append('caption', caption);

        if (Buffer.isBuffer(video)) {
            form.append('video', video, { filename: 'video.mp4' });
        } else if (typeof video === 'string' && fs.existsSync(video)) {
            form.append('video', fs.createReadStream(video));
        } else {
            throw new Error('Invalid video format. Expected Buffer or file path.');
        }

        const response = await this.axios.post('/send/video', form, {
            headers: form.getHeaders()
        });

        return this._formatMessageResponse(response.data, jid);
    }

    /**
     * Send document/file
     */
    async sendDocument(jid, document, filename, options = {}) {
        const phone = this._jidToPhone(jid);
        const form = new FormData();

        form.append('phone', phone);
        form.append('filename', filename);

        if (Buffer.isBuffer(document)) {
            form.append('file', document, { filename: filename });
        } else if (typeof document === 'string' && fs.existsSync(document)) {
            form.append('file', fs.createReadStream(document));
        } else {
            throw new Error('Invalid document format. Expected Buffer or file path.');
        }

        const response = await this.axios.post('/send/file', form, {
            headers: form.getHeaders()
        });

        return this._formatMessageResponse(response.data, jid);
    }

    /**
     * Send audio message
     */
    async sendAudio(jid, audio, options = {}) {
        const phone = this._jidToPhone(jid);
        const form = new FormData();

        form.append('phone', phone);

        if (Buffer.isBuffer(audio)) {
            form.append('audio', audio, { filename: 'audio.mp3' });
        } else if (typeof audio === 'string' && fs.existsSync(audio)) {
            form.append('audio', fs.createReadStream(audio));
        } else {
            throw new Error('Invalid audio format. Expected Buffer or file path.');
        }

        const response = await this.axios.post('/send/audio', form, {
            headers: form.getHeaders()
        });

        return this._formatMessageResponse(response.data, jid);
    }

    /**
     * Send sticker
     */
    async sendSticker(jid, sticker, options = {}) {
        const phone = this._jidToPhone(jid);
        const form = new FormData();

        form.append('phone', phone);

        if (Buffer.isBuffer(sticker)) {
            form.append('sticker', sticker, { filename: 'sticker.webp' });
        } else if (typeof sticker === 'string' && fs.existsSync(sticker)) {
            form.append('sticker', fs.createReadStream(sticker));
        } else {
            throw new Error('Invalid sticker format. Expected Buffer or file path.');
        }

        const response = await this.axios.post('/send/sticker', form, {
            headers: form.getHeaders()
        });

        return this._formatMessageResponse(response.data, jid);
    }

    /**
     * Send contact
     */
    async sendContact(jid, contacts, options = {}) {
        const phone = this._jidToPhone(jid);

        // Format contacts for Gowa API
        const contactList = Array.isArray(contacts) ? contacts : [contacts];

        const response = await this.axios.post('/send/contact', {
            phone: phone,
            contacts: contactList
        });

        return this._formatMessageResponse(response.data, jid);
    }

    /**
     * Send location
     */
    async sendLocation(jid, latitude, longitude, options = {}) {
        const phone = this._jidToPhone(jid);

        const response = await this.axios.post('/send/location', {
            phone: phone,
            latitude: latitude,
            longitude: longitude,
            ...options
        });

        return this._formatMessageResponse(response.data, jid);
    }

    /**
     * Delete message
     */
    async deleteMessage(jid, messageId, options = {}) {
        const phone = this._jidToPhone(jid);

        const response = await this.axios.post('/message/delete', {
            phone: phone,
            message_id: messageId
        });

        return response.data;
    }

    /**
     * Download media from message
     */
    async downloadMedia(messageId) {
        try {
            const response = await this.axios.get(`/message/download/${messageId}`, {
                responseType: 'arraybuffer'
            });
            return Buffer.from(response.data);
        } catch (error) {
            console.error('[GOWA-CLIENT] Download media error:', error.message);
            throw error;
        }
    }

    /**
     * Get group metadata
     */
    async groupMetadata(groupId) {
        const groupJid = this._ensureGroupJid(groupId);

        try {
            const response = await this.axios.get(`/group/${groupJid}`);
            return this._formatGroupMetadata(response.data);
        } catch (error) {
            console.error('[GOWA-CLIENT] Group metadata error:', error.message);
            throw error;
        }
    }

    /**
     * Get group invite code
     */
    async groupInviteCode(groupId) {
        const groupJid = this._ensureGroupJid(groupId);

        try {
            const response = await this.axios.get(`/group/${groupJid}/invite-code`);
            return response.data.code || response.data.invite_code;
        } catch (error) {
            console.error('[GOWA-CLIENT] Group invite code error:', error.message);
            throw error;
        }
    }

    /**
     * Update group subject (name)
     */
    async groupUpdateSubject(groupId, subject) {
        const groupJid = this._ensureGroupJid(groupId);

        const response = await this.axios.put(`/group/${groupJid}/subject`, {
            subject: subject
        });

        return response.data;
    }

    /**
     * Update group description
     */
    async groupUpdateDescription(groupId, description) {
        const groupJid = this._ensureGroupJid(groupId);

        const response = await this.axios.put(`/group/${groupJid}/description`, {
            description: description
        });

        return response.data;
    }

    /**
     * Update group participants (add/remove/promote/demote)
     * @param {string} groupId - Group JID
     * @param {array} participants - Array of participant JIDs
     * @param {string} action - 'add', 'remove', 'promote', 'demote'
     */
    async groupParticipantsUpdate(groupId, participants, action) {
        const groupJid = this._ensureGroupJid(groupId);
        const phones = participants.map(jid => this._jidToPhone(jid));

        const response = await this.axios.post(`/group/${groupJid}/participants`, {
            participants: phones,
            action: action
        });

        return response.data;
    }

    /**
     * Get profile picture URL
     */
    async profilePictureUrl(jid, type = 'image') {
        const phone = this._jidToPhone(jid);

        try {
            const response = await this.axios.get(`/user/${phone}/avatar`);
            return response.data.url || response.data.avatar_url;
        } catch (error) {
            // Return default avatar if not found
            return 'https://telegra.ph/file/8dcf2bc718248d2dd189b.jpg';
        }
    }

    /**
     * Update block status
     */
    async updateBlockStatus(jid, action) {
        const phone = this._jidToPhone(jid);

        const response = await this.axios.post('/user/block', {
            phone: phone,
            action: action // 'block' or 'unblock'
        });

        return response.data;
    }

    /**
     * Send presence update
     */
    async sendPresenceUpdate(presence, jid = null) {
        try {
            const payload = {
                presence: presence // 'available', 'unavailable', 'composing', 'recording'
            };

            if (jid) {
                payload.jid = jid;
            }

            const response = await this.axios.post('/user/presence', payload);
            return response.data;
        } catch (error) {
            // Presence updates are not critical, just log
            console.log('[GOWA-CLIENT] Presence update skipped:', error.message);
            return { success: false };
        }
    }

    /**
     * Revoke group invite link
     */
    async groupRevokeInvite(groupId) {
        const groupJid = this._ensureGroupJid(groupId);

        const response = await this.axios.post(`/group/${groupJid}/revoke-invite`);
        return response.data;
    }

    /**
     * Leave group
     */
    async groupLeave(groupId) {
        const groupJid = this._ensureGroupJid(groupId);

        const response = await this.axios.post(`/group/${groupJid}/leave`);
        return response.data;
    }

    /**
     * Update group settings
     */
    async groupSettingUpdate(groupId, setting, value) {
        const groupJid = this._ensureGroupJid(groupId);

        const response = await this.axios.put(`/group/${groupJid}/settings`, {
            setting: setting, // 'announcement', 'locked', 'not_announcement', 'unlocked'
            value: value
        });

        return response.data;
    }

    // ============ HELPER METHODS ============

    /**
     * Convert WhatsApp JID to phone number
     */
    _jidToPhone(jid) {
        if (!jid) return '';
        return jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    }

    /**
     * Ensure JID has group suffix
     */
    _ensureGroupJid(groupId) {
        if (!groupId) return '';
        return groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
    }

    /**
     * Format message response to Baileys-compatible format
     */
    _formatMessageResponse(data, jid) {
        return {
            key: {
                remoteJid: jid,
                fromMe: true,
                id: data.message_id || data.id || this._generateMessageId()
            },
            message: data.message || {},
            messageTimestamp: Math.floor(Date.now() / 1000),
            status: 1
        };
    }

    /**
     * Format group metadata to Baileys-compatible format
     */
    _formatGroupMetadata(data) {
        return {
            id: data.jid || data.id,
            subject: data.name || data.subject,
            subjectOwner: data.owner,
            subjectTime: data.subject_time,
            creation: data.creation,
            owner: data.owner,
            desc: data.description || data.desc,
            descId: data.desc_id,
            participants: (data.participants || []).map(p => ({
                id: p.jid || p.id,
                admin: p.is_admin ? 'admin' : (p.is_super_admin ? 'superadmin' : null),
                isSuperAdmin: p.is_super_admin || false,
                isAdmin: p.is_admin || false
            })),
            size: data.size || (data.participants || []).length,
            announce: data.announce || false,
            restrict: data.restrict || false
        };
    }

    /**
     * Generate random message ID
     */
    _generateMessageId() {
        return 'GOWA' + Math.random().toString(36).substring(2, 15).toUpperCase();
    }
}

module.exports = GowaClient;
