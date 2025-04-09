const mongoose = require('mongoose');

/**
 * نموذج إعدادات الذكاء الاصطناعي
 * يستخدم لتخزين معلمات وتوجيهات الذكاء الاصطناعي
 */
const aiSettingsSchema = new mongoose.Schema({
  // إعدادات API
  apiKey: {
    type: String,
    required: true
  },
  apiEndpoint: {
    type: String,
    default: 'https://api.openai.com/v1/chat/completions'
  },
  model: {
    type: String,
    default: 'gpt-4o',
    enum: [
      // النماذج الرئيسية الأحدث
      'gpt-4.5-preview', 'gpt-4o', 'gpt-4o-mini',
      
      // نماذج الاستدلال (o-series)
      'o3-mini', 'o1', 'o1-mini', 'o1-pro',
      
      // نماذج الوقت الفعلي
      'gpt-4o-realtime-preview', 'gpt-4o-mini-realtime-preview',
      
      // النماذج القديمة
      'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'gpt-3.5-turbo-16k'
    ]
  },
  
  // إعدادات الوسائط المتعددة
  enableVisionSupport: {
    type: Boolean,
    default: true,
    description: 'تفعيل دعم تحليل الصور (Vision)'
  },
  enableAudioSupport: {
    type: Boolean,
    default: true,
    description: 'تفعيل دعم تحويل الصوت إلى نص'
  },
  
  // نموذج تحويل الصوت إلى نص (Whisper)
  audioToTextModel: {
    type: String,
    default: 'whisper-1',
    enum: ['whisper-1'],
    description: 'نموذج تحويل الصوت إلى نص'
  },
  
  // نموذج تحويل النص إلى صوت (TTS)
  textToSpeechModel: {
    type: String,
    default: 'tts-1',
    enum: ['tts-1', 'tts-1-hd'],
    description: 'نموذج تحويل النص إلى صوت'
  },
  
  // إعدادات الجودة
  temperature: {
    type: Number,
    default: 0.7,
    min: 0,
    max: 2
  },
  maxTokens: {
    type: Number,
    default: 800,
    min: 100,
    max: 4000
  },
  topP: {
    type: Number,
    default: 0.9,
    min: 0,
    max: 1
  },
  presencePenalty: {
    type: Number,
    default: 0.6,
    min: -2,
    max: 2
  },
  frequencyPenalty: {
    type: Number,
    default: 0.5,
    min: -2,
    max: 2
  },
  
  // إعدادات السياق والتاريخ
  conversationHistoryLimit: {
    type: Number,
    default: 15,
    min: 5,
    max: 50
  },
  previousConversationsLimit: {
    type: Number,
    default: 3,
    min: 0,
    max: 10
  },
  
  // تعليمات الذكاء الاصطناعي
  systemInstructions: {
    type: String,
    default: `أنت مساعد ذكاء اصطناعي مفيد في خدمة العملاء باسم "مساعد". 
مهمتك مساعدة العملاء بلغة عربية فصيحة ومهذبة. استخدم لهجة احترافية ولطيفة.`
  },
  
  // كلمات تحويل المحادثة لمندوب بشري
  transferKeywords: {
    type: [String],
    default: [
      // كلمات صريحة لطلب التحدث مع موظف
      'أريد التحدث مع شخص',
      'أريد التحدث إلى مندوب',
      'تحويل إلى موظف',
      'موظف حقيقي',
      'انسان حقيقي',
      'شخص حقيقي',
      'تواصل مع موظف',
      'مندوب خدمة',
      'مساعدة بشرية',
      'تحدث معي',
      
      // عبارات تعبر عن عدم الرضا
      'مساعد غير مفيد',
      'روبوت غبي',
      'لا تفهمني',
      'لم أفهم',
      'لست مفيد',
      'لم تجب على سؤالي',
      
      // طلبات خاصة قد تحتاج لتدخل بشري
      'مشكلة معقدة',
      'مشكلة في الفاتورة',
      'أطلب استرداد المبلغ',
      'إلغاء الطلب',
      'شكوى',
      'أود رفع شكوى',
      'خطأ في الطلب',
      'تأخير في التوصيل'
    ]
  },
  
  // من قام بتحديث الإعدادات
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

/**
 * الحصول على الإعدادات النشطة أو إنشاء إعدادات افتراضية إذا لم تكن موجودة
 */
aiSettingsSchema.statics.getSettings = async function() {
  // البحث عن إعدادات موجودة
  let settings = await this.findOne();
  
  // إذا لم تكن هناك إعدادات، قم بإنشاء إعدادات افتراضية
  if (!settings) {
    // القيم الافتراضية المناسبة
    const defaultMaxTokens = Math.min(parseInt(process.env.AI_MAX_TOKENS || '800'), 4000);
    const defaultHistoryLimit = Math.min(parseInt(process.env.AI_HISTORY_LIMIT || '15'), 50);
    const defaultPreviousLimit = Math.min(parseInt(process.env.AI_PREVIOUS_CONVERSATIONS_LIMIT || '3'), 10);
    
    settings = await this.create({
      apiKey: process.env.OPENAI_API_KEY || 'YOUR_API_KEY_HERE',
      apiEndpoint: process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions',
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      
      // إعدادات الوسائط المتعددة
      enableVisionSupport: process.env.AI_ENABLE_VISION !== 'false',
      enableAudioSupport: process.env.AI_ENABLE_AUDIO !== 'false',
      audioToTextModel: process.env.AI_AUDIO_TO_TEXT_MODEL || 'whisper-1',
      textToSpeechModel: process.env.AI_TEXT_TO_SPEECH_MODEL || 'tts-1',
      
      temperature: Math.min(Math.max(parseFloat(process.env.AI_TEMPERATURE || '0.7'), 0), 2),
      maxTokens: defaultMaxTokens,
      topP: Math.min(Math.max(parseFloat(process.env.AI_TOP_P || '0.9'), 0), 1),
      presencePenalty: Math.min(Math.max(parseFloat(process.env.AI_PRESENCE_PENALTY || '0.6'), -2), 2),
      frequencyPenalty: Math.min(Math.max(parseFloat(process.env.AI_FREQUENCY_PENALTY || '0.5'), -2), 2),
      conversationHistoryLimit: defaultHistoryLimit,
      previousConversationsLimit: defaultPreviousLimit,
      systemInstructions: process.env.AI_SYSTEM_INSTRUCTIONS || `أنت مساعد ذكاء اصطناعي مفيد في خدمة العملاء باسم "مساعد". 
مهمتك مساعدة العملاء بلغة عربية فصيحة ومهذبة. استخدم لهجة احترافية ولطيفة.`
    });
  }
  
  return settings;
};

const AISettings = mongoose.model('AISettings', aiSettingsSchema);

module.exports = AISettings; 