const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notificationController');
const { isAuthenticated } = require('../middleware/authMiddleware');
const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../services/loggerService');
const NotificationService = require('../services/notificationService');

/**
 * مسارات الإشعارات
 * توفر نقاط نهاية للتعامل مع الإشعارات
 */

// الحصول على إشعارات المستخدم
router.get('/user', async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;
    const skip = parseInt(req.query.skip) || 0;
    const onlyUnread = req.query.onlyUnread === 'true';

    const notifications = await NotificationService.getUserNotifications(userId, {
      limit,
      skip,
      onlyUnread
    });
    
    const unreadCount = await NotificationService.getUnreadCount(userId);

    res.json({ success: true, notifications, unreadCount });
  } catch (error) {
    logger.error('notificationRoutes', 'خطأ في جلب إشعارات المستخدم', error);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// الحصول على عدد الإشعارات غير المقروءة
router.get('/unread-count', isAuthenticated, NotificationController.getUnreadCount);

// تحديث حالة القراءة للإشعار
router.put('/:notificationId/read', async (req, res) => {
  try {
    const notificationId = req.params.notificationId;
    const userId = req.user._id;

    // التحقق من أن الإشعار يخص المستخدم
    const notification = await Notification.findOne({ _id: notificationId, recipient: userId });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'الإشعار غير موجود أو لا يخصك' });
    }

    const updatedNotification = await NotificationService.markAsRead(notificationId, req.body.isRead);
    res.json({ success: true, notification: updatedNotification });
  } catch (error) {
    logger.error('notificationRoutes', 'خطأ في تحديث حالة قراءة الإشعار', error);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// تحديث حالة القراءة لجميع الإشعارات
router.put('/mark-all-read', async (req, res) => {
  try {
    const userId = req.user._id;
    await NotificationService.markAllAsRead(userId);
    res.json({ success: true, message: 'تم تعيين جميع الإشعارات كمقروءة' });
  } catch (error) {
    logger.error('notificationRoutes', 'خطأ في تعيين جميع الإشعارات كمقروءة', error);
    res.status(500).json({ success: false, message: 'خطأ في الخادم' });
  }
});

// أرشفة إشعار
router.put('/:notificationId/archive', isAuthenticated, NotificationController.archiveNotification);

// حذف إشعار
router.delete('/:notificationId', isAuthenticated, NotificationController.deleteNotification);

// مسار جديد لتخزين اشتراك Web Push
router.post('/subscribe', async (req, res) => {
  const subscription = req.body;
  const userId = req.user._id;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ success: false, error: 'بيانات الاشتراك غير صالحة' });
  }

  try {
    // البحث عن المستخدم وتحديث اشتراكاته
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }

    // التحقق مما إذا كان الاشتراك موجودًا بالفعل
    const existingSubscription = user.webPushSubscriptions.find(
      sub => sub.endpoint === subscription.endpoint
    );

    if (!existingSubscription) {
      // إضافة الاشتراك الجديد
      user.webPushSubscriptions.push(subscription);
      await user.save();
      res.status(201).json({ success: true, message: 'تم الاشتراك بنجاح' });
    } else {
      res.status(200).json({ success: true, message: 'الاشتراك موجود بالفعل' });
    }

  } catch (error) {
    logger.error('notificationRoutes', 'خطأ في تخزين اشتراك Web Push', { userId, error: error.message });
    res.status(500).json({ success: false, error: 'خطأ في الخادم أثناء تخزين الاشتراك' });
  }
});

module.exports = router; 