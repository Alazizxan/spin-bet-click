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

module.exports = {
    formatCardNumber,
    validateExpiryDate
};
