const JvPaymentAPIClient = require('./jvspinbetpay');
const ProPaymentAPIClient = require('./1probet-pay');
const SpinbetterApiClient = require('./SpinPay');



const spinbetterClient = new SpinbetterApiClient();
const jvspinbetClient = new JvPaymentAPIClient();
const pro1betClient = new ProPaymentAPIClient();


// Models
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    telegramId: String,
    refferalId: String,
    username: String,
    fullName: String,
    phone: String,
    registrationDate: {
        type: Date,
        default: Date.now
    },
    lastActive: Date,
    isActive: {
        type: Boolean,
        default: true
    },
    isAdmin: {
        type: Boolean,
        default: false
    }
});

const TransactionSchema = new mongoose.Schema({
    userId: String,
    telegramId: String,
    phone: String,
    type: {
        type: String,
        enum: ['deposit', 'withdrawal']
    },
    platform: String,
    gameId: String,
    cardNumber: String,
    expiryDate: String,
    amount: Number,
    status: String,
    paymentId: String,
    error: String,
    operationId: String,
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const User = mongoose.model('User', UserSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);

// Bot code
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const moment = require('moment');

// Initialize bot
const bot = new TelegramBot("8159558283:AAEetjs_CfzllCfFDX_-BzSFpQE9l-DeLeo", { polling: true });

// Connect to MongoDB
mongoose.connect('mongodb+srv://uchar:Lalaku007@cluster0.qpkevc2.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Keyboard layouts
const mainKeyboard = {
    reply_markup: {
        keyboard: [
            ['Alldata', 'Statistics'],
            ['Search', 'Checking', 'Payment']
        ],
        resize_keyboard: true
    }
};

const allDataKeyboard = {
    reply_markup: {
        keyboard: [
            ['Transactions', 'Users'],
            ['Back to Main Menu']
        ],
        resize_keyboard: true
    }
};

const searchKeyboard = {
    reply_markup: {
        keyboard: [
            ['Game ID', 'Telegram ID'],
            ['Back to Main Menu']
        ],
        resize_keyboard: true
    }
};

const checkingKeyboard = {
    reply_markup: {
        keyboard: [
            ['Payment ID', 'Operation ID'],
            ['Back to Main Menu']
        ],
        resize_keyboard: true
    }
};

const paymentKeyboard = {
    reply_markup: {
        keyboard: [
            ['Deposit', 'Withdrawal'],
            ['Back to Main Menu']
        ],
        resize_keyboard: true
    }
};

const navigationKeyboard = {
    reply_markup: {
        keyboard: [
            ['< Previous', 'Next >'],
            ['Back']
        ],
        resize_keyboard: true
    }
};

// User states storage
const userStates = new Map();

// Helper function to format transaction data
function formatTransaction(transaction) {
    return `
🔖 Transaction ID: ${transaction._id}
👤 User ID: ${transaction.userId}
📱 Telegram ID: ${transaction.telegramId}
📞 Phone: ${transaction.phone}
💰 Amount: ${transaction.amount}
🏷 Type: ${transaction.type}
💰 PaymentId: ${transacton.paymentId}
💰 OperationId: ${transaction.operationId}
🎮 Platform: ${transaction.platform}
🎲 Game ID: ${transaction.gameId}
💳 Card: ${transaction.cardNumber}
📅 Date: ${moment(transaction.timestamp).format('YYYY-MM-DD HH:mm:ss')}
📊 Status: ${transaction.status}
`;
}


const removeKeyboard = {
    reply_markup: {
        remove_keyboard: true
    }
};


// Helper function to format user data
function formatUser(user) {
    return `
👤 User Information:
📱 Telegram ID: ${user.telegramId}
👥 Username: ${user.username}
📋 Full Name: ${user.fullName}
📞 Phone: ${user.phone}
📅 Registered: ${moment(user.registrationDate).format('YYYY-MM-DD HH:mm:ss')}
⚡ Active: ${user.isActive ? 'Yes' : 'No'}
`;
}

// Command handlers
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 'Welcome to the Transaction Management Bot!', mainKeyboard);
});

