const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * خدمة الإشعارات - توفر وظائف لإنشاء وإدارة الإشعارات
 */
class NotificationService {
  /**
   * إنشاء إشعار جديد
   * @param {Object} notification بيانات الإشعار
   * @returns {Promise<Object>} الإشعار الذي تم إنشاؤه
   */
  static async createNotification(notification) {
    try {
      // التحقق من أن المستلم موجود
      const recipient = await User.findById(notification.recipient);
      if (!recipient) {
        throw new Error('المستلم غير موجود');
      }

      // التحقق من إعدادات الإشعارات للمستخدم
      if (!this.shouldSendNotification(recipient, notification.type)) {
        console.log(`لن يتم إرسال إشعار للمستخدم ${recipient._id} بسبب إعداداته`);
        return null;
      }

      // إنشاء الإشعار
      const newNotification = new Notification(notification);
      await newNotification.save();
      
      // يمكن هنا إضافة إرسال الإشعار عبر ويب سوكت (سيتم تنفيذه لاحقاً)
      // إرسال حدث إلى ويب سوكت لإرسال الإشعار فورياً

      return newNotification;
    } catch (error) {
      console.error('خطأ في إنشاء الإشعار:', error);
      throw error;
    }
  }

  /**
   * إنشاء إشعار نظام لمستخدم واحد أو أكثر
   * @param {Array|String} recipientIds معرف المستلم أو مصفوفة من المعرفات
   * @param {String} title عنوان الإشعار
   * @param {String} content محتوى الإشعار
   * @param {String} link رابط للتنقل إليه عند النقر على الإشعار (اختياري)
   * @param {Object} reference مرجع للعنصر المرتبط بالإشعار (اختياري)
   * @returns {Promise<Array>} الإشعارات التي تم إنشاؤها
   */
  static async createSystemNotification(recipientIds, title, content, link = null, reference = null) {
    try {
      // تحويل المعرف إلى مصفوفة إذا كان واحدًا
      const recipients = Array.isArray(recipientIds) ? recipientIds : [recipientIds];
      const notifications = [];

      for (const recipientId of recipients) {
        const notification = await this.createNotification({
          recipient: recipientId,
          type: 'system',
          title,
          content,
          link,
          reference
        });
        if (notification) {
          notifications.push(notification);
        }
      }

      return notifications;
    } catch (error) {
      console.error('خطأ في إنشاء إشعار النظام:', error);
      throw error;
    }
  }

  /**
   * إنشاء إشعار رسالة
   * @param {String} recipientId معرف المستلم
   * @param {String} senderId معرف المرسل
   * @param {String} conversationId معرف المحادثة
   * @param {String} messageContent محتوى الرسالة
   * @returns {Promise<Object>} الإشعار الذي تم إنشاؤه
   */
  static async createMessageNotification(recipientId, senderId, conversationId, messageContent) {
    try {
      const sender = await User.findById(senderId);
      if (!sender) {
        throw new Error('المرسل غير موجود');
      }

      return await this.createNotification({
        recipient: recipientId,
        sender: senderId,
        type: 'message',
        title: `رسالة جديدة من ${sender.full_name || sender.username}`,
        content: messageContent.length > 100 ? `${messageContent.slice(0, 100)}...` : messageContent,
        link: `/crm/conversation/${conversationId}`,
        reference: {
          model: 'Conversation',
          id: conversationId
        }
      });
    } catch (error) {
      console.error('خطأ في إنشاء إشعار الرسالة:', error);
      throw error;
    }
  }

  /**
   * تحديث حالة القراءة للإشعار
   * @param {String} notificationId معرف الإشعار
   * @param {Boolean} isRead حالة القراءة
   * @returns {Promise<Object>} الإشعار المحدث
   */
  static async markAsRead(notificationId, isRead = true) {
    try {
      return await Notification.findByIdAndUpdate(
        notificationId,
        { isRead },
        { new: true }
      );
    } catch (error) {
      console.error('خطأ في تحديث حالة القراءة للإشعار:', error);
      throw error;
    }
  }

