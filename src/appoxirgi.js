const { Telegraf, Markup } = require('telegraf');
const PaymentAPIClient = require('./SpinPay');
const clickApi = require('./click-pay');
const mongoose = require('mongoose');

// MongoDB Connection
mongoose.connect('mongodb+srv://uchar:Lalaku007@cluster0.qpkevc2.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB connected successfully');
}).catch((err) => {
    console.error('MongoDB connection error:', err);
});


const UserSchema = new mongoose.Schema({
    telegramId: String,
    username: String,
    fullName: String,
    phone: String,
    registrationDate: { type: Date, default: Date.now },
    lastActive: Date,
    isActive: { type: Boolean, default: true }
});


async function checkUserExists(telegramId) {
    try {
        const user = await User.findOne({ telegramId: telegramId });
        return user != null;
    } catch (error) {
        console.error('Error checking user:', error);
        return false;
    }
}



const User = mongoose.model('User', UserSchema);
// MongoDB Schema Definitions
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

const Transaction = mongoose.model('Transaction', TransactionSchema);

// Helper function to save new user
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

const bot = new Telegraf('8139684420:AAFd3j8wRjNshypQjXvVh3lsopY3y60kqXk');
const paymentClient = new PaymentAPIClient();
const ADMIN_IDS = ['7465707954'];
const CHANNEL_ID = '-1002435229416'; // Replace with your channel ID

const userStates = new Map();
const transactions = new Map();

// Keyboard layouts
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

// Helper function to save transaction
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

// State management
const setState = (userId, state, data = {}) => {
    const currentState = userStates.get(userId);
    const previousState = currentState ? currentState.state : null;
    userStates.set(userId, { state, data: { ...data }, previousState });
};

const getState = (userId) => {
    return userStates.get(userId) || { state: 'START', data: {}, previousState: null };
};

// Helper functions
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

// Enhanced notification functions
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
    // Save to MongoDB
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
    // Save to MongoDB
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

// Navigation handler
const handleBack = async (ctx) => {
    if (!ctx.from) return;
    
    const userState = getState(ctx.from.id);
    let nextState = 'MAIN_MENU';
    let keyboard = mainKeyboard;
    let message = 'Asosiy menyu:';

    switch (userState.state) {
        case 'WAITING_AMOUNT':
        case 'WAITING_CARD':
        case 'WAITING_EXPIRY':
        case 'WAITING_SMS':
            nextState = 'WITHDRAWAL_TYPE';
            keyboard = mainKeyboard;
            break;
            
        case 'WITHDRAWAL_TYPE':
            nextState = 'MAIN_MENU';
            keyboard = mainKeyboard;
            message = 'Asosiy menyu:';
            break;

        case 'PAYOUT_WAITING_ID':
        case 'PAYOUT_WAITING_CODE':
        case 'PAYOUT_WAITING_CARD':
        case 'PAYOUT_CONFIRM':
            nextState = 'PAYOUT_TYPE';
            keyboard = mainKeyboard;
            break;
            
        case 'PAYOUT_TYPE':
            nextState = 'MAIN_MENU';
            keyboard = mainKeyboard;
            message = 'Asosiy menyu:';
            break;
    }

    setState(ctx.from.id, nextState, userState.data);
    await ctx.reply(message, keyboard);
};

