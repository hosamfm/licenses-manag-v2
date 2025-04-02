/**
 * متحكم وسائط واتساب - للتعامل مع تحميل وإرسال الملفات
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../services/loggerService');
const storageService = require('../services/storageService');
const metaWhatsappService = require('../services/whatsapp/MetaWhatsappService');
const WhatsAppChannel = require('../models/WhatsAppChannel');
const Conversation = require('../models/Conversation');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const socketService = require('../services/socketService');

// تكوين تخزين مؤقت للملفات المرفوعة - سيتم حذف هذه الملفات بعد تحميلها إلى R2
const tempStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    // إنشاء المجلد المؤقت إذا لم يكن موجودًا
    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // توليد اسم فريد للملف المؤقت
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// إعداد معالج التحميل
const upload = multer({
  storage: tempStorage,
  limits: {
    fileSize: 16 * 1024 * 1024 // 16 ميجابايت كحد أقصى (حد API واتساب)
  },
  fileFilter: function (req, file, cb) {
    // التحقق من نوع الملف
    const filetypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|mp3|mp4|webm|ogg|wav|amr|csv|txt/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم! يرجى تحميل ملف بامتداد صالح.'));
    }
  }
}).single('media');

/**
 * معالج تحميل الملفات ورفعها إلى خدمة التخزين السحابي
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 * @returns {Promise} - استجابة JSON تحتوي على معلومات الملف المخزن
 */
exports.uploadMedia = async (req, res) => {
  // تنفيذ تحميل الملف باستخدام multer
  upload(req, res, async function (err) {
    try {
      if (err) {
        logger.error('whatsappMediaController', 'خطأ في تحميل الملف', { error: err.message });
        return res.status(400).json({ success: false, error: err.message });
      }

      if (!req.file) {
        logger.error('whatsappMediaController', 'لم يتم تحميل أي ملف');
        return res.status(400).json({ success: false, error: 'لم يتم تحميل أي ملف' });
      }

      logger.info('whatsappMediaController', 'تم تحميل ملف بنجاح', {
        filename: req.file.originalname,
        size: req.file.size,
        mime: req.file.mimetype
      });

      // تحميل الملف من المسار المؤقت إلى Cloudflare R2
      const fileBuffer = fs.readFileSync(req.file.path);
      const fileName = storageService.generateUniqueFileName(req.file.originalname);
      const mimeType = req.file.mimetype;

      // تحميل الملف إلى R2
      const uploadResult = await storageService.uploadFileFromBuffer(
        fileBuffer,
        fileName,
        mimeType,
        'whatsapp'
      );

      // حذف الملف المؤقت
      fs.unlinkSync(req.file.path);

      // تحديد نوع الوسائط بناءً على نوع MIME
      let mediaType = 'document'; // القيمة الافتراضية
      if (mimeType.startsWith('image/')) {
        mediaType = 'image';
      } else if (mimeType.startsWith('video/')) {
        mediaType = 'video';
      } else if (mimeType.startsWith('audio/')) {
        mediaType = 'audio';
      }

      const responseData = {
        ...uploadResult,
        originalName: req.file.originalname,
        mediaType
      };

      logger.info('whatsappMediaController', 'تم تحميل الملف إلى R2 بنجاح', {
        r2Key: uploadResult.r2Key
      });

      return res.status(200).json(responseData);
    } catch (error) {
      logger.error('whatsappMediaController', 'خطأ في معالجة تحميل الملف', {
        error: error.message
      });

      // محاولة حذف الملف المؤقت في حالة حدوث خطأ
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      return res.status(500).json({
        success: false,
        error: 'حدث خطأ أثناء معالجة الملف: ' + error.message
      });
    }
  });
};

/**
 * إرسال ملف إلى محادثة واتساب
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 * @returns {Promise} - استجابة JSON تحتوي على نتيجة الإرسال
 */
