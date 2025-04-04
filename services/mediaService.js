/**
 * خدمة معالجة وسائط واتساب
 * هذه الخدمة تدير جميع عمليات الوسائط المتعلقة برسائل واتساب
 * وتوحد طريقة التعامل مع الوسائط للرسائل الواردة والصادرة
 */

const WhatsappMedia = require('../models/WhatsappMedia');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const logger = require('../services/loggerService');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const axios = require('axios');
require('dotenv').config();

// أنواع الوسائط المعتمدة
const MEDIA_TYPES = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  STICKER: 'sticker',
  LOCATION: 'location'
};

/**
 * البحث عن سجل وسائط مرتبط برسالة معينة
 * @param {Object} message كائن الرسالة
 * @returns {Promise<Object>} سجل الوسائط إذا وجد، أو null إذا لم يوجد
 */
async function findMediaForMessage(message) {
  try {
    // التحقق من وجود الرسالة
    if (!message || !message._id) {
      return null;
    }

    // البحث عن الوسائط بمعرف الرسالة (الطريقة المباشرة)
    let media = await WhatsappMedia.findOne({ messageId: message._id }).lean();
    if (media) {
      return media;
    }

    // إذا لم يتم العثور على وسائط بمعرف الرسالة، نحاول البحث بطرق أخرى
    
    // للرسائل الصادرة، نستخدم معايير بحث متعددة
    if (message.direction === 'outgoing' && message.conversationId && message.mediaType) {
      
      // 1. البحث عن وسائط صادرة بنفس توقيت الرسالة تقريباً
      const timeThreshold = 60000; // 60 ثانية
      const messageTime = new Date(message.createdAt || message.timestamp);
      
      const mediaByTime = await WhatsappMedia.findOne({
        conversationId: message.conversationId,
        direction: 'outgoing',
        mediaType: message.mediaType,
        createdAt: { 
          $gte: new Date(messageTime.getTime() - timeThreshold),
          $lte: new Date(messageTime.getTime() + timeThreshold)
        }
      }).lean();

      if (mediaByTime) {
        // ربط الوسائط بالرسالة إذا لم تكن مرتبطة بالفعل
        if (!mediaByTime.messageId) {
          await linkMediaToMessage(mediaByTime._id, message._id);
        }
        
        return { ...mediaByTime, messageId: message._id };
      }
      
      // 2. البحث عن وسائط غير مرتبطة (الطريقة السابقة)
      const unlinkedMedia = await WhatsappMedia.findOne({
        conversationId: message.conversationId,
        direction: 'outgoing',
        mediaType: message.mediaType,
        messageId: { $exists: false }
      }).sort({ createdAt: -1 }).lean();

      if (unlinkedMedia) {
        // ربط الوسائط بالرسالة
        await linkMediaToMessage(unlinkedMedia._id, message._id);
        return { ...unlinkedMedia, messageId: message._id };
      }
      
      // 3. البحث بناءً على معرف الرسالة الخارجي (إذا كان موجوداً)
      if (message.externalMessageId) {
        // يمكن أن يكون قد تم ربط الوسائط بمعرف خارجي مختلف للرسالة
        const mediaByMessageData = await WhatsappMedia.find({
          conversationId: message.conversationId,
          direction: 'outgoing',
          mediaType: message.mediaType
        }).lean();
        
        // البحث عن تطابق في البيانات الوصفية
        if (mediaByMessageData && mediaByMessageData.length > 0) {
          for (const mediaItem of mediaByMessageData) {
            if (mediaItem.metaData && 
               (mediaItem.metaData.externalMessageId === message.externalMessageId || 
                mediaItem.metaData.messageId === message._id.toString())) {
              
              // ربط الوسائط بالرسالة إذا لم تكن مرتبطة بالفعل
              if (!mediaItem.messageId) {
                await linkMediaToMessage(mediaItem._id, message._id);
              }
              
              return { ...mediaItem, messageId: message._id };
            }
          }
        }
      }
    }

    return null;
  } catch (error) {
    logger.error(`خطأ في البحث عن وسائط للرسالة: ${error.message}`);
    return null;
  }
}

/**
 * ربط الوسائط برسالة معينة
 * @param {String} mediaId معرف الوسائط
 * @param {String} messageId معرف الرسالة
 * @returns {Promise<Boolean>} نجاح أو فشل عملية الربط
 */
