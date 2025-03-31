/**
 * مسارات مراقبة webhook واتساب الرسمي من ميتا
 */
const express = require('express');
const router = express.Router();
const metaWhatsappMonitorController = require('../controllers/metaWhatsappMonitorController');
const { isAdmin } = require('../middleware/authMiddleware');

// عرض صفحة المراقبة
router.get('/admin/meta-whatsapp-monitor', isAdmin, metaWhatsappMonitorController.showMonitor);

// عرض تفاصيل سجل معين
router.get('/admin/meta-whatsapp-monitor/log/:id', isAdmin, metaWhatsappMonitorController.showLogDetails);

// API للحصول على أحدث السجلات
router.get('/api/meta-whatsapp/logs/latest', isAdmin, metaWhatsappMonitorController.getLatestLogs);

// حذف السجلات القديمة
router.post('/admin/meta-whatsapp-monitor/clear-old', isAdmin, metaWhatsappMonitorController.clearOldLogs);

module.exports = router;
