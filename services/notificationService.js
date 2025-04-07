const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('./loggerService');
const mongoose = require('mongoose');
const webpush = require('web-push');
const Conversation = require('../models/Conversation');

// إعداد web-push باستخدام مفاتيح VAPID من متغيرات البيئة
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:madlum.huusam@gmail.com', // تم التحديث بالبريد الصحيح
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  logger.info('notificationService', 'تم إعداد تفاصيل VAPID لـ Web Push');
} else {
  logger.warn('notificationService', 'لم يتم العثور على مفاتيح VAPID في متغيرات البيئة. لن تعمل إشعارات Web Push.');
}

/**
 * خدمة الإشعارات - توفر وظائف لإنشاء وإدارة الإشعارات
 */
class NotificationService {
  /**
   * إنشاء إشعار جديد وإرساله (بما في ذلك Web Push)
   * @param {Object} notificationData بيانات الإشعار الأساسية (recipient, type, title, content, link, reference)
   * @param {Object} [conversation=null] - كائن المحادثة المرتبط بالإشعار (إذا كان منطبقًا).
   * @returns {Promise<Object|null>} الإشعار الذي تم إنشاؤه أو null إذا تم منعه
   */
  static async createAndSendNotification(notificationData, conversation = null) {
    logger.info('notificationService', '[createAndSendNotification] Starting...', { type: notificationData.type, recipientId: notificationData.recipient, conversationId: conversation?._id });
    try {
      // 1. التحقق من المستلم وتفضيلاته
      const recipient = await User.findById(notificationData.recipient);
      if (!recipient) {
        logger.warn('notificationService', '[createAndSendNotification] Recipient not found', { recipientId: notificationData.recipient });
        return null;
      }
      logger.info('notificationService', '[createAndSendNotification] Recipient found', { recipientId: recipient._id });

      // التحقق من الإعداد العام للإشعارات للمستلم
      if (recipient.enable_general_notifications === false) {
        logger.info('notificationService', `[createAndSendNotification] General notifications disabled for user ${recipient._id}`);
        return null;
      }
      
      // التحقق من إعدادات الإشعارات الخاصة بالنوع المحدد (مع تمرير المحادثة)
      if (!this.shouldSendNotificationBasedOnType(recipient, notificationData.type, conversation)) {
        logger.info('notificationService', `[createAndSendNotification] Notification type ${notificationData.type} disabled for user ${recipient._id}`);
        return null;
      }
      logger.info('notificationService', '[createAndSendNotification] Checks passed, creating notification...');
      
      // 2. إنشاء الإشعار وحفظه في قاعدة البيانات
      const newNotification = new Notification(notificationData);
      await newNotification.save();
      logger.info('notificationService', '[createAndSendNotification] Notification saved to DB', { notificationId: newNotification._id, recipientId: recipient._id });

      // 3. إرسال الإشعار عبر Socket.IO (سيتم استدعاؤه بشكل منفصل من notificationSocketService)
      logger.info('notificationService', '[createAndSendNotification] Notification creation successful, proceeding to send (if applicable)');

      // 4. إرسال الإشعار عبر Web Push إذا كان متاحًا
      if (recipient.webPushSubscriptions && recipient.webPushSubscriptions.length > 0) {
         logger.info('notificationService', `[createAndSendNotification] Attempting Web Push for user ${recipient._id} (${recipient.webPushSubscriptions.length} subscriptions)`);
         await this.sendWebPushNotification(recipient, newNotification);
      } else {
         logger.info('notificationService', `[createAndSendNotification] No Web Push subscriptions for user ${recipient._id}`);
      }

      return newNotification;

    } catch (error) {
      logger.error('notificationService', '[createAndSendNotification] Critical error', { error: error.message, stack: error.stack, notificationData });
      return null;
    }
  }
  
  /**
   * إرسال إشعار عبر Web Push إلى جميع اشتراكات المستخدم
   * @param {Object} user - كائن المستخدم
   * @param {Object} notification - كائن الإشعار
   */
  static async sendWebPushNotification(user, notification) {
    logger.info('notificationService', '[sendWebPushNotification] Starting...', { userId: user._id, notificationId: notification._id });
    if (!user || !notification || !user.webPushSubscriptions || user.webPushSubscriptions.length === 0) {
      return;
    }
    
    // التأكد من إعداد مفاتيح VAPID
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
       logger.warn('notificationService', 'لا يمكن إرسال Web Push بسبب عدم وجود مفاتيح VAPID.');
       return;
    }

