require('dotenv').config();

const config = {
    CLICK_API: {
        SECRET_KEY: process.env.CLICK_API_SECRET_KEY,
        MERCHANT_USER_ID: process.env.CLICK_API_MERCHANT_USER_ID,
        SERVICE_ID: process.env.CLICK_API_SERVICE_ID,
        BASE_URL: process.env.CLICK_API_BASE_URL,
    },
    PAYMENT_CLIENT: {
        CASHDESK_PASSWORD: process.env.CASHDESK_PASSWORD,
        CASHDESK_ID: process.env.CASHDESK_ID,
        API_KEY: process.env.API_KEY,
        BASE_URL: process.env.BASE_URL,
        JVCASHDESK_PASSWORD: process.env.JVCASHDESK_PASSWORD,
        JVCASHDESK_ID: process.env.JVCASHDESK_ID,
        JVAPI_KEY: process.env.JVAPI_KEY,
        ProCASHDESK_PASSWORD: process.env.ProCASHDESK_PASSWORD,
        ProCASHDESK_ID: process.env.ProCASHDESK_ID,
        ProAPI_KEY: process.env.ProAPI_KEY,
    },
    BOT: {
        TOKEN: process.env.BOT_TOKEN,
        ADMIN_IDS: process.env.ADMIN_IDS.split(','),
        CHANNEL_ID: process.env.CHANNEL_ID,
        ADMIN_ID: process.env.ADMIN_ID,
    },
    DATABASE: {
        URI: process.env.MONGO_URI,
    },
    LIMIT: {
        LIMIT: Number(process.env.LIMIT),
    },
};

module.exports = config;
