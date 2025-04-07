const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  type: { 
    type: String, 
    enum: ['message', 'system', 'conversation', 'license', 'user'], 
    required: true 
  },
  title: { 
    type: String, 
    required: true 
  },
  content: { 
    type: String, 
    required: true 
  },
  reference: {
    model: { type: String },       // اسم النموذج المرجعي (مثلاً 'Conversation', 'License')
    id: { type: mongoose.Schema.Types.ObjectId } // معرف العنصر المرجعي
  },
  link: { 
    type: String       // رابط للتنقل إليه عند النقر على الإشعار
  },
  isRead: { 
    type: Boolean, 
    default: false 
  },
  isArchived: { 
    type: Boolean, 
    default: false 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// إنشاء فهرس لتسريع الاستعلامات
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification; 