const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

// مسار لإرسال رسالة باستخدام مفتاح API - متاح للعملاء
router.get('/api/send-message', messageController.sendMessage);

// مسار للتحقق من الرصيد باستخدام مفتاح API - متاح للعملاء
router.get('/api/check-balance', messageController.checkBalance);

module.exports = router;
