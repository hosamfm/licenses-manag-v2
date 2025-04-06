/**
 * مسارات إدارة قنوات واتساب
 */
const express = require('express');
const router = express.Router();
const whatsappChannelController = require('../controllers/whatsappChannelController');
const { isAuthenticated, checkRole } = require('../middleware/authMiddleware');

// حماية جميع المسارات بمتطلبات التحقق من الهوية
router.use(isAuthenticated);

// عرض صفحة إدارة قنوات واتساب
router.get('/whatsapp-channels', checkRole(['admin', 'supervisor']), whatsappChannelController.renderChannelsPage);

// الحصول على قائمة قنوات واتساب (API)
router.get('/api/whatsapp-channels', checkRole(['admin', 'supervisor']), whatsappChannelController.getChannels);

// إنشاء قناة واتساب جديدة
router.post('/whatsapp-channels', checkRole(['admin']), whatsappChannelController.createChannel);

// الحصول على إعدادات واتساب المتاحة للاختيار
router.get('/api/whatsapp-channels/settings', checkRole(['admin', 'supervisor']), whatsappChannelController.getAvailableSettings);

// الحصول على قناة واتساب بواسطة المعرف
router.get('/api/whatsapp-channels/:id', checkRole(['admin', 'supervisor']), whatsappChannelController.getChannelById);

// تحديث أو حذف قناة واتساب (نفس المسار)
router.post('/whatsapp-channels/:id', checkRole(['admin']), (req, res) => {
  if (req.body._method === 'DELETE') {
    whatsappChannelController.deleteChannel(req, res);
  } else {
    whatsappChannelController.updateChannel(req, res);
  }
});

module.exports = router;
