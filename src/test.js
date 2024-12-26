function calculateModifiedValue(input) {
    // Kiruvchi stringdan "-" belgini olib tashlash
    let number = parseFloat(input.replace('-', ''));
    
    // Raqamdan 3% ni ayirish
    let result = number - (number * 0.03);
    
    return result;
}

const payoutData = {
    amount: '-1000',
    cimission: '',
};

const payout =  calculateModifiedValue(payoutData.amount)
console.log(payout);