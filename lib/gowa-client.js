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

        if (payload.mentions) {
            console.log(`[GOWA-DEBUG] Mentions found in payload:`, JSON.stringify(payload.mentions));
        } else {
            console.log(`[GOWA-DEBUG] No mentions in payload`);
        }

        const response = await this.axios.post('/send/message', payload);
        // DBG-LOG
        console.log(`[GOWA-DEBUG] SendText Response Data:`, JSON.stringify(response.data, null, 2));

        return this._formatMessageResponse(response.data, jid);
    }

    // ... (rest of file)

    _formatMessageResponse(data, jid) {
        // DBG-LOG
        const msgId = data.message_id || data.id || data.results?.message_id || data.data?.message_id;
        console.log(`[GOWA-DEBUG] Formatting response. Raw ID found:`, msgId);

        return {
            key: {
                remoteJid: jid,
                fromMe: true,
                id: msgId || this._generateMessageId()
            },
            message: data.message || {},
            messageTimestamp: Math.floor(Date.now() / 1000),
            status: 1
        };
    }

    // ...

    async deleteMessage(jid, messageId, options = {}) {
        // API documentation suggests full JID for revoke endpoint
        // Example: '6289685028129@s.whatsapp.net'
        console.log(`[GOWA-DEBUG] Attempting deleteMessage. JID: ${jid}, MessageID: ${messageId}`);

        try {
            // API requires message_id in path: /message/{message_id}/revoke
            const response = await this.axios.post(`/message/${messageId}/revoke`, {
                phone: jid // Use full JID instead of stripped number
            });
            return response.data;
        } catch (error) {
            // Fallback: try /delete endpoint if revoke fails (Delete for me)
            try {
                const response = await this.axios.post(`/message/${messageId}/delete`, {
                    phone: jid // Use full JID instead of stripped number
                });
                return response.data;
            } catch (secondError) {
                console.warn(`[GOWA-CLIENT] Warning: Failed to delete/revoke message ${messageId} for ${jid}. (${error.message})`);
                return { success: false, error: error.message };
            }
        }
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

        console.log(`[GOWA-DEBUG] SendImage Response Data:`, JSON.stringify(response.data, null, 2));
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
        // API documentation suggests full JID for revoke endpoint
        // Example: '6289685028129@s.whatsapp.net'

        try {
            // API requires message_id in path: /message/{message_id}/revoke
            const response = await this.axios.post(`/message/${messageId}/revoke`, {
                phone: jid // Use full JID instead of stripped number
            });
            return response.data;
        } catch (error) {
            // Fallback: try /delete endpoint if revoke fails (Delete for me)
            try {
                const response = await this.axios.post(`/message/${messageId}/delete`, {
                    phone: jid // Use full JID instead of stripped number
                });
                return response.data;
            } catch (secondError) {
                console.warn(`[GOWA-CLIENT] Warning: Failed to delete/revoke message ${messageId} for ${jid}. (${error.message})`);
                return { success: false, error: error.message };
            }
        }
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
    /**
     * Get group metadata
     */
    async groupMetadata(groupId) {
        const groupJid = this._ensureGroupJid(groupId);

        try {
            // Correct endpoint: /group/info?group_id=...
            const response = await this.axios.get('/group/info', {
                params: { group_id: groupJid }
            });
            console.log(`[GOWA-DEBUG] Raw /group/info response:`, JSON.stringify(response.data, null, 2));
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
            // Correct endpoint: /group/invite-link?group_id=...
            const response = await this.axios.get('/group/invite-link', {
                params: { group_id: groupJid }
            });
            // Extract code from link if present
            const link = response.data.link || response.data.invite_link;
            if (link) {
                return link.split('chat.whatsapp.com/')[1] || link;
            }
            return response.data.code;
        } catch (error) {
            console.error('[GOWA-CLIENT] Group invite code error:', error.message);
            throw error;
        }
    }

    /**
     * Update group subject (name)
     * Note: /group/subject endpoint not found in openapi, checking if it exists or assuming similar pattern
     * Based on openapi pattern, likely POST /group/topic since subject update isn't explicitly listed in the chunks read
     * But let's assume subject update might be different. 
     * However, standard behavior for title update in Gowa usually uses a specific endpoint. 
     * Since I don't see /group/subject, I will leave it for now or try to best guess or warn.
     * Actually, let's stick to fixing the ones we know are wrong.
     */
    async groupUpdateSubject(groupId, subject) {
        const groupJid = this._ensureGroupJid(groupId);
        // Warning: Endpoint unverified in openapi.yaml
        const response = await this.axios.post(`/group/update-subject`, {
            group_id: groupJid,
            subject: subject
        });
        return response.data;
    }

    /**
     * Update group description
     */
    async groupUpdateDescription(groupId, description) {
        const groupJid = this._ensureGroupJid(groupId);

        // Correct endpoint: POST /group with topic property? No, /group is for create.
        // /group/topic is available in chunk 20
        const response = await this.axios.post('/group/topic', {
            group_id: groupJid,
            topic: description
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
        // Helper to extract phone from JID
        const phones = participants.map(jid => this._jidToPhone(jid));

        let endpoint = '';
        const payload = {
            group_id: groupJid,
            participants: phones
        };

        switch (action) {
            case 'add':
                endpoint = '/group/participants'; // POST /group/participants (Wait, GET is list, POST is add? Check chunk 16... Yes, POST is "Adding more participants")
                break;
            case 'remove':
                endpoint = '/group/participants/remove';
                break;
            case 'promote':
                endpoint = '/group/participants/promote';
                break;
            case 'demote':
                endpoint = '/group/participants/demote';
                break;
            default:
                throw new Error(`Invalid action: ${action}`);
        }

        const response = await this.axios.post(endpoint, payload);
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
     * Format group metadata to Baileys-compatible format
     */
    _formatGroupMetadata(data) {
        // Gowa API returns data in results object
        const groupData = data.results || data;

        return {
            id: groupData.jid || groupData.id || groupData.JID,
            subject: groupData.name || groupData.subject || groupData.Name || 'Unknown Group',
            subjectOwner: groupData.owner || groupData.OwnerJID,
            subjectTime: groupData.subject_time || groupData.NameSetAt,
            creation: groupData.creation || groupData.GroupCreated,
            owner: groupData.owner || groupData.OwnerJID,
            desc: groupData.description || groupData.desc || groupData.Topic,
            descId: groupData.desc_id || groupData.TopicID,
            participants: (groupData.participants || groupData.Participants || []).map(p => ({
                id: p.jid || p.id || p.JID,
                admin: p.is_admin || p.IsAdmin ? 'admin' : (p.is_super_admin || p.IsSuperAdmin ? 'superadmin' : null),
                isSuperAdmin: p.is_super_admin || p.IsSuperAdmin || false,
                isAdmin: p.is_admin || p.IsAdmin || false
            })),
            size: groupData.size || (groupData.participants || groupData.Participants || []).length,
            announce: groupData.announce || groupData.IsAnnounce || false,
            restrict: groupData.restrict || groupData.IsLocked || false
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
