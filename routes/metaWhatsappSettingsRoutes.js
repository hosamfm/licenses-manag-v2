/**
 * مسارات إعدادات واتساب الرسمي من ميتا
 */
const express = require('express');
const router = express.Router();
const metaWhatsappSettingsController = require('../controllers/metaWhatsappSettingsController');
const { isAdmin } = require('../middleware/authMiddleware');

// مسار عرض إعدادات واتساب الرسمي
router.get('/admin/meta-whatsapp-settings', isAdmin, metaWhatsappSettingsController.showMetaWhatsappSettings);

// مسار حفظ إعدادات واتساب الرسمي
router.post('/admin/meta-whatsapp-settings/save', isAdmin, metaWhatsappSettingsController.saveMetaWhatsappSettings);

// مسار توليد توكن تحقق جديد
router.post('/admin/meta-whatsapp-settings/generate-token', isAdmin, metaWhatsappSettingsController.generateNewVerifyToken);

module.exports = router;
