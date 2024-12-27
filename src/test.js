const crypto = require('crypto'); // Hashlarni hisoblash uchun
const axios = require('axios'); // HTTP so'rovlarni jo'natish uchun

// API uchun konfiguratsiya ma'lumotlari
const config = {
    hash: 'a2640a353b22fe063727d6aef8869fe5876630f5faccdaad42c40b1e5ac223d3', // API_KEY
    cashierPass: 'TuAT5ef2',
    cashdeskId: '1293755',
    baseUrl: 'https://partners.servcul.com/CashdeskBotAPI'
};

// Imzo hisoblash uchun yordamchi funksiyalar
function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function md5(data) {
    return crypto.createHash('md5').update(data).digest('hex');
}

// Balans olish funksiyasi
async function getCashdeskBalance() {
    const dt = new Date().toISOString().replace('T', ' ').slice(0, 19); // UTC format: yyyy.MM.dd HH:mm:ss
    const confirm = md5(`${config.cashdeskId}:${config.hash}`);

    // Sign hisoblash
    const signPart1 = sha256(`hash=${config.hash}&cashierpass=${config.cashierPass}&dt=${dt}`);
    const signPart2 = md5(`dt=${dt}&cashierpass=${config.cashierPass}&cashdeskid=${config.cashdeskId}`);
    const sign = sha256(signPart1 + signPart2);

    // API so'rovi URL
    const url = `${config.baseUrl}/CashdeskBotAPI/Cashdesk/${config.cashdeskId}/Balance?confirm=${confirm}&dt=${dt}`;

    try {
        const response = await axios.get(url, {
            headers: { sign }
        });
        console.log('Balans ma\'lumotlari:', response.data);
    } catch (error) {
        console.error('Xatolik yuz berdi:', error.response ? error.response.data : error.message);
    }
}

// Balans olishni chaqirish
getCashdeskBalance();
