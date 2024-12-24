
const {bot} = require('./botInitialization');

const notifyAdmins = async (message, errorLevel = 'info') => {
    const emoji = {
        info: 'ℹ️',
        warning: '⚠️',
        error: '🚫',
        success: '✅'
    };

    const adminId = '7465707954'
    const formattedMessage = `${emoji[errorLevel]} ${message}`;
    const adminIds = process.env.ADMIN_IDS.split(',');
    for (const adminId of adminIds) {
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
${transactionData.error ? `❌ Xatolik: ${transactionData.error}` : ''}`;
    
    await notifyAdmins(message, transactionData.success ? 'success' : 'error');
};

module.exports = {
    notifyAdmins,
    sendTransactionNotification
};
