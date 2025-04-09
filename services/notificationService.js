const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('./loggerService');
const mongoose = require('mongoose');
const webpush = require('web-push');
const Conversation = require('../models/Conversation');
const ContactHelper = require('../utils/contactHelper');

// إعداد web-push باستخدام مفاتيح VAPID من متغيرات البيئة
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:madlum.huusam@gmail.com', // تم التحديث بالبريد الصحيح
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
} else {
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
    try {
      // 1. التحقق من وجود المستخدم
      const user = await User.findById(notificationData.recipient).lean();
      if (!user) {
        logger.warn('notificationService', '[createNotification] Recipient not found', { recipientId: notificationData.recipient });
        return null;
      }
      
      // 2. التحقق من تفضيلات المستخدم للإشعارات
      const shouldSend = this.shouldSendNotificationBasedOnType(user, notificationData.type, conversation);
      if (!shouldSend) {
        return null;
      }
      
      // 3. إنشاء الإشعار
      const notification = new Notification(notificationData);
      await notification.save();
      
      return notification;
    } catch (error) {
      logger.error('notificationService', '[createNotification] Error', { 
        error: error.message, 
        stack: error.stack, 
        data: notificationData 
      });
      return null;
    }
  }

  /**
   * إرسال إشعار عبر Web Push إلى جميع اشتراكات المستخدم
   * @param {Object} user - كائن المستخدم
   * @param {Object} notification - كائن الإشعار
   */
  static async sendWebPushNotification(user, notification) {
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
        await webpush.sendNotification(subscription, payload);
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
    } catch (error) {
      logger.error('notificationService', 'خطأ في إزالة اشتراك Web Push', { userId, endpoint, error: error.message });
    }
  }

  /**
   * إنشاء وإرسال إشعار (متضمنًا إمكانية إرسال Web Push)
   * @param {Object} notificationData - بيانات الإشعار الأساسية
   * @param {Object} [conversation=null] - كائن المحادثة المرتبط بالإشعار (إذا كان منطبقًا)
   * @returns {Promise<Notification|null>} - الإشعار الذي تم إنشاؤه أو null
   */
  static async createAndSendNotification(notificationData, conversation = null) {
    try {
      // إنشاء الإشعار
      const notification = await this.createNotification(notificationData, conversation);
      
      if (notification) {
        // إرسال الإشعار عبر Web Push إذا كان لدى المستخدم اشتراكات نشطة
        try {
          const user = await User.findById(notification.recipient)
            .select('webPushSubscriptions')
            .lean();
          
          if (user && user.webPushSubscriptions && user.webPushSubscriptions.length > 0) {
            await this.sendWebPushNotification(user, notification);
          }
        } catch (pushError) {
          logger.error('notificationService', 'خطأ في إرسال إشعار Web Push', { 
            recipientId: notification.recipient, 
            error: pushError.message 
          });
          // استمر حتى لو فشل إرسال Web Push
        }
      }
      
      return notification;
    } catch (error) {
      logger.error('notificationService', 'خطأ في إنشاء وإرسال الإشعار', { 
        error: error.message, 
        stack: error.stack, 
        data: notificationData 
      });
      return null;
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
    // الحصول على بيانات المحادثة لاستخراج اسم العميل
    let conversation = null;
    try {
      conversation = await Conversation.findById(conversationId)
                        .select('assignedTo status contactId customerName phoneNumber')
                        .populate('contactId', 'name phoneNumber')
                        .lean();
      if (!conversation) {
        logger.warn('notificationService', '[createMessageNotification] Conversation not found', { conversationId });
        // يمكن الاستمرار بدون المحادثة، لكن التحقق سيكون أقل دقة
      }
    } catch (error) {
       logger.error('notificationService', '[createMessageNotification] Error fetching conversation', { conversationId, error: error.message });
       // يمكن الاستمرار بدون المحادثة
    }
    
    // استخدام الدالة المساعدة للحصول على الاسم المناسب
    const displayName = conversation ? 
      ContactHelper.getServerDisplayName(conversation) : 
      (senderName || 'عميل');
    
    const notificationData = {
        recipient: recipientId,
        type: 'message',
        title: `رسالة جديدة من ${displayName}`,
        message: messageContent.substring(0, 100) + (messageContent.length > 100 ? '...' : ''), // اقتطاع الرسائل الطويلة
        link: `/crm/conversations/${conversationId}?msg=${messageId}`,
        relatedConversation: conversationId,
        relatedMessage: messageId
    };

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
      return false; // الإشعارات العامة معطلة
    }

    switch (notificationType) {
      case 'message':
        // إذا كان notify_any_message مفعلًا، أرسل دائمًا
        if (user.notify_any_message === true) {
          return true;
        }
        
        // إذا لم يكن notify_any_message مفعلًا، تحقق من حالة التعيين
        if (conversation) {
          const isAssignedToCurrentUser = conversation.assignedTo && conversation.assignedTo.toString() === user._id.toString();
          
          if (isAssignedToCurrentUser && user.notify_assigned_conversation === true) {
            return true; // المحادثة معينة له ويريد إشعارات المحادثات المعينة
          } else if (!conversation.assignedTo && user.notify_unassigned_conversation === true) {
            return true; // المحادثة غير معينة ويريد إشعارات المحادثات غير المعينة
          }
        }
        
        // إذا لم يتحقق أي من الشروط السابقة، لا ترسل
        return false;

      case 'assignment':
        // إشعارات التعيين تُرسل دائمًا إذا كانت الإشعارات العامة مفعلة
        // يمكن إضافة تفضيل خاص بها لاحقًا إذا لزم الأمر
        return true;
        
      case 'conversation':
        // نوع خاص للإشعارات المتعلقة بالمحادثات التي تحتاج للتدخل البشري
        
        // 1. إذا كان المستخدم مندوب أو مشرف ويمتلك صلاحية الوصول للمحادثات
        if (user.can_access_conversations) {
          // 2. حتى إذا كانت المحادثة معينة للذكاء الاصطناعي، نريد إرسال إشعار للمندوبين البشريين
          if (conversation && conversation.assignedTo) {
            try {
              // التحقق مما إذا كانت المحادثة معينة للمستخدم الحالي
              const isAssignedToCurrentUser = conversation.assignedTo.toString() === user._id.toString();
              
              // إذا كانت المحادثة معينة للمستخدم الحالي، أرسل الإشعار
              if (isAssignedToCurrentUser) {
                return true;
              }
              
              // بدلاً من البحث في قاعدة البيانات، نفحص اسم المستخدم مباشرة
              // نفترض أن أي مستخدم يمكنه الوصول للمحادثات يجب أن يتلقى إشعارات عن المحادثات المعينة للذكاء الاصطناعي
              // التحقق اذا كان المحادثة معينة لمستخدم اسمه يبدأ بـ 'ai-' (مثل 'ai-assistant')
              const assignedToId = conversation.assignedTo.toString();
              
              // نسجل هذه المعلومة في السجلات للمتابعة
              logger.debug('notificationService', 'التحقق من المحادثة المعينة للذكاء الاصطناعي', {
                userId: user._id,
                conversationAssignedTo: assignedToId,
                hasAccessToConversations: user.can_access_conversations
              });
              
              // اسمح للمستخدم ذو الصلاحية بتلقي إشعارات عن المحادثات المسندة للذكاء الاصطناعي
              // دون الحاجة للتأكد من هوية مستخدم الذكاء الاصطناعي
              return true;
            } catch (error) {
              logger.error('notificationService', 'خطأ في التحقق من إعدادات الإشعار', {
                error: error.message,
                conversationId: conversation?._id
              });
            }
          }
          
          // المحادثة غير معينة لأحد - أرسل إشعارًا للمستخدمين المؤهلين
          if (!conversation || !conversation.assignedTo) {
            return true;
          }
        }

        // الافتراضي: إرسال الإشعار إذا كان للمستخدم صلاحية الوصول للمحادثات 
        return !!user.can_access_conversations;
      // أضف حالات لأنواع إشعارات أخرى هنا
      // case 'status_change': ...

      default:
        logger.warn('notificationService', `[shouldSendNotificationBasedOnType] Unknown notification type: ${notificationType}. Allowing by default.`);
        return true; // السماح بأنواع غير معروفة افتراضيًا (أو إرجاع false حسب الحاجة)
    }
  }
}

module.exports = NotificationService; 