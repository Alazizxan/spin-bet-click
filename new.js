const { Telegraf, Markup, session } = require('telegraf');
const mongoose = require('mongoose');
const moment = require('moment');
require('dotenv').config();

// MongoDB Connection
mongoose.connect('mongodb+srv://simplepayuz:Baho2003@cluster0.lvbnrdi.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB Atlas');
}).catch(err => {
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

// Bot initialization
const bot = new Telegraf('7759594292:AAGxkqskipYD2Y41WddPaLQnFztUGuUtrCQ');

// Enable session middleware - MUHIM QO'SHIMCHA
bot.use(session());

// Global variables for pagination
const PAGE_SIZE = 10;
const userPages = {};
const transactionPages = {};

// Session context type for search operations
const searchStates = {
    USER_SEARCH: 'user_search',
    PAYMENT_ID_SEARCH: 'payment_id_search',
    GAME_ID_SEARCH: 'game_id_search'
};

// Check if user is admin
const isAdmin = async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id.toString(), isAdmin: false });
    return !!user;
};

// Admin authentication middleware
bot.use(async (ctx, next) => {
    try {
        if (ctx.from) {
            const admin = await isAdmin(ctx);
            if (admin) {
                return next();
            } else {
                await ctx.reply('Bu panel faqat adminlar uchun.');
            }
        }
        return next();
    } catch (error) {
        console.error("Xatolik:", error.message);
    }
});

// Main menu keyboard
const getMainMenuKeyboard = () => {
    return Markup.keyboard([
        ['👥 Userlar', '💰 Transactionlar'],
        ['🔍 TG User izlash', '🔍 Payment ID izlash'],
        ['🔍 Game ID izlash', '💸 Pul yechish'],
        ['📊 Total summa', '📅 Oylik summa'],
        ['💵 To\'ldirish']
    ]).resize();
};

// Pagination keyboard
const getPaginationKeyboard = (type, page) => {
    return Markup.inlineKeyboard([
        [
            Markup.button.callback('⬅️', `${type}_prev_${page}`),
            Markup.button.callback('➡️', `${type}_next_${page}`),
        ],
        [Markup.button.callback('🏠 Menu', 'main_menu')]
    ]);
};

// Format user data for display
const formatUserData = (user) => {
    return `
👤 *User ma'lumotlari:*
📌 Telegram ID: \`${user.telegramId || 'Mavjud emas'}\`
👤 Username: @${user.username || 'Mavjud emas'}
📝 To'liq ismi: ${user.fullName || 'Mavjud emas'}
📞 Telefon: ${user.phone || 'Mavjud emas'}
📆 Ro'yxatdan o'tgan: ${moment(user.registrationDate).format('DD.MM.YYYY HH:mm')}
🕒 Oxirgi faollik: ${user.lastActive ? moment(user.lastActive).format('DD.MM.YYYY HH:mm') : 'Mavjud emas'}
✅ Holati: ${user.isActive ? 'Faol' : 'Faol emas'}
🔑 Admin: ${user.isAdmin ? 'Ha' : 'Yo\'q'}
`;
};

// Format transaction data for display
const formatTransactionData = (transaction) => {
    return `
💰 *Transaction ma'lumotlari:*
🆔 ID: \`${transaction._id}\`
👤 Telegram ID: \`${transaction.telegramId || 'Mavjud emas'}\`
📞 Telefon: ${transaction.phone || 'Mavjud emas'}
📊 Turi: ${transaction.type === 'deposit' ? '💲 Kirim' : '💸 Chiqim'}
🎮 Platform: ${transaction.platform || 'Mavjud emas'}
🎯 Game ID: \`${transaction.gameId || 'Mavjud emas'}\`
💳 Karta raqami: ${transaction.cardNumber || 'Mavjud emas'}
📅 Amal qilish muddati: ${transaction.expiryDate || 'Mavjud emas'}
💵 Miqdori: ${transaction.amount ? transaction.amount.toLocaleString('ru-RU') + ' so\'m' : 'Mavjud emas'}
📋 Holati: ${transaction.status || 'Mavjud emas'}
🧾 Payment ID: \`${transaction.paymentId || 'Mavjud emas'}\`
❌ Xatolik: ${transaction.error || 'Mavjud emas'}
📝 Operation ID: \`${transaction.operationId || 'Mavjud emas'}\`
📆 Sana: ${moment(transaction.timestamp).format('DD.MM.YYYY HH:mm')}
`;
};

