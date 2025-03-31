/**
 * نموذج جهة اتصال
 * يستخدم لتخزين معلومات جهات الاتصال وربطها بالمحادثات
 */
const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  phoneNumber: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  email: { 
    type: String,
    default: null
  },
  company: {
    type: String,
    default: null
  },
  notes: {
    type: String,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: { 
    createdAt: 'createdAt', 
    updatedAt: 'updatedAt' 
  }
});

// دالة تطبيع رقم الهاتف قبل الحفظ
contactSchema.pre('save', function(next) {
  // إضافة + في بداية الرقم إذا لم يكن موجوداً
  if (this.phoneNumber && !this.phoneNumber.startsWith('+')) {
    this.phoneNumber = '+' + this.phoneNumber;
  }
  next();
});

// دالة بحث عن جهة اتصال بواسطة رقم الهاتف مع تطبيع الرقم
contactSchema.statics.findByPhoneNumber = async function(phoneNumber) {
  if (!phoneNumber) return null;
  
  // تطبيع رقم الهاتف
  if (!phoneNumber.startsWith('+')) {
    phoneNumber = '+' + phoneNumber;
  }
  
  // البحث عن جهة الاتصال
  return this.findOne({ phoneNumber });
};

module.exports = mongoose.model('Contact', contactSchema);