  /**
   * تحديث حالة القراءة لجميع إشعارات المستخدم
   * @param {String} userId معرف المستخدم
   * @param {Boolean} isRead حالة القراءة
   * @returns {Promise<Object>} نتيجة التحديث
   */
  static async markAllAsRead(userId, isRead = true) {
    try {
      return await Notification.updateMany(
        { recipient: userId, isRead: !isRead },
        { isRead }
      );
    } catch (error) {
      console.error('خطأ في تحديث حالة القراءة لجميع الإشعارات:', error);
      throw error;
    }
  }

  /**
   * أرشفة إشعار
   * @param {String} notificationId معرف الإشعار
   * @param {Boolean} isArchived حالة الأرشفة
   * @returns {Promise<Object>} الإشعار المحدث
   */
  static async archiveNotification(notificationId, isArchived = true) {
    try {
      return await Notification.findByIdAndUpdate(
        notificationId,
        { isArchived },
        { new: true }
      );
    } catch (error) {
      console.error('خطأ في أرشفة الإشعار:', error);
      throw error;
    }
  }

  /**
   * حذف إشعار
   * @param {String} notificationId معرف الإشعار
   * @returns {Promise<Object>} نتيجة الحذف
   */
  static async deleteNotification(notificationId) {
    try {
      return await Notification.findByIdAndDelete(notificationId);
    } catch (error) {
      console.error('خطأ في حذف الإشعار:', error);
      throw error;
    }
  }

  /**
   * الحصول على إشعارات المستخدم
   * @param {String} userId معرف المستخدم
   * @param {Object} options خيارات الاستعلام
   * @param {Boolean} options.onlyUnread إرجاع الإشعارات غير المقروءة فقط
   * @param {Boolean} options.includeArchived تضمين الإشعارات المؤرشفة
   * @param {Number} options.limit عدد الإشعارات المطلوب استرجاعها
   * @param {Number} options.skip عدد الإشعارات التي يجب تخطيها
   * @returns {Promise<Array>} الإشعارات
   */
  static async getUserNotifications(userId, options = {}) {
    try {
      const {
        onlyUnread = false,
        includeArchived = false,
        limit = 20,
        skip = 0
      } = options;

      const query = { recipient: userId };
      
      if (onlyUnread) {
        query.isRead = false;
      }
      
      if (!includeArchived) {
        query.isArchived = false;
      }

      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'username full_name profile_picture');

      return notifications;
    } catch (error) {
      console.error('خطأ في الحصول على إشعارات المستخدم:', error);
      throw error;
    }
  }

  /**
   * الحصول على عدد الإشعارات غير المقروءة للمستخدم
   * @param {String} userId معرف المستخدم
   * @returns {Promise<Number>} عدد الإشعارات غير المقروءة
   */
  static async getUnreadCount(userId) {
    try {
      return await Notification.countDocuments({
        recipient: userId,
        isRead: false,
        isArchived: false
      });
    } catch (error) {
      console.error('خطأ في الحصول على عدد الإشعارات غير المقروءة:', error);
      throw error;
    }
  }

  /**
   * التحقق مما إذا كان يجب إرسال إشعار للمستخدم بناءً على إعداداته
   * @param {Object} user المستخدم
   * @param {String} notificationType نوع الإشعار
   * @returns {Boolean} هل يجب إرسال الإشعار
   */
  static shouldSendNotification(user, notificationType) {
    // إذا كانت الإشعارات العامة معطلة، فلا ترسل أي إشعار
    if (user.enable_general_notifications === false) {
      return false;
    }

    // بناءً على نوع الإشعار، تحقق من الإعدادات المحددة
    switch (notificationType) {
      case 'message':
        return user.notify_any_message !== false;
      case 'conversation':
        // إذا كانت المحادثة معينة للمستخدم
        return user.notify_assigned_conversation !== false;
      default:
        // للأنواع الأخرى (system, license, user)، ارسل دائمًا
        return true;
    }
  }
}

module.exports = NotificationService; 