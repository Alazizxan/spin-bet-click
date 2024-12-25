require('dotenv').config();

const config = {
    CLICK_API: {
        BASE_URL: process.env.CLICK_BASE_URL,
        SERVICE_ID: process.env.CLICK_SERVICE_ID,
        SECRET_KEY: process.env.CLICK_SECRET_KEY,
        MERCHANT_ID: process.env.CLICK_MERCHANT_ID,
        MERCHANT_USER_ID: process.env.CLICK_MERCHANT_USER_ID,
    },
    PAYMENT_CLIENT: {
        CASHDESK_PASSWORD: process.env.CASHDESK_PASSWORD,
        CASHDESK_ID: process.env.CASHDESK_ID,
        API_KEY: process.env.API_KEY,
        BASE_URL: process.env.BASE_URL,
    },
    BOT: {
        TOKEN: process.env.BOT_TOKEN,
        ADMIN_IDS: process.env.ADMIN_IDS.split(','),
        CHANNEL_ID: process.env.CHANNEL_ID,
    },
    DATABASE: {
        URI: process.env.MONGO_URI,
    },
};

module.exports = config;