// Main menu handler
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    switch (text) {
        case 'Alldata':
            bot.sendMessage(chatId, 'Select data type:', allDataKeyboard);
            break;

        case 'Statistics':
            await handleStatistics(chatId);
            break;

        case 'Search':
            bot.sendMessage(chatId, 'Select search type:', searchKeyboard);
            break;

        case 'Checking':
            bot.sendMessage(chatId, 'Select checking type:', checkingKeyboard);
            break;

        case 'Payment':
            bot.sendMessage(chatId, 'Select payment type:', paymentKeyboard);
            break;

        case 'Back to Main Menu':
            bot.sendMessage(chatId, 'Main Menu:', mainKeyboard);
            userStates.delete(chatId);
            break;

        case 'Transactions':
            await handlePagination(chatId, 'transactions');
            break;

        case 'Users':
            await handlePagination(chatId, 'users');
            break;

        case 'Game ID':
            userStates.set(chatId, { action: 'search_game_id' });
            bot.sendMessage(chatId, 'Please enter Game ID:');
            break;

        case 'Telegram ID':
            userStates.set(chatId, { action: 'search_telegram_id' });
            bot.sendMessage(chatId, 'Please enter Telegram ID:');
            break;

        case 'Payment ID':
            userStates.set(chatId, { action: 'check_payment_id' });
            bot.sendMessage(chatId, 'Please enter Payment ID:');
            break;

        case 'Operation ID':
            userStates.set(chatId, { action: 'check_operation_id' });
            bot.sendMessage(chatId, 'Please enter Operation ID:');
            break;

        case 'Deposit':
            userStates.set(chatId, { action: 'deposit_platform' });
            bot.sendMessage(chatId, 'Platformani tanlang:', platformKeyboard);
            break;

        case 'Withdrawal':
            userStates.set(chatId, { action: 'withdrawal_platform' });
            bot.sendMessage(chatId, 'Platformani tanlang:', platformKeyboard);
            break;

        default:
            await handleStateBasedInput(chatId, text);
            break;
    }
});

// Handle pagination for transactions and users
async function handlePagination(chatId, type, page = 0) {
    const pageSize = 10;
    const skip = page * pageSize;
    
    let data;
    let totalCount;
    
    try {
        if (type === 'transactions') {
            data = await Transaction.find()
                .skip(skip)
                .limit(pageSize)
                .sort({ timestamp: -1 });
            totalCount = await Transaction.countDocuments();
        } else {
            data = await User.find()
                .skip(skip)
                .limit(pageSize)
                .sort({ registrationDate: -1 });
            totalCount = await User.countDocuments();
        }

        if (data.length === 0) {
            bot.sendMessage(chatId, 'No data found', mainKeyboard);
            return;
        }

        const formattedData = data.map(item => 
            type === 'transactions' ? formatTransaction(item) : formatUser(item)
        ).join('\n---\n');

        const paginationInfo = `Page ${page + 1} of ${Math.ceil(totalCount / pageSize)}`;
        
        bot.sendMessage(chatId, `${paginationInfo}\n\n${formattedData}`, navigationKeyboard);
        userStates.set(chatId, { action: type, currentPage: page });
    } catch (error) {
        console.error('Pagination error:', error);
        bot.sendMessage(chatId, 'Error fetching data', mainKeyboard);
    }
}

// Handle statistics calculation
async function handleStatistics(chatId) {
    try {
        // All-time statistics
        const allTimeStats = await calculateStatistics();
        let message = '📊 All Time Statistics:\n';
        message += formatStatistics(allTimeStats);

        // Monthly statistics
        const monthlyStats = await calculateStatistics(moment().subtract(1, 'month'));
        message += '\n\n📅 Last Month Statistics:\n';
        message += formatStatistics(monthlyStats);

        // Platform statistics
        const platformStats = await calculatePlatformStatistics();
        message += '\n\n🎮 Platform Statistics:\n';
        message += formatPlatformStatistics(platformStats);

        bot.sendMessage(chatId, message, mainKeyboard);
    } catch (error) {
        console.error('Statistics error:', error);
        bot.sendMessage(chatId, 'Error calculating statistics', mainKeyboard);
    }
}

async function calculateStatistics(startDate = null) {
    const query = startDate ? { timestamp: { $gte: startDate.toDate() } } : {};
    
    const transactions = await Transaction.find(query);
    const stats = {
        deposit: { count: 0, total: 0 },
        withdrawal: { count: 0, total: 0 }
    };

    transactions.forEach(tx => {
        stats[tx.type].count++;
        stats[tx.type].total += tx.amount;
    });

    return stats;
}

async function calculatePlatformStatistics() {
    return await Transaction.aggregate([
        {
            $group: {
                _id: '$platform',
                count: { $sum: 1 },
                total: { $sum: '$amount' }
            }
        }
    ]);
}

function formatStatistics(stats) {
    return `
Deposits: ${stats.deposit.count} (Total: ${stats.deposit.total})
Withdrawals: ${stats.withdrawal.count} (Total: ${stats.withdrawal.total})
Net: ${stats.deposit.total - stats.withdrawal.total}`;
}

