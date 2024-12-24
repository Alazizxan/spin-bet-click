const { Telegraf, Markup } = require('telegraf');
const PaymentAPIClient = require('./SpinPay');
const clickApi = require('./click-pay');

const bot = new Telegraf('8139684420:AAFd3j8wRjNshypQjXvVh3lsopY3y60kqXk');
const paymentClient = new PaymentAPIClient();
const ADMIN_IDS = ['7465707954'];

const userStates = new Map();
const transactions = new Map();

// Keyboard layouts
const mainKeyboard = Markup.keyboard([
    [ '💳 Hisob To\'ldirish','💰 Pul yechish'],
    ['Support', 'Qo\'llanma']
]).resize();


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
2. Bokmeker IDingizni  kiriting
3. Hisobingizdan pul chiqarishda [Наличные]ni tanlang!
4. QARSHI LT Textile (24/7)ni tanlang
5. Kodni oling va kiriting
6. Karta raqamini kiriting
7. Ma'lumotlarni tasdiqlang

❗️ Muammo bo'lsa: @support_admin`;

    await ctx.reply(manual, mainKeyboard);
});

const confirmKeyboard = Markup.keyboard([
    ['✅ Tasdiqlash', '❌ Bekor qilish']
]).resize();

const contactKeyboard = Markup.keyboard([
    [Markup.button.contactRequest('📱 Raqamni ulashish')]
]).resize();

const backKeyboard = Markup.keyboard([
    ['🔙 Orqaga']
]).resize();

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

// Notification functions
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

const sendTransactionNotification = async (transactionData) => {
    const message = `
🔔 Yangi tranzaksiya:
📱 Tel: ${transactionData.phone}
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
};

const sendPayoutNotification = async (payoutData) => {
    const message = `
🔄 Yangi pul yechish:
🆔 ID: ${payoutData.userId}
💳 Karta: ${payoutData.cardNumber}
💰 Summa: ${payoutData.amount}
🔑 Operation ID: ${payoutData.operationId}
✅ Status: ${payoutData.success ? 'Muvaffaqiyatli' : 'Muvaffaqiyatsiz'}
💬 Xabar: ${payoutData.message}
⏰ Vaqt: ${new Date().toLocaleString()}
`;
    
    await notifyAdmins(message, payoutData.success ? 'success' : 'error');
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
    
    setState(ctx.from.id, 'START');
    await ctx.reply('Xush kelibsiz! Davom etish uchun raqamingizni ulashing:', contactKeyboard);
    await notifyAdmins(`Yangi foydalanuvchi: ${ctx.from.id} (${ctx.from.username || 'username yo\'q'})`, 'info');
});

// Contact handler
bot.on('contact', async (ctx) => {
    if (!ctx.from || !ctx.message.contact) return;
    
    const userId = ctx.from.id;
    const phone = ctx.message.contact.phone_number;
    
    setState(userId, 'MAIN_MENU', { phone });
    await ctx.reply('Asosiy menyu:', mainKeyboard);
});


const platformButtons = Markup.inlineKeyboard([
    
        [Markup.button.callback('SpinBetter', 'platform_spinbetter')],
        [Markup.button.callback('1xBet', 'platform_1xbet')],
        [Markup.button.callback('LineBet', 'platform_linebet')]
    
]).resize();

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

// Handle platform selection
bot.action(/platform_(.+)/, async (ctx) => {
    if (!ctx.from || !ctx.match) return;
    
    const platform = ctx.match[1];
    const userState = getState(ctx.from.id);
    await ctx.deleteMessage();

    if (userState.state === 'WITHDRAWAL_TYPE') {
        setState(ctx.from.id, 'WAITING_ID');
        await ctx.reply('ID raqamingizni kiriting:', backKeyboard);
    } else if (userState.state === 'PAYOUT_TYPE') {
        setState(ctx.from.id, 'PAYOUT_WAITING_ID');
        await ctx.reply('ID raqamingizni kiriting:', backKeyboard);
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
                try { gamer_data = await paymentClient.searchUser(text);
                    setState(userId, 'WAITING_AMOUNT', { ...userState.data, gameId: text });
                    const message = `
                🆔 <b>User ID:</b> <code>${gamer_data.UserId}</code>
👤 <b>Name:</b> ${gamer_data.Name}
💵 <b>Currency ID:</b> ${gamer_data.CurrencyId}
`;

    // Sending the formatted reply
                    await ctx.reply(message, { parse_mode: 'HTML' }, backKeyboard);
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
                                
                                const transactionData0 = {
                                    userId: userState.data.gameId,
                                    phone: userState.data.phone,
                                    cardNumber: userState.data.cardNumber,
                                    expiryDate: userState.data.expiryDate,
                                    amount: userState.data.amount,
                                    success: "Kartadan Pul yechildi lekin pul tushmadi!",
                                    paymentId: paymentResponse.payment_id,
                                    error: depositResponse.Success ? null : depositResponse.Message,
                                    timestamp: new Date()
                                };
        

                                await sendTransactionNotification(transactionData0);

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
                try{
                    gamer_data = await paymentClient.searchUser(text);
                    const message = `
                🆔 <b>User ID:</b> <code>${gamer_data.UserId}</code>
👤 <b>Name:</b> ${gamer_data.Name}
💵 <b>Currency ID:</b> ${gamer_data.CurrencyId}`;
                    await ctx.reply(message, { parse_mode: 'HTML' }, backKeyboard);
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

// Update handlers


// Support and Manual handlers
// Fix Support and Manual handlers
bot.hears('Support', async (ctx) => {
    if (!ctx.from) return;
    await ctx.reply('Admin bilan bog\'lanish: @support_admin', backKeyboard);
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