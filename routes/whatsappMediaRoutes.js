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

// مسار لتدفق الوسائط مباشرة من التخزين - بدون مصادقة لتمكين التضمين المباشر
router.get('/stream/:r2Key', whatsappMediaController.streamMedia);

module.exports = router;
