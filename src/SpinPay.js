const config = require('./config'); // config faylni import qilamiz


class PaymentAPIClient {
    constructor() {
        this.cashdeskPassword = config.PAYMENT_CLIENT.CASHDESK_PASSWORD;
        this.cashdeskId = config.PAYMENT_CLIENT.CASHDESK_ID;
        this.apiKey = config.PAYMENT_CLIENT.API_KEY;
        this.baseUrl = config.PAYMENT_CLIENT.BASE_URL;
    }

    async _generateSha256(inputString) {
        const crypto = require('crypto');
        return crypto.createHash('sha256').update(inputString, 'utf-8').digest('hex').toLowerCase();
    }

    async _generateMd5(inputString) {
        const crypto = require('crypto');
        return crypto.createHash('md5').update(inputString, 'utf-8').digest('hex').toLowerCase();
    }

    async _generateSignature(userId, summa, lng = 'ru') {
        const hashString = `hash=${this.apiKey}&lng=${lng}&userid=${userId}`;
        const hashResult1 = await this._generateSha256(hashString);
        
        const paramsString = `summa=${parseInt(summa)}&cashierpass=${this.cashdeskPassword}&cashdeskid=${this.cashdeskId}`;
        const hashResult2 = await this._generateMd5(paramsString);
        
        return await this._generateSha256(hashResult1 + hashResult2);
    }

    async _generateConfirm(userId) {
        const confirmString = `${userId}:${this.apiKey}`;
        return await this._generateMd5(confirmString);
    }

    async deposit(userId, summa, lng = 'ru') {
        try {
            const signature = await this._generateSignature(userId, summa, lng);
            const confirm = await this._generateConfirm(userId);

            const url = `${this.baseUrl}/CashdeskBotAPI/Deposit/${userId}/Add`;

            const headers = {
                'Content-Type': 'application/json',
                'sign': signature,
                'Accept': 'application/json',
            };

            const payload = {
                cashdeskId: parseInt(this.cashdeskId),
                lng: lng,
                summa: parseInt(summa),
                confirm: confirm,
            };

            const axios = require('axios');
            const response = await axios.post(url, payload, { headers });

            const data = response.data;
            return data;

        } catch (error) {
            
            return false;
        }
    }

    async payout(userId, code, lng = 'ru') {
        try {
            // 4.1 Hashlarni hosil qilish
            const hashString = `hash=${this.apiKey}&lng=${lng}&userid=${userId}`;
            const hashResult1 = await this._generateSha256(hashString);
            

            const paramsString = `code=${String(code)}&cashierpass=${this.cashdeskPassword}&cashdeskid=${this.cashdeskId}`;
            const hashResult2 = await this._generateMd5(paramsString);
            
            const combinedHash = await this._generateSha256(hashResult1 + hashResult2);
    
            // 4.2 Confirm hosil qilish
            const confirmString = `${userId}:${this.apiKey}`;
            const confirm = await this._generateMd5(confirmString);
    
            // 4.3 API so'rovni tayyorlash
            const url = `${this.baseUrl}/CashdeskBotAPI/Deposit/${userId}/Payout`;
    
            const headers = {
                'Content-Type': 'application/json',
                'sign': combinedHash,
                'Accept': 'application/json',
            };
    
            const payload = {
                cashdeskId: parseInt(this.cashdeskId),
                lng: lng,
                code: code,
                confirm: confirm,
            };
            
            
    
            const axios = require('axios');
            const response = await axios.post(url, payload, { headers });
    
            const data = response.data;
            
            return data;
    
        } catch (error) {
            
            return { success: false, error: error.message };
        }
    }
    
    
    async searchUser(userId) {
        try {
            const hashString = `hash=${this.apiKey}&userid=${userId}&cashdeskid=${this.cashdeskId}`;
            const hashResult = await this._generateSha256(hashString);
            
            const hashString2 = `userid=${userId}&cashierpass=${this.cashdeskPassword}&hash=${this.apiKey}`;
            const hashResult2 = await this._generateMd5(hashString2);

            const signature = await this._generateSha256(hashResult + hashResult2);
            const confirm = await this._generateMd5(`${userId}:${this.apiKey}`);
    
            const url = `${this.baseUrl}/CashdeskBotAPI/Users/${userId}?confirm=${confirm}&cashdeskId=${this.cashdeskId}`;
            
            const headers = {
                'Content-Type': 'application/json',
                'sign': signature,
                'Accept': 'application/json',
            };

            const axios = require('axios');
            const response = await axios.get(url, {headers});
    
            const data = response.data;
            return data;
    
        } catch (error) {
            return { success: false, error: error.message };
        }
    }



}

module.exports = PaymentAPIClient;
