const express = require('express');
const router = express.Router();
const NotificationController = require('../controllers/notificationController');
const { isAuthenticated } = require('../middleware/authMiddleware');

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

module.exports = router; 