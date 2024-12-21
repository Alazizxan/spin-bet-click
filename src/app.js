const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');
const TelegramBot = require('node-telegram-bot-api');

// Load environment variables
dotenv.config();

const app = express();

// Telegram bot tokenini .env faylidan olish
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Foydalanuvchi ma'lumotlarini saqlash uchun Map
const userStates = new Map();

// Middleware for parsing JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Click.uz API configuration
const CLICK_API = {
    BASE_URL: 'https://api.click.uz/v2/merchant',
    SERVICE_ID: process.env.CLICK_SERVICE_ID,
    SECRET_KEY: process.env.CLICK_SECRET_KEY,
    MERCHANT_ID: process.env.CLICK_MERCHANT_ID,
    MERCHANT_USER_ID: process.env.MERCHANT_USER_ID
};

// Validate environment variables
const validateConfig = () => {
    const required = ['CLICK_SERVICE_ID', 'CLICK_SECRET_KEY', 'CLICK_MERCHANT_ID', 'MERCHANT_USER_ID', 'BOT_TOKEN'];
    for (const key of required) {
        if (!process.env[key]) {
            throw new Error(`Missing required environment variable: ${key}`);
        }
    }
};

// Auth generation and axios instance creation functions remain the same
const generateClickAuth = () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = crypto.createHash('sha1')
        .update(timestamp + process.env.CLICK_SECRET_KEY)
        .digest('hex');
    return `${process.env.MERCHANT_USER_ID}:${digest}:${timestamp}`;
};

const createAxiosInstance = () => {
    return axios.create({
        baseURL: process.env.CLICK_BASE_URL || 'https://api.click.uz/v2/merchant/',
        headers: {
            'Auth': generateClickAuth(),
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    });
};

// Telegram bot handlers
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    
    // Contact tugmasini yaratish
    const keyboard = {
        keyboard: [[{
            text: '📱 Raqamni yuborish',
            request_contact: true
        }]],
        resize_keyboard: true,
        one_time_keyboard: true
    };
    
    bot.sendMessage(chatId, 'Xush kelibsiz! Iltimos, raqamingizni yuboring:', {
        reply_markup: keyboard
    });
});

// Contact qabul qilish
bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const contact = msg.contact;
    
    // Foydalanuvchi kontaktini saqlash
    userStates.set(chatId, {
        phone: contact.phone_number
    });
    
    // Asosiy menuni ko'rsatish
    showMainMenu(chatId);
});

// Asosiy menu
function showMainMenu(chatId) {
    const keyboard = {
        keyboard: [[
            { text: '💰 Hisobni to\'ldirish' },
            { text: '💳 Hisobdan pul yechish' }
        ]],
        resize_keyboard: true
    };
    
    bot.sendMessage(chatId, 'Kerakli amalni tanlang:', {
        reply_markup: keyboard
    });
}

// Hisobni to'ldirish jarayoni
bot.onText(/💰 Hisobni to'ldirish/, async (msg) => {
    const chatId = msg.chat.id;
    userStates.set(chatId, { ...userStates.get(chatId), state: 'waiting_spin_id' });
    bot.sendMessage(chatId, 'SPIN bet ID raqamingizni kiriting:');
});

// Spin ID qabul qilish va summa so'rash
bot.on('text', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const userData = userStates.get(chatId);

    if (!userData) return;

    switch (userData.state) {
        case 'waiting_spin_id':
            userStates.set(chatId, { ...userData, spinId: text, state: 'waiting_amount' });
            bot.sendMessage(chatId, 'To\'lov summasini kiriting (UZS):');
            break;

        case 'waiting_amount':
            if (!isNaN(text) && Number(text) > 0) {
                userStates.set(chatId, { ...userData, amount: Number(text), state: 'waiting_card_number' });
                bot.sendMessage(chatId, 'Karta raqamingizni kiriting (16 raqam):');
            } else {
                bot.sendMessage(chatId, 'Noto\'g\'ri summa. Iltimos, raqam kiriting.');
            }
            break;

        case 'waiting_card_number':
            if (/^\d{16}$/.test(text)) {
                userStates.set(chatId, { ...userData, cardNumber: text, state: 'waiting_expire_date' });
                bot.sendMessage(chatId, 'Karta amal qilish muddatini kiriting (MMYY formatida):');
            } else {
                bot.sendMessage(chatId, 'Noto\'g\'ri karta raqami. 16 ta raqam kiriting.');
            }
            break;

        case 'waiting_expire_date':
            if (/^\d{4}$/.test(text)) {
                try {
                    // Card token olish
                    const response = await createAxiosInstance().post('/card_token/request', {
                        service_id: parseInt(CLICK_API.SERVICE_ID, 10),
                        card_number: userData.cardNumber,
                        expire_date: text,
                        temporary: 1
                    });

                    userStates.set(chatId, { 
                        ...userData, 
                        expireDate: text,
                        cardToken: response.data.card_token,
                        state: 'waiting_sms_code'
                    });
                    
                    bot.sendMessage(chatId, 'SMS kodini kiriting:');
                } catch (error) {
                    bot.sendMessage(chatId, 'Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
                    showMainMenu(chatId);
                }
            } else {
                bot.sendMessage(chatId, 'Noto\'g\'ri format. MMYY formatida kiriting (masalan: 1225)');
            }
            break;

        case 'waiting_sms_code':
            try {
                // SMS kodni tekshirish
                await createAxiosInstance().post('/card_token/verify', {
                    service_id: parseInt(CLICK_API.SERVICE_ID, 10),
                    card_token: userData.cardToken,
                    sms_code: text
                });

                // To'lovni amalga oshirish
                const paymentResponse = await createAxiosInstance().post('/card_token/payment', {
                    service_id: parseInt(CLICK_API.SERVICE_ID, 10),
                    card_token: userData.cardToken,
                    amount: userData.amount.toString(),
                    transaction_parameter: Date.now()
                });
                console.log('Full Payment Response:', JSON.stringify(paymentResponse.data, null, 2));

                if (paymentResponse.data.error_code === 0) {
                    bot.sendMessage(chatId, `✅ To'lov muvaffaqiyatli amalga oshirildi!\n\nSumma: ${userData.amount} UZS\nID: ${userData.spinId}`);
                } else {
                    bot.sendMessage(chatId, `❌ To'lov amalga oshirilmadi: ${paymentResponse.data.error_note},${paymentResponse.data.error_code}`);
                }
            } catch (error) {
                bot.sendMessage(chatId, 'Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
            }
            
            // Foydalanuvchi holatini tozalash va asosiy menuga qaytish
            userStates.delete(chatId);
            showMainMenu(chatId);
            break;
    }
});

// Error handler middleware remains the same
app.use((err, req, res, next) => {
    console.error('Error details:', err.response?.data || err);
    if (err.response) {
        return res.status(err.response.status).json({
            error_code: err.response.data.error_code || -1,
            error_note: err.response.data.error_note || 'An error occurred with the payment service'
        });
    }
    res.status(500).json({
        error_code: -1,
        error_note: err.message || 'An unexpected error occurred'
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Telegram bot started');
});