// const crypto =  require('crypto');
const axios = require('axios');
const { salt_key, merchant_id } = require('./secret');
const sha256 = require('sha256');
const Booking = require('../models/Booking');


const newPayment = async (req, res) => {
    // console.log(req.body);
    const bookingData = {
        userId: req.body.userId,
        services: req.body.bookingData.serviceData,
        selectedAddress: req.body.bookingData.selectedAddress ? req.body.bookingData.selectedAddress : {
          address: "test address",
          pinCode: "999999",
          city: "Gurgaon"
        },
        serviceTiming: req.body.bookingData.bookingTimings.serviceTiming,
        startDate: req.body.bookingData.bookingTimings.startDate,
        totalPrice: req.body.bookingData.totalPrice,
      }
    try {
        const merchantTransactionId = req.body.transactionId;
        const data = {
            merchantId: merchant_id,
            merchantTransactionId: merchantTransactionId,
            merchantUserId: req.body.MUID,
            name: req.body.name,
            amount: req.body.amount * 100,
            redirectUrl: `${process.env.SERVER_URL}/api/payment/status/${merchantTransactionId}?bookingData=${encodeURIComponent(JSON.stringify(bookingData))}`,
            redirectMode: 'POST',
            callbackUrl: `${process.env.SERVER_URL}/api/payment/status/${merchantTransactionId}?bookingData=${encodeURIComponent(JSON.stringify(bookingData))}`,
            mobileNumber: req.body.number,
            paymentInstrument: {
                type: 'PAY_PAGE'
            }
        };
        const payload = JSON.stringify(data);
        const payloadMain = Buffer.from(payload).toString('base64');
        const keyIndex = 1;
        const string = payloadMain + '/pg/v1/pay' + salt_key;
        // const sha256 = crypto.createHash('sha256').update(string).digest('hex');
        const sha256_val = sha256(string);
        const checksum = sha256_val + '###' + keyIndex;

        // const prod_URL = "https://api.phonepe.com/apis/hermes/pg/v1/pay"
        const prod_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay"
        const options = {
            method: 'POST',
            url: prod_URL,
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                'X-VERIFY': checksum
            },
            data: {
                request: payloadMain
            }
        };

        axios.request(options).then(function (response) {
            // console.log(response.data.data) //.instrumentResponse.redirectInfo
            return res.status(200).send(response.data.data.instrumentResponse.redirectInfo.url)
        })
            .catch(function (error) {
                console.error(error);
                res.status(500).send({
                    message: error.message,
                    success: false
                })
            });

    } catch (error) {
        res.status(500).send({
            message: error.message,
            success: false
        })
    }
}

const checkStatus = async (req, res) => {
    const merchantTransactionId = res.req.body.transactionId
    const merchantId = res.req.body.merchantId

    // Decode and parse the bookingData from URL query parameters
    const bookingData = req.query.bookingData ? JSON.parse(decodeURIComponent(req.query.bookingData)) : null;


    const keyIndex = 1;
    const string = `/pg/v1/status/${merchantId}/${merchantTransactionId}` + salt_key;
    // const sha256_val = crypto.createHash('sha256').update(string).digest('hex');
    const sha256_val = sha256(string);
    const checksum = sha256_val + "###" + keyIndex;

    const options = {
        method: 'GET',
        url: `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status/${merchantId}/${merchantTransactionId}`,
        headers: {
            accept: 'application/json',
            'Content-Type': 'application/json',
            'X-VERIFY': checksum,
            'X-MERCHANT-ID': `${merchantId}`
        }
    };

    // CHECK PAYMENT STATUS
    axios.request(options)
        .then(async (response) => {
            // console.log(response.data)
            if (response.data.success === true) {
                try {
                    const bookingResponse = await createBooking({...bookingData, transactionData: response.data.data});
                    if (bookingResponse && bookingResponse.success) {
                        const successUrl = `${process.env.CLIENT_URL}/success/${bookingResponse.bookingId}`;
                        return res.redirect(successUrl);
                    } else {
                        // Handle scenario where booking creation fails
                        const failureUrl = `${process.env.CLIENT_URL}/failure`;
                        return res.redirect(failureUrl);
                    }
                } catch (error) {
                    console.error('Booking creation failed', error);
                    const errorUrl = `${process.env.CLIENT_URL}/failure`;
                    return res.redirect(errorUrl);
                }
            } else {
                const url = `${process.env.CLIENT_URL}/failure`;
                return res.redirect(url);
            }
        })
        .catch((error) => {
            console.error(error);
        });
};

async function createBooking(bookingDetails) {
    // Your booking creation logic here
    // This is a placeholder function. Implement your booking creation logic as required.
    // Example:
    const newBooking = new Booking(bookingDetails);
    const savedBooking = await newBooking.save();
    return {
        success: true,
        bookingId: savedBooking._id // or however you reference bookings
    };
}

module.exports = {
    newPayment,
    checkStatus
}
