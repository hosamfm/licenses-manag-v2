const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('./loggerService');
const mongoose = require('mongoose');
const webpush = require('web-push');

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
   * @returns {Promise<Object|null>} الإشعار الذي تم إنشاؤه أو null إذا تم منعه
   */
  static async createAndSendNotification(notificationData) {
    try {
      // 1. التحقق من المستلم وتفضيلاته
      const recipient = await User.findById(notificationData.recipient);
      if (!recipient) {
        logger.warn('notificationService', 'المستلم غير موجود في createAndSendNotification', { recipientId: notificationData.recipient });
        return null;
      }

      // التحقق من الإعداد العام للإشعارات للمستلم
      if (recipient.enable_general_notifications === false) {
        logger.info('notificationService', `لن يتم إنشاء إشعار للمستخدم ${recipient._id} بسبب تعطيل الإشعارات العامة`);
        return null;
      }
      
      // التحقق من إعدادات الإشعارات الخاصة بالنوع المحدد
      if (!this.shouldSendNotificationBasedOnType(recipient, notificationData.type)) {
        logger.info('notificationService', `لن يتم إنشاء إشعار من النوع ${notificationData.type} للمستخدم ${recipient._id} بسبب إعداداته الخاصة بالنوع`);
        return null;
      }
      
      // 2. إنشاء الإشعار وحفظه في قاعدة البيانات
      const newNotification = new Notification(notificationData);
      await newNotification.save();
      logger.info('notificationService', 'تم حفظ الإشعار الجديد في قاعدة البيانات', { notificationId: newNotification._id, recipientId: recipient._id });

      // 3. إرسال الإشعار عبر Socket.IO (هذا يُفترض أن يتم في notificationSocketService)
      // لا نضع استدعاء Socket.IO هنا للحفاظ على فصل الاهتمامات
      // يجب أن يستدعي الكود الآخر sendNotification من notificationSocketService بعد استدعاء هذه الدالة بنجاح

      // 4. إرسال الإشعار عبر Web Push إذا كان متاحًا
      if (recipient.webPushSubscriptions && recipient.webPushSubscriptions.length > 0) {
         logger.info('notificationService', `محاولة إرسال Web Push للمستخدم ${recipient._id} لعدد ${recipient.webPushSubscriptions.length} اشتراك`);
         await this.sendWebPushNotification(recipient, newNotification);
      } else {
         logger.info('notificationService', `لا توجد اشتراكات Web Push للمستخدم ${recipient._id}`);
      }

      return newNotification;

    } catch (error) {
      logger.error('notificationService', 'خطأ فادح في createAndSendNotification', { error: error.message, notificationData });
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
  static async createMessageNotification(recipientId, senderId, conversationId, messageContent) {
    try {
      // 1. تحديد اسم المرسل (كما في النسخة السابقة)
      let senderName = 'رسالة جديدة'; 
      if (senderId && senderId !== 'system' && mongoose.Types.ObjectId.isValid(senderId)) {
          try {
              const senderUser = await User.findById(senderId);
              if (senderUser) senderName = senderUser.full_name || senderUser.username;
              else senderName = 'مستخدم غير معروف';
          } catch (findError) {
               logger.warn('notificationService', 'خطأ في البحث عن مرسل رسالة داخلي', { senderId, error: findError.message });
               senderName = 'مرسل غير صالح';
          }
      }
      
      // 2. تحضير بيانات الإشعار الأساسية
      const notificationData = {
        recipient: recipientId,
        sender: (senderId === 'system' || !mongoose.Types.ObjectId.isValid(senderId) ? null : senderId),
        type: 'message',
        title: `${senderName}`,
        content: messageContent && typeof messageContent === 'string'
                   ? (messageContent.length > 100 ? `${messageContent.slice(0, 100)}...` : messageContent)
                   : 'رسالة جديدة',
        link: `/crm/conversations/ajax?selected=${conversationId}`, // <-- استخدام الرابط الصحيح هنا
        reference: {
          model: 'Conversation',
          id: conversationId
        }
      };
      
      // 3. استدعاء الدالة الموحدة للإنشاء والإرسال
      // **ملاحظة:** الفحص العام وتفضيلات النوع يتم داخل createAndSendNotification
      const newNotification = await this.createAndSendNotification(notificationData);
      
      if (newNotification) {
         logger.info('notificationService', 'تم إنشاء وإرسال إشعار رسالة بنجاح', { recipientId, conversationId });
      }
      
      return newNotification; // إرجاع الإشعار الذي تم إنشاؤه (أو null)

    } catch (error) {
      logger.error('notificationService', 'خطأ فادح في createMessageNotification', { 
        error: error.message, 
        recipientId, 
        senderId, 
        conversationId 
      });
      return null; 
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
   * @returns {Boolean}
   */
  static shouldSendNotificationBasedOnType(user, notificationType) {
    if (!user || user.enable_general_notifications === false) {
      return false; // الإشعارات العامة معطلة
    }

    switch (notificationType) {
      case 'message':
        // يتم التعامل مع منطق الرسائل بشكل منفصل بناءً على notify_assigned/unassigned/any
        // هذه الدالة تركز على الأنواع الأخرى أو كفحص إضافي
        return user.notify_any_message === true; 
      case 'conversation':
        // نفترض أن إشعارات المحادثات (مثل التعيين) مهمة دائمًا إذا كانت الإشعارات العامة مفعلة
        return true; 
      case 'system':
        // نفترض أن الإشعارات النظامية مهمة دائمًا إذا كانت الإشعارات العامة مفعلة
        return true;
      case 'license':
         // يمكن إضافة حقل مخصص في المستخدم للتحكم في إشعارات التراخيص
         // return user.notify_license_updates === true;
         return true; // مؤقتًا، نفترض أنها مفعلة دائمًا
      // أضف أنواعًا أخرى هنا إذا لزم الأمر
      default:
        return true; // السماح بالأنواع غير المعروفة افتراضيًا إذا كانت الإشعارات العامة مفعلة
    }
  }
}

module.exports = NotificationService; 