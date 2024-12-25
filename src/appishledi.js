
const PaymentAPIClient = require('./SpinPay');
const config = require('./config');

const paymentClient = new PaymentAPIClient();

const payment = paymentClient.searchUser('appis');
console.log(payment);