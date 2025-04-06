const mongoose = require('mongoose');

const conversationEventSchema = new mongoose.Schema({
  conversationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Conversation', 
    required: true,
    index: true
  },
  eventType: { 
    type: String, 
    enum: ['opened', 'closed', 'reopened_automatically'], 
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    default: null // يكون null في حالة الفتح التلقائي
  },
  // الحقول الخاصة بأحداث الإغلاق
  closeDurationMs: { 
    type: Number // المدة بالمللي ثانية
  },
  messagesSentSinceOpen: { 
    type: Number 
  },
  messagesReceivedSinceOpen: { 
    type: Number 
  },
  closeReason: { 
    type: String 
  },
  closeNote: { 
    type: String 
  }
}, {
  timestamps: true 
});

// إضافة فهرس لتحسين أداء الاستعلام عن الأحداث لمحادثة معينة
conversationEventSchema.index({ conversationId: 1, timestamp: -1 });

const ConversationEvent = mongoose.model('ConversationEvent', conversationEventSchema);

module.exports = ConversationEvent; 