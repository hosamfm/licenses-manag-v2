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
require('dotenv').config();

/**
 * تنزيل وتخزين بيانات الوسائط في قاعدة البيانات فقط (بدون ملفات محلية)
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
    let fileName = '';
    let mimeType = '';
    let fileSize = 0;
    let fileData = ''; // لتخزين البيانات المشفرة
    let metaData = {};
    
    // تحديد الموقع في حالة رسالة الموقع
    let latitude = null;
    let longitude = null;
    let locationName = null;


    switch (mediaType) {
      case 'image':
        mediaUrl = mediaInfo.link || mediaInfo.id;
        fileName = `image_${Date.now()}.jpg`;
        mimeType = 'image/jpeg'; 
        break;
      case 'video':
        mediaUrl = mediaInfo.link || mediaInfo.id;
        fileName = `video_${Date.now()}.mp4`;
        mimeType = 'video/mp4';
        break;
      case 'audio':
        mediaUrl = mediaInfo.link || mediaInfo.id;
        fileName = `audio_${Date.now()}.ogg`;
        mimeType = 'audio/ogg';
        break;
      case 'document':
        mediaUrl = mediaInfo.link || mediaInfo.id;
        fileName = mediaInfo.filename || `document_${Date.now()}.pdf`;
        mimeType = mediaInfo.mime_type || 'application/pdf';
        break;
      case 'sticker':
        mediaUrl = mediaInfo.link || mediaInfo.id;
        fileName = `sticker_${Date.now()}.webp`;
        mimeType = 'image/webp';
        break;
      case 'location':
        // في حالة الموقع، لا يوجد ملف فعلي
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


      return {
        success: true,
        media: locationMedia
      };
    }

    // للأنواع الأخرى، نحتاج لتنزيل البيانات من الرابط وتحويلها لـ base64
    if (!mediaUrl) {
      throw new Error('رابط الوسائط غير متوفر');
    }


    // الحصول على توكن الوصول لواتساب
    const settings = await MetaWhatsappSettings.getActiveSettings();
    if (!settings || !settings.config || !settings.config.accessToken) {
      throw new Error('لم يتم العثور على إعدادات واتساب أو توكن الوصول');
    }

    const accessToken = settings.config.accessToken;
    let response; // تعريف المتغير قبل كتلة try-catch



    try {
      // طلب GET لاسترجاع معلومات الوسائط والحصول على رابط التنزيل
      const mediaInfoResponse = await axios({
        method: 'GET',
        url: `https://graph.facebook.com/v22.0/${mediaUrl}`,
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      // التحقق من وجود عنوان URL للوسائط في الاستجابة
      if (!mediaInfoResponse.data || !mediaInfoResponse.data.url) {
        throw new Error('لم يتم العثور على عنوان URL للوسائط في استجابة واتساب');
      }

      const mediaDownloadUrl = mediaInfoResponse.data.url;


      // الخطوة 2: تنزيل الوسائط باستخدام العنوان المُسترجع
      response = await axios({
        method: 'GET',
        url: mediaDownloadUrl,
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        responseType: 'arraybuffer'
      });

      // استخراج معلومات من الاستجابة
      if (response.headers['content-type']) {
        mimeType = response.headers['content-type'];
      } else if (mediaInfoResponse.data.mime_type) {
        // استخدام نوع MIME من استجابة معلومات الوسائط إذا كان متاحًا
        mimeType = mediaInfoResponse.data.mime_type;
      }

      if (response.headers['content-length']) {
        fileSize = parseInt(response.headers['content-length']);
      } else {
        fileSize = response.data.length;
      }

      // تحسين اسم الملف إذا كان متاحًا في استجابة معلومات الوسائط
      if (mediaInfoResponse.data.file_name) {
        fileName = mediaInfoResponse.data.file_name;
      }
    } catch (apiError) {
      // في حالة فشل طريقة الخطوتين، نحاول تجربة الطريقة المباشرة كخطة بديلة
      // logger.warn(`فشل في استرجاع عنوان URL للوسائط، محاولة التنزيل المباشر: ${apiError.message}`, {
      //   mediaType,
      //   mediaUrl
      // });

      // تنزيل الوسائط مباشرة (الطريقة القديمة)
      response = await axios({
        method: 'GET',
        url: `https://graph.facebook.com/v22.0/${mediaUrl}`,
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        responseType: 'arraybuffer'
      });

      // استخراج معلومات من الاستجابة
      if (response.headers['content-type']) {
        mimeType = response.headers['content-type'];
      }

      if (response.headers['content-length']) {
        fileSize = parseInt(response.headers['content-length']);
      } else {
        fileSize = response.data.length;
      }
    }

    // تنظيف اسم الملف
    fileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

    // تحويل البيانات إلى base64 لتخزينها في قاعدة البيانات
    fileData = Buffer.from(response.data).toString('base64');


    // بناء كائن البيانات الوصفية
    metaData = {
      mediaId: mediaInfo.id,
      mediaUrl: mediaUrl,
      originalInfo: mediaInfo,
      downloadedAt: new Date()
    };

    // إنشاء سجل في قاعدة البيانات مع تخزين البيانات المشفرة
    const mediaRecord = await mediaService.createMedia({
      messageId,
      conversationId: messageData.conversationId,
      mediaType,
      fileName,
      mimeType,
      fileSize,
      direction: 'incoming',
      fileData, // تخزين البيانات المشفرة مباشرة
      metaData
    });

    if (!mediaRecord) {
      throw new Error('فشل في إنشاء سجل الوسائط');
    }


    return {
      success: true,
      media: mediaRecord
    };
  } catch (error) {
    logger.error(`خطأ في عملية تنزيل وحفظ بيانات الوسائط: ${error.message}`, {
      messageId: messageData?._id,
      mediaType: mediaInfo?.type
    });
    
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * استرجاع محتوى ملف الوسائط من قاعدة البيانات
 * @param {Object} req - كائن الطلب
 * @param {Object} res - كائن الاستجابة
 */
