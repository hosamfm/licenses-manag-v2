/**
 * نموذج لتخزين وسائط واتساب - WhatsappMedia Model
 * يستخدم لتخزين الملفات والوسائط الواردة والصادرة من خلال واتساب
 */

const mongoose = require('mongoose');
const logger = require('../services/loggerService');

const whatsappMediaSchema = new mongoose.Schema({
  // معلومات عامة
  messageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsAppMessage',
    required: false, // تغيير من true إلى false للسماح بإنشاء وسائط بدون ربطها برسالة في البداية
    index: true
  },
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  direction: {
    type: String,
    enum: ['incoming', 'outgoing'],
    required: true
  },
  mediaType: {
    type: String,
    enum: ['image', 'video', 'audio', 'document', 'sticker', 'location'],
    required: true
  },
  
  // معلومات الملف
  fileName: {
    type: String,
    required: true
  },
  mimeType: String, // نوع MIME للملف
  fileSize: Number, // حجم الملف بالبايت
  fileData: { // محتوى الملف مشفر بصيغة base64
    type: String,
    required: true
  },
  
  // النص المصاحب للوسائط
  caption: {
    type: String,
    default: ''
  },
  
  // معلومات ميتا واتساب
  externalMediaId: String, // معرف الوسائط الخارجي من واتساب
  metaData: Object, // بيانات إضافية
  
  // معلومات الموقع (للنوع location فقط)
  latitude: Number,
  longitude: Number,
  locationName: String,
  
  // توقيت
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

/**
 * إنشاء ملف وسائط جديد
 * @param {Object} mediaData - بيانات الوسائط
 * @returns {Promise} - الملف المخزن
 */
whatsappMediaSchema.statics.createMedia = async function(mediaData) {
  try {
    logger.info('WhatsappMedia', 'جاري إنشاء ملف وسائط جديد', {
      messageId: mediaData.messageId,
      mediaType: mediaData.mediaType
    });
    
    const media = await this.create(mediaData);
    return media;
  } catch (error) {
    logger.error('WhatsappMedia', 'خطأ في إنشاء ملف وسائط', error);
    throw error;
  }
};

/**
 * الحصول على وسائط رسالة معينة
 * @param {ObjectId} messageId - معرف الرسالة
 * @returns {Promise} - سجل الوسائط
 */
whatsappMediaSchema.statics.getMediaByMessageId = async function(messageId) {
  return this.findOne({ messageId });
};

/**
 * الحصول على جميع الوسائط لمحادثة معينة
 * @param {ObjectId} conversationId - معرف المحادثة
 * @returns {Promise} - قائمة بالوسائط
 */
whatsappMediaSchema.statics.getMediaByConversation = async function(conversationId) {
  return this.find({ conversationId }).sort({ createdAt: -1 });
};

/**
 * تحديث معرف الوسائط الخارجي بعد الإرسال لواتساب
 * @param {ObjectId} mediaId - معرف الوسائط الداخلي
 * @param {String} externalMediaId - معرف الوسائط الخارجي من واتساب
 * @returns {Promise} - سجل الوسائط المحدث
 */
whatsappMediaSchema.statics.updateExternalId = async function(mediaId, externalMediaId) {
  return this.findByIdAndUpdate(
    mediaId,
    { 
      externalMediaId,
      updatedAt: new Date()
    },
    { new: true }
  );
};

const WhatsappMedia = mongoose.model('WhatsappMedia', whatsappMediaSchema);

module.exports = WhatsappMedia;
