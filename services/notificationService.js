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
  // logger.info('notificationService', 'تم إعداد تفاصيل VAPID لـ Web Push');
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
   * @returns {Promise<Notification|null>} - الإشعار الذي تم إنشاؤه أو null.
   */
  static async createNotification(notificationData, conversation = null) {
    // logger.info('notificationService', '[createNotification] Starting...', { type: notificationData.type, recipientId: notificationData.recipient, conversationId: conversation?._id });
    try {
      // 1. التحقق من المستلم وتفضيلاته
      const recipient = await User.findById(notificationData.recipient);
      if (!recipient) {
        logger.warn('notificationService', '[createNotification] Recipient not found', { recipientId: notificationData.recipient });
        return null;
      }
      // logger.info('notificationService', '[createNotification] Recipient found', { recipientId: recipient._id });

      // التحقق من الإعداد العام للإشعارات للمستلم
      if (recipient.enable_general_notifications === false) {
        // logger.info('notificationService', `[createNotification] General notifications disabled for user ${recipient._id}`);
        return null;
      }
      
      // التحقق من إعدادات الإشعارات الخاصة بالنوع المحدد (مع تمرير المحادثة)
      if (!this.shouldSendNotificationBasedOnType(recipient, notificationData.type, conversation)) {
        // لا حاجة لرسالة سجل هنا، الدالة الداخلية تسجل السبب
        return null;
      }
      // logger.info('notificationService', '[createNotification] Checks passed, creating notification...');
      
      // 2. إنشاء الإشعار وحفظه في قاعدة البيانات
      const newNotification = new Notification(notificationData);
      await newNotification.save();
      // logger.info('notificationService', '[createNotification] Notification saved to DB', { notificationId: newNotification._id, recipientId: recipient._id });

      // 3. إزالة جزء إرسال الويب بوش من هنا
      // logger.info('notificationService', '[createNotification] Notification creation successful, proceeding to send (if applicable)');
      // if (recipient.webPushSubscriptions && recipient.webPushSubscriptions.length > 0) { ... }

      // إرجاع الإشعار الذي تم إنشاؤه فقط
      return newNotification;

    } catch (error) {
      logger.error('notificationService', '[createNotification] Critical error during creation/saving', { error: error.message, stack: error.stack, notificationData });
      return null;
    }
  }

  /**
   * إرسال إشعار عبر Web Push إلى جميع اشتراكات المستخدم
   * @param {Object} user - كائن المستخدم
   * @param {Object} notification - كائن الإشعار
   */
  static async sendWebPushNotification(user, notification) {
    // logger.info('notificationService', '[sendWebPushNotification] Starting...', { userId: user._id, notificationId: notification._id });
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
        // logger.info('notificationService', `إرسال Web Push إلى ${subscription.endpoint.substring(0, 30)}... للمستخدم ${user._id}`);
        await webpush.sendNotification(subscription, payload);
        // logger.info('notificationService', `تم إرسال Web Push بنجاح إلى ${subscription.endpoint.substring(0, 30)}... للمستخدم ${user._id}`);
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
     // logger.info('notificationService', `اكتملت محاولة إرسال Web Push لجميع اشتراكات المستخدم ${user._id}`);
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
      // logger.info('notificationService', 'تمت إزالة اشتراك Web Push بنجاح', { userId, endpoint });
    } catch (error) {
      logger.error('notificationService', 'خطأ في إزالة اشتراك Web Push', { userId, endpoint, error: error.message });
    }
  }

  /**
   * إنشاء إشعار نظام لمستخدم واحد أو أكثر
   * يستخدم الآن createNotification
   */
  static async createSystemNotification(recipientIds, title, content, link = null, reference = null) {
    const recipients = Array.isArray(recipientIds) ? recipientIds : [recipientIds];
    const notifications = [];
    for (const recipientId of recipients) {
      try {
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
      } catch (error) {
         logger.error('notificationService', 'خطأ في إرسال إشعار النظام للمستخدم', { recipientId, error: error.message });
         // استمر في المحاولة للمستخدمين الآخرين
      }
    }
    return notifications;
  }

  /**
   * إنشاء إشعار رسالة
   * يستخدم الآن createNotification ويتجاوز الفحص العام لأنه يتم في notificationSocketService
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

    // استدعاء الدالة الجديدة
    notificationData.content = notificationData.message; 
    return this.createNotification(notificationData, conversation);
  }

  static async createAssignmentNotification(recipientId, conversationId, assignedByUserId) {
     // ... (كود تحضير notificationData و جلب conversation/assignedByUser)
     // استدعاء الدالة الجديدة
     return this.createNotification(notificationData, conversation);
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
      logger.error('notificationService', 'خطأ في حذف الإشعار:', { error: error.message, notificationId });
      throw error;
    }
  }

  /**
   * حذف جميع الإشعارات المؤرشفة للمستخدم
   * @param {String} userId معرف المستخدم
   * @returns {Promise<Object>} نتيجة الحذف
   */
  static async deleteAllArchivedNotifications(userId) {
    try {
      return await Notification.deleteMany({ recipient: userId, isArchived: true });
    } catch (error) {
      logger.error('notificationService', 'خطأ في حذف جميع الإشعارات المؤرشفة:', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * جلب إشعارات المستخدم مع التصفية والتصفح
   * @param {String} userId معرف المستخدم
   * @param {Object} options خيارات التصفية والتصفح
   * @returns {Promise<Object>} قائمة الإشعارات ومعلومات التصفح
   */
  static async getUserNotifications(userId, options = {}) {
    try {
      const page = options.page || 1;
      const limit = options.limit || 20;
      const filter = { recipient: userId, ...options.filter };
      const sort = options.sort || { createdAt: -1 };
      
      const totalNotifications = await Notification.countDocuments(filter);
      const notifications = await Notification.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
      
      return {
        notifications,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalNotifications / limit),
          totalItems: totalNotifications
        }
      };
    } catch (error) {
      logger.error('notificationService', 'خطأ في جلب إشعارات المستخدم:', { error: error.message, userId });
      throw error;
    }
  }

  /**
   * حساب عدد الإشعارات غير المقروءة للمستخدم
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
      logger.error('notificationService', 'خطأ في حساب عدد الإشعارات غير المقروءة:', { error: error.message, userId });
      return 0;
    }
  }

  /**
   * التحقق مما إذا كان يجب إرسال إشعار بناءً على نوعه وتفضيلات المستخدم والمحادثة
   * @param {Object} user - كائن المستخدم
   * @param {String} notificationType - نوع الإشعار (message, assignment, mention, system)
   * @param {Object} [conversation=null] - كائن المحادثة المرتبط (إن وجد)
   * @returns {Boolean} هل يجب إرسال الإشعار أم لا
   */
  static shouldSendNotificationBasedOnType(user, notificationType, conversation = null) {
    const userId = user._id;
    switch (notificationType) {
      case 'message':
        // التحقق من تفضيلات إشعارات الرسائل
        if (user.notify_assigned_conversation && conversation && conversation.assignedTo && conversation.assignedTo.toString() === userId) {
          // logger.info('notificationService', `[shouldSendNotificationBasedOnType] Allowing message notification for user ${userId} (conversation assigned and notify_assigned_conversation enabled)`);
          return true; // إرسال للمستخدم المسند له
        }
        if (user.notify_unassigned_conversation && conversation && !conversation.assignedTo) {
          // logger.info('notificationService', `[shouldSendNotificationBasedOnType] Allowing message notification for user ${userId} (conversation unassigned and notify_unassigned_conversation enabled)`);
          return true; // إرسال للمشرفين للمحادثات غير المسندة
        }
        if (user.notify_any_message && !conversation) { // إذا لم يتم تمرير المحادثة، نعتمد على الإعداد العام
            // logger.info('notificationService', `[shouldSendNotificationBasedOnType] Allowing message notification for user ${userId} (notify_any_message enabled, conversation not provided)`);
            return true;
        }
        if (user.notify_any_message && conversation && conversation.assignedTo && conversation.assignedTo.toString() !== userId) { 
            // إرسال للمشرفين حتى لو كانت مسندة لغيرهم (إذا الإعداد يسمح)
            // logger.info('notificationService', `[shouldSendNotificationBasedOnType] Allowing message notification for user ${userId} (notify_any_message enabled)`);
            return true; 
        }
        // logger.info('notificationService', `[shouldSendNotificationBasedOnType] Blocking message notification for user ${userId} based on preferences`);
        return false;
      case 'assignment':
        // الإشعارات المتعلقة بالإسناد يتم إرسالها دائمًا للمستلم
        // logger.info('notificationService', `[shouldSendNotificationBasedOnType] Allowing assignment notification for user ${userId}`);
        return true;
      case 'mention':
        if (user.notify_mention) {
          // logger.info('notificationService', `[shouldSendNotificationBasedOnType] Allowing mention notification for user ${userId} (notify_mention enabled)`);
          return true;
        }
        // logger.info('notificationService', `[shouldSendNotificationBasedOnType] Blocking mention notification for user ${userId} (notify_mention disabled)`);
        return false;
      case 'system':
        // إشعارات النظام يتم إرسالها دائمًا
        // logger.info('notificationService', `[shouldSendNotificationBasedOnType] Allowing system notification for user ${userId}`);
        return true;
      default:
        logger.warn('notificationService', `[shouldSendNotificationBasedOnType] Unknown notification type: ${notificationType}`);
        return false;
    }
  }
}

module.exports = NotificationService; 