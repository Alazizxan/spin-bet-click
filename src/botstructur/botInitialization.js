const { Telegraf } = require('telegraf');
const keyboards = require('./keyboards');
const handlers = require('./handlers');
const notifications = require('./notifications');

const bot = new Telegraf(process.env.BOT_TOKEN);

// Register event handlers
handlers.registerHandlers(bot);

// Start bot
bot.launch().then(() => {
    console.log('Bot started successfully');
    notifications.notifyAdmins('Bot qayta ishga tushdi', 'info');
}).catch(err => {
    console.error('Bot start error:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot;
