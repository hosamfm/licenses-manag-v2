/**
 * ملف استيراد لنموذج رسائل واتساب
 * يستخدم لمعالجة مشكلة اختلاف حالة الأحرف في أسماء الملفات بين أنظمة التشغيل
 */

// استيراد النموذج مباشرة بدون الاعتماد على ملف آخر
const mongoose = require('mongoose');

const whatsappMessageSchema = new mongoose.Schema({
  conversationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Conversation', 
    required: true 
  },
  direction: { 
    type: String, 
    enum: ['incoming', 'outgoing'], 
    required: true 
  },
  content: { 
    type: String,
    default: ''
  },
  mediaUrl: { 
    type: String 
  },
  mediaType: { 
    type: String,
    enum: ['image', 'audio', 'video', 'document', 'sticker', 'location', null]
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  status: { 
    type: String, 
    enum: ['sent', 'delivered', 'read', 'failed', 'received'], 
    default: 'sent' 
  },
  readAt: {
    type: Date
  },
  deliveredAt: {
    type: Date
  },
  sentBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  externalMessageId: { 
    type: String,
    index: true 
  },
  metadata: { 
    type: Object,
    default: {}
  }
}, {
  timestamps: true
});

/**
 * إنشاء رسالة واردة جديدة
 * @param {Object} conversationId - معرّف المحادثة
 * @param {Object} messageData - بيانات الرسالة
 */
whatsappMessageSchema.statics.createIncomingMessage = async function(conversationId, messageData) {
  try {
    const { from, id, type, timestamp } = messageData;
    let content = '';
    let mediaUrl = '';
    
    // استخراج محتوى الرسالة حسب نوعها
    if (type === 'text' && messageData.text) {
      content = messageData.text.body;
    } else if (type === 'image' && messageData.image) {
      mediaUrl = messageData.image.link || messageData.image.id;
    } else if (type === 'video' && messageData.video) {
      mediaUrl = messageData.video.link || messageData.video.id;
    } else if (type === 'audio' && messageData.audio) {
      mediaUrl = messageData.audio.link || messageData.audio.id;
    } else if (type === 'document' && messageData.document) {
      mediaUrl = messageData.document.link || messageData.document.id;
      content = messageData.document.filename || '';
    } else if (type === 'location' && messageData.location) {
      content = `${messageData.location.latitude}, ${messageData.location.longitude}`;
      if (messageData.location.name) {
        content += ` (${messageData.location.name})`;
      }
    }
    
    // إنشاء رسالة جديدة
    const message = await this.create({
      conversationId: conversationId,
      direction: 'incoming',
      content: content,
      mediaUrl: mediaUrl,
      mediaType: type === 'text' ? null : type,
      timestamp: new Date(parseInt(timestamp) * 1000),
      status: 'received',
      externalMessageId: id,
      metadata: messageData
    });
    
    return message;
  } catch (error) {
    console.error('خطأ في إنشاء رسالة واردة:', error);
    throw error;
  }
};

/**
 * إنشاء رسالة صادرة جديدة
 * @param {Object} conversationId - معرّف المحادثة
 * @param {string} content - محتوى الرسالة
 * @param {Object} userId - معرّف المستخدم المرسل
 */
whatsappMessageSchema.statics.createOutgoingMessage = async function(conversationId, content, userId) {
  try {
    const message = await this.create({
      conversationId: conversationId,
      direction: 'outgoing',
      content: content,
      timestamp: new Date(),
      status: 'sent',
      sentBy: userId
    });
    
    return message;
  } catch (error) {
    console.error('خطأ في إنشاء رسالة صادرة:', error);
    throw error;
  }
};

/**
 * تحديث حالة الرسالة
 * @param {string} externalMessageId - معرّف الرسالة الخارجي
 * @param {string} status - الحالة الجديدة
 * @param {Date} timestamp - توقيت التحديث
 */
whatsappMessageSchema.statics.updateMessageStatus = async function(externalMessageId, status, timestamp) {
  try {
    const message = await this.findOne({ externalMessageId: externalMessageId });
    
    if (!message) {
      return null;
    }
    
    message.status = status;
    
    if (status === 'delivered') {
      message.deliveredAt = timestamp;
    } else if (status === 'read') {
      message.readAt = timestamp;
    }
    
    await message.save();
    return message;
  } catch (error) {
    console.error('خطأ في تحديث حالة الرسالة:', error);
    throw error;
  }
};

const WhatsAppMessage = mongoose.model('WhatsAppMessage', whatsappMessageSchema);

module.exports = WhatsAppMessage;
