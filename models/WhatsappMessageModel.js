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
    enum: ['incoming', 'outgoing', 'internal'], 
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
    enum: ['image', 'audio', 'video', 'document', 'sticker', 'location', 'reaction', null]
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  status: { 
    type: String, 
    enum: ['sent', 'delivered', 'read', 'failed', 'received', 'note'], 
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
  },
  // حقول جديدة لدعم التفاعلات والردود
  reactions: {
    type: Array,
    default: []
  },
  replyToMessageId: {
    type: String,
    default: null
  },
  context: {
    type: Object,
    default: null
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
    let replyToMessageId = null;
    let context = null;
    
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
    } else if (type === 'reaction' && messageData.reaction) {
      // معالجة التفاعلات على الرسائل
      content = messageData.reaction.emoji;
      replyToMessageId = messageData.reaction.message_id;
      
      // تحديث التفاعل على الرسالة الأصلية
      const updatedMessage = await this.updateReaction(replyToMessageId, from, content);
      
      // إرجاع الرسالة المحدثة مع علامة خاصة لتمييزها كتفاعل وليس كرسالة جديدة
      if (updatedMessage) {
        return { 
          isReaction: true, 
          originalMessageId: replyToMessageId,
          reaction: { 
            sender: from, 
            emoji: content 
          }
        };
      }
    }
    
    // التحقق من وجود سياق رد على رسالة
    if (messageData.context && messageData.context.message_id) {
      replyToMessageId = messageData.context.message_id;
      context = messageData.context;
    }
    
    // التحقق من وجود سياق في metadata (للتوافق مع تنسيق API واتساب)
    if (!replyToMessageId && messageData.metadata && messageData.metadata.context && messageData.metadata.context.id) {
      replyToMessageId = messageData.metadata.context.id;
      context = messageData.metadata.context;
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
      metadata: messageData,
      replyToMessageId: replyToMessageId,
      context: context
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
 * @param {string} replyToMessageId - معرّف الرسالة التي يتم الرد عليها (اختياري)
 */
whatsappMessageSchema.statics.createOutgoingMessage = async function(conversationId, content, userId, replyToMessageId = null) {
  try {
    // إذا كان هناك رد على رسالة، ابحث عن تفاصيلها
    let context = null;
    if (replyToMessageId) {
      const originalMessage = await this.findOne({ externalMessageId: replyToMessageId });
      if (originalMessage) {
        context = {
          message_id: replyToMessageId,
          from: originalMessage.metadata ? originalMessage.metadata.from : null
        };
      }
    }
    
    const message = await this.create({
      conversationId: conversationId,
      direction: 'outgoing',
      content: content,
      timestamp: new Date(),
      status: 'sent',
      sentBy: userId,
      replyToMessageId: replyToMessageId,
      context: context
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

/**
 * تحديث التفاعل على رسالة
 * @param {string} messageId - معرّف الرسالة الأصلية
 * @param {Object} reactionData - بيانات التفاعل (المرسل، الإيموجي، التوقيت)
 */
whatsappMessageSchema.statics.updateReaction = async function(messageId, reactionData) {
  try {
    // تحديد نوع المعرف (ObjectId أو معرف خارجي)
    let query;
    if (messageId.length === 24 && /^[0-9a-fA-F]{24}$/.test(messageId)) {
      // المعرف يبدو كأنه ObjectId صالح
      query = { 
        $or: [
          { externalMessageId: messageId },
          { _id: messageId }
        ]
      };
    } else {
      // المعرف ليس ObjectId - ابحث فقط باستخدام المعرف الخارجي
      query = { externalMessageId: messageId };
    }
    
    // البحث عن الرسالة 
    const message = await this.findOne(query);
    
    if (!message) {
      return null;
    }
    
    // تحضير بيانات التفاعل
    const sender = reactionData.sender;
    const emoji = reactionData.emoji || '';
    const timestamp = reactionData.timestamp || new Date();
    
    // البحث عن تفاعل سابق من نفس المرسل وتحديثه
    let reactions = message.reactions || [];
    const existingReaction = reactions.findIndex(r => r.sender === sender);
    
    if (emoji === '') {
      // إذا كان الإيموجي فارغاً، أزل التفاعل
      if (existingReaction !== -1) {
        reactions.splice(existingReaction, 1);
      }
    } else {
      if (existingReaction !== -1) {
        // تحديث التفاعل الموجود
        reactions[existingReaction].emoji = emoji;
        reactions[existingReaction].timestamp = timestamp;
      } else {
        // إضافة تفاعل جديد
        reactions.push({
          sender,
          emoji,
          timestamp
        });
      }
    }
    
    message.reactions = reactions;
    await message.save();
    return message;
  } catch (error) {
    console.error('خطأ في تحديث التفاعل على الرسالة:', error);
    throw error;
  }
};

/**
 * إنشاء رسالة رد صادرة جديدة
 * @param {Object} conversationId - معرّف المحادثة
 * @param {string} content - محتوى الرسالة
 * @param {Object} userId - معرّف المستخدم المرسل
 * @param {string} replyToMessageId - معرّف الرسالة التي يتم الرد عليها
 */
whatsappMessageSchema.statics.createReplyMessage = async function(conversationId, content, userId, replyToMessageId) {
  try {
    // البحث عن الرسالة الأصلية للرد عليها
    const originalMessage = await this.findOne({ 
      $or: [
        { externalMessageId: replyToMessageId },
        { _id: replyToMessageId }
      ] 
    });
    
    // تحضير سياق الرد
    let context = null;
    let finalReplyId = replyToMessageId; // استخدام المعرف الأصلي كاحتياطي

    if (originalMessage) {
      // إذا وجدنا الرسالة الأصلية، نستخدم المعرف الخارجي لها إن وجد
      if (originalMessage.externalMessageId) {
        finalReplyId = originalMessage.externalMessageId;
      }
      
      context = {
        message_id: originalMessage.externalMessageId || replyToMessageId,
        from: originalMessage.metadata ? originalMessage.metadata.from : null
      };
    }
    
    // إنشاء رسالة الرد - استخدام المعرف الخارجي للرسالة الأصلية في replyToMessageId
    const message = await this.create({
      conversationId: conversationId,
      direction: 'outgoing',
      content: content,
      timestamp: new Date(),
      status: 'sent',
      sentBy: userId,
      replyToMessageId: finalReplyId, // استخدام المعرف الخارجي إذا كان متاحاً
      context: context
    });
    
    return message;
  } catch (error) {
    console.error('خطأ في إنشاء رسالة رد:', error);
    throw error;
  }
};

/**
 * الحصول على رسالة بواسطة المعرف الخارجي
 * @param {string} externalMessageId - المعرف الخارجي للرسالة
 */
whatsappMessageSchema.statics.getMessageByExternalId = async function(externalMessageId) {
  try {
    return await this.findOne({ externalMessageId });
  } catch (error) {
    console.error('خطأ في الحصول على الرسالة بواسطة المعرف الخارجي:', error);
    throw error;
  }
};

const WhatsAppMessage = mongoose.model('WhatsAppMessage', whatsappMessageSchema);

module.exports = WhatsAppMessage;