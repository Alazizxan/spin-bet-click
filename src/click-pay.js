// clickApi.js
const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');
const config = require('./config');
const { CLICK_API } = require('./config');
// Load environment variables
dotenv.config();

// Click.uz API configuration


// Auth generation
const generateClickAuth = () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = crypto.createHash('sha1')
        .update(timestamp + CLICK_API.SECRET_KEY)
        .digest('hex');
    return `${CLICK_API.MERCHANT_USER_ID}:${digest}:${timestamp}`;
};

// Axios instance creation
const createAxiosInstance = () => {
    return axios.create({
        baseURL: CLICK_API.BASE_URL,
        headers: {
            'Auth': generateClickAuth(),
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    });
};



const requestCardTokenWithTimeout = async (cardNumber, expireDate) => {
    const timeout = 4000; // 4 soniya

    // Timeout uchun promise
    const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Karta ma\'lumotlari noto\'g\'ri')), timeout)
    );

    try {
        const response = await Promise.race([
            createAxiosInstance().post('/card_token/request', {
                service_id: parseInt(CLICK_API.SERVICE_ID, 10),
                card_number: cardNumber,
                expire_date: expireDate,
                temporary: 0,
            }),
            timeoutPromise, // Agar 4 soniya ichida tugamasa, timeout xatosini qaytaradi
        ]);

        return response.data;
    } catch (error) {
        throw new Error(
            'Karta token so\'rovida xatolik: ' +
            (error.response?.data?.error_note || error.message)
        );
    }
};






// Request for card token
const requestCardToken = async (cardNumber, expireDate) => {
    try {
        const response = await createAxiosInstance().post('/card_token/request', {
            service_id: parseInt(CLICK_API.SERVICE_ID, 10),
            card_number: cardNumber,
            expire_date: expireDate,
            temporary: 1
        });
        
        return response.data;
    } catch (error) {
        throw new Error('Error requesting card token: ' + error.response?.data?.error_note || error.message);
    }
};

// Verify card token
const verifyCardToken = async (cardToken, smsCode) => {
    try {
        const response = await createAxiosInstance().post('/card_token/verify', {
            service_id: parseInt(CLICK_API.SERVICE_ID, 10),
            card_token: cardToken,
            sms_code: smsCode
        });
        return response.data;
    } catch (error) {
        throw new Error('Error verifying card token: ' + error.response?.data?.error_note || error.message);
    }
};

// Make payment
const makePayment = async (cardToken, amount) => {
    try {
        const paymentPayload = {
            service_id: parseInt(CLICK_API.SERVICE_ID, 10),
            card_token: cardToken,
            amount: parseFloat(amount), // Convert amount to float
            transaction_parameter: Date.now().toString() // Transaction parameter as string
        };

        const response = await createAxiosInstance().post('/card_token/payment', paymentPayload);
        return response.data;
    } catch (error) {
        throw new Error('Error making payment: ' + error.response?.data?.error_note || error.message);
    }
};

module.exports = {
    requestCardToken,
    requestCardTokenWithTimeout,
    verifyCardToken,
    makePayment
};
