const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// مسار لإرسال رسالة باستخدام مفتاح API - متاح للعملاء
router.get('/api/send-message', messageController.sendMessage);

// مسار للتحقق من الرصيد باستخدام مفتاح API - متاح للعملاء
router.get('/api/check-balance', messageController.checkBalance);

// مسارات للمدراء فقط - تتطلب تسجيل الدخول والتحقق من الصلاحيات
// التحقق من رصيد مزود الخدمة
router.get('/admin/sms-provider-balance', isAuthenticated, messageController.checkSmsProviderBalance);

// تحديث حالة الرسائل المعلقة
router.post('/admin/update-pending-messages', isAuthenticated, messageController.updatePendingMessagesStatus);

// مسار للحصول على رسائل عميل معين - متاح فقط للأدمن
router.get('/client/:clientId/messages', isAuthenticated, messageController.getClientMessages);

module.exports = router;
