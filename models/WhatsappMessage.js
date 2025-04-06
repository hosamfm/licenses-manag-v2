/**
 * نموذج رسالة واتساب
 */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReaderSchema = new Schema({
  userId: { type: String, required: true },
  username: { type: String, required: true },
  readAt: { type: Date, default: Date.now }
}, { _id: false });

const WhatsappMessageSchema = new Schema({
  // المعرف الداخلي يتم إنشاؤه تلقائيًا
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  
  // معرف الرسالة الخارجي (الذي ترسله واتساب)
  externalMessageId: { type: String, sparse: true },
  
  // اتجاه الرسالة: واردة أو صادرة أو ملاحظة داخلية
  direction: { type: String, enum: ['incoming', 'outgoing', 'internal'], required: true },
  
  // محتوى الرسالة (النص)
  content: { type: String },
  
  // معرف الرسالة المرد عليها
  replyToMessageId: { type: Schema.Types.Mixed },
  
  // معلومات المرسل
  sentBy: { 
    type: Schema.Types.Mixed, 
    default: function() {
      return this.direction === 'incoming' ? 'customer' : 'system';
    }
  },
  
  // اسم المستخدم المرسل
  sentByUsername: { type: String },
  
  // حالة الرسالة (جاري الإرسال، تم الإرسال، تم التسليم، تم القراءة، فشل)
  status: { type: String, enum: ['sending', 'sent', 'delivered', 'read', 'failed'], default: 'sent' },
  
  // تاريخ إنشاء الرسالة
  createdAt: { type: Date, default: Date.now },
  
  // نسخة التطبيق
  appVersion: { type: String },
  
  // طوابع زمنية لتتبع الحالة
  timestamp: { type: Date },
  deliveredAt: { type: Date },
  readAt: { type: Date },
  
  // نوع الوسائط (صورة، فيديو، صوت...)
  mediaType: { type: String },
  
  // معرف الوسائط المرفقة
  mediaId: { type: Schema.Types.ObjectId, ref: 'Media' },
  
  // رابط للوسائط
  mediaUrl: { type: String },
  
  // بيانات إضافية
  metadata: { type: Schema.Types.Mixed },
  
  // التفاعلات (الإيموجي)
  reactions: [{
    emoji: { type: String, required: true },
    sender: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }],
  
  // قائمة المستخدمين الذين قرؤوا الرسالة
  readBy: [ReaderSchema]
}, { timestamps: true });

WhatsappMessageSchema.index({ conversationId: 1, createdAt: -1 });
WhatsappMessageSchema.index({ externalMessageId: 1 }, { sparse: true });

module.exports = mongoose.model('WhatsappMessage', WhatsappMessageSchema); 