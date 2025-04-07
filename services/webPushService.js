/**
 * خدمة إشعارات الويب (Web Push)
 * تقوم بإدارة إرسال الإشعارات إلى متصفحات المستخدمين
 */
const webpush = require('web-push');
const logger = require('./loggerService');
const User = require('../models/User');

// مفاتيح VAPID - في بيئة الإنتاج يجب تخزينها في متغيرات بيئية
// استخدم الأمر node -e "console.log(require('web-push').generateVAPIDKeys())" لتوليد مفاتيح جديدة
const VAPID_KEYS = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BNJSYiGbPFIQtcQ6IuhD78oP8JX9YHBPvOITvNtvXh2A6XC3Hzr1dE18jnLfCITFZRs0nwyJFR4gj0byLNj7iA4',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'dJrL_EaTuKjAw3_K9KwGfgeQboAq7HrH2xXyGXrIJgA'
};

// تهيئة خدمة الويب بوش
webpush.setVapidDetails(
  'mailto:admin@altaqanee.sa', // تم تحديث عنوان البريد الإلكتروني إلى بريد حقيقي
  VAPID_KEYS.publicKey,
  VAPID_KEYS.privateKey
);

logger.info('webPushService', 'تم تهيئة خدمة إشعارات الويب مع مفاتيح VAPID', {
  publicKey: VAPID_KEYS.publicKey.substring(0, 10) + '...' // لا نعرض المفتاح الكامل في السجلات
});

/**
 * حفظ اشتراك إشعارات المستخدم
 * @param {String} userId - معرف المستخدم
 * @param {Object} subscription - كائن اشتراك إشعارات الويب
 * @returns {Promise<Object>} - بيانات المستخدم المحدثة
 */
async function saveSubscription(userId, subscription) {
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('المستخدم غير موجود');
    }
    
    // تحديث بيانات اشتراك الإشعارات للمستخدم
    user.pushSubscription = subscription;
    await user.save();
    
    logger.info('webPushService', 'تم حفظ اشتراك إشعارات الويب بنجاح', { 
      userId,
      endpoint: subscription.endpoint.substring(0, 30) + '...'
    });
    
    return { success: true, message: 'تم حفظ اشتراك الإشعارات بنجاح' };
  } catch (error) {
    logger.error('webPushService', 'خطأ في حفظ اشتراك إشعارات الويب', { 
      userId, 
      error: error.message 
    });
    throw error;
  }
}

/**
 * إرسال إشعار إلى مستخدم عبر إشعارات الويب
 * @param {String} userId - معرف المستخدم
 * @param {Object} notification - بيانات الإشعار
 * @returns {Promise<Object>} - نتيجة الإرسال
 */
async function sendNotificationToUser(userId, notification) {
  try {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('المستخدم غير موجود');
    }
    
    if (!user.pushSubscription) {
      logger.warn('webPushService', 'لا يوجد اشتراك إشعارات ويب للمستخدم', { userId });
      return { success: false, message: 'لا يوجد اشتراك إشعارات ويب للمستخدم' };
    }
    
    // تجهيز بيانات الإشعار
    const payload = JSON.stringify({
      title: notification.title || 'إشعار جديد',
      content: notification.content || 'لديك إشعار جديد',
      link: notification.link || '/',
      icon: notification.icon || '/images/logo.png',
      tag: notification.tag || 'default',
      renotify: notification.renotify || false,
      timestamp: new Date().getTime()
    });
    
    logger.info('webPushService', 'محاولة إرسال إشعار ويب', { 
      userId, 
      title: notification.title,
      endpoint: user.pushSubscription.endpoint.substring(0, 30) + '...'
    });
    
    // إرسال الإشعار
    const result = await webpush.sendNotification(user.pushSubscription, payload);
    
    logger.info('webPushService', 'تم إرسال إشعار الويب بنجاح', { 
      userId, 
      statusCode: result.statusCode 
    });
    
    return { success: true, message: 'تم إرسال الإشعار بنجاح' };
  } catch (error) {
    // معالجة خطأ انتهاء صلاحية الاشتراك
    if (error.statusCode === 410) {
      logger.warn('webPushService', 'اشتراك إشعارات الويب منتهي الصلاحية', { userId });
      // إزالة الاشتراك من قاعدة البيانات
      await User.findByIdAndUpdate(userId, { $unset: { pushSubscription: 1 } });
      return { success: false, message: 'اشتراك الإشعارات منتهي الصلاحية', expired: true };
    }
    
    logger.error('webPushService', 'خطأ في إرسال إشعار الويب', { 
      userId, 
      error: error.message,
      statusCode: error.statusCode,
      stack: error.stack // سجل كامل المكدس لمزيد من المعلومات
    });
    
    return { success: false, message: error.message, statusCode: error.statusCode };
  }
}

/**
 * إرسال إشعار تجريبي للتحقق من عمل الإشعارات
 * @param {String} userId - معرف المستخدم
 * @returns {Promise<Object>} - نتيجة الإرسال
 */
async function sendTestNotification(userId) {
  const testNotification = {
    title: 'إشعار تجريبي',
    content: 'هذا إشعار تجريبي للتحقق من عمل نظام الإشعارات',
    link: '/',
    renotify: true,
    tag: 'test-notification'
  };
  
  logger.info('webPushService', 'إرسال إشعار تجريبي', { userId });
  return await sendNotificationToUser(userId, testNotification);
}

/**
 * توليد مفاتيح VAPID جديدة
 * استخدم هذه الدالة لتوليد مفاتيح جديدة عند الحاجة
 * @returns {Object} - زوج المفاتيح العام والخاص
 */
function generateVAPIDKeys() {
  const keys = webpush.generateVAPIDKeys();
  console.log('مفاتيح VAPID الجديدة:');
  console.log('المفتاح العام:', keys.publicKey);
  console.log('المفتاح الخاص:', keys.privateKey);
  console.log('تأكد من تعيين هذه المفاتيح في ملف .env');
  return keys;
}

module.exports = {
  saveSubscription,
  sendNotificationToUser,
  sendTestNotification,
  generateVAPIDKeys,
  VAPID_KEYS
}; 