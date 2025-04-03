/**
 * خدمة التخزين المؤقت للمحادثات والرسائل
 * تستخدم للتخزين المؤقت للبيانات المتكررة الاستخدام لتحسين الأداء
 */

const NodeCache = require('node-cache');
const logger = require('./loggerService');

// إنشاء كائن التخزين المؤقت مع تعيين مدة التخزين الافتراضية إلى 5 دقائق
const cache = new NodeCache({ 
  stdTTL: 300, // مدة التخزين المؤقت بالثواني
  checkperiod: 60 // فترة فحص الصلاحية بالثواني
});

/**
 * الحصول على بيانات محادثة من التخزين المؤقت
 * @param {String} conversationId معرف المحادثة
 * @returns {Object} بيانات المحادثة أو null إذا لم تكن موجودة في التخزين المؤقت
 */
const getCachedConversation = (conversationId) => {
  try {
    const cacheKey = `conversation_${conversationId}`;
    return cache.get(cacheKey);
  } catch (error) {
    logger.error('خطأ في استرجاع بيانات المحادثة من التخزين المؤقت', error);
    return null;
  }
};

/**
 * تخزين بيانات محادثة في التخزين المؤقت
 * @param {String} conversationId معرف المحادثة
 * @param {Object} conversationData بيانات المحادثة
 * @param {Number} ttl مدة التخزين المؤقت بالثواني (اختياري)
 * @returns {Boolean} نجاح أو فشل عملية التخزين
 */
const setCachedConversation = (conversationId, conversationData, ttl = 300) => {
  try {
    const cacheKey = `conversation_${conversationId}`;
    return cache.set(cacheKey, conversationData, ttl);
  } catch (error) {
    logger.error('خطأ في تخزين بيانات المحادثة في التخزين المؤقت', error);
    return false;
  }
};

/**
 * الحصول على رسائل محادثة من التخزين المؤقت
 * @param {String} conversationId معرف المحادثة
 * @param {Number} page رقم الصفحة
 * @param {Number} limit عدد العناصر في الصفحة
 * @returns {Array} مصفوفة الرسائل أو null إذا لم تكن موجودة في التخزين المؤقت
 */
const getCachedMessages = (conversationId, page = 1, limit = 20) => {
  try {
    const cacheKey = `messages_${conversationId}_${page}_${limit}`;
    return cache.get(cacheKey);
  } catch (error) {
    logger.error('خطأ في استرجاع رسائل المحادثة من التخزين المؤقت', error);
    return null;
  }
};

/**
 * تخزين رسائل محادثة في التخزين المؤقت
 * @param {String} conversationId معرف المحادثة
 * @param {Array} messages مصفوفة الرسائل
 * @param {Number} page رقم الصفحة
 * @param {Number} limit عدد العناصر في الصفحة
 * @param {Number} ttl مدة التخزين المؤقت بالثواني (اختياري)
 * @returns {Boolean} نجاح أو فشل عملية التخزين
 */
const setCachedMessages = (conversationId, messages, page = 1, limit = 20, ttl = 300) => {
  try {
    const cacheKey = `messages_${conversationId}_${page}_${limit}`;
    return cache.set(cacheKey, messages, ttl);
  } catch (error) {
    logger.error('خطأ في تخزين رسائل المحادثة في التخزين المؤقت', error);
    return false;
  }
};

/**
 * مسح التخزين المؤقت للمحادثة ورسائلها
 * @param {String} conversationId معرف المحادثة
 * @returns {Number} عدد المفاتيح التي تم مسحها
 */
const clearConversationCache = (conversationId) => {
  try {
    // حذف بيانات المحادثة
    let deletedCount = 0;
    const conversationKey = `conversation_${conversationId}`;
    if (cache.has(conversationKey)) {
      cache.del(conversationKey);
      deletedCount++;
    }

    // البحث عن جميع مفاتيح الرسائل المتعلقة بهذه المحادثة
    const keys = cache.keys();
    const messageKeysPattern = `messages_${conversationId}_`;
    
    keys.forEach(key => {
      if (key.startsWith(messageKeysPattern)) {
        cache.del(key);
        deletedCount++;
      }
    });
    
    return deletedCount;
  } catch (error) {
    logger.error('خطأ في مسح التخزين المؤقت للمحادثة', error);
    return 0;
  }
};

/**
 * التعامل مع الرسائل المخزنة مؤقتاً (للتوافق مع الإصدار القديم)
 * @param {String} userId معرف المستخدم
 */
const handleCachedMessages = (userId) => {
  try {
    logger.debug(`معالجة الرسائل المخزنة مؤقتاً للمستخدم: ${userId}`);
    // يمكن إضافة منطق تحديثي هنا مستقبلاً
  } catch (error) {
    logger.error('خطأ في معالجة الرسائل المخزنة مؤقتاً', error);
  }
};

/**
 * تخزين حالة رسالة غير موجودة للتطبيق لاحقاً
 * @param {String} externalMessageId المعرف الخارجي للرسالة
 * @param {String} status الحالة الجديدة للرسالة
 * @param {Date} timestamp توقيت تحديث الحالة
 * @param {Number} ttl مدة التخزين المؤقت بالثواني (اختياري)
 * @returns {Boolean} نجاح أو فشل عملية التخزين
 */
const setMessageStatusCache = (externalMessageId, status, timestamp, ttl = 3600) => {
  try {
    const cacheKey = `pending_status_${externalMessageId}`;
    return cache.set(cacheKey, { status, timestamp }, ttl);
  } catch (error) {
    logger.error('خطأ في تخزين حالة الرسالة غير الموجودة', error);
    return false;
  }
};

/**
 * الحصول على حالة رسالة مخزنة مؤقتاً
 * @param {String} externalMessageId المعرف الخارجي للرسالة
 * @returns {Object} بيانات الحالة {status, timestamp} أو null إذا لم تكن موجودة
 */
const getMessageStatusCache = (externalMessageId) => {
  try {
    const cacheKey = `pending_status_${externalMessageId}`;
    return cache.get(cacheKey);
  } catch (error) {
    logger.error('خطأ في استرجاع حالة الرسالة من التخزين المؤقت', error);
    return null;
  }
};

/**
 * حذف حالة رسالة مخزنة مؤقتاً بعد تطبيقها
 * @param {String} externalMessageId المعرف الخارجي للرسالة
 * @returns {Boolean} نجاح أو فشل عملية الحذف
 */
const deleteMessageStatusCache = (externalMessageId) => {
  try {
    const cacheKey = `pending_status_${externalMessageId}`;
    return cache.del(cacheKey);
  } catch (error) {
    logger.error('خطأ في حذف حالة الرسالة من التخزين المؤقت', error);
    return false;
  }
};

module.exports = {
  getCachedConversation,
  setCachedConversation,
  getCachedMessages,
  setCachedMessages,
  clearConversationCache,
  handleCachedMessages,
  setMessageStatusCache,
  getMessageStatusCache,
  deleteMessageStatusCache
};