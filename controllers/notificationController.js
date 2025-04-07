const NotificationService = require('../services/notificationService');

/**
 * وحدة تحكم الإشعارات
 * توفر طرق نهائية للتعامل مع طلبات HTTP المتعلقة بالإشعارات
 */
class NotificationController {
  /**
   * الحصول على إشعارات المستخدم
   * @param {Object} req - كائن الطلب
   * @param {Object} res - كائن الاستجابة
   */
  static async getUserNotifications(req, res) {
    try {
      const userId = req.session.userId;
      const { unread, includeArchived, limit, skip } = req.query;
      
      const options = {
        onlyUnread: unread === 'true',
        includeArchived: includeArchived === 'true',
        limit: limit ? parseInt(limit, 10) : 20,
        skip: skip ? parseInt(skip, 10) : 0
      };
      
      const notifications = await NotificationService.getUserNotifications(userId, options);
      const unreadCount = await NotificationService.getUnreadCount(userId);
      
      return res.status(200).json({
        success: true,
        notifications,
        unreadCount
      });
    } catch (error) {
      console.error('خطأ في الحصول على الإشعارات:', error);
      return res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء جلب الإشعارات'
      });
    }
  }
  
  /**
   * الحصول على عدد الإشعارات غير المقروءة
   * @param {Object} req - كائن الطلب
   * @param {Object} res - كائن الاستجابة
   */
  static async getUnreadCount(req, res) {
    try {
      const userId = req.session.userId;
      const unreadCount = await NotificationService.getUnreadCount(userId);
      
      return res.status(200).json({
        success: true,
        unreadCount
      });
    } catch (error) {
      console.error('خطأ في الحصول على عدد الإشعارات غير المقروءة:', error);
      return res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء جلب عدد الإشعارات غير المقروءة'
      });
    }
  }

  /**
   * تحديث حالة القراءة للإشعار
   * @param {Object} req - كائن الطلب
   * @param {Object} res - كائن الاستجابة
   */
  static async markAsRead(req, res) {
    try {
      const { notificationId } = req.params;
      const { isRead = true } = req.body;
      
      const notification = await NotificationService.markAsRead(notificationId, isRead === true || isRead === 'true');
      
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'الإشعار غير موجود'
        });
      }
      
      return res.status(200).json({
        success: true,
        notification
      });
    } catch (error) {
      console.error('خطأ في تحديث حالة القراءة للإشعار:', error);
      return res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء تحديث حالة القراءة للإشعار'
      });
    }
  }

  /**
   * تحديث حالة القراءة لجميع إشعارات المستخدم
   * @param {Object} req - كائن الطلب
   * @param {Object} res - كائن الاستجابة
   */
  static async markAllAsRead(req, res) {
    try {
      const userId = req.session.userId;
      const result = await NotificationService.markAllAsRead(userId, true);
      
      return res.status(200).json({
        success: true,
        message: 'تم تحديث جميع الإشعارات كمقروءة',
        result
      });
    } catch (error) {
      console.error('خطأ في تحديث حالة القراءة لجميع الإشعارات:', error);
      return res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء تحديث حالة القراءة لجميع الإشعارات'
      });
    }
  }

  /**
   * أرشفة إشعار
   * @param {Object} req - كائن الطلب
   * @param {Object} res - كائن الاستجابة
   */
  static async archiveNotification(req, res) {
    try {
      const { notificationId } = req.params;
      const { isArchived = true } = req.body;
      
      const notification = await NotificationService.archiveNotification(notificationId, isArchived === true || isArchived === 'true');
      
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'الإشعار غير موجود'
        });
      }
      
      return res.status(200).json({
        success: true,
        notification
      });
    } catch (error) {
      console.error('خطأ في أرشفة الإشعار:', error);
      return res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء أرشفة الإشعار'
      });
    }
  }

  /**
   * حذف إشعار
   * @param {Object} req - كائن الطلب
   * @param {Object} res - كائن الاستجابة
   */
  static async deleteNotification(req, res) {
    try {
      const { notificationId } = req.params;
      
      const result = await NotificationService.deleteNotification(notificationId);
      
      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'الإشعار غير موجود'
        });
      }
      
      return res.status(200).json({
        success: true,
        message: 'تم حذف الإشعار بنجاح'
      });
    } catch (error) {
      console.error('خطأ في حذف الإشعار:', error);
      return res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء حذف الإشعار'
      });
    }
  }
}

module.exports = NotificationController; 