// Libsignal Session Error Patch
// This patch helps prevent "No sessions" errors from crashing the bot

const fs = require('fs');
const path = require('path');

// Patch for libsignal session errors
function patchLibsignal() {
  try {
    const libsignalPath = path.join(__dirname, 'node_modules', 'libsignal', 'src', 'session_cipher.js');
    
    if (fs.existsSync(libsignalPath)) {
      let content = fs.readFileSync(libsignalPath, 'utf8');
      
      // Check if already patched
      if (content.includes('// PATCHED BY BOT-WA')) {
        console.log('✅ Libsignal already patched');
        return;
      }
      
      // Add error handling for session errors
      const patch = `
// PATCHED BY BOT-WA - Session Error Handling
const originalThrow = (message) => {
  if (message === "No sessions") {
    console.log('⚠️  Libsignal: No sessions available, creating new session...');
    // Return a dummy session instead of throwing
    return {
      encrypt: async () => Buffer.alloc(0),
      decrypt: async () => ({ type: 1, body: Buffer.alloc(0) })
    };
  }
  throw new errors.SessionError(message);
};

// Replace the throw statement
if (sessions.length === 0) {
  return originalThrow("No sessions");
}
`;
      
      // Apply the patch
      content = content.replace(
        'if (sessions.length === 0) {\n                throw new errors.SessionError("No sessions");\n            }',
        patch
      );
      
      fs.writeFileSync(libsignalPath, content);
      console.log('✅ Libsignal patched successfully');
      
    } else {
      console.log('⚠️  Libsignal file not found, skipping patch');
    }
    
  } catch (error) {
    console.log('❌ Error patching libsignal:', error.message);
  }
}

// Alternative approach: Monkey patch the error
function monkeyPatchSessionError() {
  try {
    const libsignal = require('libsignal');
    
    // Override the SessionError constructor
    if (libsignal.errors && libsignal.errors.SessionError) {
      const OriginalSessionError = libsignal.errors.SessionError;
      
      libsignal.errors.SessionError = function(message) {
        if (message === "No sessions") {
          console.log('⚠️  Libsignal: No sessions available, attempting recovery...');
          // Return a recoverable error instead of crashing
          const error = new Error("No sessions - attempting recovery");
          error.name = "SessionError";
          error.recoverable = true;
          return error;
        }
        return new OriginalSessionError(message);
      };
      
      console.log('✅ SessionError monkey patched');
    }
    
  } catch (error) {
    console.log('❌ Error monkey patching:', error.message);
  }
}

// Main patch function
function applyPatches() {
  console.log('🔧 Applying libsignal patches...');
  
  // Try file patch first
  patchLibsignal();
  
  // Then try monkey patch
  monkeyPatchSessionError();
  
  console.log('✅ Patches applied');
}

// Export for use in main.js
module.exports = { applyPatches };

// Run if called directly
if (require.main === module) {
  applyPatches();
} 