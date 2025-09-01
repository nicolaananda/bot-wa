// Simplified optimized index with command router
require("./setting.js");
const CommandRouter = require("./src/utils/command-router");
const CommandContext = require("./src/utils/command-context");

// Import existing modules
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const fs = require("fs");
const moment = require("moment-timezone");
const crypto = require("crypto");

// Import existing functions
const { getGroupAdmins, runtime, sleep } = require("./function/myfunc");
const { color } = require("./function/console");

// Performance optimization: Cache for user saldo
const saldoCache = new Map();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

function getCachedSaldo(userId) {
  const cached = saldoCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
    return cached.saldo;
  }
  return null;
}

function setCachedSaldo(userId, saldo) {
  saldoCache.set(userId, {
    saldo: saldo,
    timestamp: Date.now()
  });
}

function clearExpiredCache() {
  const now = Date.now();
  for (const [userId, data] of saldoCache.entries()) {
    if (now - data.timestamp > CACHE_EXPIRY) {
      saldoCache.delete(userId);
    }
  }
}

setInterval(clearExpiredCache, 10 * 60 * 1000);

module.exports.getCachedSaldo = getCachedSaldo;
module.exports.setCachedSaldo = setCachedSaldo;

global.prefa = ["", "."];
moment.tz.setDefault("Asia/Jakarta").locale("id");

// Initialize command router
const commandRouter = new CommandRouter();

module.exports = async (ronzz, m, mek) => {
  try {
    const { isQuotedMsg, fromMe } = m;
    if (fromMe) return;
    
    // Extract message data optimized
    const from = m.chat;
    const sender = m.isGroup ? (mek.key.participant || mek.participant) : mek.key.remoteJid;
    const pushname = m.pushName || "Unknown";
    
    // Parse command with error handling
    let chats = "";
    try {
      if (m.mtype === "conversation") chats = m.message.conversation;
      else if (m.mtype === "extendedTextMessage") chats = m.message.extendedTextMessage.text;
      else if (m.mtype === "buttonsResponseMessage") chats = m.message.buttonsResponseMessage.selectedButtonId;
      // Add other message types as needed
    } catch (error) {
      console.error("Error parsing message:", error);
    }
    
    const prefix = prefa ? /^[°•π÷×¶∆£¢€¥®=????+✓_=|~!?@#%^&.©^]/gi.test(chats) ? chats.match(/^[°•π÷×¶∆£¢€¥®=????+✓_=|~!?@#%^&.©^]/gi)[0] : "" : prefa ?? "#";
    const isGroup = m.isGroup;
    const isOwner = [ronzz.user.id, ...owner].map(v => v.replace(/[^0-9]/g, "") + "@s.whatsapp.net").includes(sender);
    const args = chats.trim().split(/ +/).slice(1);
    const q = args.join(" ");
    const command = chats.replace(prefix, "").trim().split(/ +/).shift().toLowerCase();
    
    // Group metadata only when needed
    let groupAdmins = [];
    let isGroupAdmins = false;
    if (isGroup) {
      try {
        const groupMetadata = await ronzz.groupMetadata(from);
        groupAdmins = getGroupAdmins(groupMetadata.participants);
        isGroupAdmins = groupAdmins.includes(sender);
      } catch (error) {
        console.error("Error fetching group metadata:", error);
      }
    }
    
    // Helper functions
    const reply = (text, options = {}) => ronzz.sendMessage(from, { text, ...options }, { quoted: m });
    
    function parseMention(text = "") {
      return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + "@s.whatsapp.net");
    }
    
    // Log command
    if (chats) {
      console.log("CMD:", command, "from", pushname, isGroup ? "in group" : "");
    }
    
    // Create command context
    const messageData = {
      from, sender, pushname, args, q, command, prefix, isGroup, 
      isOwner, isGroupAdmins, reply, parseMention
    };
    
    const ctx = new CommandContext(ronzz, m, mek, messageData);
    
    // Try to execute command using router
    const commandExecuted = await commandRouter.execute(command, ctx);
    
    // Handle legacy commands if not found in router
    if (!commandExecuted) {
      // Handle eval commands for owner
      if (isOwner) {
        if (chats.startsWith("=>")) {
          try {
            const result = eval(`(async () => { ${chats.slice(3)} })()`);
            reply(String(result));
          } catch (e) {
            reply(String(e));
          }
        } else if (chats.startsWith(">")) {
          try {
            const evaled = await eval(chats.slice(2));
            reply(typeof evaled !== "string" ? require("util").inspect(evaled) : evaled);
          } catch (err) {
            reply(String(err));
          }
        }
      }
    }
    
  } catch (err) {
    console.log(color("[ERROR]", "red"), err);
  }
};