    // تحضير بيانات الإشعار للـ payload
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.content,
      url: notification.link || '/' // الرابط الذي سيتم فتحه
    });

    const promises = user.webPushSubscriptions.map(async (subscription) => {
      try {
        logger.info('notificationService', `إرسال Web Push إلى ${subscription.endpoint.substring(0, 30)}... للمستخدم ${user._id}`);
        await webpush.sendNotification(subscription, payload);
        logger.info('notificationService', `تم إرسال Web Push بنجاح إلى ${subscription.endpoint.substring(0, 30)}... للمستخدم ${user._id}`);
      } catch (error) {
        logger.error('notificationService', `خطأ في إرسال Web Push إلى ${subscription.endpoint.substring(0, 30)}... للمستخدم ${user._id}`, { errorMessage: error.message, statusCode: error.statusCode });
        
        // إذا كان الخطأ يشير إلى اشتراك منتهي الصلاحية أو غير صالح (مثل 404 أو 410)
        if (error.statusCode === 404 || error.statusCode === 410) {
          // قم بإزالة الاشتراك غير الصالح من قاعدة البيانات
          logger.warn('notificationService', `إزالة اشتراك Web Push غير صالح للمستخدم ${user._id}: ${subscription.endpoint.substring(0, 30)}...`);
          await this.removeWebPushSubscription(user._id, subscription.endpoint);
        }
      }
    });

    await Promise.all(promises);
     logger.info('notificationService', `اكتملت محاولة إرسال Web Push لجميع اشتراكات المستخدم ${user._id}`);
  }

  /**
   * إزالة اشتراك Web Push من المستخدم
   * @param {String} userId - معرف المستخدم
   * @param {String} endpoint - نقطة نهاية الاشتراك المراد إزالتها
   */
  static async removeWebPushSubscription(userId, endpoint) {
    try {
      await User.updateOne(
        { _id: userId },
        { $pull: { webPushSubscriptions: { endpoint: endpoint } } }
      );
      logger.info('notificationService', 'تمت إزالة اشتراك Web Push بنجاح', { userId, endpoint });
    } catch (error) {
      logger.error('notificationService', 'خطأ في إزالة اشتراك Web Push', { userId, endpoint, error: error.message });
    }
  }

  /**
   * إنشاء إشعار نظام لمستخدم واحد أو أكثر
   * يستخدم الآن createAndSendNotification
   */
  static async createSystemNotification(recipientIds, title, content, link = null, reference = null) {
    const recipients = Array.isArray(recipientIds) ? recipientIds : [recipientIds];
    const notifications = [];
    for (const recipientId of recipients) {
      try {
          const notification = await this.createAndSendNotification({
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
      } catch (error) {
         logger.error('notificationService', 'خطأ في إرسال إشعار النظام للمستخدم', { recipientId, error: error.message });
         // استمر في المحاولة للمستخدمين الآخرين
      }
    }
    return notifications;
  }

  /**
   * إنشاء إشعار رسالة
   * يستخدم الآن createAndSendNotification ويتجاوز الفحص العام لأنه يتم في notificationSocketService
   */
  static async createMessageNotification(recipientId, conversationId, messageContent, messageId, senderName) {
    const notificationData = {
        recipient: recipientId,
        type: 'message',
        title: `رسالة جديدة من ${senderName || 'عميل'}`,
        message: messageContent.substring(0, 100) + (messageContent.length > 100 ? '...' : ''), // اقتطاع الرسائل الطويلة
        link: `/crm/conversations/${conversationId}?msg=${messageId}`,
        relatedConversation: conversationId,
        relatedMessage: messageId
    };
    
    // جلب المحادثة لتمريرها لدالة التحقق
    let conversation = null;
    try {
      conversation = await Conversation.findById(conversationId).select('assignedTo status').lean();
      if (!conversation) {
        logger.warn('notificationService', '[createMessageNotification] Conversation not found', { conversationId });
        // يمكن الاستمرار بدون المحادثة، لكن التحقق سيكون أقل دقة
      }
    } catch (error) {
       logger.error('notificationService', '[createMessageNotification] Error fetching conversation', { conversationId, error: error.message });
       // يمكن الاستمرار بدون المحادثة
    }

    // استدعاء الدالة الرئيسية مع تمرير المحادثة
    return this.createAndSendNotification(notificationData, conversation);
  }

  /**
   * تحديث حالة القراءة للإشعار
   * @param {String} notificationId معرف الإشعار
   * @param {Boolean} isRead حالة القراءة
   * @returns {Promise<Object>} الإشعار المحدث
   */
  static async markAsRead(notificationId, isRead = true) {
    try {
      return await Notification.findByIdAndUpdate(notificationId, { isRead }, { new: true });
    } catch (error) {
      logger.error('notificationService', 'خطأ في تحديث حالة قراءة الإشعار:', { error: error.message, notificationId });
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
      return await Notification.updateMany({ recipient: userId, isRead: !isRead }, { isRead });
    } catch (error) {
      logger.error('notificationService', 'خطأ في تحديث حالة القراءة لجميع الإشعارات:', { error: error.message, userId });
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
      return await Notification.findByIdAndUpdate(notificationId, { isArchived }, { new: true });
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
        query.isArchived = { $ne: true };
      }

      return await Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(); // استخدام lean لأداء أفضل عند القراءة فقط
    } catch (error) {
      logger.error('notificationService', 'خطأ في جلب إشعارات المستخدم:', { error: error.message, userId });
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
        isArchived: { $ne: true }
      });
    } catch (error) {
      logger.error('notificationService', 'خطأ في جلب عدد الإشعارات غير المقروءة:', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * التحقق مما إذا كان يجب إرسال إشعار بناءً على إعدادات المستخدم ونوع الإشعار
   * @param {Object} user كائن المستخدم
   * @param {String} notificationType نوع الإشعار
   * @param {Object} [conversation=null] - كائن المحادثة المرتبط بالإشعار (إذا كان منطبقًا).
   * @returns {Boolean}
   */
  static shouldSendNotificationBasedOnType(user, notificationType, conversation = null) {
    if (!user || user.enable_general_notifications === false) {
      logger.info('notificationService', `[shouldSendNotificationBasedOnType] Blocking: General notifications disabled for user ${user._id}`);
      return false; // الإشعارات العامة معطلة
    }

    switch (notificationType) {
      case 'message':
        // إذا كان notify_any_message مفعلًا، أرسل دائمًا
        if (user.notify_any_message === true) {
          logger.info('notificationService', `[shouldSendNotificationBasedOnType] Allowing message notification for user ${user._id} (notify_any_message enabled)`);
          return true;
        }
        
        // إذا لم يكن notify_any_message مفعلًا، تحقق من حالة التعيين
        if (conversation) {
          const isAssignedToCurrentUser = conversation.assignedTo && conversation.assignedTo.toString() === user._id.toString();
          
          if (isAssignedToCurrentUser && user.notify_assigned_conversation === true) {
            logger.info('notificationService', `[shouldSendNotificationBasedOnType] Allowing message notification for user ${user._id} (conversation assigned and notify_assigned_conversation enabled)`);
            return true; // المحادثة معينة له ويريد إشعارات المحادثات المعينة
          } else if (!conversation.assignedTo && user.notify_unassigned_conversation === true) {
            logger.info('notificationService', `[shouldSendNotificationBasedOnType] Allowing message notification for user ${user._id} (conversation unassigned and notify_unassigned_conversation enabled)`);
            return true; // المحادثة غير معينة ويريد إشعارات المحادثات غير المعينة
          }
        }
        
        // إذا لم يتحقق أي من الشروط السابقة، لا ترسل
        logger.info('notificationService', `[shouldSendNotificationBasedOnType] Blocking message notification for user ${user._id} based on assignment and preferences. Conversation assigned: ${!!conversation?.assignedTo}, Assigned to self: ${conversation?.assignedTo?.toString() === user._id.toString()}, Notify assigned: ${user.notify_assigned_conversation}, Notify unassigned: ${user.notify_unassigned_conversation}`);
        return false;

      case 'assignment':
        // إشعارات التعيين تُرسل دائمًا إذا كانت الإشعارات العامة مفعلة
        // يمكن إضافة تفضيل خاص بها لاحقًا إذا لزم الأمر
        logger.info('notificationService', `[shouldSendNotificationBasedOnType] Allowing assignment notification for user ${user._id} (general enabled)`);
        return true;
        
      // أضف حالات لأنواع إشعارات أخرى هنا
      // case 'status_change': ...

      default:
        logger.warn('notificationService', `[shouldSendNotificationBasedOnType] Unknown notification type: ${notificationType}. Allowing by default.`);
        return true; // السماح بأنواع غير معروفة افتراضيًا (أو إرجاع false حسب الحاجة)
    }
  }
}

module.exports = NotificationService; 