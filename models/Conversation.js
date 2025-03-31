/**
 * نموذج المحادثات
 * يستخدم لتتبع محادثات واتساب مع العملاء
 */
const mongoose = require('mongoose');

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
  customerName: { 
    type: String,
    trim: true 
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
 */
conversationSchema.methods.close = async function() {
  try {
    this.status = 'closed';
    
    await this.save();
    return this;
  } catch (error) {
    console.error('خطأ في إغلاق المحادثة:', error);
    throw error;
  }
};

/**
 * إعادة فتح المحادثة
 */
conversationSchema.methods.reopen = async function() {
  try {
    this.status = 'open';
    
    await this.save();
    return this;
  } catch (error) {
    console.error('خطأ في إعادة فتح المحادثة:', error);
    throw error;
  }
};

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
