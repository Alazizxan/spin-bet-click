// clickApi.js
const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Click.uz API configuration
const CLICK_API = {
    BASE_URL: 'https://api.click.uz/v2/merchant',
    SERVICE_ID: '38391',
    SECRET_KEY: 'XIlHKia6zVcdW',
    MERCHANT_ID: '26291',
    MERCHANT_USER_ID: '47931'

};

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
    verifyCardToken,
    makePayment
};