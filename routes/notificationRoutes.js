const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notificationController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const webPushService = require('../services/webPushService');
const User = require('../models/User');

/**
 * مسارات الإشعارات
 * توفر نقاط نهاية للتعامل مع الإشعارات
 */

// الحصول على إشعارات المستخدم
router.get('/user', isAuthenticated, NotificationController.getUserNotifications);

// الحصول على عدد الإشعارات غير المقروءة
router.get('/unread-count', isAuthenticated, NotificationController.getUnreadCount);

// تحديث حالة القراءة للإشعار
router.put('/:notificationId/read', isAuthenticated, NotificationController.markAsRead);

// تحديث حالة القراءة لجميع الإشعارات
router.put('/mark-all-read', isAuthenticated, NotificationController.markAllAsRead);

// أرشفة إشعار
router.put('/:notificationId/archive', isAuthenticated, NotificationController.archiveNotification);

// حذف إشعار
router.delete('/:notificationId', isAuthenticated, NotificationController.deleteNotification);

// مسار حفظ اشتراك إشعارات الويب
router.post('/subscription', isAuthenticated, async (req, res) => {
  try {
    const { subscription } = req.body;
    
    if (!subscription) {
      return res.status(400).json({ success: false, message: 'بيانات الاشتراك مفقودة' });
    }
    
    const userId = req.session.userId;
    const result = await webPushService.saveSubscription(userId, subscription);
    
    res.json(result);
  } catch (error) {
    console.error('خطأ في حفظ اشتراك إشعارات الويب:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// مسار إلغاء اشتراك إشعارات الويب
router.post('/unsubscribe', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // إزالة بيانات الاشتراك من قاعدة البيانات
    await User.findByIdAndUpdate(userId, { $unset: { pushSubscription: 1 } });
    
    console.log(`تم إلغاء اشتراك إشعارات الويب للمستخدم: ${userId}`);
    
    res.json({ success: true, message: 'تم إلغاء اشتراك إشعارات الويب بنجاح' });
  } catch (error) {
    console.error('خطأ في إلغاء اشتراك إشعارات الويب:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// مسار إرسال إشعار تجريبي
router.post('/send-test', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // إرسال إشعار تجريبي
    const result = await webPushService.sendTestNotification(userId);
    
    res.json(result);
  } catch (error) {
    console.error('خطأ في إرسال الإشعار التجريبي:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router; 