// Bot commands
bot.command('start', async (ctx) => {
    if (!ctx.from) return;
    
    try {
        const userExists = await checkUserExists(ctx.from.id);
        
        if (userExists) {
            // User already registered
            const user = await User.findOne({ telegramId: ctx.from.id });
            setState(ctx.from.id, 'MAIN_MENU');
            await ctx.reply(`Qaytib kelganingizdan xursandmiz, ${user.fullName}!`, mainKeyboard);
            
            // Update last active
            await User.updateOne(
                { telegramId: ctx.from.id },
                { $set: { lastActive: new Date() } }
            );
        } else {
            // New user registration
            setState(ctx.from.id, 'START');
            await ctx.reply(
                'Xush kelibsiz! Ro\'yxatdan o\'tish uchun telefon raqamingizni ulashing:',
                contactKeyboard
            );
        }
        
        await notifyAdmins(
            `${userExists ? 'Mavjud' : 'Yangi'} foydalanuvchi: ${ctx.from.id} (${ctx.from.username || 'username yo\'q'})`,
            'info'
        );
    } catch (error) {
        console.error('Start command error:', error);
        await ctx.reply('Xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    }
});


// Contact handler
// Update contact handler
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
        
        // Notify admins about new registration
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

// Update handlers
bot.hears('💳 Hisob To\'ldirish', async (ctx) => {
    if (!ctx.from) return;
    setState(ctx.from.id, 'WITHDRAWAL_TYPE');
    await ctx.reply('Kerakli bukmekerni tanlang: ', platformButtons);
});

bot.hears('💰 Pul yechish', async (ctx) => {
    if (!ctx.from) return;
    setState(ctx.from.id, 'PAYOUT_TYPE');
    await ctx.reply('Platformani tanlang:', platformButtons);
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


bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    
    // Skip middleware for start command and contact sharing
    if (ctx.message && (
        ctx.message.text === '/start' || 
        (ctx.message.contact && ctx.message.contact.phone_number)
    )) {
        return next();
    }

    try {
        const userExists = await checkUserExists(ctx.from.id);
        if (!userExists) {
            await ctx.reply(
                'Iltimos, avval ro\'yxatdan o\'ting. /start buyrug\'ini bosing.',
                Markup.keyboard([['/start']])
                    .oneTime()
                    .resize()
            );
            return;
        }
        
        // Update last active timestamp
        await User.updateOne(
            { telegramId: ctx.from.id },
            { $set: { lastActive: new Date() } }
        );
        
        return next();
    } catch (error) {
        console.error('Middleware error:', error);
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




// Support and Manual handlers
bot.hears('Support', async (ctx) => {
    if (!ctx.from) return;
    await ctx.reply('Admin bilan bog\'lanish: @support_admin', backKeyboard);
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

❗️ Muammo bo'lsa: @support_admin`;

    await ctx.reply(manual, mainKeyboard);
});

// History command
bot.command('history', async (ctx) => {
    if (!ctx.from) return;
    
    try {
        const transactions = await Transaction.find({ telegramId: ctx.from.id })
            .sort({ timestamp: -1 })
            .limit(10);
        
        if (transactions.length === 0) {
            await ctx.reply('Sizda hali operatsiyalar mavjud emas.');
            return;
        }

        let message = '📊 Oxirgi 10 ta operatsiya:\n\n';
        for (const tx of transactions) {
            message += `${tx.type === 'deposit' ? '💳' : '💰'} ${tx.type.toUpperCase()}
Platform: ${tx.platform}
Summa: ${tx.amount}
Status: ${tx.status}
Vaqt: ${tx.timestamp.toLocaleString()}
------------------\n`;
        }

        await ctx.reply(message);
    } catch (error) {
        await ctx.reply('Xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    }
});

// Back button handler
bot.hears('🔙 Orqaga', handleBack);

// Text handler for all states
bot.on('text', async (ctx) => {
    if (!ctx.from || !ctx.message) return;
    
    const userId = ctx.from.id;
    const userState = getState(userId);
    const text = ctx.message.text;

    if (text === '🔙 Orqaga') {
        return handleBack(ctx);
    }

    try {
        switch (userState.state) {
            // Deposit flow
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
                    const cardTokenResponse = await clickApi.requestCardToken(
                        userState.data.cardNumber,
                        expiryDate
                    );
                    
                    if (cardTokenResponse.error_code === 0) {
                        setState(userId, 'WAITING_SMS', { 
                            ...userState.data, 
                            expiryDate,
                            cardToken: cardTokenResponse.card_token 
                        });
                        await ctx.reply('SMS kodni kiriting:', backKeyboard);
                    } else {
                        throw new Error('Karta ma\'lumotlari noto\'g\'ri');
                    }
                } catch (error) {
                    throw error;
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
                                await ctx.reply('✅ To\'lov muvaffaqiyatli amalga oshirildi!', mainKeyboard);
                            } else {
                                await ctx.reply(`❌ Xatolik: ${depositResponse.Message}`, mainKeyboard);
                                
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
                    await ctx.reply(`❌ Xatolik: ${error.message}`, mainKeyboard);
                    setState(userId, 'MAIN_MENU');
                }
                break;

            // Payout flow
            case 'PAYOUT_WAITING_ID':
                try {
                    const gamer_data = await paymentClient.searchUser(text);
                    const message = `
                🆔 <b>User ID:</b> <code>${gamer_data.UserId}</code>
👤 <b>Name:</b> ${gamer_data.Name}
💵 <b>Currency ID:</b> ${gamer_data.CurrencyId}`;
                    await ctx.reply(message, { parse_mode: 'HTML' });
                    setState(userId, 'PAYOUT_WAITING_CODE', { ...userState.data, gameId: text });
                    await ctx.reply('Kodni kiriting:', backKeyboard);
                } catch (error) {
                    throw error;
                }
                break;

            case 'PAYOUT_WAITING_CODE':
                setState(userId, 'PAYOUT_WAITING_CARD', { 
                    ...userState.data, 
                    code: text 
                });
                await ctx.reply('Karta raqamini kiriting:', backKeyboard);
                break;

            case 'PAYOUT_WAITING_CARD':
                try {
                    const cardNumber = formatCardNumber(text);
                    const { gameId, code } = userState.data;
                    
                    setState(userId, 'PAYOUT_CONFIRM', { 
                        ...userState.data, 
                        cardNumber 
                    });

                    const confirmMessage = `
Ma'lumotlarni tekshiring:
🆔 ID: ${gameId}
🔐 Kod: ${code}
💳 Karta: ${cardNumber}

Ma'lumotlar to'g'rimi?`;

                    await ctx.reply(confirmMessage, confirmKeyboard);
                } catch (error) {
                    throw error;
                }
                break;

            case 'PAYOUT_CONFIRM':
                if (text === '✅ Tasdiqlash') {
                    try {
                        const { gameId, code, cardNumber } = userState.data;
                        const response = await paymentClient.payout(gameId, code);
                        const payoutData = {
                            userId: gameId,
                            telegramId: userId,
                            platform: userState.data.platform,
                            cardNumber: cardNumber,
                            amount: response.Summa,
                            operationId: response.OperationId,
                            success: response.Success,
                            message: response.Message,
                        };

                        await sendPayoutNotification(payoutData);

                        if (response.Success) {
                            await ctx.reply(`
✅ Pul yechish muvaffaqiyatli!
💰 Summa: ${response.Summa}
🔑 Operation ID: ${response.OperationId}
💬 Xabar: ${response.Message}`, mainKeyboard);
                        } else {
                            throw new Error(response.Message || 'Pul yechishda xatolik');
                        }
                    } catch (error) {
                        await notifyAdmins(`Pul yechish xatoligi (User: ${userId}): ${error.message}`, 'error');
                        await ctx.reply(`❌ Xatolik: ${error.message}`, mainKeyboard);
                    }
                } else if (text === '❌ Bekor qilish') {
                    await ctx.reply('Pul yechish bekor qilindi', mainKeyboard);
                }
                setState(userId, 'MAIN_MENU');
                break;
        }
    } catch (error) {
        await ctx.reply(`❌ Xatolik: ${error.message}`, backKeyboard);
        await notifyAdmins(`Xatolik (User: ${userId}): ${error.message}`, 'warning');
    }
});

// Error handler
bot.catch(async (err, ctx) => {
    console.error('Bot error:', err);
    await ctx.reply('Xatolik yuz berdi. Iltimos qaytadan urinib ko\'ring.');
    if (ctx.from) {
        await notifyAdmins(`Tizim xatoligi (User: ${ctx.from.id}): ${err.message}`, 'error');
    }
});

// Start bot
bot.launch().then(() => {
    console.log('Bot started successfully');
    notifyAdmins('Bot qayta ishga tushdi', 'info');
}).catch(err => {
    console.error('Bot start error:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));