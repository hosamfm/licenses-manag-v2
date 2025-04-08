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
 * تحديث التخزين المؤقت للرسائل عند استلام رسالة جديدة
 * @param {String} conversationId معرف المحادثة
 * @param {Object} newMessage الرسالة الجديدة
 * @param {Number} page رقم الصفحة (اختياري، الافتراضي 1)
 * @param {Number} limit عدد العناصر في الصفحة (اختياري، الافتراضي 20)
 * @returns {Boolean} نجاح أو فشل عملية التحديث
 */
const updateCachedMessages = (conversationId, newMessage, page = 1, limit = 20) => {
  try {
    const cacheKey = `messages_${conversationId}_${page}_${limit}`;
    
    // التحقق من وجود رسائل مخزنة مؤقتًا
    const existingMessages = cache.get(cacheKey);
    
    // إذا كانت الرسائل غير موجودة في التخزين المؤقت، نعيد false
    if (!existingMessages) {
      return false;
    }
    
    // إذا كانت الرسالة الجديدة رسالة واردة (incoming)، نضيفها في بداية القائمة
    if (newMessage.direction === 'incoming') {
      // إضافة الرسالة الجديدة في بداية القائمة (لأن الترتيب تنازلي)
      existingMessages.unshift(newMessage);
      
      // إزالة آخر رسالة إذا تجاوز العدد الحد المطلوب
      if (existingMessages.length > limit) {
        existingMessages.pop();
      }
    } else {
      // إذا كانت الرسالة صادرة (outgoing)، نضيفها في بداية القائمة أيضًا
      existingMessages.unshift(newMessage);
      
      // إزالة آخر رسالة إذا تجاوز العدد الحد المطلوب
      if (existingMessages.length > limit) {
        existingMessages.pop();
      }
    }
    
    // تحديث التخزين المؤقت بالقائمة الجديدة
    const ttl = cache.getTtl(cacheKey);
    let newTtl = 300; // الافتراضي هو 5 دقائق
    
    // إذا كان هناك وقت متبقي، نستخدمه
    if (ttl) {
      const now = Date.now();
      newTtl = Math.max(Math.floor((ttl - now) / 1000), 60); // على الأقل دقيقة واحدة
    }
    
    return cache.set(cacheKey, existingMessages, newTtl);
  } catch (error) {
    logger.error('خطأ في تحديث التخزين المؤقت للرسائل', error);
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

/**
 * تخزين معرف الوسائط في التخزين المؤقت
 * @param {String} mediaHash البصمة الإلكترونية للوسائط (MD5 hash)
 * @param {String} mediaType نوع الوسائط (image, video, audio, document)
 * @param {String} mediaId معرف الوسائط في واتساب
 * @param {Object} metadata بيانات وصفية إضافية (اختياري)
 * @param {Number} ttl مدة التخزين المؤقت بالثواني (اختياري)
 * @returns {Boolean} نجاح أو فشل عملية التخزين
 */
const setMediaIdCache = (mediaHash, mediaType, mediaId, metadata = {}, ttl = 86400) => {
  try {
    if (!mediaHash || !mediaType || !mediaId) {
      logger.warn('تحذير: بيانات غير مكتملة لتخزين معرف الوسائط', { mediaHash, mediaType, mediaId });
      return false;
    }

    const cacheKey = `media_${mediaType}_${mediaHash}`;
    
    const mediaData = {
      id: mediaId,
      type: mediaType,
      hash: mediaHash,
      metadata: metadata,
      cachedAt: new Date()
    };

    
    return cache.set(cacheKey, mediaData, ttl);
  } catch (error) {
    logger.error('خطأ في تخزين معرف الوسائط في التخزين المؤقت', error);
    return false;
  }
};

/**
 * الحصول على معرف الوسائط من التخزين المؤقت
 * @param {String} mediaHash البصمة الإلكترونية للوسائط
 * @param {String} mediaType نوع الوسائط (image, video, audio, document)
 * @returns {Object|null} بيانات الوسائط {id, type, hash, metadata, cachedAt} أو null إذا لم تكن موجودة
 */
const getMediaIdCache = (mediaHash, mediaType) => {
  try {
    if (!mediaHash || !mediaType) {
      logger.warn('تحذير: بيانات غير مكتملة للبحث عن معرف الوسائط', { mediaHash, mediaType });
      return null;
    }

    const cacheKey = `media_${mediaType}_${mediaHash}`;
    const cachedMedia = cache.get(cacheKey);
    
    if (cachedMedia) {

    }
    
    return cachedMedia;
  } catch (error) {
    logger.error('خطأ في استرجاع معرف الوسائط من التخزين المؤقت', error);
    return null;
  }
};

/**
 * حذف معرف الوسائط من التخزين المؤقت
 * @param {String} mediaHash البصمة الإلكترونية للوسائط
 * @param {String} mediaType نوع الوسائط (image, video, audio, document)
 * @returns {Boolean} نجاح أو فشل عملية الحذف
 */
const deleteMediaIdCache = (mediaHash, mediaType) => {
  try {
    if (!mediaHash || !mediaType) {
      logger.warn('تحذير: بيانات غير مكتملة لحذف معرف الوسائط', { mediaHash, mediaType });
      return false;
    }

    const cacheKey = `media_${mediaType}_${mediaHash}`;
    
    if (cache.has(cacheKey)) {
      return cache.del(cacheKey);
    }
    
    return false;
  } catch (error) {
    logger.error('خطأ في حذف معرف الوسائط من التخزين المؤقت', error);
    return false;
  }
};

/**
 * تخزين محتوى الوسائط في التخزين المؤقت
 * @param {String} mediaHash البصمة الإلكترونية للوسائط
 * @param {String} mediaType نوع الوسائط (image, video, audio, document)
 * @param {Buffer|String} mediaContent محتوى الوسائط
 * @param {Object} metadata بيانات وصفية إضافية (اختياري)
 * @param {Number} ttl مدة التخزين المؤقت بالثواني (اختياري)
 * @returns {Boolean} نجاح أو فشل عملية التخزين
 */
const setMediaContentCache = (mediaHash, mediaType, mediaContent, metadata = {}, ttl = 3600) => {
  try {
    if (!mediaHash || !mediaType || !mediaContent) {
      logger.warn('تحذير: بيانات غير مكتملة لتخزين محتوى الوسائط', { mediaHash, mediaType });
      return false;
    }

    const cacheKey = `media_content_${mediaType}_${mediaHash}`;
    
    // تحويل المحتوى إلى نص base64 إذا كان Buffer
    const content = Buffer.isBuffer(mediaContent) 
      ? mediaContent.toString('base64') 
      : mediaContent;
    
    const mediaData = {
      content: content,
      type: mediaType,
      hash: mediaHash,
      isBase64: Buffer.isBuffer(mediaContent),
      metadata: metadata,
      cachedAt: new Date(),
      size: Buffer.isBuffer(mediaContent) ? mediaContent.length : content.length
    };
    

    
    return cache.set(cacheKey, mediaData, ttl);
  } catch (error) {
    logger.error('خطأ في تخزين محتوى الوسائط في التخزين المؤقت', error);
    return false;
  }
};

/**
 * الحصول على محتوى الوسائط من التخزين المؤقت
 * @param {String} mediaHash البصمة الإلكترونية للوسائط
 * @param {String} mediaType نوع الوسائط (image, video, audio, document)
 * @param {Boolean} asBuffer إرجاع المحتوى كـ Buffer (اختياري، الافتراضي true)
 * @returns {Object|null} بيانات الوسائط {content, type, hash, metadata, cachedAt} أو null إذا لم تكن موجودة
 */
const getMediaContentCache = (mediaHash, mediaType, asBuffer = true) => {
  try {
    if (!mediaHash || !mediaType) {
      logger.warn('تحذير: بيانات غير مكتملة للبحث عن محتوى الوسائط', { mediaHash, mediaType });
      return null;
    }

    const cacheKey = `media_content_${mediaType}_${mediaHash}`;
    const cachedMedia = cache.get(cacheKey);
    
    if (cachedMedia) {

      
      // إذا طلب المحتوى كـ Buffer وكان مخزناً كـ base64
      if (asBuffer && cachedMedia.isBase64) {
        cachedMedia.content = Buffer.from(cachedMedia.content, 'base64');
      }
    }
    
    return cachedMedia;
  } catch (error) {
    logger.error('خطأ في استرجاع محتوى الوسائط من التخزين المؤقت', error);
    return null;
  }
};

/**
 * حذف محتوى الوسائط من التخزين المؤقت
 * @param {String} mediaHash البصمة الإلكترونية للوسائط
 * @param {String} mediaType نوع الوسائط (image, video, audio, document)
 * @returns {Boolean} نجاح أو فشل عملية الحذف
 */
const deleteMediaContentCache = (mediaHash, mediaType) => {
  try {
    if (!mediaHash || !mediaType) {
      logger.warn('تحذير: بيانات غير مكتملة لحذف محتوى الوسائط', { mediaHash, mediaType });
      return false;
    }

    const cacheKey = `media_content_${mediaType}_${mediaHash}`;
    
    if (cache.has(cacheKey)) {
      return cache.del(cacheKey);
    }
    
    return false;
  } catch (error) {
    logger.error('خطأ في حذف محتوى الوسائط من التخزين المؤقت', error);
    return false;
  }
};

/**
 * حذف جميع الوسائط المخزنة مؤقتاً من نوع معين
 * @param {String} mediaType نوع الوسائط (image, video, audio, document)
 * @returns {Number} عدد العناصر التي تم حذفها
 */
const clearMediaTypeCache = (mediaType) => {
  try {
    if (!mediaType) {
      logger.warn('تحذير: نوع الوسائط غير محدد لحذف التخزين المؤقت');
      return 0;
    }

    // البحث عن جميع مفاتيح الوسائط المتعلقة بهذا النوع
    const keys = cache.keys();
    let deletedCount = 0;
    
    const idKeysPattern = `media_${mediaType}_`;
    const contentKeysPattern = `media_content_${mediaType}_`;
    
    keys.forEach(key => {
      if (key.startsWith(idKeysPattern) || key.startsWith(contentKeysPattern)) {
        cache.del(key);
        deletedCount++;
      }
    });

    
    return deletedCount;
  } catch (error) {
    logger.error('خطأ في مسح التخزين المؤقت للوسائط من نوع معين', error);
    return 0;
  }
};

/**
 * الحصول على إحصائيات حول الوسائط المخزنة مؤقتاً
 * @returns {Object} إحصائيات الوسائط المخزنة {countByType, totalSize, totalCount, typeDistribution}
 */
const getMediaCacheStats = () => {
  try {
    const keys = cache.keys();
    const stats = {
      countByType: {
        image: 0,
        video: 0,
        audio: 0,
        document: 0
      },
      totalSize: 0,
      totalCount: 0,
      typeDistribution: {}
    };
    
    // البحث عن جميع مفاتيح الوسائط
    keys.forEach(key => {
      if (key.startsWith('media_content_')) {
        const cachedItem = cache.get(key);
        if (cachedItem) {
          // زيادة العداد حسب النوع
          if (stats.countByType[cachedItem.type] !== undefined) {
            stats.countByType[cachedItem.type]++;
          }
          
          // إضافة الحجم إلى الإجمالي
          stats.totalSize += cachedItem.size || 0;
          stats.totalCount++;
        }
      }
    });
    
    // حساب التوزيع النسبي
    if (stats.totalCount > 0) {
      Object.keys(stats.countByType).forEach(type => {
        stats.typeDistribution[type] = (stats.countByType[type] / stats.totalCount * 100).toFixed(2) + '%';
      });
    }
    
    return stats;
  } catch (error) {
    logger.error('خطأ في الحصول على إحصائيات التخزين المؤقت للوسائط', error);
    return {
      countByType: { image: 0, video: 0, audio: 0, document: 0 },
      totalSize: 0,
      totalCount: 0,
      typeDistribution: {}
    };
  }
};

module.exports = {
  getCachedConversation,
  setCachedConversation,
  getCachedMessages,
  setCachedMessages,
  updateCachedMessages,
  clearConversationCache,
  handleCachedMessages,
  setMessageStatusCache,
  getMessageStatusCache,
  deleteMessageStatusCache,
  
  // وظائف التخزين المؤقت للوسائط
  setMediaIdCache,
  getMediaIdCache,
  deleteMediaIdCache,
  setMediaContentCache,
  getMediaContentCache,
  deleteMediaContentCache,
  clearMediaTypeCache,
  getMediaCacheStats
};