exports.getMediaContent = async (req, res) => {
  try {
    const { mediaId } = req.params;
    
    if (!mediaId) {
      // logger.warn('whatsappMediaController', 'معرف الوسائط مطلوب');
      return res.status(400).json({ success: false, error: 'معرف الوسائط مطلوب' });
    }
    

    
    // استرجاع بيانات الوسائط باستخدام خدمة الوسائط
    const mediaContent = await mediaService.getMediaContent(mediaId);
    
    if (!mediaContent) {
      // logger.warn('whatsappMediaController', `لم يتم العثور على وسائط بالمعرف: ${mediaId}`);
      
      // محاولة البحث عن الوسائط باستخدام معرف الرسالة
      try {
        const message = await WhatsappMessage.findById(mediaId);
        if (message && message.mediaType) {
          const mediaFromMessage = await mediaService.findMediaForMessage(message);
          
          if (mediaFromMessage) {
            // إعادة توجيه الطلب إلى معرف الوسائط الصحيح
            return res.redirect(`/whatsapp/media/content/${mediaFromMessage._id}`);
          }
        }
      } catch (messageError) {
        logger.debug('whatsappMediaController', 'خطأ في البحث عن الرسالة', { error: messageError.message });
      }
      
      return res.status(404).json({ success: false, error: 'لم يتم العثور على الوسائط المطلوبة' });
    }
    
    // في حالة الموقع، نعيد كائن JSON
    if (mediaContent.mediaType === 'location' || mediaContent.isLocation) {
      return res.json({
        success: true,
        locationData: mediaContent.locationData || mediaContent.metaData
      });
    }
    
    // في حالة وجود بيانات مشفرة مخزنة، نستخدمها مباشرة
    if (mediaContent.fileData) {
      try {
        // قراءة بيانات الملف المشفرة
        const fileData = mediaContent.fileData;
        
        // فك تشفير البيانات وإرسالها
        const buffer = Buffer.from(fileData, 'base64');
        
        // ضبط نوع المحتوى
        res.set('Content-Type', mediaContent.mimeType || 'application/octet-stream');
        res.set('Content-Disposition', `inline; filename="${mediaContent.fileName || 'file'}"`);

        
        // إرسال البيانات
        return res.send(buffer);
      } catch (bufferError) {
        logger.error('whatsappMediaController', `خطأ في معالجة بيانات الوسائط: ${bufferError.message}`, {
          mediaId,
          error: bufferError.stack
        });
        
        return res.status(500).json({ 
          success: false, 
          error: 'خطأ في معالجة بيانات الوسائط', 
          details: bufferError.message 
        });
      }
    }
    
    // في حالة عدم وجود بيانات للملف، نرسل رسالة خطأ
    // logger.warn('whatsappMediaController', `لا توجد بيانات مشفرة للوسائط: ${mediaId}`, {
    //   mediaType: mediaContent.mediaType,
    //   hasContent: mediaContent.hasContent,
    //   messageId: mediaContent.messageId
    // });
    
    return res.status(404).json({ 
      success: false, 
      error: 'بيانات الوسائط غير متوفرة', 
      mediaType: mediaContent.mediaType
    });
  } catch (error) {
    logger.error('whatsappMediaController', `خطأ في استرجاع محتوى الوسائط: ${error.message}`, {
      error: error.stack,
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
    
    const { conversationId, mediaType, caption } = req.body;
    const file = req.file;
    
    // التحقق من دعم نوع الملف
    if (!mediaService.MEDIA_TYPES[mediaType.toUpperCase()]) {
      return res.status(400).json({
        success: false,
        error: `نوع وسائط غير مدعوم: ${mediaType}`
      });
    }

    
    // إنشاء اسم ملف بسيط للتخزين
    const simpleFileName = `file_${Date.now()}.${file.originalname.split('.').pop() || 'bin'}`;
    
    // قراءة محتوى الملف وتحويله إلى base64
    const fileData = file.buffer.toString('base64');
    
    // إنشاء سجل وسائط جديد باستخدام خدمة الوسائط
    const media = await mediaService.createMedia({
      conversationId,
      direction: 'outgoing',
      mediaType,
      fileName: simpleFileName,
      mimeType: file.mimetype,
      fileSize: file.size,
      fileData,
      caption: caption || '', // إضافة النص المصاحب
      metaData: { 
        originalFileName: file.originalname
      }
    });
    
    return res.json({
      success: true,
      media: {
        _id: media._id,
        fileName: file.originalname, // استخدام الاسم الأصلي للعرض في الواجهة
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
    if (!mediaId || !messageId) {
      // logger.warn('whatsappMediaController', 'معرف الوسائط أو معرف الرسالة غير موجود', {
      //   mediaId,
      //   messageId
      // });
      return false;
    }

    // التحقق من وجود الوسائط أولاً
    const media = await WhatsappMedia.findById(mediaId);
    if (!media) {
      // logger.warn('whatsappMediaController', 'لم يتم العثور على الوسائط للتحديث', {
      //   mediaId,
      //   messageId
      // });
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
    
    await media.save();

    
    // استخدام خدمة الوسائط كطريقة ثانية للتأكد من الربط
    const result = await mediaService.linkMediaToMessage(mediaId, messageId);
    
    return true;
  } catch (error) {
    logger.error('whatsappMediaController', 'خطأ في تحديث معرف الرسالة للوسائط', {
      error: error.message,
      mediaId,
      messageId
    });
    
    // محاولة إعادة الربط باستخدام خدمة الوسائط مباشرة في حالة الفشل
    try {
      const result = await mediaService.linkMediaToMessage(mediaId, messageId);
      if (result) {

        return true;
      }
    } catch (retryError) {
      logger.error('whatsappMediaController', 'فشل في محاولة الربط الثانية', {
        error: retryError.message,
        mediaId,
        messageId
      });
    }
    
    return false;
  }
};
