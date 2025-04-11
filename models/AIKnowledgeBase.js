/**
 * نموذج قاعدة المعرفة للذكاء الاصطناعي
 * يستخدم لتخزين معلومات وإجابات يمكن للذكاء الاصطناعي الرجوع إليها
 */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const AIKnowledgeBaseSchema = new Schema({
  // عنوان المعلومة أو السؤال
  title: {
    type: String,
    required: true,
    trim: true
  },
  
  // النص الرئيسي المحتوي على المعلومات أو الإجابة
  content: {
    type: String,
    required: true
  },
  
  // الكلمات المفتاحية للبحث (تسهل عملية البحث)
  keywords: [{
    type: String,
    trim: true
  }],
  
  // التصنيف: يمكن استخدامه لتنظيم المعلومات
  category: {
    type: String,
    default: 'عام',
    trim: true
  },
  
  // أهمية المعلومة (1-10) - القيم الأعلى تعني أن المعلومة أكثر أهمية
  priority: {
    type: Number,
    default: 5,
    min: 1,
    max: 10
  },
  
  // هل المعلومة نشطة ومتاحة للاستخدام
  isActive: {
    type: Boolean,
    default: true
  },
  
  // من أضاف المعلومة
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // تواريخ التحديث والإنشاء
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// تحديث وقت التعديل قبل الحفظ
AIKnowledgeBaseSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// إضافة مؤشر نصي للبحث في العنوان والمحتوى والكلمات المفتاحية
AIKnowledgeBaseSchema.index({ title: 'text', content: 'text', keywords: 'text' });

const AIKnowledgeBase = mongoose.model('AIKnowledgeBase', AIKnowledgeBaseSchema);

module.exports = AIKnowledgeBase; 