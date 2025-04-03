/**
 * متحكم وسائط واتساب - WhatsApp Media Controller
 * المسؤول عن إدارة وسائط واتساب (صور، فيديو، صوت، مستندات...)
 */

const axios = require('axios');
const WhatsappMedia = require('../models/WhatsappMedia');
const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
const metaWhatsappService = require('../services/whatsapp/MetaWhatsappService');
const logger = require('../services/loggerService');
const mediaService = require('../services/mediaService');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

/**
 * تنزيل وسائط من API ميتا واتساب وتخزينها
 * @param {Object} mediaInfo - معلومات الوسائط (النوع، المعرف، الرابط...)
 * @param {Object} messageData - بيانات الرسالة المرتبطة
 * @returns {Promise<Object>} - نتيجة العملية
 */
exports.downloadAndSaveMedia = async (mediaInfo, messageData) => {
  try {
    // التحقق من صحة المعلومات المطلوبة
    if (!mediaInfo || !messageData || !messageData._id || !messageData.conversationId) {
      throw new Error('معلومات الرسالة أو الوسائط غير مكتملة');
    }

    // تهيئة متغيرات البيانات
    const messageId = messageData._id;
    const mediaType = mediaInfo.type;
    let mediaUrl = '';
    let mediaData = null;
    let fileName = '';
    let mimeType = '';
    let fileSize = 0;
    let fileData = '';
    let metaData = {};
    
    // تحديد الموقع في حالة رسالة الموقع
    let latitude = null;
    let longitude = null;
    let locationName = null;

    switch (mediaType) {
      case 'image':
        mediaUrl = mediaInfo.link || mediaInfo.id;
        mediaData = mediaInfo;
        mimeType = 'image/jpeg'; // القيمة الافتراضية، سيتم تحديثها بعد التنزيل
        break;
      case 'video':
        mediaUrl = mediaInfo.link || mediaInfo.id;
        mediaData = mediaInfo;
        mimeType = 'video/mp4'; // القيمة الافتراضية
        break;
      case 'audio':
        mediaUrl = mediaInfo.link || mediaInfo.id;
        mediaData = mediaInfo;
        mimeType = 'audio/ogg'; // القيمة الافتراضية
        break;
      case 'document':
        mediaUrl = mediaInfo.link || mediaInfo.id;
        mediaData = mediaInfo;
        fileName = mediaInfo.filename || 'document.pdf';
        mimeType = mediaInfo.mime_type || 'application/pdf';
        break;
      case 'sticker':
        mediaUrl = mediaInfo.link || mediaInfo.id;
        mediaData = mediaInfo;
        mimeType = 'image/webp';
        break;
      case 'location':
        // في حالة الموقع، لا يوجد ملف فعلي للتنزيل
        latitude = mediaInfo.latitude;
        longitude = mediaInfo.longitude;
        locationName = mediaInfo.name || '';
        break;
      default:
        throw new Error(`نوع وسائط غير معتمد: ${mediaType}`);
    }

    // إذا كان نوع الوسائط "location"، نقوم بإنشاء سجل وسائط للموقع فقط
    if (mediaType === 'location') {
      const locationData = {
        messageId,
        conversationId: messageData.conversationId,
        mediaType,
        direction: 'incoming',
        fileName: 'location.json',
        mimeType: 'application/json',
        fileSize: 0,
        metaData: {
          latitude,
          longitude,
          name: locationName
        }
      };

      const locationMedia = await mediaService.createMedia(locationData);
      
      logger.info('whatsappMediaController', 'تم حفظ بيانات الموقع', {
        messageId,
        latitude,
        longitude
      });

      return {
        success: true,
        media: locationMedia
      };
    }

    // للأنواع الأخرى، نحتاج لتنزيل الملف من الرابط
    if (!mediaUrl) {
      throw new Error('رابط الوسائط غير متوفر');
    }

    logger.info('whatsappMediaController', 'بدء تنزيل الوسائط', {
      mediaType,
      mediaUrl
    });

    // الحصول على توكن الوصول لواتساب
    const settings = await MetaWhatsappSettings.getActiveSettings();
    if (!settings || !settings.accessToken) {
      throw new Error('لم يتم العثور على إعدادات واتساب أو توكن الوصول');
    }

    // تنزيل الملف من API واتساب
    const response = await axios({
      method: 'GET',
      url: mediaUrl,
      headers: {
        'Authorization': `Bearer ${settings.accessToken}`
      },
      responseType: 'arraybuffer'
    });

    // استخراج معلومات إضافية من الاستجابة
    if (response.headers['content-type']) {
      mimeType = response.headers['content-type'];
    }

    if (response.headers['content-length']) {
      fileSize = parseInt(response.headers['content-length']);
    } else {
      fileSize = response.data.length;
    }

    // توليد اسم الملف إذا لم يكن متوفرًا
    if (!fileName) {
      const extension = mimeType.split('/')[1] || 'bin';
      fileName = `${mediaType}_${Date.now()}.${extension}`;
    }

    // تحويل البيانات المستلمة إلى قاعدة64
    fileData = Buffer.from(response.data).toString('base64');

    // حفظ البيانات في المجلد المخصص
    const mediaDir = config.mediaStoragePath || path.join(__dirname, '../public/uploads/whatsapp');
    
    // التأكد من وجود المجلد
    if (!fs.existsSync(mediaDir)) {
      fs.mkdirSync(mediaDir, { recursive: true });
    }
    
    const filePath = path.join(mediaDir, fileName);
    
    // كتابة الملف
    fs.writeFileSync(filePath, response.data);
    
    logger.info('whatsappMediaController', 'تم تنزيل الوسائط بنجاح', {
      mediaType,
      fileName,
      fileSize,
      mimeType
    });

    // إنشاء سجل وسائط في قاعدة البيانات
    const mediaRecord = await mediaService.createMedia({
      messageId,
      conversationId: messageData.conversationId,
      mediaType,
      direction: 'incoming',
      fileName,
      mimeType,
      fileSize,
      mediaUrl,
      fileData,
      metaData: mediaData || {}
    });

    return {
      success: true,
      media: mediaRecord
    };

  } catch (error) {
    logger.error('whatsappMediaController', 'خطأ في تنزيل وحفظ الوسائط', {
      error: error.message,
      mediaInfo: mediaInfo ? JSON.stringify(mediaInfo) : 'غير متوفر',
      messageId: messageData ? messageData._id : 'غير متوفر'
    });

    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * استرجاع محتوى ملف الوسائط
 * @param {Object} req - كائن الطلب
 * @param {Object} res - كائن الاستجابة
 */
exports.getMediaContent = async (req, res) => {
  try {
    const mediaId = req.params.mediaId;
    
    if (!mediaId) {
      return res.status(400).json({ success: false, error: 'معرف الوسائط مطلوب' });
    }

    // استخدام خدمة الوسائط للحصول على المحتوى
    const media = await mediaService.getMediaContent(mediaId);
    
    if (!media) {
      return res.status(404).json({ success: false, error: 'لم يتم العثور على الوسائط' });
    }

    // معالجة خاصة للمواقع
    if (media.isLocation && media.locationData) {
      return res.json({
        success: true,
        mediaType: 'location',
        location: media.locationData
      });
    }

    // إرسال الملف كاستجابة
    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(media.fileName)}"`);
    
    if (media.fileExists && media.localPath) {
      // إرسال الملف من المسار المحلي
      return res.sendFile(media.localPath);
    } else if (media.fileData) {
      // إرسال البيانات من قاعدة البيانات
      const buffer = Buffer.from(media.fileData, 'base64');
      return res.send(buffer);
    } else {
      return res.status(404).json({ success: false, error: 'محتوى الوسائط غير متوفر' });
    }
    
  } catch (error) {
    logger.error('whatsappMediaController', 'خطأ في استرجاع محتوى الوسائط', {
      error: error.message,
      mediaId: req.params.mediaId
    });
    
    return res.status(500).json({
      success: false,
      error: 'خطأ في معالجة الطلب'
    });
  }
};

/**
 * الحصول على وسائط رسالة معينة
 * @param {Object} req - كائن الطلب
 * @param {Object} res - كائن الاستجابة
 */
exports.getMediaByMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    
    if (!messageId) {
      return res.status(400).json({ success: false, error: 'معرف الرسالة مطلوب' });
    }
    
    // استخدام خدمة الوسائط للبحث عن الوسائط المرتبطة بالرسالة
    const media = await WhatsappMedia.findOne({ messageId });
    
    if (!media) {
      return res.status(404).json({ success: false, error: 'لم يتم العثور على وسائط للرسالة المحددة' });
    }
    
    return res.json({
      success: true,
      media: {
        _id: media._id,
        messageId: media.messageId,
        mediaType: media.mediaType,
        fileName: media.fileName,
        mimeType: media.mimeType,
        fileSize: media.fileSize,
        direction: media.direction,
        createdAt: media.createdAt
      }
    });
    
  } catch (error) {
    logger.error('whatsappMediaController', 'خطأ في الحصول على وسائط الرسالة', {
      error: error.message,
      messageId: req.params.messageId
    });
    
    return res.status(500).json({
      success: false,
      error: 'خطأ في معالجة الطلب'
    });
  }
};

