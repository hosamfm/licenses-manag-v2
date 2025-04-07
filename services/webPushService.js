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
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BIL3UXcQDBrxkqZ3cjnJLqrSJgT3lKwDrRVVAB_-oyHnUGUkuuZ85rEPQmG1xwHpGQbwtcEZFJ8NRmk0RD8LKSA',
  privateKey: process.env.VAPID_PRIVATE_KEY || '2QQc_MvPsKLohSQMIXpTy7d9XYRgD9rV2nFoUZ_OE6U'
};

// تهيئة خدمة الويب بوش
webpush.setVapidDetails(
  'mailto:admin@example.com', // يجب تغييره إلى عنوان بريد إلكتروني حقيقي
  VAPID_KEYS.publicKey,
  VAPID_KEYS.privateKey
);

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
    
    logger.info('webPushService', 'تم حفظ اشتراك إشعارات الويب بنجاح', { userId });
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
      timestamp: new Date().getTime()
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
      statusCode: error.statusCode
    });
    
    return { success: false, message: error.message, statusCode: error.statusCode };
  }
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
  generateVAPIDKeys,
  VAPID_KEYS
}; 