async function linkMediaToMessage(mediaId, messageId) {
  try {
    if (!mediaId || !messageId) {
      logger.warn('mediaService', 'معرف الوسائط أو معرف الرسالة غير موجود', { mediaId, messageId });
      return false;
    }

    // البحث عن الوسائط
    const media = await WhatsappMedia.findById(mediaId);
    if (!media) {
      logger.warn('mediaService', 'لم يتم العثور على الوسائط للربط', { mediaId, messageId });
      return false;
    }

    // البحث عن الرسالة للتأكد من وجودها
    const message = await WhatsappMessage.findById(messageId);
    if (!message) {
      logger.warn('mediaService', 'لم يتم العثور على الرسالة للربط', { mediaId, messageId });
      return false;
    }

    // تحديث معرف الرسالة في الوسائط
    media.messageId = messageId;
    media.updatedAt = new Date();
    
    // إضافة معرف الرسالة في البيانات الوصفية أيضاً للاحتياط
    if (!media.metaData) {
      media.metaData = {};
    }
    media.metaData.messageId = messageId.toString();
    
    // تحديث معلومات المحادثة إذا كانت غير موجودة
    if (!media.conversationId && message.conversationId) {
      media.conversationId = message.conversationId;
      
      if (media.metaData) {
        media.metaData.conversationId = message.conversationId.toString();
      }
    }
    
    // تحديث الاتجاه إذا كان غير موجود
    if (!media.direction && message.direction) {
      media.direction = message.direction;
    }
    
    await media.save();
    
    // تحديث الرسالة بمعلومات الوسائط إذا لم تكن موجودة
    if (message.mediaType !== media.mediaType || !message.mediaId) {
      message.mediaType = media.mediaType;
      message.mediaId = media._id;
      
      if (media.caption && !message.text) {
        message.text = media.caption;
      }
      
      await message.save();
      logger.info('mediaService', 'تم تحديث معلومات الوسائط في الرسالة', { mediaId, messageId });
    }
    
    logger.info('mediaService', 'تم ربط الوسائط بالرسالة بنجاح', { mediaId, messageId });
    return true;
  } catch (error) {
    logger.error('mediaService', 'خطأ في ربط الوسائط بالرسالة', { 
      error: error.message, 
      mediaId, 
      messageId,
      stack: error.stack
    });
    return false;
  }
}

/**
 * دمج معلومات الوسائط مع الرسالة للعرض في الواجهة
 * @param {Object} message كائن الرسالة
 * @param {Object} media كائن الوسائط
 * @returns {Object} الرسالة مع معلومات الوسائط المدمجة
 */
function prepareMessageWithMedia(message, media) {
  if (!message) return null;
  
  // في حالة عدم وجود وسائط، نعيد الرسالة كما هي
  if (!media) {
    return message;
  }
  
  // أهم تغيير: التأكد من تعيين حقل mediaType في كائن الرسالة
  // هذا ضروري للرسائل الصادرة التي قد لا تحتوي على هذا الحقل مباشرة
  const enhancedMessage = {
    ...message,
    mediaId: media._id,
    // تأكد من تعيين mediaType في الرسالة نفسها، وليس فقط في كائن media الفرعي
    mediaType: media.mediaType || message.mediaType, 
    media: {
      _id: media._id,
      mediaType: media.mediaType || message.mediaType,
      fileName: media.fileName || 'ملف',
      fileSize: media.fileSize || 0,
      mimeType: media.mimeType || '',
      messageId: media.messageId || message._id,
    },
    fileName: media.fileName || message.fileName || 'ملف',
    fileSize: media.fileSize || message.fileSize || 0,
    mimeType: media.mimeType || message.mimeType || ''
  };
  
  return enhancedMessage;
}

/**
 * معالجة مجموعة من الرسائل وإضافة معلومات الوسائط لها
 * @param {Array} messages مصفوفة من كائنات الرسائل
 * @returns {Promise<Array>} مصفوفة من الرسائل مع معلومات الوسائط
 */
async function processMessagesWithMedia(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  try {
    const messagesWithMedia = await Promise.all(messages.map(async (message) => {
      // جلب الوسائط للرسالة بغض النظر عن وجود حقل mediaType
      const media = await findMediaForMessage(message);
      
      // إذا وجدنا وسائط مرتبطة بالرسالة، نقوم بتحضير الرسالة مع الوسائط
      if (media) {
        return prepareMessageWithMedia(message, media);
      }
      
      // إذا لم نجد وسائط مرتبطة، نعيد الرسالة كما هي
      return message;
    }));

    return messagesWithMedia;
  } catch (error) {
    logger.error(`خطأ في معالجة الرسائل مع الوسائط: ${error.message}`);
    return messages;
  }
}

/**
 * الحصول على محتوى الوسائط
 * @param {String} mediaId معرف الوسائط
 * @returns {Promise<Object>} كائن الوسائط مع معلومات الملف
 */
