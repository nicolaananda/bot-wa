const fs = require('fs');

// Fungsi untuk graceful shutdown
function gracefulShutdown() {
  console.log('\nReceived SIGINT or SIGTERM. Starting graceful shutdown...');
  
  // Save database sebelum shutdown
  if (global.db) {
    console.log('Saving database...');
    global.db.save().then(() => {
      console.log('Database saved successfully');
      process.exit(0);
    }).catch((error) => {
      console.error('Error saving database:', error);
      process.exit(1);
    });
  } else {
    process.exit(0);
  }
}

// Handle berbagai sinyal shutdown
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGUSR2', gracefulShutdown); // Untuk nodemon

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  
  // Save database sebelum crash
  if (global.db) {
    global.db.save().then(() => {
      console.log('Database saved before crash');
      process.exit(1);
    }).catch(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Save database sebelum crash
  if (global.db) {
    global.db.save().then(() => {
      console.log('Database saved before crash');
      process.exit(1);
    }).catch(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

console.log('Graceful shutdown handler loaded');

module.exports = { gracefulShutdown }; 