/**
 * مسارات webhook واتساب الرسمي من ميتا
 */
const express = require('express');
const router = express.Router();
const metaWhatsappWebhookController = require('../controllers/metaWhatsappWebhookController');

// مسار التحقق من webhook واتساب الرسمي
router.get('/api/meta-whatsapp/webhook', metaWhatsappWebhookController.verifyWebhook);

// مسار استقبال webhook واتساب الرسمي
router.post('/api/meta-whatsapp/webhook', metaWhatsappWebhookController.handleWebhook);

module.exports = router;