// Start command handler
bot.start(async (ctx) => {
    try {
        const admin = await isAdmin(ctx);
        if (admin) {
            await ctx.reply('Admin panelga xush kelibsiz!', getMainMenuKeyboard());
        } else {
            await ctx.reply('Bu bot faqat adminlar uchun.');
        }
    } catch (error) {
        console.error("Xatolik yuz berdi:", error.message);
    }
});

// Users list handler
bot.hears('👥 Userlar', async (ctx) => {
    const userId = ctx.from.id;
    userPages[userId] = 0;
    
    await showUserPage(ctx, userId);
});

// Show user page function
async function showUserPage(ctx, userId) {
    const page = userPages[userId] || 0;
    const skip = page * PAGE_SIZE;

    const users = await User.find().skip(skip).limit(PAGE_SIZE);
    const totalUsers = await User.countDocuments();
    const totalPages = Math.ceil(totalUsers / PAGE_SIZE);

    if (users.length === 0) {
        return ctx.reply("Userlar mavjud emas.");
    }

    let message = `<b>📋 Userlar ro'yxati</b> (${skip + 1}-${Math.min(skip + users.length, totalUsers)} / ${totalUsers})\n`;
    message += `<b>📄 Sahifa:</b> ${page + 1}/${totalPages}\n\n`;

    users.forEach((user, index) => {
        message += `<b>${skip + index + 1}. ${user.fullName || user.username || user.telegramId || 'Nomsiz'}</b>\n`;
        message += `   👤 <b>Username:</b> ${user.username || 'Mavjud emas'}\n`;
        message += `   📌 <b>Telegram ID:</b> ${user.telegramId || 'Mavjud emas'}\n`;
        message += `   📝 <b>To'liq ismi:</b> ${user.fullName || 'Mavjud emas'}\n`;
        message += `   📞 <b>Telefon:</b> ${user.phone || 'Mavjud emas'}\n`;
        message += `   📆 <b>Ro'yxatdan o'tgan:</b> ${moment(user.registrationDate).format('DD.MM.YYYY')}\n`;
        message += `   ✅ <b>Holati:</b> ${user.isActive ? 'Faol' : 'Faol emas'}\n\n`;
    });

    if (ctx.updateType === 'callback_query') {
        await ctx.editMessageText(message, {
            parse_mode: "HTML",
            ...getPaginationKeyboard('users', page)
        });
    } else {
        await ctx.reply(message, {
            parse_mode: "HTML",
            ...getPaginationKeyboard('users', page)
        });
    }
}

// Transactions list handler
bot.hears('💰 Transactionlar', async (ctx) => {
    const userId = ctx.from.id;
    transactionPages[userId] = 0;
    
    await showTransactionPage(ctx, userId);
});

