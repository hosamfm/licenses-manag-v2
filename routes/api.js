/**
 * مسارات API
 */
const express = require('express');
const router = express.Router();
const messageController = require('../controllers/api/messageController');
const { requireAuth } = require('../middleware/auth');

// تطبيق وسيط التحقق من المصادقة على جميع طلبات API
router.use(requireAuth);

// مسارات ال API لتحديث حالة قراءة الرسائل
router.post('/messages/update-read-status', messageController.updateReadStatus);
router.get('/messages/:messageId/read-by', messageController.getReadBy);

module.exports = router; 