require("./setting.js")
const TelegramBot = require('node-telegram-bot-api');
const chalk = require('chalk')
const fs = require("fs");
const figlet = require("figlet")
const moment = require('moment')
const time = moment(new Date()).format('HH:mm:ss DD/MM/YYYY')
const yargs = require('yargs/yargs')
const { exec, execSync } = require("child_process");

const { color } = require('./function/console.js')
const { nocache } = require('./function/chache.js')

//DATABASE - Gunakan database dari parent directory (sama dengan WhatsApp bot)
global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse())
global.db = new (require('./function/database'))(`${opts._[0] ? opts._[0] + '_' : ''}../options/database.json`, null, 2)

// Load backup system
require('./options/backup')

// Load graceful shutdown handler
require('./options/graceful-shutdown')

// Load database helper
global.dbHelper = require('./options/db-helper')

// Initialize database structure only if it doesn't exist
// Don't overwrite existing data
if (!db.data.list) db.data.list = []
if (!db.data.testi) db.data.testi = []
if (!db.data.chat) db.data.chat = {}
if (!db.data.users) db.data.users = {}
if (!db.data.sewa) db.data.sewa = {}
if (!db.data.profit) db.data.profit = {}
if (!db.data.topup) db.data.topup = {}
if (!db.data.type) db.data.type = type
if (!db.data.setting) db.data.setting = {}
if (!db.data.deposit) db.data.deposit = {}
if (!db.data.produk) db.data.produk = {}
if (!db.data.order) db.data.order = {}
if (!db.data.transaksi) db.data.transaksi = []
if (!db.data.persentase) db.data.persentase = {}
if (!db.data.customProfit) db.data.customProfit = {}

// Log database status
console.log(`📊 Database loaded: ${Object.keys(db.data.users).length} users, ${db.data.transaksi.length} transactions`)

let lastJSON = JSON.stringify(db.data)
if (!opts['test']) setInterval(async () => {
  if (JSON.stringify(db.data) == lastJSON) return
  await db.save()
  lastJSON = JSON.stringify(db.data)
}, 5 * 1000) // Ubah dari 10 detik ke 5 detik

async function startTelegramBot() {
  console.log(chalk.bold.green(figlet.textSync('Telegram Bot', {
    font: 'Standard',
    horizontalLayout: 'default',
    verticalLayout: 'default',
    whitespaceBreak: false
  })))
  
  console.log(chalk.yellow(`${chalk.red('[ TELEGRAM BOT TOPUP ]')}\n\n${chalk.italic.magenta(`Bot Telegram untuk layanan topup\nToken: ${telegramToken.substring(0, 20)}...\n`)}`))

  require('./index')
  nocache('../index', module => console.log(chalk.greenBright('[ TelegramBot ]  ') + time + chalk.cyanBright(` "${module}" Telah diupdate!`)))

  // Create bot instance
  const bot = new TelegramBot(telegramToken, { polling: true });

  // Bot info
  bot.getMe().then((botInfo) => {
    console.log(chalk.green(`✅ Bot connected: @${botInfo.username} (${botInfo.first_name})`))
  }).catch((error) => {
    console.log(chalk.red(`❌ Error connecting to bot: ${error.message}`))
  })

  // Handle messages
  bot.on('message', async (msg) => {
    try {
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const username = msg.from.username || msg.from.first_name;
      const text = msg.text || '';
      const messageId = msg.message_id;
      const isGroup = msg.chat.type === 'group' || msg.chat.type === 'supergroup';
      const isPrivate = msg.chat.type === 'private';

      // Create message object similar to WhatsApp bot
      const m = {
        chat: chatId,
        sender: userId,
        pushName: username,
        isGroup: isGroup,
        text: text,
        messageId: messageId,
        quoted: msg.reply_to_message || null
      };

      // Process message
      require('./index')(bot, m, msg)
    } catch (err) {
      console.log(chalk.red('Error handling message:', err))
    }
  });

  // Callback handler dihapus - tidak menggunakan inline keyboard

  // Error handling
  bot.on('error', (error) => {
    console.log(chalk.red(`Bot error: ${error.message}`))
  });

  // Polling error handling
  bot.on('polling_error', (error) => {
    console.log(chalk.red(`Polling error: ${error.message}`))
  });

  // Global bot instance
  global.telegramBot = bot;
}

startTelegramBot().catch(console.error); 