// Show transaction page function
async function showTransactionPage(ctx, userId) {
    const page = transactionPages[userId] || 0;
    const skip = page * PAGE_SIZE;
    
    const transactions = await Transaction.find().sort({ timestamp: -1 }).skip(skip).limit(PAGE_SIZE);
    const totalTransactions = await Transaction.countDocuments();
    const totalPages = Math.ceil(totalTransactions / PAGE_SIZE);
    
    if (transactions.length === 0) {
        return ctx.reply('Transactionlar mavjud emas.');
    }
    
    let message = `📋 *Transactionlar ro'yxati* (${skip + 1}-${Math.min(skip + transactions.length, totalTransactions)} / ${totalTransactions})\n`;
    message += `📄 Sahifa: ${page + 1}/${totalPages}\n\n`;
    
    transactions.forEach((transaction, index) => {
        message += `${skip + index + 1}. ${transaction.type === 'deposit' ? '💲 Kirim' : '💸 Chiqim'} - ${transaction.amount ? transaction.amount.toLocaleString('ru-RU') + ' so\'m' : 'Mavjud emas'}\n`;
        message += `   🎮 Platform: ${transaction.platform || 'Mavjud emas'}\n`;
        message += `   🆔 ID: ${transaction._id || 'Mavjud emas'}\n`;
        message += `   👤 Telegram ID: ${transaction.telegramId || 'Mavjud emas'}\n`;
        message += `   💵 miqdori: ${transaction.amount ? transaction.amount.toLocaleString('ru-RU') + ' so\'m' : 'Mavjud emas'}\n`;
        message += `   🎮 Game ID: ${transaction.userId || 'Mavjud emas'}\n`;
        message += `   💳 Karta raqami: ${transaction.cardNumber || 'Mavjud emas'}\n`;
        message += `   🧾 Payment ID: ${transaction.paymentId || 'WITHRAWAL BU'}\n`;
        message += `   📋 Holati: ${transaction.status || 'Mavjud emas'}\n`;
        message += `   📤 Xatolik: ${transaction.error || 'YOQ'}\n`;
        message += `   📤 Operation ID: ${transaction.operationId || 'YOQ'}\n`;
        message += `   📆 Sana: ${moment(transaction.timestamp).format('DD.MM.YYYY HH:mm')}\n\n`;
    });
    
    if (ctx.updateType === 'callback_query') {
        await ctx.editMessageText(message, {
            parse_mode: 'Markdown',
            ...getPaginationKeyboard('transactions', page)
        });
    } else {
        await ctx.reply(message, {
            parse_mode: 'Markdown',
            ...getPaginationKeyboard('transactions', page)
        });
    }
}

// User pagination callback handlers
bot.action(/users_prev_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    const currentPage = parseInt(ctx.match[1]);
    
    if (currentPage > 0) {
        userPages[userId] = currentPage - 1;
        await showUserPage(ctx, userId);
    } else {
        await ctx.answerCbQuery('Siz birinchi sahifadasiz!');
    }
});

bot.action(/users_next_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    const currentPage = parseInt(ctx.match[1]);
    const totalUsers = await User.countDocuments();
    const totalPages = Math.ceil(totalUsers / PAGE_SIZE);
    
    if (currentPage < totalPages - 1) {
        userPages[userId] = currentPage + 1;
        await showUserPage(ctx, userId);
    } else {
        await ctx.answerCbQuery('Siz oxirgi sahifadasiz!');
    }
});

// Transaction pagination callback handlers
bot.action(/transactions_prev_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    const currentPage = parseInt(ctx.match[1]);
    
    if (currentPage > 0) {
        transactionPages[userId] = currentPage - 1;
        await showTransactionPage(ctx, userId);
    } else {
        await ctx.answerCbQuery('Siz birinchi sahifadasiz!');
    }
});

bot.action(/transactions_next_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    const currentPage = parseInt(ctx.match[1]);
    const totalTransactions = await Transaction.countDocuments();
    const totalPages = Math.ceil(totalTransactions / PAGE_SIZE);
    
    if (currentPage < totalPages - 1) {
        transactionPages[userId] = currentPage + 1;
        await showTransactionPage(ctx, userId);
    } else {
        await ctx.answerCbQuery('Siz oxirgi sahifadasiz!');
    }
});

// Main menu callback handler
bot.action('main_menu', async (ctx) => {
    await ctx.editMessageText('Admin panelga xush kelibsiz!');
    await ctx.reply('Mavjud bo\'limlar:', getMainMenuKeyboard());
});

// TG User search handler - TUZATILGAN
bot.hears('🔍 TG User izlash', async (ctx) => {
    ctx.session = { state: searchStates.USER_SEARCH };
    await ctx.reply('Izlamoqchi bo\'lgan foydalanuvchining Telegram ID\'sini kiriting:', 
        Markup.inlineKeyboard([
            Markup.button.callback('🏠 Menu', 'main_menu')
        ])
    );
});

