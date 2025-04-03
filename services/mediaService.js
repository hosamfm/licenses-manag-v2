/**
 * خدمة معالجة وسائط واتساب
 * هذه الخدمة تدير جميع عمليات الوسائط المتعلقة برسائل واتساب
 * وتوحد طريقة التعامل مع الوسائط للرسائل الواردة والصادرة
 */

const WhatsappMedia = require('../models/WhatsappMedia');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const axios = require('axios');
const config = require('../config/config');

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
      logger.warn('محاولة البحث عن وسائط بدون معرف رسالة صالح');
      return null;
    }

    // البحث عن الوسائط بمعرف الرسالة (الطريقة المباشرة)
    let media = await WhatsappMedia.findOne({ messageId: message._id }).lean();
    if (media) {
      logger.debug(`تم العثور على وسائط بمعرف الرسالة: ${message._id}`);
      return media;
    }

    // إذا لم يتم العثور على وسائط بمعرف الرسالة، نحاول البحث بطرق أخرى
    
    // للرسائل الصادرة، نبحث عن وسائط غير مرتبطة في نفس المحادثة
    if (message.direction === 'outgoing' && message.conversationId && message.mediaType) {
      const unlinkedMedia = await WhatsappMedia.findOne({
        conversationId: message.conversationId,
        direction: 'outgoing',
        mediaType: message.mediaType,
        messageId: { $exists: false },
        createdAt: { $lte: new Date(message.createdAt || message.timestamp) }
      }).sort({ createdAt: -1 }).lean();

      if (unlinkedMedia) {
        logger.debug(`تم العثور على وسائط غير مرتبطة للرسالة: ${message._id}`);
        
        // ربط الوسائط بالرسالة
        await linkMediaToMessage(unlinkedMedia._id, message._id);
        return { ...unlinkedMedia, messageId: message._id };
      }
    }

    logger.debug(`لم يتم العثور على وسائط للرسالة: ${message._id}`);
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
      logger.warn('محاولة ربط وسائط برسالة بدون معرفات صالحة');
      return false;
    }

    const result = await WhatsappMedia.updateOne(
      { _id: mediaId },
      { $set: { messageId: messageId } }
    );

    const success = result.modifiedCount > 0;
    if (success) {
      logger.info(`تم ربط الوسائط ${mediaId} بالرسالة ${messageId}`);
    } else {
      logger.warn(`فشل ربط الوسائط ${mediaId} بالرسالة ${messageId}`);
    }

    return success;
  } catch (error) {
    logger.error(`خطأ في ربط الوسائط بالرسالة: ${error.message}`);
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
  if (!media) return message;

  return {
    ...message,
    mediaId: media._id,
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
      if (!message.mediaType) {
        return message;
      }

      const media = await findMediaForMessage(message);
      return prepareMessageWithMedia(message, media);
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
      logger.warn('محاولة الحصول على محتوى وسائط بدون معرف صالح');
      return null;
    }

    // البحث عن الوسائط بالمعرف
    let media = await WhatsappMedia.findById(mediaId);
    
    // إذا لم نجد بالمعرف، نبحث عن طريق معرف الرسالة
    if (!media) {
      media = await WhatsappMedia.findOne({ messageId: mediaId });
    }

    if (!media) {
      logger.warn(`لم يتم العثور على وسائط بالمعرف: ${mediaId}`);
      return null;
    }

    // التحقق من صحة نوع الوسائط
    if (!MEDIA_TYPES[media.mediaType.toUpperCase()] && media.mediaType !== 'location') {
      logger.warn(`نوع وسائط غير مدعوم: ${media.mediaType}`);
    }

    // معالجة خاصة للموقع
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

    // تحديد المسار المحلي للملف
    const mediaStoragePath = config.mediaStoragePath || path.join(__dirname, '../public/uploads/whatsapp');
    const mediaPath = path.join(mediaStoragePath, media.fileName);
    
    // فحص وجود الملف محليًا
    const fileExists = fs.existsSync(mediaPath);
    
    // محاولة إعادة تنزيل الملف إذا لم يكن موجودًا
    if (!fileExists) {
      logger.warn(`الملف غير موجود محليًا: ${mediaPath}`);
      
      // إعادة تحميل الملف إذا كان لدينا رابط
      if (media.mediaUrl) {
        const downloadSuccess = await downloadMediaFile(media);
        if (!downloadSuccess) {
          logger.error(`فشل إعادة تنزيل الملف: ${media.fileName}`);
        }
      }
    }

    // استخدام بيانات الملف من fileData إذا كان المسار المحلي غير موجود
    const finalMimeType = media.mimeType || mime.lookup(media.fileName) || 'application/octet-stream';
    
    return {
      ...media.toObject(),
      localPath: fileExists ? mediaPath : null,
      mimeType: finalMimeType,
      // إعادة التحقق من وجود الملف بعد محاولة التنزيل
      fileExists: fs.existsSync(mediaPath)
    };
  } catch (error) {
    logger.error(`خطأ في الحصول على محتوى الوسائط: ${error.message}`);
    return null;
  }
}

/**
 * تحميل ملف الوسائط من الرابط
 * @param {Object} media كائن الوسائط
 * @returns {Promise<Boolean>} نجاح أو فشل عملية التحميل
 */
async function downloadMediaFile(media) {
  try {
    if (!media || !media.mediaUrl) {
      logger.warn('محاولة تحميل ملف وسائط بدون رابط صالح');
      return false;
    }

    const mediaPath = path.join(config.mediaStoragePath, media.fileName);
    const mediaDir = path.dirname(mediaPath);

    // التأكد من وجود المجلد
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }

    // تحميل الملف
    const response = await axios({
      method: 'GET',
      url: media.mediaUrl,
      responseType: 'stream',
      headers: {
        'Authorization': `Bearer ${config.whatsappToken}`
      }
    });

    // حفظ الملف
    const writer = fs.createWriteStream(mediaPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        logger.info(`تم تحميل ملف الوسائط بنجاح: ${media.fileName}`);
        resolve(true);
      });
      writer.on('error', (error) => {
        logger.error(`خطأ في تحميل ملف الوسائط: ${error.message}`);
        reject(false);
      });
    });
  } catch (error) {
    logger.error(`خطأ في تحميل ملف الوسائط: ${error.message}`);
    return false;
  }
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
