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
  
  // إعدادات خيارات OpenAI المحدثة
  seed: {
    type: Number,
    default: null,
    description: 'قيمة عشوائية للتحكم في قدر معين من الاتساق في الإخراج'
  },
  responseFormat: {
    type: String,
    enum: ['text', 'json_object', null],
    default: null,
    description: 'تنسيق الاستجابة المطلوب'
  },
  stream: {
    type: Boolean,
    default: false,
    description: 'ما إذا كان سيتم بث الرد عبر تقنية Server-Sent Events'
  },
  
  // إضافة معرّف المستخدم للتتبع من OpenAI
  userIdentifier: {
    type: String,
    default: null,
    description: 'معرّف المستخدم النهائي للمساعدة في مراقبة سوء الاستخدام'
  },
  
  // إعدادات نماذج الاستجابات الجديدة
  truncation: {
    type: String,
    enum: ['disabled', 'auto', null],
    default: 'disabled',
    description: 'خيار تحديد كيفية تعامل النظام مع النصوص الطويلة'
  },
  
  // إعدادات للأدوات والوظائف
  toolChoice: {
    type: String,
    enum: ['none', 'auto', 'required', null],
    default: 'auto',
    description: 'كيفية اختيار النموذج للأدوات'
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
مهمتك مساعدة العملاء بلغة عربية فصيحة ومهذبة. استخدم لهجة احترافية ولطيفة.`,

      // الإعدادات الجديدة المحدثة
      seed: process.env.AI_SEED || null,
      responseFormat: process.env.AI_RESPONSE_FORMAT || null,
      stream: process.env.AI_STREAM === 'true',
      userIdentifier: process.env.AI_USER_IDENTIFIER || null,
      truncation: process.env.AI_TRUNCATION || 'disabled',
      toolChoice: process.env.AI_TOOL_CHOICE || 'auto',
      
      transferKeywords: Array.isArray(JSON.parse(process.env.AI_TRANSFER_KEYWORDS || '[]')) ? 
        JSON.parse(process.env.AI_TRANSFER_KEYWORDS || '[]') : 
        [
          "تحدث مع مندوب",
          "تكلم مع شخص حقيقي",
          "أريد التحدث مع شخص",
          "مساعدة من مندوب",
          "تواصل مع مسؤول"
        ]
    });
  }
  
  return settings;
};

const AISettings = mongoose.model('AISettings', aiSettingsSchema);

module.exports = AISettings;