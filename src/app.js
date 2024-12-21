const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();

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
    const required = ['CLICK_SERVICE_ID', 'CLICK_SECRET_KEY', 'CLICK_MERCHANT_ID','MERCHANT_USER_ID'];
    for (const key of required) {
        if (!process.env[key]) {
            throw new Error(`Missing required environment variable: ${key}`);
        }
    }
};

// Call validation on startup
validateConfig();

// Node.js "crypto" moduli orqali "Auth" sarlavhasini generatsiya qilish
const generateClickAuth = () => {
    const timestamp = Math.floor(Date.now() / 1000); // UNIX timestamp (10 raqamli)
    const digest = require('crypto').createHash('sha1')
        .update(timestamp + process.env.CLICK_SECRET_KEY)
        .digest('hex');
    return `${process.env.MERCHANT_USER_ID}:${digest}:${timestamp}`;
};

// Helper function to create Axios instance with Auth header
// "Axios" instansiyasini "Auth" sarlavhasi bilan yaratish
const createAxiosInstance = () => {
    return require('axios').create({
        baseURL: process.env.CLICK_BASE_URL || 'https://api.click.uz/v2/merchant/',
        headers: {
            'Auth': generateClickAuth(),
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    });
};


// Validation middleware for card token requests
const validateCardTokenRequest = (req, res, next) => {
    const { card_number, expire_date } = req.body;
    
    if (!card_number || !expire_date) {
        return res.status(400).json({
            error_code: -1,
            error_note: 'Card number and expiration date are required'
        });
    }

    if (!/^\d{16}$/.test(card_number)) {
        return res.status(400).json({
            error_code: -1,
            error_note: 'Invalid card number format'
        });
    }

    if (!/^\d{4}$/.test(expire_date)) {
        return res.status(400).json({
            error_code: -1,
            error_note: 'Invalid expiration date format (should be MMYY)'
        });
    }

    next();
};

// Routes

// 1. Create card token
app.post('/api/payments/Prepare', validateCardTokenRequest, async (req, res, next) => {
    try {
        const { card_number, expire_date, temporary } = req.body;
        
        const response = await createAxiosInstance().post(
            '/card_token/request',
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

// 2. Verify card token
app.post('/api/payments/verify-token', async (req, res, next) => {
    try {
        const { card_token, sms_code } = req.body;

        if (!card_token || !sms_code) {
            return res.status(400).json({
                error_code: -1,
                error_note: 'Card token and SMS code are required'
            });
        }
        
        const response = await createAxiosInstance().post(
            '/card_token/verify',
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

// 3. Process payment
// merchant_trans_id ni generatsiya qiluvchi funksiya
function generateMerchantTransId() {
    const randomOrder = Math.random().toString(36).substring(2, 10).toUpperCase(); // Tasodifiy harflar va raqamlar
    const timestamp = Date.now(); // Vaqt tamg'asi
    return `TRANS_${randomOrder}_${timestamp}`; // Yagona tranzaksiya ID
}

// API endpoint
app.post('/api/payments/Complete', async (req, res, next) => {
    try {
        const { card_token, amount } = req.body;

        // Validate required fields
        if (!card_token || !amount) {
            return res.status(400).json({
                error_code: -1,
                error_note: 'Missing required fields: card_token and amount'
            });
        }

        // Validate amount format
        if (typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({
                error_code: -1,
                error_note: 'Amount must be a positive number'
            });
        }

        // Generate merchant_trans_id
        const merchant_trans_id = generateMerchantTransId();

        // Create payload
        const payload = {
            service_id: CLICK_API.SERVICE_ID,
            card_token: card_token,
            amount: amount,
            transaction_parameter: merchant_trans_id
        };

        console.log('Payment request payload:', payload);

        // Send payment request to external API
        const response = await createAxiosInstance().post(
            '/card_token/payment',
            payload
        );

        res.json({
            error_code: response.data.error_code,
            error_note: response.data.error_note,
            payment_id: response.data.payment_id,
            payment_status: response.data.payment_status
        });
    } catch (error) {
        next(error);
    }
});


// 4. Delete card token
app.delete('/api/payments/card-token/:card_token', async (req, res, next) => {
    try {
        const { card_token } = req.params;
        
        if (!card_token) {
            return res.status(400).json({
                error_code: -1,
                error_note: 'Card token is required'
            });
        }

        const response = await createAxiosInstance().delete(
            `/card_token/${CLICK_API.SERVICE_ID}/${card_token}`
        );
        
        res.json(response.data);
    } catch (error) {
        next(error);
    }
});

// 5. Check payment status
app.get('/api/payments/status/:payment_id', async (req, res, next) => {
    try {
        const { payment_id } = req.params;

        if (!payment_id) {
            return res.status(400).json({
                error_code: -1,
                error_note: 'Payment ID is required'
            });
        }

        const response = await createAxiosInstance().get(
            `/payment_status/${CLICK_API.SERVICE_ID}/${payment_id}`
        );

        res.json(response.data);
    } catch (error) {
        next(error);
    }
});

// Error handler middleware
const errorHandler = (err, req, res, next) => {
    console.error('Error details:', err.response?.data || err);
    
    // Handle Axios errors
    if (err.response) {
        return res.status(err.response.status).json({
            error_code: err.response.data.error_code || -1,
            error_note: err.response.data.error_note || 'An error occurred with the payment service'
        });
    }

    // Handle other errors
    res.status(500).json({
        error_code: -1,
        error_note: err.message || 'An unexpected error occurred'
    });
};

// Use error handler
app.use(errorHandler);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'click-payment-service'
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Gracefully shutdown
    process.exit(1);
});