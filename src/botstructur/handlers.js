const keyboards = require('./keyboards');
const { setState, getState } = require('./stateManagement');
const { notifyAdmins } = require('./notifications');

const registerHandlers = (bot) => {
    bot.command('start', async (ctx) => {
        if (!ctx.from) return;

        setState(ctx.from.id, 'START');
        await ctx.reply('Xush kelibsiz! Davom etish uchun raqamingizni ulashing:', keyboards.contactKeyboard);
        await notifyAdmins(`Yangi foydalanuvchi: ${ctx.from.id} (${ctx.from.username || 'username yo\'q'})`, 'info');
    });

    bot.hears('Support', async (ctx) => {
        if (!ctx.from) return;
        await ctx.reply('Admin bilan bog\'lanish: @support_admin', keyboards.backKeyboard);
    });
};

module.exports = { registerHandlers };
