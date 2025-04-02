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
 * استرجاع محتوى الوسائط
 * @param {Object} req - كائن الطلب
 * @param {Object} res - كائن الاستجابة
 */
exports.getMediaContent = async (req, res) => {
  try {
    const { mediaId } = req.params;
    
    if (!mediaId) {
      return res.status(400).json({ success: false, error: 'معرف الوسائط مطلوب' });
    }
    
    const media = await WhatsappMedia.findById(mediaId);
    
    if (!media) {
      return res.status(404).json({ success: false, error: 'لم يتم العثور على الوسائط المحددة' });
    }
    
    // التحقق من وجود بيانات الملف
    if (!media.fileData || media.fileData === 'DOWNLOAD_FAILED') {
      return res.status(404).json({ success: false, error: 'محتوى الملف غير متوفر' });
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
      mediaId: req.params.mediaId
    });
    
    return res.status(500).json({
      success: false,
      error: 'خطأ في معالجة الطلب'
    });
  }
};

/**
 * استرجاع محتوى الوسائط باستخدام معرف الرسالة
 * @param {Object} req - كائن الطلب
 * @param {Object} res - كائن الاستجابة
 */
exports.getMediaContentByMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    
    if (!messageId) {
      return res.status(400).json({ success: false, error: 'معرف الرسالة مطلوب' });
    }
    
    logger.info('whatsappMediaController', 'البحث عن وسائط برقم الرسالة', {
      messageId
    });
    
    // محاولة البحث المباشر عن الوسائط بمعرف الرسالة
    const media = await WhatsappMedia.findOne({ 
      messageId: messageId.toString() 
    });
    
    if (media) {
      logger.info('whatsappMediaController', 'تم العثور على وسائط مرتبطة بالرسالة', {
        messageId,
        mediaId: media._id,
        mediaType: media.mediaType
      });
      
      return exports.getMediaContent({
        params: { mediaId: media._id.toString() }
      }, res);
    }
    
    // إذا لم ينجح البحث المباشر، نحاول البحث في كل السجلات
    logger.info('whatsappMediaController', 'جاري البحث عن الوسائط في جميع السجلات', {
      messageId
    });
    
    const allMedia = await WhatsappMedia.find({});
    const matchingMedia = allMedia.filter(m => 
      m.messageId && m.messageId.toString() === messageId.toString()
    );
    
    logger.info('whatsappMediaController', 'نتائج البحث الشامل', {
      totalCount: allMedia.length,
      matchingCount: matchingMedia.length,
    });
    
    if (matchingMedia.length > 0) {
      logger.info('whatsappMediaController', 'تم العثور على وسائط مطابقة', {
        mediaId: matchingMedia[0]._id,
        mediaType: matchingMedia[0].mediaType
      });
      
      return exports.getMediaContent({
        params: { mediaId: matchingMedia[0]._id.toString() }
      }, res);
    }
    
    // البحث عن الوسائط باستخدام معرف الوسائط الخارجي من الرسالة
    logger.info('whatsappMediaController', 'محاولة البحث باستخدام معرف الوسائط الخارجي', {
      messageId
    });
    
    const message = await require('../models/WhatsappMessageModel').findById(messageId);
    
    if (message && message.mediaUrl) {
      const mediaByExternalId = await WhatsappMedia.findOne({ 
        externalMediaId: message.mediaUrl 
      });
      
      if (mediaByExternalId) {
        logger.info('whatsappMediaController', 'تم العثور على وسائط باستخدام المعرف الخارجي', {
          externalId: message.mediaUrl,
          mediaId: mediaByExternalId._id,
          mediaType: mediaByExternalId.mediaType
        });
        
        return exports.getMediaContent({
          params: { mediaId: mediaByExternalId._id.toString() }
        }, res);
      }
    }
    
    // لم يتم العثور على أي وسائط
    logger.error('whatsappMediaController', 'فشل في العثور على الوسائط المطلوبة', {
      messageId,
      messageFound: !!message,
      externalMediaId: message?.mediaUrl
    });
    
    return res.status(404).json({
      success: false,
      error: 'لم يتم العثور على وسائط للرسالة المحددة',
      errorCode: 'MEDIA_NOT_FOUND'
    });
    
  } catch (error) {
    logger.error('whatsappMediaController', 'خطأ في استرجاع محتوى الوسائط بواسطة معرف الرسالة', {
      error: error.message,
      stack: error.stack,
      messageId: req.params.messageId
    });
    
    return res.status(500).json({
      success: false,
      error: 'خطأ في معالجة الطلب',
      message: error.message
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