// Payment ID search handler - TUZATILGAN
bot.hears('🔍 Payment ID izlash', async (ctx) => {
    ctx.session = { state: searchStates.PAYMENT_ID_SEARCH };
    await ctx.reply('Izlamoqchi bo\'lgan Payment ID\'ni kiriting:', 
        Markup.inlineKeyboard([
            Markup.button.callback('🏠 Menu', 'main_menu')
        ])
    );
});

// Game ID search handler - TUZATILGAN
bot.hears('🔍 Game ID izlash', async (ctx) => {
    ctx.session = { state: searchStates.GAME_ID_SEARCH };
    await ctx.reply('Izlamoqchi bo\'lgan Game ID\'ni kiriting:', 
        Markup.inlineKeyboard([
            Markup.button.callback('🏠 Menu', 'main_menu')
        ])
    );
});

// Total sum handler

bot.hears('📊 Total summa', async (ctx) => {
    try {
        // Faqat statusi "success" bo'lgan va operationId yoki paymentId null bo'lmagan transactionlarni olish
        const transactions = await Transaction.find({
            status: 'success',
            $or: [{ operationId: { $ne: null } }, { paymentId: { $ne: null } }]
        });

        // Platformalar va umumiy hisob uchun o'zgaruvchilar
        const platforms = {};
        let totalDeposit = 0;
        let totalWithdrawal = 0;

        transactions.forEach(transaction => {
            const platform = transaction.platform || 'Nomalum';
            const type = transaction.type;
            const amount = transaction.amount || 0;

            if (!platforms[platform]) {
                platforms[platform] = { deposit: 0, withdrawal: 0 };
            }

            if (type === 'deposit') {
                platforms[platform].deposit += amount;
                totalDeposit += amount;
            } else if (type === 'withdrawal') {
                platforms[platform].withdrawal += amount;
                totalWithdrawal += amount;
            }
        });

        // Xabar shakllantirish
        let message = '📊 *Umumiy summa ma\'lumotlari (faqat success + valid ID)*\n\n';

        Object.keys(platforms).forEach(platform => {
            message += `*${platform}*\n`;
            message += `💲 Kirim: ${platforms[platform].deposit.toLocaleString('ru-RU')} so'm\n`;
            message += `💸 Chiqim: ${platforms[platform].withdrawal.toLocaleString('ru-RU')} so'm\n`;
            message += `🔄 Balans: ${(platforms[platform].deposit - platforms[platform].withdrawal).toLocaleString('ru-RU')} so'm\n\n`;
        });

        message += `*Jami*\n`;
        message += `💲 Kirim: ${totalDeposit.toLocaleString('ru-RU')} so'm\n`;
        message += `💸 Chiqim: ${totalWithdrawal.toLocaleString('ru-RU')} so'm\n`;
        message += `🔄 Balans: ${(totalDeposit - totalWithdrawal).toLocaleString('ru-RU')} so'm\n`;

        ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                Markup.button.callback('🏠 Menu', 'main_menu')
            ])
        });
    } catch (error) {
        console.error('Total sum error:', error);
        ctx.reply('Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
    }
});

