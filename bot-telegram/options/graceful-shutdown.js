const chalk = require('chalk')

process.on('SIGINT', async () => {
  console.log(chalk.yellow('\n⚠️ Received SIGINT. Graceful shutdown...'))
  
  try {
    // Save database before shutdown
    if (global.db) {
      await global.db.save()
      console.log(chalk.green('✅ Database saved successfully'))
    }
    
    // Close Telegram bot if exists
    if (global.telegramBot) {
      await global.telegramBot.stopPolling()
      console.log(chalk.green('✅ Telegram bot stopped'))
    }
    
    console.log(chalk.green('✅ Graceful shutdown completed'))
    process.exit(0)
  } catch (error) {
    console.error(chalk.red('❌ Error during shutdown:'), error.message)
    process.exit(1)
  }
})

process.on('SIGTERM', async () => {
  console.log(chalk.yellow('\n⚠️ Received SIGTERM. Graceful shutdown...'))
  
  try {
    // Save database before shutdown
    if (global.db) {
      await global.db.save()
      console.log(chalk.green('✅ Database saved successfully'))
    }
    
    // Close Telegram bot if exists
    if (global.telegramBot) {
      await global.telegramBot.stopPolling()
      console.log(chalk.green('✅ Telegram bot stopped'))
    }
    
    console.log(chalk.green('✅ Graceful shutdown completed'))
    process.exit(0)
  } catch (error) {
    console.error(chalk.red('❌ Error during shutdown:'), error.message)
    process.exit(1)
  }
})

process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('❌ Unhandled Rejection at:'), promise, 'reason:', reason)
  process.exit(1)
}) 