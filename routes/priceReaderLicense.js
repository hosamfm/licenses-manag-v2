const express = require('express');
const router = express.Router();
const licenseController = require('../controllers/licenseController');

// عرض صفحة طلب الترخيص
router.get('/price-reader-license', (req, res) => {
    res.render('price_reader_license');
});

// معالجة طلب الترخيص وتوجيه المستخدم لصفحة النجاح
router.post('/request-price-reader-license', licenseController.handlePriceReaderLicenseRequest);

// عرض صفحة النجاح بعد تقديم الطلب
router.get('/price-reader-license/success', (req, res) => {
    res.render('success_price_reader');
});

module.exports = router;
