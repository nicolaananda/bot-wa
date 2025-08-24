/**
 * WhatsApp Bot Session Error Handler
 * Handles encryption errors and session resets automatically
 */

const fs = require('fs');
const path = require('path');

class SessionErrorHandler {
    constructor(client, options = {}) {
        this.client = client;
        this.options = {
            maxRetries: 3,
            retryDelay: 5000,
            autoReconnect: true,
            clearSessionsOnError: true,
            ...options
        };
        
        this.retryCount = 0;
        this.isHandling = false;
        
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Handle authentication failures
        this.client.on('auth_failure', (msg) => {
            console.log('🔐 Authentication failed:', msg);
            this.handleAuthFailure();
        });

        // Handle connection state changes
        this.client.on('change_state', (state) => {
            console.log('📡 Connection state changed:', state);
            if (state === 'DISCONNECTED') {
                this.handleDisconnection();
            }
        });

        // Handle connection errors
        this.client.on('disconnected', (reason) => {
            console.log('❌ Disconnected:', reason);
            this.handleDisconnection(reason);
        });

        // Handle session errors
        this.client.on('session_error', (error) => {
            console.log('🚨 Session error detected:', error.message);
            this.handleSessionError(error);
        });

        // Handle ready state
        this.client.on('ready', () => {
            console.log('✅ WhatsApp client ready');
            this.retryCount = 0; // Reset retry count on success
        });
    }

    async handleSessionError(error) {
        if (this.isHandling) return;
        this.isHandling = true;

        try {
            console.log('🔄 Handling session error...');
            
            if (error.message.includes('Bad MAC') || 
                error.message.includes('Failed to decrypt') ||
                error.message.includes('Session error')) {
                
                await this.handleEncryptionError();
            } else {
                await this.handleGenericError(error);
            }
        } catch (err) {
            console.error('❌ Error in session error handler:', err);
        } finally {
            this.isHandling = false;
        }
    }

    async handleEncryptionError() {
        console.log('🔐 Handling encryption error...');
        
        if (this.options.clearSessionsOnError) {
            await this.clearSessions();
        }
        
        if (this.retryCount < this.options.maxRetries) {
            this.retryCount++;
            console.log(`🔄 Retrying connection (${this.retryCount}/${this.options.maxRetries})...`);
            
            setTimeout(() => {
                this.reconnect();
            }, this.options.retryDelay);
        } else {
            console.log('❌ Max retries reached. Manual intervention required.');
            this.retryCount = 0;
        }
    }

    async handleAuthFailure() {
        console.log('🔐 Handling authentication failure...');
        
        // Clear sessions and wait for new QR scan
        await this.clearSessions();
        
        console.log('📱 Please scan the QR code again');
        console.log('⏳ Waiting for authentication...');
    }

    async handleDisconnection(reason = 'Unknown') {
        console.log('📡 Handling disconnection...');
        
        if (this.options.autoReconnect && this.retryCount < this.options.maxRetries) {
            this.retryCount++;
            console.log(`🔄 Attempting to reconnect (${this.retryCount}/${this.options.maxRetries})...`);
            
            setTimeout(() => {
                this.reconnect();
            }, this.options.retryDelay);
        }
    }

    async handleGenericError(error) {
        console.log('⚠️ Handling generic error:', error.message);
        
        // Log error details for debugging
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
    }

    async clearSessions() {
        try {
            console.log('🧹 Clearing session data...');
            
            const sessionPaths = [
                path.join(process.cwd(), 'sessions'),
                path.join(process.cwd(), 'store'),
                path.join(process.cwd(), '.wwebjs_auth'),
                path.join(process.cwd(), '.wwebjs_cache')
            ];

            for (const sessionPath of sessionPaths) {
                if (fs.existsSync(sessionPath)) {
                    // Backup before deletion
                    const backupPath = `${sessionPath}_backup_${Date.now()}`;
                    fs.renameSync(sessionPath, backupPath);
                    console.log(`💾 Backed up: ${sessionPath} -> ${backupPath}`);
                }
            }
            
            console.log('✅ Session data cleared successfully');
        } catch (error) {
            console.error('❌ Error clearing sessions:', error);
        }
    }

    async reconnect() {
        try {
            console.log('🔄 Attempting to reconnect...');
            
            // Destroy current client
            if (this.client) {
                await this.client.destroy();
            }
            
            // Wait a moment before reconnecting
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Emit reconnect event for main app to handle
            this.client.emit('reconnect_required');
            
        } catch (error) {
            console.error('❌ Error during reconnection:', error);
        }
    }

    // Method to manually trigger session reset
    async resetSessions() {
        console.log('🔄 Manually resetting sessions...');
        await this.clearSessions();
        this.retryCount = 0;
    }

    // Get current status
    getStatus() {
        return {
            retryCount: this.retryCount,
            maxRetries: this.options.maxRetries,
            isHandling: this.isHandling,
            autoReconnect: this.options.autoReconnect
        };
    }
}

module.exports = SessionErrorHandler; 