async function getMediaContent(mediaId) {
  try {
    if (!mediaId) {
      logger.warn('mediaService', 'معرف الوسائط غير موجود');
      return null;
    }

    // البحث عن الوسائط بالمعرف
    let media = await WhatsappMedia.findById(mediaId);
    
    // إذا لم يتم العثور على الوسائط، نحاول البحث بطرق أخرى
    if (!media) {
      logger.warn('mediaService', `لم يتم العثور على وسائط بالمعرف المباشر: ${mediaId}`);
      
      // محاولة البحث باستخدام المعرف كنص
      try {
        media = await WhatsappMedia.findOne({ _id: mediaId.toString() });
      } catch (idError) {
        logger.debug('mediaService', 'خطأ في البحث بالمعرف كنص', { error: idError.message });
      }
      
      // إذا لم نجد الوسائط، نحاول البحث في البيانات الوصفية
      if (!media) {
        media = await WhatsappMedia.findOne({ 'metaData.id': mediaId });
      }
      
      // إذا لم نجد الوسائط، نحاول البحث باستخدام معرف الرسالة
      if (!media) {
        media = await WhatsappMedia.findOne({ messageId: mediaId });
      }
      
      // إذا لم نجد الوسائط، نعود بقيمة فارغة
      if (!media) {
        logger.warn('mediaService', `لم يتم العثور على وسائط بأي طريقة للمعرف: ${mediaId}`);
        return null;
      }
    }

    // معالجة وسائط الموقع بشكل خاص
    if (media.mediaType === 'location') {
      return {
        ...media.toObject(),
        localPath: null,
        mimeType: 'application/json',
        isLocation: true,
        locationData: {
          latitude: media.metaData?.latitude || media.latitude,
          longitude: media.metaData?.longitude || media.longitude,
          name: media.metaData?.name || media.locationName || 'موقع'
        }
      };
    }

    // استخدام بيانات الملف من fileData إذا كان المسار المحلي غير موجود
    const finalMimeType = media.mimeType || mime.lookup(media.fileName) || 'application/octet-stream';
    
    // التركيز على استخدام البيانات المخزنة مباشرة في قاعدة البيانات
    const hasDataInDb = !!media.fileData || (media.metaData && media.metaData.base64Data);
    
    // استخدام البيانات المشفرة من metaData إن وجدت
    if (!media.fileData && media.metaData && media.metaData.base64Data) {
      media.fileData = media.metaData.base64Data;
      logger.info(`تم استرداد بيانات الوسائط من metaData: ${mediaId}`);
      
      // تحديث سجل الوسائط لتخزين البيانات في الحقل الصحيح
      try {
        await WhatsappMedia.updateOne(
          { _id: media._id },
          { $set: { fileData: media.metaData.base64Data } }
        );
        logger.info(`تم تحديث حقل fileData للوسائط: ${mediaId}`);
      } catch (updateError) {
        logger.error(`خطأ في تحديث حقل fileData للوسائط: ${updateError.message}`);
      }
    }
    
    // إضافة سجل للتشخيص
    if (!hasDataInDb) {
      logger.debug(`وسائط بدون بيانات مشفرة في قاعدة البيانات (messageId: ${media.messageId}, conversationId: ${media.conversationId})`);
    } else {
      logger.debug(`تم العثور على بيانات الوسائط بنجاح: ${mediaId}`);
    }
    
    return {
      ...media.toObject(),
      // تعطيل استخدام المسار المحلي
      localPath: null,
      mimeType: finalMimeType,
      fileExists: false, // دائماً false لأننا لا نعتمد على الملفات المحلية
      hasContent: hasDataInDb
    };
  } catch (error) {
    logger.error(`خطأ في الحصول على محتوى الوسائط: ${error.message}`, { mediaId, error: error.stack });
    return null;
  }
}

/**
 * تم تعطيل تحميل ملف الوسائط من الرابط - نعتمد فقط على البيانات الموجودة في قاعدة البيانات
 * @param {Object} media كائن الوسائط
 * @returns {Promise<Boolean>} دائماً يعيد false لأن التنزيل معطل
 */
async function downloadMediaFile(media) {
  // تسجيل رسالة تحذير بأن التنزيل معطل
  logger.info(`تم تعطيل تنزيل الوسائط - نعتمد فقط على البيانات المخزنة في قاعدة البيانات. mediaId: ${media?._id}`);
  
  // دائماً يعيد false لأن التنزيل معطل
  return false;
}

/**
 * إنشاء سجل وسائط جديد
 * @param {Object} mediaData بيانات الوسائط
 * @returns {Promise<Object>} سجل الوسائط الجديد
 */
async function createMedia(mediaData) {
  try {
    const media = new WhatsappMedia(mediaData);
    await media.save();
    logger.info(`تم إنشاء سجل وسائط جديد: ${media._id}`);
    return media;
  } catch (error) {
    logger.error(`خطأ في إنشاء سجل وسائط: ${error.message}`);
    return null;
  }
}

/**
 * تحديث سجل وسائط موجود
 * @param {String} mediaId معرف الوسائط
 * @param {Object} updateData بيانات التحديث
 * @returns {Promise<Object>} سجل الوسائط المحدث
 */
async function updateMedia(mediaId, updateData) {
  try {
    const media = await WhatsappMedia.findByIdAndUpdate(
      mediaId,
      { $set: updateData },
      { new: true }
    );
    
    if (media) {
      logger.info(`تم تحديث سجل الوسائط: ${mediaId}`);
    } else {
      logger.warn(`لم يتم العثور على سجل الوسائط للتحديث: ${mediaId}`);
    }
    
    return media;
  } catch (error) {
    logger.error(`خطأ في تحديث سجل الوسائط: ${error.message}`);
    return null;
  }
}

// تصدير الدوال
module.exports = {
  MEDIA_TYPES,
  findMediaForMessage,
  linkMediaToMessage,
  prepareMessageWithMedia,
  processMessagesWithMedia,
  getMediaContent,
  downloadMediaFile,
  createMedia,
  updateMedia
};
