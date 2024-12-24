const { Markup } = require('telegraf');

const mainKeyboard = Markup.keyboard([
    ['💳 Hisob To\'ldirish', '💰 Pul yechish'],
    ['Support', 'Qo\'llanma']
]).resize();

const confirmKeyboard = Markup.keyboard([
    ['✅ Tasdiqlash', '❌ Bekor qilish']
]).resize();

const contactKeyboard = Markup.keyboard([
    [Markup.button.contactRequest('📱 Raqamni ulashish')]
]).resize();

const backKeyboard = Markup.keyboard([
    ['🔙 Orqaga']
]).resize();

const platformButtons = Markup.inlineKeyboard([
    [Markup.button.callback('SpinBetter', 'platform_spinbetter')],
    [Markup.button.callback('1xBet', 'platform_1xbet')],
    [Markup.button.callback('LineBet', 'platform_linebet')]
]).resize();

module.exports = {
    mainKeyboard,
    confirmKeyboard,
    contactKeyboard,
    backKeyboard,
    platformButtons
};
