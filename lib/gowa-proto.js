/**
 * Baileys Protocol Definitions
 * Minimal proto definitions needed for Baileys compatibility
 */

const proto = {
    WebMessageInfo: {
        // Stub for compatibility
    },
    Message: {
        // Stub for compatibility
    }
};

/**
 * Get content type from message object
 */
function getContentType(message) {
    if (!message) return null;
    const keys = Object.keys(message);
    return keys[0] || null;
}

/**
 * Delay function
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Download content from message (compatibility stub)
 * This will be handled by the adapter's downloadMedia method
 */
async function downloadContentFromMessage(message, type) {
    throw new Error('downloadContentFromMessage is deprecated. Use nicola.downloadMedia() instead.');
}

/**
 * JID decode (compatibility)
 */
function jidDecode(jid) {
    if (!jid) return {};

    const parts = jid.split('@');
    if (parts.length !== 2) return {};

    const [user, server] = parts;
    return { user, server };
}

module.exports = {
    proto,
    getContentType,
    delay,
    downloadContentFromMessage,
    jidDecode
};
