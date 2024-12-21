const express = require('express');
const axios = require('axios');
const crypto = require('crypto');  // To calculate the sha1 digest
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Click.uz API configuration
const CLICK_API = {
    BASE_URL: 'https://api.click.uz/v2/merchant',
    SERVICE_ID: process.env.CLICK_SERVICE_ID,
    SECRET_KEY: process.env.CLICK_SECRET_KEY,
    MERCHANT_ID: process.env.CLICK_MERCHANT_ID
};

// Helper function to generate the "Auth" header
const generateClickAuth = () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const digest = crypto.createHash('sha1')
                         .update(timestamp + CLICK_API.SECRET_KEY)
                         .digest('hex');
    return `${CLICK_API.MERCHANT_ID}:${digest}:${timestamp}`;
};

// Helper function to create Axios instance with Auth header
const createAxiosInstance = () => {
    return axios.create({
        headers: {
            'Auth': generateClickAuth(),
            'Content-Type': 'application/json'  // Assuming JSON, adjust if needed
        }
    });
};

// Error handler middleware
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: err.response?.data || err.message 
    });
};

// Routes

// Create card token
app.post('/api/payments/card-token', async (req, res, next) => {
    try {
        const { card_number, expire_date, temporary } = req.body;
        
        const response = await createAxiosInstance().post(
            `${CLICK_API.BASE_URL}/card_token/request`, 
            {
                service_id: CLICK_API.SERVICE_ID,
                card_number,
                expire_date,
                temporary: temporary ? 1 : 0
            }
        );
        
        res.json(response.data);
    } catch (error) {
        next(error);
    }
});

// Verify card token
app.post('/api/payments/verify-token', async (req, res, next) => {
    try {
        const { card_token, sms_code } = req.body;
        
        const response = await createAxiosInstance().post(
            `${CLICK_API.BASE_URL}/card_token/verify`,
            {
                service_id: CLICK_API.SERVICE_ID,
                card_token,
                sms_code
            }
        );
        
        res.json(response.data);
    } catch (error) {
        next(error);
    }
});

// Process payment
app.post('/api/payments/process', async (req, res, next) => {
    try {
        const { card_token, amount, merchant_trans_id } = req.body;
        
        const response = await createAxiosInstance().post(
            `${CLICK_API.BASE_URL}/card_token/payment`,
            {
                service_id: CLICK_API.SERVICE_ID,
                card_token,
                amount,
                transaction_parameter: merchant_trans_id
            }
        );
        
        res.json(response.data);
    } catch (error) {
        next(error);
    }
});

// Delete card token
app.delete('/api/payments/card-token/:card_token', async (req, res, next) => {
    try {
        const { card_token } = req.params;
        
        const response = await createAxiosInstance().delete(
            `${CLICK_API.BASE_URL}/card_token/${CLICK_API.SERVICE_ID}/${card_token}`
        );
        
        res.json(response.data);
    } catch (error) {
        next(error);
    }
});

// Use error handler
app.use(errorHandler);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
});

// Handle unhandled errors
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});
