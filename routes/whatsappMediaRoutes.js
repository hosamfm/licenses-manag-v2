/**
 * مسارات وسائط واتساب
 * تتعامل مع تحميل وإرسال الملفات عبر واتساب
 */
const express = require('express');
const router = express.Router();
const whatsappMediaController = require('../controllers/whatsappMediaController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// مسار تحميل ملف إلى التخزين السحابي
router.post('/upload', isAuthenticated, whatsappMediaController.uploadMedia);

// مسار إرسال ملف إلى محادثة واتساب
router.post('/conversations/:conversationId/send', isAuthenticated, whatsappMediaController.sendMedia);

// طلب تحديث رابط ملف وسائط
router.post('/refresh-url', isAuthenticated, whatsappMediaController.refreshMediaUrl);

module.exports = router;
