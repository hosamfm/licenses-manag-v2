/**
 * ملف استيراد لنموذج رسائل واتساب
 * يستخدم لمعالجة مشكلة اختلاف حالة الأحرف في أسماء الملفات بين أنظمة التشغيل
 */

// استيراد النموذج مباشرة بدون الاعتماد على ملف آخر
const mongoose = require('mongoose');
const logger = require('../services/loggerService'); // استيراد logger

const whatsappMessageSchema = new mongoose.Schema({
  conversationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Conversation', 
    required: true,
    index: true // إضافة فهرس لتسريع البحث عن الرسائل حسب المحادثة
  },
  direction: { 
    type: String, 
    enum: ['incoming', 'outgoing', 'internal'], 
    required: true,
    index: true // إضافة فهرس لتسريع البحث حسب اتجاه الرسالة
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
    enum: ['image', 'audio', 'video', 'document', 'sticker', 'location', 'reaction', null],
    index: true // إضافة فهرس لتسريع البحث حسب نوع الوسائط
  },
  timestamp: { 
    type: Date, 
    default: Date.now,
    index: true // إضافة فهرس لتسريع الترتيب حسب التاريخ
  },
  status: { 
    type: String, 
    enum: ['sent', 'delivered', 'read', 'failed', 'received', 'note'], 
    default: 'sent' 
  },
  readAt: {
    type: Date
  },
  // إضافة سجل المستخدمين الذين قرؤوا الرسالة
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
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
  },
  // إضافة دعم منشن المستخدمين في الملاحظات الداخلية
  mentions: {
    type: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      username: String
    }],
    default: []
  }
}, {
  timestamps: true
});

/**
 * إنشاء رسالة واردة جديدة
 * @param {Object} whatsappData بيانات الرسالة
 * @param {Object} conversationId معرّف المحادثة
 * @param {Object} options خيارات إضافية
 * @returns {Promise<Object>} الرسالة التي تم إنشاؤها
 */
whatsappMessageSchema.statics.createIncomingMessage = async function(whatsappData, conversationId, options = {}) {
  try {
    const { id, messageType, text, timestamp = new Date(), from } = whatsappData;
    
    // التحقق من وجود الرسالة مسبقاً لتجنب التكرار
    const existingMessage = await this.findOne({ externalMessageId: id });
    if (existingMessage) {
      logger.info('تجاهل الرسالة المكررة', { id, conversationId });
      return existingMessage;
    }
    
    // تحديد حالة الرسالة (افتراضياً 'تم الاستلام')
    const status = options.status || 'received';
    
    // إنشاء كائن الرسالة الجديدة
    const messageData = {
      externalMessageId: id,
      conversationId,
      senderPhone: from,
      text: messageType === 'text' ? text : options.textOverride || '',
      timestamp: new Date(timestamp), // تحويل الطابع الزمني إلى كائن Date
      direction: 'incoming',
      status,
      mediaType: options.mediaType || null,
      metadata: options.metadata || {}
    };
    
    // حفظ الرسالة الجديدة في قاعدة البيانات
    const newMessage = new this(messageData);
    const savedMessage = await newMessage.save();
    
    // تسجيل نجاح العملية
    logger.info('تم إنشاء رسالة واردة جديدة', { id, conversationId });
    
    return savedMessage;
  } catch (error) {
    logger.error('خطأ في إنشاء رسالة واردة', error);
    throw error;
  }
};