function formatPlatformStatistics(platformStats) {
    return platformStats.map(platform => 
        `${platform._id || 'Unknown'}: ${platform.count} transactions (Total: ${platform.total})`
    ).join('\n');
}

// Handle state-based user input
async function handleStateBasedInput(chatId, text) {
    const state = userStates.get(chatId);
    if (!state) return;

    try {
        switch (state.action) {
            case 'search_game_id':
                await handleGameIdSearch(chatId, text);
                break;
            case 'search_telegram_id':
                await handleTelegramIdSearch(chatId, text);
                break;
            case 'check_payment_id':
                await handlePaymentIdCheck(chatId, text);
                break;
            case 'check_operation_id':
                await handleOperationIdCheck(chatId, text);
                break;
            case 'deposit_platform':
            case 'withdrawal_platform':
                await handlePlatformSelection(chatId, text);
                break;
            
            case 'deposit_game_id':
            case 'withdrawal_game_id':
                await handleGameIdInput(chatId, text);
                break;

            case 'deposit_amount':
            case 'withdrawal_amount':
                await handlePaymentAmountInput(chatId, text);
                break;
            case 'transactions':
            case 'users':
                await handlePaginationNavigation(chatId, text, state);
                break;
        }
    } catch (error) {
        console.error('State handling error:', error);
        bot.sendMessage(chatId, 'Error processing your request', mainKeyboard);
    }
}

// Search handlers
async function handleGameIdSearch(chatId, gameId) {
    const transactions = await Transaction.find({ userId });
    if (transactions.length === 0) {
        bot.sendMessage(chatId, 'No transactions found with this Game ID', mainKeyboard);
        return;
    }

    const user = await User.findOne({ telegramId: transactions[0].telegramId });
    let response = user ? formatUser(user) + '\n\nTransactions:\n' : 'Transactions:\n';
    response += transactions.map(formatTransaction).join('\n---\n');
    
    bot.sendMessage(chatId, response, mainKeyboard);
    userStates.delete(chatId);
}

async function handleTelegramIdSearch(chatId, telegramId) {
    const user = await User.findOne({ telegramId });
    const transactions = await Transaction.find({ telegramId });
    
    if (!user && transactions.length === 0) {
        bot.sendMessage(chatId, 'No data found for this Telegram ID', mainKeyboard);
        return;
    }

    let response = user ? formatUser(user) + '\n\n' : '';
    if (transactions.length > 0) {
        response += 'Transactions:\n' + transactions.map(formatTransaction).join('\n---\n');
    }
    
    bot.sendMessage(chatId, response, mainKeyboard);
    userStates.delete(chatId);
}

// Checking handlers
async function handlePaymentIdCheck(chatId, paymentId) {
    const transaction = await Transaction.findOne({ paymentId });
    if (!transaction) {
        bot.sendMessage(chatId, 'Transaction not found', mainKeyboard);
        return;
    }

    const user = await User.findOne({ telegramId: transaction.telegramId });
    let response = user ? formatUser(user) + '\n\nTransaction:\n' : 'Transaction:\n';
    response += formatTransaction(transaction);
    
    bot.sendMessage(chatId, response, mainKeyboard);
    userStates.delete(chatId);
}

async function handleOperationIdCheck(chatId, operationId) {
    const transaction = await Transaction.findOne({ operationId });
    if (!transaction) {
        bot.sendMessage(chatId, 'Transaction not found', mainKeyboard);
        return;
    }

    const user = await User.findOne({ telegramId: transaction.telegramId });
    let response = user ? formatUser(user) + '\n\nTransaction:\n' : 'Transaction:\n';
    response += formatTransaction(transaction);
    
    bot.sendMessage(chatId, response, mainKeyboard);
    userStates.delete(chatId);
}

// Payment handlers
// Inline Keyboard for platform selection
const platformKeyboard = {
    reply_markup: {
        keyboard: [
            ['Spinbetter', 'JVSpinbet', 'Pro1bet'],
            ['Back to Main Menu']
        ],
        resize_keyboard: true
    }
};

