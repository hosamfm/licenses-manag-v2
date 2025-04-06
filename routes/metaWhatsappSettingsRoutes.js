/**
 * مسارات إعدادات واتساب الرسمي من ميتا
 */
const express = require('express');
const router = express.Router();
const metaWhatsappSettingsController = require('../controllers/metaWhatsappSettingsController');
const { isAdmin, isAuthenticated } = require('../middleware/authMiddleware');

// مسار عرض إعدادات واتساب الرسمي
router.get('/admin/meta-whatsapp-settings', isAdmin, metaWhatsappSettingsController.showMetaWhatsappSettings);

// مسار حفظ إعدادات واتساب الرسمي
router.post('/admin/meta-whatsapp-settings/save', isAdmin, metaWhatsappSettingsController.saveMetaWhatsappSettings);

// مسار إضافة إعداد واتساب جديد
router.post('/admin/meta-whatsapp-settings/add', isAdmin, metaWhatsappSettingsController.addMetaWhatsappSettings);

// مسار الحصول على إعداد واتساب محدد للتعديل
router.get('/admin/meta-whatsapp-settings/get/:id', isAdmin, metaWhatsappSettingsController.getMetaWhatsappSettings);

// مسار تحديث إعداد واتساب محدد
router.post('/admin/meta-whatsapp-settings/update', isAdmin, metaWhatsappSettingsController.updateMetaWhatsappSettings);

// مسار حذف إعداد واتساب محدد
router.post('/admin/meta-whatsapp-settings/delete', isAdmin, metaWhatsappSettingsController.deleteMetaWhatsappSettings);

// مسار توليد توكن تحقق جديد
router.post('/admin/meta-whatsapp-settings/generate-token', isAdmin, metaWhatsappSettingsController.generateNewVerifyToken);

// فحص حالة اتصال إعداد واتساب معين
router.get('/admin/meta-whatsapp-settings/check-connection/:id', isAuthenticated, isAdmin, metaWhatsappSettingsController.checkSettingConnection);

module.exports = router;
