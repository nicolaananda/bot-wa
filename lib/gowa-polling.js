/**
 * Gowa Polling System
 * Alternative to webhook - polls Gowa API for new messages
 */

class GowaPolling {
    constructor(adapter, interval = 2000) {
        this.adapter = adapter;
        this.interval = interval;
        this.isPolling = false;
        this.lastMessageId = null;
        this.processedMessages = new Set();
    }

    /**
     * Start polling for new messages
     */
    start() {
        if (this.isPolling) {
            console.log('[GOWA-POLLING] Already polling');
            return;
        }

        this.isPolling = true;
        console.log(`[GOWA-POLLING] Started polling every ${this.interval}ms`);
        this.poll();
    }

    /**
     * Stop polling
     */
    stop() {
        this.isPolling = false;
        if (this.pollTimeout) {
            clearTimeout(this.pollTimeout);
        }
        console.log('[GOWA-POLLING] Stopped polling');
    }

    /**
     * Poll for new messages
     */
    async poll() {
        if (!this.isPolling) return;

        try {
            // Get recent messages from Gowa
            const messages = await this.getRecentMessages();

            if (messages && messages.length > 0) {
                for (const msg of messages) {
                    await this.processMessage(msg);
                }
            }
        } catch (error) {
            console.error('[GOWA-POLLING] Error:', error.message);
        }

        // Schedule next poll
        this.pollTimeout = setTimeout(() => this.poll(), this.interval);
    }

    /**
     * Get recent messages from Gowa API
     * Note: This is a placeholder - actual implementation depends on Gowa API
     */
    async getRecentMessages() {
        try {
            // Gowa doesn't have a "get messages" endpoint
            // So we'll use webhook data that's cached
            // This is just a fallback - webhook is still preferred
            return [];
        } catch (error) {
            console.error('[GOWA-POLLING] Failed to get messages:', error.message);
            return [];
        }
    }

    /**
     * Process a message
     */
    async processMessage(webhookData) {
        try {
            const messageId = webhookData.message?.id;

            // Skip if already processed
            if (messageId && this.processedMessages.has(messageId)) {
                return;
            }

            // Mark as processed
            if (messageId) {
                this.processedMessages.add(messageId);

                // Clean up old messages (keep last 1000)
                if (this.processedMessages.size > 1000) {
                    const toDelete = Array.from(this.processedMessages).slice(0, 100);
                    toDelete.forEach(id => this.processedMessages.delete(id));
                }
            }

            // Forward to adapter
            this.adapter.handleWebhook(webhookData);

            console.log('[GOWA-POLLING] Processed message:', messageId);
        } catch (error) {
            console.error('[GOWA-POLLING] Process error:', error.message);
        }
    }
}

module.exports = GowaPolling;
