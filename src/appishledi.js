const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');

// MongoDB Connection
mongoose.connect('mongodb+srv://uchar:Lalaku007@cluster0.qpkevc2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB connected successfully'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schemas
const UserSchema = new mongoose.Schema({
    telegramId: String,
    username: String,
    fullName: String,
    phone: String,
    isActive: { type: Boolean, default: true },
    isAdmin: { type: Boolean, default: false },
    lastActive: Date,
});

const User = mongoose.model('User', UserSchema);

const bot = new Telegraf('8139684420:AAFd3j8wRjNshypQjXvVh3lsopY3y60kqXk');
const ADMIN_IDS = ['<YOUR_ADMIN_ID>'];

// Pagination settings
const usersPerPage = 5;

// Helper Functions
const sendPaginatedUsers = async (ctx, page, isActive) => {
    const query = { isActive };
    const totalUsers = await User.countDocuments(query);
    const totalPages = Math.ceil(totalUsers / usersPerPage);

    if (page < 0 || page >= totalPages) {
        await ctx.reply('No more users to display.');
        return;
    }

    const users = await User.find(query)
        .sort({ lastActive: -1 })
        .skip(page * usersPerPage)
        .limit(usersPerPage);

    if (users.length === 0) {
        await ctx.reply('No users found.');
        return;
    }

    let message = `Users (Page ${page + 1}/${totalPages}):\n\n`;
    users.forEach(user => {
        message += `👤 ${user.fullName || 'No Name'}\n`;
        message += `📱 ${user.phone || 'No Phone'}\n`;
        message += `🆔 ${user.telegramId}\n`;
        message += `⏰ Last Active: ${user.lastActive?.toLocaleString() || 'Never'}\n`;
        message += '────────────────────\n';
    });

    const navigationButtons = [];
    if (page > 0) navigationButtons.push('⬅️ Previous');
    if (page < totalPages - 1) navigationButtons.push('➡️ Next');
    navigationButtons.push('🔙 Back');

    await ctx.reply(message, Markup.keyboard(navigationButtons.map(btn => [btn])).resize());
};

// Commands
bot.command('start', async (ctx) => {
    const telegramId = ctx.from.id;
    const user = await User.findOne({ telegramId });

    if (user?.isAdmin) {
        await ctx.reply('Welcome, Admin!', Markup.keyboard(['👤 View Active Users', '📉 View Blocked Users']).resize());
    } else {
        await ctx.reply('Welcome to the bot!');
    }
});

bot.hears('👤 View Active Users', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user?.isAdmin) return;

    let currentPage = 0;

    await sendPaginatedUsers(ctx, currentPage, true);

    bot.on('text', async (ctx) => {
        if (ctx.message.text === '⬅️ Previous') {
            currentPage = Math.max(0, currentPage - 1);
            await sendPaginatedUsers(ctx, currentPage, true);
        } else if (ctx.message.text === '➡️ Next') {
            currentPage += 1;
            await sendPaginatedUsers(ctx, currentPage, true);
        } else if (ctx.message.text === '🔙 Back') {
            await ctx.reply('Back to menu.', Markup.keyboard(['👤 View Active Users', '📉 View Blocked Users']).resize());
        }
    });
});

bot.hears('📉 View Blocked Users', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user?.isAdmin) return;

    let currentPage = 0;

    await sendPaginatedUsers(ctx, currentPage, false);

    bot.on('text', async (ctx) => {
        if (ctx.message.text === '⬅️ Previous') {
            currentPage = Math.max(0, currentPage - 1);
            await sendPaginatedUsers(ctx, currentPage, false);
        } else if (ctx.message.text === '➡️ Next') {
            currentPage += 1;
            await sendPaginatedUsers(ctx, currentPage, false);
        } else if (ctx.message.text === '🔙 Back') {
            await ctx.reply('Back to menu.', Markup.keyboard(['👤 View Active Users', '📉 View Blocked Users']).resize());
        }
    });
});

// Error handling
bot.catch((err) => {
    console.error('Error occurred:', err);
});

// Launch the bot
bot.launch().then(() => console.log('Bot started')).catch(err => console.error('Bot launch error:', err));

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
