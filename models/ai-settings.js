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
      'gpt-4o', 'gpt-4o-mini',
      
      // نماذج النص إلى صورة
      'dall-e-3', 'dall-e-2',
      
      // النماذج المتقدمة
      'gpt-4-turbo', 'gpt-4-turbo-2024-04-09',
      'gpt-4-0125-preview', 'gpt-4-1106-preview', 'gpt-4-vision-preview',
      
      // النماذج الأساسية
      'gpt-3.5-turbo', 'gpt-3.5-turbo-0125', 'gpt-3.5-turbo-1106', 'gpt-3.5-turbo-instruct',
      
      // نماذج تجريبية
      'gpt-4-vision-preview'
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
    default: null
  },
  
  // كلمات تحويل المحادثة لمندوب بشري
  transferKeywords: {
    type: [String],
    default: ["تحدث مع مندوب", "تكلم مع شخص حقيقي", "أريد التحدث مع شخص", "مساعدة من مندوب", "تواصل مع مسؤول"]
  },
  
  // إعدادات خيارات OpenAI المحدثة
  seed: {
    type: Number,
    default: null
  },
  responseFormat: {
    type: String,
    enum: ['text', 'json_object', null],
    default: null
  },
  stream: {
    type: Boolean,
    default: false
  },
  
  // إضافة معرّف المستخدم للتتبع من OpenAI
  userIdentifier: {
    type: String,
    default: null
  },
  
  // إعدادات نماذج الاستجابات الجديدة
  truncation: {
    type: String,
    enum: ['disabled', 'auto', null],
    default: 'disabled'
  },
  
  // إعدادات للأدوات والوظائف
  toolChoice: {
    type: String,
    enum: ['none', 'auto', 'required', null],
    default: 'auto'
  },
  
  // إعدادات رسالة الترحيب
  greetingPrompt: {
    type: String,
    default: null
  },
  greetingModel: {
    type: String,
    default: 'gpt-3.5-turbo',
    enum: ['gpt-3.5-turbo', 'gpt-4o-mini', 'gpt-4o']
  },
  greetingTemperature: {
    type: Number,
    default: 0.8,
    min: 0,
    max: 2
  },
  
  // من قام بتحديث الإعدادات
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

/**
 * الحصول على الإعدادات النشطة أو إنشاء إعدادات افتراضية
 */
aiSettingsSchema.statics.getSettings = async function() {
  // البحث عن إعدادات موجودة
  let settings = await this.findOne();
  
  // إنشاء إعدادات افتراضية إذا لم تكن موجودة
  if (!settings) {
    // استخدام متغيرات البيئة إذا كانت متوفرة، وإلا سيتم استخدام القيم الافتراضية المحددة في المخطط
    const data = {
      apiKey: process.env.OPENAI_API_KEY || 'YOUR_API_KEY_HERE',
      apiEndpoint: process.env.OPENAI_API_ENDPOINT,
      model: process.env.OPENAI_MODEL,
      
      // إعدادات أخرى يمكن تحميلها من متغيرات البيئة
      systemInstructions: process.env.AI_SYSTEM_INSTRUCTIONS,
      greetingPrompt: process.env.AI_GREETING_PROMPT
    };
    
    // إزالة الحقول ذات القيمة undefined
    Object.keys(data).forEach(key => data[key] === undefined && delete data[key]);
    
    // إنشاء إعدادات جديدة (سيتم استخدام القيم الافتراضية المحددة في المخطط للحقول غير المحددة)
    settings = await this.create(data);
  }
  
  return settings;
};

const AISettings = mongoose.model('AISettings', aiSettingsSchema);

module.exports = AISettings;