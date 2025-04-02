/**
 * مسارات وسائط واتساب - WhatsApp Media Routes
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const whatsappMediaController = require('../controllers/whatsappMediaController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// إعداد multer لتحميل الملفات (تخزين مؤقت في الذاكرة)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 16 * 1024 * 1024 } // الحد الأقصى 16 ميجابايت
});

// الحصول على وسائط رسالة محددة
router.get('/message/:messageId', isAuthenticated, whatsappMediaController.getMediaByMessage);

// استرجاع محتوى الوسائط برابط مباشر (يمكن استخدام إما معرف الوسائط أو معرف الرسالة)
router.get('/content/:mediaId', whatsappMediaController.getMediaContent);

// مسار إضافي لاسترجاع الوسائط باستخدام معرف الرسالة مباشرة
router.get('/message-content/:messageId', whatsappMediaController.getMediaContentByMessage);

// تحميل وسائط جديدة للإرسال
router.post('/upload', 
  isAuthenticated, 
  upload.single('mediaFile'), 
  whatsappMediaController.uploadMediaForSending
);

module.exports = router;
