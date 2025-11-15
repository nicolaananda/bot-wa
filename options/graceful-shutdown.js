const fs = require('fs');

// Flag untuk prevent multiple shutdown attempts
let isShuttingDown = false;

// Fungsi untuk graceful shutdown
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('[SHUTDOWN] Already shutting down, forcing exit...');
    process.exit(1);
  }
  
  isShuttingDown = true;
  console.log(`\n[SHUTDOWN] Received ${signal || 'SIGINT/SIGTERM'}. Starting graceful shutdown...`);
  
  const shutdownTasks = [];
  
  // 1. Cleanup timeouts
  if (typeof global.cleanupAllTimeouts === 'function') {
    try {
      const cleaned = global.cleanupAllTimeouts();
      if (cleaned > 0) {
        console.log(`[SHUTDOWN] Cleaned up ${cleaned} active timeouts`);
      }
    } catch (error) {
      console.error('[SHUTDOWN] Error cleaning up timeouts:', error.message);
    }
  }
  
  // 2. Close Redis connection
  try {
    const { closeRedis } = require('../config/redis');
    if (typeof closeRedis === 'function') {
      shutdownTasks.push(
        closeRedis().then(() => {
          console.log('[SHUTDOWN] Redis connection closed');
        }).catch((error) => {
          console.error('[SHUTDOWN] Error closing Redis:', error.message);
        })
      );
    }
  } catch (error) {
    // Redis not available, skip
  }
  
  // 3. Save database (force immediate save, don't use debounced)
  if (global.db && typeof global.db.save === 'function') {
    shutdownTasks.push(
      global.db.save().then(() => {
        console.log('[SHUTDOWN] Database saved successfully');
      }).catch((error) => {
        console.error('[SHUTDOWN] Error saving database:', error.message);
      })
    );
  }
  
  // Wait for all tasks with timeout
  try {
    await Promise.race([
      Promise.all(shutdownTasks),
      new Promise((resolve) => setTimeout(resolve, 5000)) // 5 second timeout
    ]);
  } catch (error) {
    console.error('[SHUTDOWN] Error during shutdown tasks:', error.message);
  }
  
  console.log('[SHUTDOWN] Graceful shutdown completed');
  process.exit(0);
}

// Handle berbagai sinyal shutdown
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Untuk nodemon

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  console.error('\n[ERROR] Uncaught Exception:', error);
  console.error('[ERROR] Stack:', error.stack);
  
  // Try to save database before crash
  if (global.db && typeof global.db.save === 'function') {
    try {
      await Promise.race([
        global.db.save(),
        new Promise((resolve) => setTimeout(resolve, 2000)) // 2 second timeout
      ]);
      console.log('[ERROR] Database saved before crash');
    } catch (saveError) {
      console.error('[ERROR] Failed to save database before crash:', saveError.message);
    }
  }
  
  // Cleanup timeouts
  if (typeof global.cleanupAllTimeouts === 'function') {
    try {
      global.cleanupAllTimeouts();
    } catch {}
  }
  
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  console.error('\n[ERROR] Unhandled Rejection at:', promise);
  console.error('[ERROR] Reason:', reason);
  
  // Log stack if available
  if (reason && reason.stack) {
    console.error('[ERROR] Stack:', reason.stack);
  }
  
  // Don't exit on unhandled rejection, just log
  // This allows the app to continue running
  // Only exit if it's a critical error
  if (reason && typeof reason === 'object' && reason.critical) {
    console.error('[ERROR] Critical error detected, shutting down...');
    await gracefulShutdown('UNHANDLED_REJECTION');
  }
});

console.log('[SHUTDOWN] Graceful shutdown handler loaded');

module.exports = { gracefulShutdown }; 