// Oylik summa handleri
bot.hears('📅 Oylik summa', async (ctx) => {
    try {
        const startDate = moment().startOf('month').toDate();

        // Faqat statusi "success" bo'lgan, ID si mavjud va joriy oyda bo'lgan transactionlarni olish
        const transactions = await Transaction.find({
            status: 'success',
            $or: [{ operationId: { $ne: null } }, { paymentId: { $ne: null } }],
            timestamp: { $gte: startDate }
        });

        const platforms = {};
        let totalDeposit = 0;
        let totalWithdrawal = 0;

        transactions.forEach(transaction => {
            const platform = transaction.platform || 'Nomalum';
            const type = transaction.type;
            const amount = transaction.amount || 0;

            if (!platforms[platform]) {
                platforms[platform] = { deposit: 0, withdrawal: 0 };
            }

            if (type === 'deposit') {
                platforms[platform].deposit += amount;
                totalDeposit += amount;
            } else if (type === 'withdrawal') {
                platforms[platform].withdrawal += amount;
                totalWithdrawal += amount;
            }
        });

        let message = `📅 *${moment().format('MMMM YYYY')} oyi uchun summa ma'lumotlari (faqat success + valid ID)*\n\n`;

        Object.keys(platforms).forEach(platform => {
            message += `*${platform}*\n`;
            message += `💲 Kirim: ${platforms[platform].deposit.toLocaleString('ru-RU')} so'm\n`;
            message += `💸 Chiqim: ${platforms[platform].withdrawal.toLocaleString('ru-RU')} so'm\n`;
            message += `🔄 Balans: ${(platforms[platform].deposit - platforms[platform].withdrawal).toLocaleString('ru-RU')} so'm\n\n`;
        });

        message += `*Jami*\n`;
        message += `💲 Kirim: ${totalDeposit.toLocaleString('ru-RU')} so'm\n`;
        message += `💸 Chiqim: ${totalWithdrawal.toLocaleString('ru-RU')} so'm\n`;
        message += `🔄 Balans: ${(totalDeposit - totalWithdrawal).toLocaleString('ru-RU')} so'm\n`;

        ctx.reply(message, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                Markup.button.callback('🏠 Menu', 'main_menu')
            ])
        });
    } catch (error) {
        console.error('Monthly sum error:', error);
        ctx.reply('Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
    }
});


bot.hears("💵 To'ldirish", async (ctx) => {
    ctx.session.state = 'SELECT_PLATFORM';
    return ctx.reply("💳 To'lov platformasini tanlang:", Markup.inlineKeyboard([
        [Markup.button.callback('SpinBetter', 'platform_spinbetter')],
        [Markup.button.callback('JVSpin', 'platform_jvspin')],
        [Markup.button.callback('1ProBet', 'platform_1probet')]
    ]));
});

// Platforma tanlanganda
bot.action(/^platform_(.+)$/, async (ctx) => {
    const platform = ctx.match[1];
    ctx.session.data = { platform };
    ctx.session.state = 'REQUEST_ID';
    return ctx.reply("📌 ID raqamingizni kiriting:");
});