exports.sendMedia = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { mediaType, mediaUrl, caption, fileName, r2Key, replyToMessageId } = req.body;

    // التحقق من وجود المحادثة
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      logger.error('whatsappMediaController', 'المحادثة غير موجودة', { conversationId });
      return res.status(404).json({ success: false, error: 'المحادثة غير موجودة' });
    }

    // التحقق من تحديد mediaUrl
    if (!mediaUrl) {
      logger.error('whatsappMediaController', 'لم يتم تحديد رابط الوسائط');
      return res.status(400).json({ success: false, error: 'يجب تحديد رابط الوسائط' });
    }

    // التحقق من تحديد نوع الوسائط
    if (!mediaType) {
      logger.error('whatsappMediaController', 'لم يتم تحديد نوع الوسائط');
      return res.status(400).json({ success: false, error: 'يجب تحديد نوع الوسائط' });
    }

    // الحصول على قناة واتساب المرتبطة بالمحادثة
    const channel = await WhatsAppChannel.findById(conversation.channelId);
    if (!channel) {
      logger.error('whatsappMediaController', 'قناة واتساب غير موجودة', { channelId: conversation.channelId });
      return res.status(404).json({ success: false, error: 'قناة واتساب غير موجودة' });
    }

    // تحضير خيارات الرسالة
    const options = {};
    if (caption) options.caption = caption;
    if (fileName) options.filename = fileName;
    if (replyToMessageId) options.replyToMessageId = replyToMessageId;

    logger.info('whatsappMediaController', 'إرسال ملف عبر واتساب', {
      conversationId,
      to: conversation.phoneNumber,
      mediaType,
      hasCaption: !!caption
    });

    // إنشاء سجل الرسالة في قاعدة البيانات قبل الإرسال
    const fileData = {
      mediaType,
      publicUrl: mediaUrl,
      fileName: fileName || path.basename(mediaUrl),
      mimeType: storageService.getMimeTypeFromFileName(fileName || path.basename(mediaUrl)),
      size: req.body.fileSize || 0,
      r2Key
    };

    const message = await WhatsappMessage.createOutgoingMessage(
      conversationId,
      caption || '',
      req.user._id,
      replyToMessageId,
      fileData
    );

    // تحديث وقت آخر رسالة في المحادثة
    conversation.lastMessageAt = new Date();
    await conversation.save();

    // إرسال الرسالة عبر واتساب
    const result = await metaWhatsappService.sendMediaMessage(
      conversation.phoneNumber,
      mediaType,
      mediaUrl,
      options,
      channel.phoneNumberId
    );

    // تحديث معرف الرسالة الخارجي من واتساب
    if (result && result.messages && result.messages.length > 0) {
      message.externalMessageId = result.messages[0].id;
      await message.save();

      logger.info('whatsappMediaController', 'تم إرسال ملف بنجاح', {
        messageId: message._id,
        externalId: message.externalMessageId
      });
    }

    // إشعار Socket.io بالرسالة الجديدة
    const notificationData = {
      _id: message._id,
      content: message.content,
      mediaUrl: message.mediaUrl,
      mediaType: message.mediaType,
      fileDetails: message.fileDetails,
      direction: message.direction,
      timestamp: message.timestamp,
      status: message.status,
      externalMessageId: message.externalMessageId,
      conversationId: conversation._id.toString()
    };

    // إرسال إشعار بالرسالة الجديدة عبر Socket.io
    socketService.notifyNewMessage(conversation._id.toString(), notificationData);

    // إشعار بتحديث المحادثة
    socketService.notifyConversationUpdate(conversation._id.toString(), {
      _id: conversation._id,
      lastMessageAt: conversation.lastMessageAt,
      status: conversation.status
    });

    return res.status(200).json({
      success: true,
      messageId: message._id,
      externalMessageId: message.externalMessageId,
      message: 'تم إرسال الملف بنجاح'
    });
  } catch (error) {
    logger.error('whatsappMediaController', 'خطأ في إرسال ملف', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'حدث خطأ أثناء إرسال الملف: ' + error.message
    });
  }
};
