/**
 * متحكم وسائط واتساب - WhatsApp Media Controller
 * المسؤول عن إدارة وسائط واتساب (صور، فيديو، صوت، مستندات...)
 */

const axios = require('axios');
const WhatsappMedia = require('../models/WhatsappMedia');
const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
const metaWhatsappService = require('../services/whatsapp/MetaWhatsappService');
const logger = require('../services/loggerService');

/**
 * التحقق من دعم نوع الملف في واتساب
 * @param {string} mimeType - نوع MIME للملف
 * @returns {boolean} هل النوع مدعوم أم لا
 */
function isSupportedMimeType(mimeType) {
  // قائمة أنواع MIME المدعومة في واتساب
  const supportedTypes = {
    // الصور المدعومة
    'image/jpeg': true,
    'image/png': true,
    'image/webp': true,
    
    // الفيديو المدعوم
    'video/mp4': true,
    'video/3gpp': true,
    
    // الصوت المدعوم
    'audio/aac': true,
    'audio/mp4': true,
    'audio/mpeg': true,
    'audio/amr': true,
    'audio/ogg': true,
    
    // المستندات المدعومة
    'application/pdf': true,
    'application/vnd.ms-powerpoint': true,
    'application/msword': true,
    'application/vnd.ms-excel': true,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
    'text/plain': true
  };
  
  return !!supportedTypes[mimeType];
}

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
        // إنشاء صورة خريطة أو صورة عامة للموقع
        fileData = 'LOCATION_PLACEHOLDER'; // سيتم استبداله بصورة حقيقية مستقبلا
        mimeType = 'text/plain';
        break;
      default:
        throw new Error(`نوع الوسائط غير مدعوم: ${mediaType}`);
    }

    // إذا كان لدينا رابط أو معرف، قم بتنزيل الوسائط
    if (mediaUrl && mediaType !== 'location') {
      // الحصول على إعدادات واتساب النشطة
      const settings = await MetaWhatsappSettings.getActiveSettings();

      try {
        // التحقق ما إذا كان لدينا رابط مباشر أو معرف لتنزيله
        if (mediaUrl.startsWith('http')) {
          // استخدام الرابط المباشر للتنزيل
          const response = await axios.get(mediaUrl, {
            responseType: 'arraybuffer',
            headers: {
              'Authorization': `Bearer ${settings.config.accessToken}`
            }
          });
          
          // تحويل البيانات إلى base64
          fileData = Buffer.from(response.data).toString('base64');
          mimeType = response.headers['content-type'] || mimeType;
          fileSize = response.headers['content-length'] || fileData.length;
        } else {
          // نحتاج للحصول على رابط التنزيل من API ميتا
          const mediaData = await metaWhatsappService.getMediaUrl(mediaUrl);
          
          if (mediaData && mediaData.url) {
            // تنزيل الوسائط باستخدام الرابط المؤقت
            const response = await axios.get(mediaData.url, {
              responseType: 'arraybuffer',
              headers: {
                'Authorization': `Bearer ${settings.config.accessToken}`
              }
            });
            
            // تحويل البيانات إلى base64
            fileData = Buffer.from(response.data).toString('base64');
            mimeType = response.headers['content-type'] || mimeType;
            fileSize = response.headers['content-length'] || fileData.length;
          } else {
            throw new Error('فشل في الحصول على رابط التنزيل من API ميتا');
          }
        }
      } catch (downloadError) {
        logger.error('whatsappMediaController', 'خطأ في تنزيل الوسائط', {
          error: downloadError.message,
          mediaUrl,
          mediaType
        });
        
        // إذا فشل التنزيل، نحفظ سجل وسائط فارغ مع وضع الخطأ
        fileData = 'DOWNLOAD_FAILED';
        metaData = { ...metaData, downloadError: downloadError.message };
      }
    }

    // إنشاء سجل الوسائط في قاعدة البيانات
    const mediaRecord = await WhatsappMedia.createMedia({
      messageId,
      conversationId: messageData.conversationId,
      direction: 'incoming',
      mediaType,
      fileName,
      mimeType,
      fileSize,
      fileData,
      externalMediaId: mediaUrl,
      metaData: { ...mediaData, ...metaData },
      latitude,
      longitude,
      locationName
    });

    logger.info('whatsappMediaController', 'تم حفظ وسائط جديدة', {
      mediaId: mediaRecord._id,
      messageId,
      mediaType,
      success: fileData !== 'DOWNLOAD_FAILED'
    });

    return {
      success: true,
      mediaId: mediaRecord._id,
      mediaType,
      mimeType
    };
    
  } catch (error) {
    logger.error('whatsappMediaController', 'خطأ في تنزيل وحفظ الوسائط', {
      error: error.message,
      mediaInfo: mediaInfo ? mediaInfo.type : 'undefined'
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
    const { mediaId } = req.params;
    
    if (!mediaId) {
      return res.status(400).json({ success: false, error: 'معرف الوسائط أو الرسالة مطلوب' });
    }
    
    // تسجيل محاولة الوصول إلى الوسائط
    logger.info('whatsappMediaController', 'محاولة الوصول إلى الوسائط', {
      mediaId: mediaId
    });
    
    // البحث عن الوسائط إما عن طريق معرف الوسائط مباشرة أو معرف الرسالة
    let media = await WhatsappMedia.findById(mediaId);
    
    // إذا لم يتم العثور على وسائط، نحاول البحث باستخدام معرف الرسالة
    if (!media) {
      media = await WhatsappMedia.getMediaByMessageId(mediaId);
    }
    
    if (!media) {
      logger.error('whatsappMediaController', 'لم يتم العثور على الوسائط', {
        mediaId: mediaId
      });
      return res.status(404).json({ success: false, error: 'لم يتم العثور على الوسائط المحددة' });
    }
    
    // تسجيل معلومات الوسائط التي تم العثور عليها
    logger.info('whatsappMediaController', 'تم العثور على الوسائط', {
      mediaId: media._id,
      mediaType: media.mediaType,
      fileDataExists: !!media.fileData,
      fileDataLength: media.fileData ? media.fileData.length : 0,
      externalMediaId: media.externalMediaId
    });
    
    // التحقق من وجود بيانات الملف
    if (!media.fileData || media.fileData === 'DOWNLOAD_FAILED') {
      // محاولة إعادة تنزيل الوسائط إذا كان لدينا المعرف الخارجي
      if (media.externalMediaId && media.externalMediaId.length > 0) {
        try {
          logger.info('whatsappMediaController', 'محاولة إعادة تنزيل الوسائط', {
            mediaId: media._id,
            externalMediaId: media.externalMediaId
          });
          
          // الحصول على إعدادات واتساب النشطة
          const settings = await MetaWhatsappSettings.getActiveSettings();
          
          // محاولة الحصول على رابط الوسائط من API واتساب
          const mediaUrlData = await metaWhatsappService.getMediaUrl(media.externalMediaId);
          
          if (mediaUrlData && mediaUrlData.url) {
            // تنزيل الوسائط باستخدام الرابط المؤقت
            const response = await axios.get(mediaUrlData.url, {
              responseType: 'arraybuffer',
              headers: {
                'Authorization': `Bearer ${settings.config.accessToken}`
              }
            });
            
            // تحويل البيانات إلى base64
            const fileData = Buffer.from(response.data).toString('base64');
            
            // تحديث سجل الوسائط بالبيانات الجديدة
            media.fileData = fileData;
            media.updatedAt = new Date();
            await media.save();
            
            logger.info('whatsappMediaController', 'تم إعادة تنزيل الوسائط بنجاح', {
              mediaId: media._id
            });
          } else {
            logger.error('whatsappMediaController', 'فشل في الحصول على رابط إعادة التنزيل', {
              mediaId: media._id,
              externalMediaId: media.externalMediaId
            });
            return res.status(404).json({ success: false, error: 'محتوى الملف غير متوفر ولا يمكن إعادة تنزيله' });
          }
        } catch (downloadError) {
          logger.error('whatsappMediaController', 'خطأ في إعادة تنزيل الوسائط', {
            error: downloadError.message,
            mediaId: media._id,
            externalMediaId: media.externalMediaId
          });
          return res.status(404).json({ success: false, error: 'فشل في إعادة تنزيل محتوى الملف' });
        }
      } else {
        return res.status(404).json({ success: false, error: 'محتوى الملف غير متوفر' });
      }
    }
    
    // إعداد بيانات الاستجابة
    let dataType = media.mimeType;
    let dataContent;
    
    // معالجة نوع الموقع بشكل خاص
    if (media.mediaType === 'location') {
      return res.json({
        success: true,
        location: {
          latitude: media.latitude,
          longitude: media.longitude,
          name: media.locationName
        }
      });
    } else {
      // تحويل البيانات إلى Buffer لإرسالها
      dataContent = Buffer.from(media.fileData, 'base64');
      
      // تعيين نوع المحتوى
      res.setHeader('Content-Type', dataType);
      
      // تعيين اسم الملف للتنزيل إذا كان متاحًا
      if (media.fileName) {
        res.setHeader('Content-Disposition', `inline; filename="${media.fileName}"`);
      }
      
      // إرسال البيانات
      return res.send(dataContent);
    }
    
  } catch (error) {
    logger.error('whatsappMediaController', 'خطأ في استرجاع محتوى الوسائط', {
      error: error.message,
      mediaId: req.params.mediaId,
      stack: error.stack
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
    
    const media = await WhatsappMedia.getMediaByMessageId(messageId);
    
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
    if (!isSupportedMimeType(file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: `نوع الملف ${file.mimetype} غير مدعوم في واتساب. الأنواع المدعومة هي: JPEG, PNG, WEBP للصور، MP4 للفيديو، MP3/OGG للصوت، PDF/DOC/DOCX/XLS/XLSX للمستندات.`
      });
    }
    
    // قراءة محتوى الملف وتحويله إلى base64
    const fileData = file.buffer.toString('base64');
    
    // إنشاء سجل وسائط جديد (بدون messageId حتى يتم إنشاء الرسالة)
    const media = await WhatsappMedia.createMedia({
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
    await WhatsappMedia.findByIdAndUpdate(mediaId, { messageId });
    logger.info('whatsappMediaController', 'تم تحديث معرف الرسالة للوسائط', {
      mediaId,
      messageId
    });
    return true;
  } catch (error) {
    logger.error('whatsappMediaController', 'خطأ في تحديث معرف الرسالة للوسائط', {
      error: error.message,
      mediaId,
      messageId
    });
    return false;
  }
};