/**
 * إنشاء رسالة صادرة جديدة
 * @param {Object} conversationId معرّف المحادثة
 * @param {string} content محتوى الرسالة
 * @param {Object} userId معرّف المستخدم المرسل
 * @param {string} replyToMessageId معرّف الرسالة التي يتم الرد عليها (اختياري)
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
    logger.error('خطأ في إنشاء رسالة صادرة:', error);
    throw error;
  }
};

/**
 * تحديث حالة الرسالة
 * @param {string} externalMessageId معرّف الرسالة الخارجي
 * @param {string} status الحالة الجديدة
 * @param {Date} timestamp توقيت التحديث
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
    logger.error('خطأ في تحديث حالة الرسالة:', error);
    throw error;
  }
};

/**
 * تحديث التفاعل على رسالة
 * @param {string} messageId معرّف الرسالة الأصلية
 * @param {Object} reactionData بيانات التفاعل (المرسل، الإيموجي، التوقيت)
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
    logger.error('خطأ في تحديث التفاعل على الرسالة:', error);
    throw error;
  }
};

/**
 * جلب معلومات المرسل
 * @param {ObjectId} userId معرّف المستخدم
 * @returns {Object} معلومات المستخدم المرسل
 */
whatsappMessageSchema.statics.fetchSenderInfo = async function(userId) {
  if (!userId) return null;
  
  try {
    // استيراد نموذج المستخدم
    const User = mongoose.model('User');
    
    // البحث عن المستخدم حسب المعرف
    const user = await User.findById(userId);
    
    if (user) {
      return {
        _id: user._id,
        username: user.username,
        full_name: user.full_name || user.username,
        user_role: user.user_role || 'user'
      };
    }
    
    return null;
  } catch (error) {
    logger.error('خطأ في جلب معلومات المرسل:', error);
    return null;
  }
};

/**
 * إنشاء رسالة رد صادرة جديدة
 * @param {Object} conversationId معرّف المحادثة
 * @param {string} content محتوى الرسالة
 * @param {Object} userId معرّف المستخدم المرسل
 * @param {string} replyToMessageId معرّف الرسالة التي يتم الرد عليها
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
      context: context,
      metadata: {
        senderInfo: await this.fetchSenderInfo(userId)
      }
    });
    
    return message;
  } catch (error) {
    logger.error('خطأ في إنشاء رسالة رد:', error);
    throw error;
  }
};

/**
 * الحصول على رسالة بواسطة المعرف الخارجي
 * @param {string} externalMessageId المعرف الخارجي للرسالة
 */
whatsappMessageSchema.statics.getMessageByExternalId = async function(externalMessageId) {
  try {
    return await this.findOne({ externalMessageId });
  } catch (error) {
    logger.error('خطأ في الحصول على الرسالة بواسطة المعرف الخارجي:', error);
    throw error;
  }
};

/**
 * تعليم الرسالة كمقروءة من قبل مستخدم
 * @param {string} messageId معرف الرسالة
 * @param {string} userId معرف المستخدم
 * @returns {Promise<Object>} الرسالة المحدثة
 */
whatsappMessageSchema.statics.markAsReadByUser = async function(messageId, userId) {
  try {
    // البحث عن الرسالة
    const message = await this.findById(messageId);
    if (!message) {
      logger.warn('whatsappMessage', 'محاولة تعليم رسالة غير موجودة كمقروءة', { messageId });
      return null;
    }
    
    // التحقق مما إذا كان المستخدم قد قرأ الرسالة مسبقًا
    const alreadyRead = message.readBy && message.readBy.some(read => read.user.toString() === userId.toString());
    if (!alreadyRead) {
      // إضافة المستخدم إلى قائمة من قرؤوا الرسالة
      if (!message.readBy) {
        message.readBy = [];
      }
      
      message.readBy.push({
        user: userId,
        timestamp: new Date()
      });
      
      // حفظ التغييرات
      await message.save();
      logger.info('whatsappMessage', 'تم تعليم الرسالة كمقروءة', { messageId, userId });
    }
    
    return message;
  } catch (error) {
    logger.error('whatsappMessage', 'خطأ في تعليم الرسالة كمقروءة', error);
    throw error;
  }
};

const WhatsAppMessage = mongoose.model('WhatsAppMessage', whatsappMessageSchema);

module.exports = WhatsAppMessage;