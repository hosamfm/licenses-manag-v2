/**
 * نموذج المحادثات
 * يستخدم لتتبع محادثات واتساب مع العملاء
 */
const mongoose = require('mongoose');
const WhatsAppMessage = require('./WhatsappMessageModel'); // استيراد نموذج رسائل واتساب
const ConversationEvent = require('./ConversationEvent'); // استيراد نموذج أحداث المحادثة
const logger = require('../services/loggerService'); // استيراد logger

const conversationSchema = new mongoose.Schema({
  channelId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'WhatsAppChannel', 
    required: true 
  },
  phoneNumber: { 
    type: String, 
    required: true,
    trim: true 
  },
  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    default: null
  },
  customerName: { 
    type: String,
    trim: true 
  },
  customerData: {
    type: Object,
    default: {} // لتخزين معلومات الملف الشخصي للعميل الواردة من واتساب
  },
  status: { 
    type: String, 
    enum: ['open', 'assigned', 'closed'], 
    default: 'open' 
  },
  assignedTo: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null
  },
  lastMessageAt: { 
    type: Date, 
    default: Date.now 
  },
  lastOpenedAt: { // إضافة حقل لتتبع وقت آخر فتح
    type: Date,
    default: Date.now // افتراضياً عند الإنشاء تكون مفتوحة
  },
  tags: [{ 
    type: String 
  }],
  notes: [{ 
    text: { type: String, required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  metadata: { 
    type: Object,
    default: {}
  }
}, {
  timestamps: true
});

/**
 * إيجاد أو إنشاء محادثة
 * @param {string} phoneNumber - رقم هاتف العميل
 * @param {ObjectId} channelId - معرّف القناة
 */
conversationSchema.statics.findOrCreate = async function(phoneNumber, channelId) {
  try {
    // البحث عن محادثة موجودة
    let conversation = await this.findOne({ 
      phoneNumber: phoneNumber,
      channelId: channelId
    });
    
    // إذا لم تكن هناك محادثة، نقوم بإنشاء واحدة جديدة
    if (!conversation) {
      conversation = await this.create({
        phoneNumber: phoneNumber,
        channelId: channelId,
        status: 'open',
        lastMessageAt: new Date()
      });
    }
    
    return conversation;
  } catch (error) {
    console.error('خطأ في إيجاد أو إنشاء محادثة:', error);
    throw error;
  }
};

/**
 * إضافة ملاحظة إلى المحادثة
 * @param {string} text - نص الملاحظة
 * @param {ObjectId} userId - معرّف المستخدم الذي أضاف الملاحظة
 */
conversationSchema.methods.addNote = async function(text, userId) {
  try {
    this.notes.push({
      text: text,
      createdBy: userId,
      createdAt: new Date()
    });
    
    await this.save();
    return this;
  } catch (error) {
    console.error('خطأ في إضافة ملاحظة:', error);
    throw error;
  }
};

/**
 * تعيين المحادثة لمستخدم
 * @param {ObjectId} userId - معرّف المستخدم
 */
conversationSchema.methods.assignTo = async function(userId) {
  try {
    this.assignedTo = userId;
    this.status = 'assigned';
    
    await this.save();
    return this;
  } catch (error) {
    console.error('خطأ في تعيين المحادثة:', error);
    throw error;
  }
};

/**
 * إغلاق المحادثة
 * @param {ObjectId} userId - معرّف المستخدم الذي قام بالإغلاق
 * @param {string} reason - سبب الإغلاق (اختياري)
 * @param {string} note - ملاحظة الإغلاق (اختياري)
 */
conversationSchema.methods.close = async function(userId, reason = null, note = null) {
  try {
    if (this.status === 'closed') {
      logger.warn('المحادثة مغلقة بالفعل', { conversationId: this._id });
      return this; // لا تقم بأي إجراء إذا كانت مغلقة بالفعل
    }

    const now = new Date();
    const closeDurationMs = this.lastOpenedAt ? now.getTime() - this.lastOpenedAt.getTime() : null;

    // حساب عدد الرسائل منذ آخر فتح
    let messagesSentSinceOpen = 0;
    let messagesReceivedSinceOpen = 0;

    if (this.lastOpenedAt) {
      messagesSentSinceOpen = await WhatsAppMessage.countDocuments({
        conversationId: this._id,
        direction: 'outgoing',
        timestamp: { $gte: this.lastOpenedAt }
      });
      messagesReceivedSinceOpen = await WhatsAppMessage.countDocuments({
        conversationId: this._id,
        direction: 'incoming',
        timestamp: { $gte: this.lastOpenedAt }
      });
    }

    this.status = 'closed';
    this.assignedTo = null; // إلغاء تعيين المستخدم عند الإغلاق
    
    // إنشاء سجل حدث الإغلاق
    await ConversationEvent.create({
      conversationId: this._id,
      eventType: 'closed',
      timestamp: now,
      userId: userId, // المستخدم الذي قام بالإغلاق
      closeDurationMs: closeDurationMs,
      messagesSentSinceOpen: messagesSentSinceOpen,
      messagesReceivedSinceOpen: messagesReceivedSinceOpen,
      closeReason: reason,
      closeNote: note
    });

    await this.save();
    logger.info('تم إغلاق المحادثة', { conversationId: this._id, userId });
    return this;
  } catch (error) {
    logger.error('خطأ في إغلاق المحادثة:', { conversationId: this._id, error });
    throw error;
  } 
};

/**
 * إعادة فتح المحادثة
 * @param {ObjectId} userId - معرّف المستخدم الذي قام بإعادة الفتح
 */
conversationSchema.methods.reopen = async function(userId) {
  try {
    if (this.status === 'open') {
        logger.warn('المحادثة مفتوحة بالفعل', { conversationId: this._id });
        return this; // لا تفعل شيئًا إذا كانت مفتوحة بالفعل
    }
    const now = new Date();
    this.status = 'open';
    this.lastOpenedAt = now; // تحديث وقت آخر فتح

    // إنشاء سجل حدث إعادة الفتح
    await ConversationEvent.create({
      conversationId: this._id,
      eventType: 'opened',
      timestamp: now,
      userId: userId // المستخدم الذي قام بإعادة الفتح
    });

    await this.save();
    logger.info('تم إعادة فتح المحادثة', { conversationId: this._id, userId });
    return this;
  } catch (error) {
    logger.error('خطأ في إعادة فتح المحادثة:', { conversationId: this._id, error });
    throw error;
  }
};

/**
 * إعادة فتح المحادثة تلقائيًا بسبب رسالة واردة
 */
conversationSchema.methods.automaticReopen = async function() {
  try {
    if (this.status === 'open') {
      return this; // لا تفعل شيئًا إذا كانت مفتوحة بالفعل
    }
    const now = new Date();
    this.status = 'open';
    this.lastOpenedAt = now;

    // إنشاء سجل حدث إعادة الفتح التلقائي
    await ConversationEvent.create({
      conversationId: this._id,
      eventType: 'reopened_automatically',
      timestamp: now,
      userId: null // لا يوجد مستخدم مرتبط بهذا الإجراء
    });

    await this.save();
    logger.info('تمت إعادة فتح المحادثة تلقائيًا', { conversationId: this._id });
    return this;
  } catch (error) {
    logger.error('خطأ في إعادة فتح المحادثة تلقائيًا:', { conversationId: this._id, error });
    throw error;
  }
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