/**
 * تحميل ملف لإرسال صورة أو مستند
 * @param {Object} req - كائن الطلب 
 * @param {Object} res - كائن الاستجابة
 */
exports.uploadMediaForSending = async (req, res) => {
  try {
    // التحقق من وجود ملف وبيانات المحادثة
    if (!req.file || !req.body.conversationId || !req.body.mediaType) {
      return res.status(400).json({ 
        success: false, 
        error: 'بيانات غير مكتملة. الملف ومعرف المحادثة ونوع الوسائط مطلوبة' 
      });
    }
    
    const { conversationId, mediaType } = req.body;
    const file = req.file;
    
    // التحقق من دعم نوع الملف
    if (!mediaService.MEDIA_TYPES[mediaType.toUpperCase()]) {
      return res.status(400).json({
        success: false,
        error: `نوع وسائط غير مدعوم: ${mediaType}`
      });
    }
    
    // قراءة محتوى الملف وتحويله إلى base64
    const fileData = file.buffer.toString('base64');
    
    // إنشاء سجل وسائط جديد باستخدام خدمة الوسائط
    const media = await mediaService.createMedia({
      conversationId,
      direction: 'outgoing',
      mediaType,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      fileData,
      metaData: { uploaded: true }
    });
    
    return res.json({
      success: true,
      media: {
        _id: media._id,
        fileName: media.fileName,
        mediaType: media.mediaType,
        mimeType: media.mimeType,
        fileSize: media.fileSize
      }
    });
    
  } catch (error) {
    logger.error('whatsappMediaController', 'خطأ في تحميل وسائط للإرسال', {
      error: error.message
    });
    
    return res.status(500).json({
      success: false,
      error: 'خطأ في معالجة تحميل الملف'
    });
  }
};

/**
 * تحديث معرف الرسالة للوسائط بعد إنشاء الرسالة
 * @param {String} mediaId - معرف الوسائط
 * @param {String} messageId - معرف الرسالة
 */
exports.updateMessageIdForMedia = async (mediaId, messageId) => {
  try {
    // استخدام خدمة الوسائط لربط الوسائط بالرسالة
    const result = await mediaService.linkMediaToMessage(mediaId, messageId);
    return result;
  } catch (error) {
    logger.error('whatsappMediaController', 'خطأ في تحديث معرف الرسالة للوسائط', {
      error: error.message,
      mediaId,
      messageId
    });
    return false;
  }
};