// Function to handle platform selection
async function handlePlatformSelection(chatId, text) {
    const state = userStates.get(chatId);
    
    if (text === 'Back to Main Menu') {
        userStates.delete(chatId);
        return bot.sendMessage(chatId, 'Main Menu:', mainKeyboard);
    }

    if (['Spinbetter', 'JVSpinbet', 'Pro1bet'].includes(text)) {
        state.platform = text;
        state.action = state.action === 'deposit_platform' ? 'deposit_game_id' : 'withdrawal_game_id';
        userStates.set(chatId, state);
        return bot.sendMessage(chatId, 'Game ID ni kiriting:', removeKeyboard);
    } else {
        return bot.sendMessage(chatId, 'Noto\'g\'ri platforma. Iltimos qaytadan tanlang:', 
            platformKeyboard);
    }
}


async function handleGameIdInput(chatId, text) {
    const state = userStates.get(chatId);
    state.gameId = text;
    state.action = state.action === 'deposit_game_id' ? 'deposit_amount' : 'withdrawal_amount';
    userStates.set(chatId, state);
    
    bot.sendMessage(chatId, 'Summani kiriting:', removeKeyboard);
}

async function handlePaymentAmountInput(chatId, text) {
    const state = userStates.get(chatId);
    const amount = text
    const code = text;

   

    try {
        let response;
        const type = state.action.startsWith('deposit') ? 'deposit' : 'withdrawal';

        switch (state.platform.toLowerCase()) {
            case 'spinbetter':
                response = await (type === 'deposit'
                    ? spinbetterClient.deposit(state.gameId, amount)
                    : spinbetterClient.payout(state.gameId, code));
                    console.log(response);
                break;
            case 'jvspinbet':
                response = await (type === 'deposit'
                    ? jvspinbetClient.deposit(state.gameId, amount)
                    : jvspinbetClient.payout(state.gameId, amount));
                break;
            case 'pro1bet':
                response = await (type === 'deposit'
                    ? pro1betClient.deposit(state.gameId, amount)
                    : pro1betClient.payout(state.gameId, amount));
                break;
        }

        if (response && response.success) {
            const transaction = new Transaction({
                gameId: state.gameId,
                type: type,
                amount: amount,
                status: 'completed',
                platform: state.platform,
                operationId: `OP-${Date.now()}`,
                timestamp: new Date()
            });
            
            await transaction.save();
            
            await bot.sendMessage(chatId, 
                'Amaliyot muvaffaqiyatli yakunlandi!', 
                paymentKeyboard
            );
        } else {
            await bot.sendMessage(chatId,
                'Amaliyot amalga oshmadi. Iltimos qayta urinib ko\'ring.',
                paymentKeyboard
            );
        }

    } catch (error) {
        console.error('Payment processing error:', error);
        await bot.sendMessage(chatId,
            'Xatolik yuz berdi. Iltimos qayta urinib ko\'ring.',
            paymentKeyboard
        );
    }

    userStates.delete(chatId);
}


// Handle callback query for platform selection
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;

    if (data.startsWith('platform_')) {
        const platform = data.replace('platform_', '');
        const state = userStates.get(chatId) || {};
        state.platform = platform;
        userStates.set(chatId, state);

        bot.sendMessage(chatId, `You selected ${platform}. Please enter your payment ID:`, mainKeyboard);
    }
});

// Handle pagination navigation
async function handlePaginationNavigation(chatId, text, state) {
    try {
        if (text === '< Previous' && state.currentPage > 0) {
            await handlePagination(chatId, state.action, state.currentPage - 1);
        } else if (text === 'Next >') {
            const pageSize = 10;
            const totalCount = await (state.action === 'transactions' ? 
                Transaction.countDocuments() : 
                User.countDocuments());
            
            if ((state.currentPage + 1) * pageSize < totalCount) {
                await handlePagination(chatId, state.action, state.currentPage + 1);
            } else {
                bot.sendMessage(chatId, 'No more pages');
            }
        } else if (text === 'Back') {
            bot.sendMessage(chatId, 'Select data type:', allDataKeyboard);
            userStates.delete(chatId);
        }
    } catch (error) {
        console.error('Navigation error:', error);
        bot.sendMessage(chatId, 'Error navigating pages', mainKeyboard);
        userStates.delete(chatId);
    }
}

// Command handlers for specific actions
bot.onText(/\/transactions/, async (msg) => {
    const chatId = msg.chat.id;
    await handlePagination(chatId, 'transactions');
});

bot.onText(/\/users/, async (msg) => {
    const chatId = msg.chat.id;
    await handlePagination(chatId, 'users');
});

bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id;
    await handleStatistics(chatId);
});

// Error handler
bot.on('polling_error', (error) => {
    console.error('Polling error:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    await mongoose.connection.close();
    process.exit();
});

process.on('SIGTERM', async () => {
    await mongoose.connection.close();
    process.exit();
});