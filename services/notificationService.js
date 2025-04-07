const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('./loggerService');
const mongoose = require('mongoose');
const webPushService = require('./webPushService');

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
        logger.info('notificationService', `لن يتم إرسال إشعار للمستخدم ${recipient._id} بسبب إعداداته`);
        return null;
      }

      // إنشاء الإشعار
      const newNotification = new Notification(notification);
      await newNotification.save();
      
      // إرسال إشعار ويب للمستخدم إذا كان لديه اشتراك
      if (recipient.pushSubscription) {
        try {
          await webPushService.sendNotificationToUser(recipient._id, {
            title: notification.title,
            content: notification.content,
            link: notification.link,
            icon: '/images/logo.png'
          });
          logger.info('notificationService', 'تم إرسال إشعار الويب للمستخدم', {
            userId: recipient._id,
            notificationType: notification.type
          });
        } catch (pushError) {
          logger.error('notificationService', 'خطأ في إرسال إشعار الويب', {
            userId: recipient._id,
            error: pushError.message
          });
          // لا نمنع إتمام العملية إذا فشل إشعار الويب
        }
      }

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
   * @param {String} senderId معرف المرسل ('system' للرسائل الواردة)
   * @param {String} conversationId معرف المحادثة
   * @param {String} messageContent محتوى الرسالة
   * @returns {Promise<Object|null>} الإشعار الذي تم إنشاؤه أو null إذا تم منعه
   */
  static async createMessageNotification(recipientId, senderId, conversationId, messageContent) {
    try {
      // 1. التحقق من وجود المستلم وتفضيلاته العامة
      const recipient = await User.findById(recipientId);
      if (!recipient) {
        logger.warn('notificationService', 'المستلم غير موجود في createMessageNotification', { recipientId });
        return null; // لا يمكن إرسال إشعار لمستلم غير موجود
      }

      // التحقق من الإعداد العام للإشعارات للمستلم
      if (recipient.enable_general_notifications === false) {
         logger.info('notificationService', `لن يتم إرسال إشعار رسالة للمستخدم ${recipientId} بسبب تعطيل الإشعارات العامة`);
         return null;
      }
      
      // *** تم تجاوز الفحص العام shouldSendNotification هنا ***
      // نفترض أن القرار بإرسال الإشعار تم اتخاذه بشكل صحيح في notificationSocketService 
      // بناءً على notify_assigned_conversation أو notify_unassigned_conversation.

      // 2. تحديد اسم المرسل للعرض في الإشعار
      let senderName = 'رسالة جديدة'; // الافتراضي للرسائل الواردة من العملاء
      if (senderId && senderId !== 'system' && mongoose.Types.ObjectId.isValid(senderId)) {
          try {
              const senderUser = await User.findById(senderId);
              if (senderUser) {
                  senderName = senderUser.full_name || senderUser.username;
              } else {
                   senderName = 'مستخدم غير معروف';
              }
          } catch (findError) {
               logger.warn('notificationService', 'خطأ في البحث عن مرسل رسالة داخلي', { senderId, error: findError.message });
               senderName = 'مرسل غير صالح';
          }
      }

      // 3. تحضير بيانات الإشعار
      const notificationData = {
        recipient: recipientId,
        // لا نربط بمرسل إذا كان 'system' أو المعرف غير صالح
        sender: (senderId === 'system' || !mongoose.Types.ObjectId.isValid(senderId) ? null : senderId),
        type: 'message',
        title: `${senderName}`, // استخدام الاسم المحضر
        // التعامل مع المحتوى غير النصي أو الطويل جدًا
        content: messageContent && typeof messageContent === 'string'
                   ? (messageContent.length > 100 ? `${messageContent.slice(0, 100)}...` : messageContent)
                   : 'رسالة جديدة', // استخدام نص بديل للمحتوى غير النصي
        link: `/crm/conversations/ajax?selected=${conversationId}`,
        reference: {
          model: 'Conversation',
          id: conversationId
        }
      };

      // 4. إنشاء الإشعار مباشرة وحفظه
      const newNotification = new Notification(notificationData);
      await newNotification.save();

      logger.info('notificationService', 'تم إنشاء إشعار رسالة بنجاح (تم تجاوز الفحص العام)', { recipientId, conversationId });
      return newNotification; // إرجاع الإشعار الذي تم إنشاؤه

    } catch (error) {
      logger.error('notificationService', 'خطأ فادح في createMessageNotification', { 
        error: error.message, 
        recipientId, 
        senderId, 
        conversationId 
      });
      return null; // إرجاع null عند حدوث خطأ فادح
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