// Handle text messages (for searches) - TUZATILGAN
bot.on('text', async (ctx) => {
    const text = ctx.message.text.trim();
    
    if (!ctx.session) {
        return;
    }

    console.log('Current state:', ctx.session.state, 'Text:', text); // Debug qilish uchun log

    if (ctx.session.state === 'REQUEST_ID') {
        ctx.session.data.id = text;
        ctx.session.state = 'REQUEST_AMOUNT';
        return ctx.reply("💰 To'lov summasini kiriting:");
    }

    if (ctx.session.state === 'REQUEST_AMOUNT') {
        ctx.session.data.amount = text;
        const { platform, id, amount } = ctx.session.data;

        try {
            let depositResponse;

            if (platform === 'jvspin') {
                depositResponse = await jvpaymentClient.deposit(id, amount);
            } else if (platform === 'spinbetter') {
                depositResponse = await spinbetterClient.deposit(id, amount);
            } else if (platform === '1probet') {
                depositResponse = await probetClient.deposit(id, amount);
            }

            await ctx.reply(`✅ To'lov natijasi:\n\`${JSON.stringify(depositResponse, null, 2)}\``, { parse_mode: 'Markdown' });
        } catch (error) {
            console.error('Deposit error:', error);
            await ctx.reply('❌ To‘lov amalga oshirishda xatolik yuz berdi.');
        }

        ctx.session.state = null;
        return;
    }

    if (ctx.session.state === searchStates.USER_SEARCH) {
        try {
            const user = await User.findOne({ telegramId: text });
            if (!user) {
                return ctx.reply(`Telegram ID: <b>${text}</b> ga ega foydalanuvchi topilmadi.`, {
                    parse_mode: 'HTML',
                    ...Markup.inlineKeyboard([Markup.button.callback('🏠 Menu', 'main_menu')])
                });
            }
    
            const transactions = await Transaction.find({ telegramId: text }).sort({ timestamp: -1 });
    
            let message = `
            👤 <b>User ma'lumotlari:</b> \n
            📌 <b>Telegram ID:</b> <code>${user.telegramId}</code> \n
            👤 <b>Username:</b> ${user.username ? '@' + user.username : 'Mavjud emas'} \n
            📝 <b>To'liq ismi:</b> ${user.fullName || 'Mavjud emas'} \n
            📞 <b>Telefon:</b> ${user.phone || 'Mavjud emas'} \n
            📆 <b>Ro'yxatdan o'tgan:</b> ${moment(user.createdAt).format('DD.MM.YYYY HH:mm')} \n
            🕒 <b>Oxirgi faollik:</b> ${moment(user.lastActive).format('DD.MM.YYYY HH:mm')} \n
            ✅ <b>Holati:</b> ${user.isActive ? 'Faol' : 'Bloklangan'} \n
            🔑 <b>Admin:</b> ${user.isAdmin ? 'Ha' : 'Yo\'q'} \n`;
    
            if (transactions.length > 0) {
                message += `\n\n📝 <b>Foydalanuvchi transactionlari:</b>\n`;
                transactions.slice(0, 5).forEach((transaction, index) => {
                    message += `\n${index + 1}. ${transaction.type === 'deposit' ? '💲 Kirim' : '💸 Chiqim'} - <b>${transaction.amount ? transaction.amount.toLocaleString('ru-RU') + ' so\'m' : 'Mavjud emas'}</b>`;
                    message += `\n   📆 Sana: ${moment(transaction.timestamp).format('DD.MM.YYYY HH:mm')}`;
                    message += `\n   📋 Holati: ${transaction.status || 'Mavjud emas'}`;
                });
    
                if (transactions.length > 10) {
                    message += `\n\n...va yana <b>${transactions.length - 10}</b> ta transaction mavjud.`;
                }
            } else {
                message += `\n\n📝 <b>Foydalanuvchining transactionlari mavjud emas.</b>`;
            }
    
            ctx.reply(message, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([Markup.button.callback('🏠 Menu', 'main_menu')])
            });
    
        } catch (error) {
            console.error('User search error:', error);
            ctx.reply('❌ <b>Qidirishda xatolik yuz berdi. Qaytadan urinib ko‘ring.</b>', { parse_mode: 'HTML' });
        }
    
        ctx.session.state = null;
        return;
    }
    
    
    

    if (ctx.session.state === searchStates.PAYMENT_ID_SEARCH) {
        try {
            const transactions = await Transaction.find({ paymentId: text }).sort({ timestamp: -1 });
            if (transactions.length === 0) {
                return ctx.reply(`Payment ID: ${text} ga mos transactionlar topilmadi.`, 
                    Markup.inlineKeyboard([Markup.button.callback('🏠 Menu', 'main_menu')])
                );
            }
            let message = `🔍 *Payment ID: ${text}* bo'yicha ${transactions.length} ta transaction topildi:\n\n`;
            transactions.forEach((transaction, index) => {
                message += `${index + 1}. ${formatTransactionData(transaction)}\n`;
            });
            ctx.reply(message, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([Markup.button.callback('🏠 Menu', 'main_menu')])
            });
        } catch (error) {
            console.error('Payment ID search error:', error);
            ctx.reply('Qidirishda xatolik yuz berdi. Qaytadan urinib ko\'ring.');
        }
        ctx.session.state = null;
    }
});

// Handle errors
bot.catch((err, ctx) => {
    console.error(`Bot xatoligi: ${ctx.updateType}`, err);
    ctx.reply('Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
});

// Start bot
bot.launch().then(() => {
    console.log('Bot started');
}).catch(err => {
    console.error('Bot launch error:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));