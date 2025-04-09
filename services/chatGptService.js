/**
 * خدمة ChatGPT للذكاء الاصطناعي
 * هذه الخدمة تتعامل مع واجهة برمجة ChatGPT لمعالجة المحادثات تلقائياً
 */

const axios = require('axios');
const logger = require('./loggerService');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const User = require('../models/User');
const AISettings = require('../models/AiSettings');
const socketService = require('./socketService');
const FormData = require('form-data');
require('dotenv').config();

class ChatGptService {
  constructor() {
    // إعدادات API (سيتم تحميلها من قاعدة البيانات)
    this.apiKey = null;
    this.apiEndpoint = null;
    this.model = null;
    
    // إعدادات الجودة (سيتم تحميلها من قاعدة البيانات)
    this.temperature = null;
    this.maxTokens = null;
    this.topP = null;
    this.presencePenalty = null;
    this.frequencyPenalty = null;
    
    // إعدادات السياق والتاريخ (سيتم تحميلها من قاعدة البيانات)
    this.conversationHistoryLimit = null;
    this.previousConversationsLimit = null;
    
    // تعليمات الذكاء الاصطناعي (سيتم تحميلها من قاعدة البيانات)
    this.systemInstructions = null;
    
    // كلمات تحويل المحادثة لمندوب بشري (سيتم تحميلها من قاعدة البيانات)
    this.transferKeywords = [];
    
    // حالة التهيئة
    this.initialized = false;
    this.aiUserId = null;
  }

  /**
   * تهيئة الخدمة والتأكد من وجود مستخدم الذكاء الاصطناعي
   */
  async initialize() {
    try {
      // تحميل إعدادات الذكاء الاصطناعي من قاعدة البيانات
      await this.loadSettings();
      
      if (!this.apiKey) {
        logger.error('chatGptService', 'مفتاح API غير موجود. يرجى إعداد مفتاح API في إعدادات الذكاء الاصطناعي.');
        return false;
      }

      // التأكد من وجود مستخدم AI
      const aiUser = await this.ensureAiUserExists();
      this.aiUserId = aiUser._id;
      this.initialized = true;
      logger.info('chatGptService', `تم تهيئة خدمة الذكاء الاصطناعي بنجاح. مستخدم AI ID: ${this.aiUserId} | نموذج: ${this.model}`);
      return true;
    } catch (error) {
      logger.error('chatGptService', 'فشل في تهيئة خدمة الذكاء الاصطناعي:', error);
      return false;
    }
  }

  /**
   * تحميل إعدادات الذكاء الاصطناعي من قاعدة البيانات
   */
  async loadSettings() {
    try {
      // الحصول على إعدادات الذكاء الاصطناعي من قاعدة البيانات
      const settings = await AISettings.getSettings();
      
      if (settings) {
        // تحميل إعدادات API
        this.apiKey = settings.apiKey;
        this.model = settings.model;
        
        // تحديد نقطة النهاية المناسبة حسب النموذج
        this.apiEndpoint = this.determineApiEndpoint(settings.model, settings.apiEndpoint);
        
        // تحميل إعدادات الوسائط المتعددة
        this.enableVisionSupport = settings.enableVisionSupport;
        this.enableAudioSupport = settings.enableAudioSupport;
        this.audioToTextModel = settings.audioToTextModel;
        this.textToSpeechModel = settings.textToSpeechModel;
        
        // تحميل إعدادات الجودة
        this.temperature = settings.temperature;
        this.maxTokens = settings.maxTokens;
        this.topP = settings.topP;
        this.presencePenalty = settings.presencePenalty;
        this.frequencyPenalty = settings.frequencyPenalty;
        
        // تحميل إعدادات السياق والتاريخ
        this.conversationHistoryLimit = settings.conversationHistoryLimit;
        this.previousConversationsLimit = settings.previousConversationsLimit;
        
        // تحميل تعليمات الذكاء الاصطناعي
        this.systemInstructions = settings.systemInstructions;
        
        // تحميل كلمات التحويل
        this.transferKeywords = settings.transferKeywords || [];
        
        logger.info('chatGptService', 'تم تحميل إعدادات الذكاء الاصطناعي من قاعدة البيانات بنجاح');
        return true;
      } else {
        logger.error('chatGptService', 'لم يتم العثور على إعدادات الذكاء الاصطناعي في قاعدة البيانات');
        return false;
      }
    } catch (error) {
      logger.error('chatGptService', 'خطأ في تحميل إعدادات الذكاء الاصطناعي:', error);
      return false;
    }
  }

  /**
   * تحديد نقطة النهاية المناسبة بناءً على النموذج
   * @param {String} model اسم النموذج
   * @param {String} defaultEndpoint نقطة النهاية الافتراضية
   * @returns {String} نقطة النهاية المناسبة للنموذج
   */
  determineApiEndpoint(model, defaultEndpoint) {
    // نقطة النهاية الافتراضية إذا لم يتم تحديدها في الإعدادات
    const fallbackEndpoint = defaultEndpoint || 'https://api.openai.com/v1/chat/completions';
    
    // تحديد النقطة بناءً على اسم النموذج
    if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) {
      // جميع نماذج الدردشة والاستدلال الحالية تستخدم هذه النقطة
      return 'https://api.openai.com/v1/chat/completions';
    } else if (model.startsWith('whisper')) {
      // نماذج تحويل الكلام إلى نص
      return 'https://api.openai.com/v1/audio/transcriptions';
    } else if (model.startsWith('tts')) {
      // نماذج تحويل النص إلى كلام
      return 'https://api.openai.com/v1/audio/speech';
    }
    // يمكنك إضافة نقاط نهاية أخرى هنا إذا لزم الأمر (مثل التضمين)
    
    // إرجاع نقطة النهاية الافتراضية من الإعدادات أو الـ fallback
    return fallbackEndpoint;
  }

  /**
   * التأكد من وجود مستخدم للذكاء الاصطناعي
   */
  async ensureAiUserExists() {
    try {
      // بيانات مستخدم الذكاء الاصطناعي الثابتة
      const AI_USERNAME = 'ai-assistant';
      const AI_FULLNAME = 'مساعد الذكاء الاصطناعي';
      const AI_EMAIL = 'ai-assistant@system.local';
      const AI_PHONE = '00000000000';
      
      // البحث عن مستخدم الذكاء الاصطناعي
      let aiUser = await User.findOne({ username: AI_USERNAME });
      
      if (!aiUser) {
        // إنشاء كلمة مرور عشوائية آمنة
        const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).toUpperCase().slice(-10);
        
        // إنشاء مستخدم جديد للذكاء الاصطناعي
        aiUser = await User.create({
          username: AI_USERNAME,
          password: randomPassword, // سيتم تشفيرها تلقائياً بواسطة middleware
          full_name: AI_FULLNAME,
          email: AI_EMAIL,
          phone_number: AI_PHONE,
          company_name: 'النظام',
          account_status: 'active',
          user_role: 'representative',
          can_access_conversations: true
        });
        
        logger.info('chatGptService', 'تم إنشاء مستخدم الذكاء الاصطناعي بنجاح');
      } else if (aiUser.account_status !== 'active' || !aiUser.can_access_conversations || aiUser.user_role !== 'representative') {
        // تحديث صلاحيات المستخدم إذا كان موجوداً بالفعل ولكن يحتاج للتعديل
        aiUser.account_status = 'active';
        aiUser.can_access_conversations = true;
        aiUser.user_role = 'representative';
        await aiUser.save();
        
        logger.info('chatGptService', 'تم تحديث صلاحيات مستخدم الذكاء الاصطناعي');
      }
      
      return aiUser;
    } catch (error) {
      logger.error('chatGptService', 'خطأ في إنشاء مستخدم الذكاء الاصطناعي:', error);
      throw error;
    }
  }

  /**
   * الحصول على جميع المستخدمين المؤهلين للوصول إلى المحادثات
   * @returns {Promise<Array>} قائمة المستخدمين المؤهلين
   */
  async getEligibleUsers() {
    try {
      return await User.find({
        account_status: 'active',
        can_access_conversations: true,
        _id: { $ne: this.aiUserId } // استثناء مستخدم الذكاء الاصطناعي
      })
      .select('_id username full_name user_role')
      .lean();
    } catch (error) {
      logger.error('chatGptService', 'خطأ في الحصول على المستخدمين المؤهلين:', error);
      return [];
    }
  }

  /**
   * جلب سجل المحادثة السابقة مع العميل
   * @param {String} conversationId معرف المحادثة الحالية
   * @param {Number} limit عدد الرسائل الأقصى للجلب
   */
  async getConversationHistory(conversationId, limit = 10) {
    try {
      // جلب آخر عدد محدد من الرسائل
      const messages = await WhatsappMessage.find({ conversationId })
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('sentBy', 'username full_name')
        .lean();
      
      // عكس ترتيب الرسائل لتكون من الأقدم للأحدث
      return messages.reverse();
    } catch (error) {
      logger.error('chatGptService', 'خطأ في جلب سجل المحادثة:', error);
      return [];
    }
  }

  /**
   * تحويل سجل المحادثة إلى تنسيق مناسب لـ ChatGPT
   * @param {Array} messages مصفوفة من رسائل المحادثة
   * @param {Object} customerInfo معلومات العميل (اختياري)
   * @param {Array} previousConversations سجل المحادثات السابقة (اختياري)
   */
  formatMessagesForChatGPT(messages, customerInfo = null, previousConversations = []) {
    const formattedMessages = [];
    
    // إنشاء رسالة النظام مع معلومات العميل وسجل المحادثات السابقة
    let systemMessageContent = this.buildSystemMessage(customerInfo, previousConversations);
    formattedMessages.push({ role: 'system', content: systemMessageContent });

    // إضافة رسائل المحادثة
    for (const message of messages) {
      let role = 'user'; // افتراضي للرسائل الواردة من العميل
      if (message.direction === 'outgoing') {
        role = 'assistant';
      } else if (message.direction === 'internal') {
        continue; // تجاهل الملاحظات الداخلية
      }
      
      // تخطي الرسائل التي لا تحتوي على محتوى نصي أو وسائط مدعومة
      if (!message.content && !message.mediaType) continue;
      
      let contentPayload = [];

      // 1. إضافة المحتوى النصي (إن وجد)
      if (message.content) {
        contentPayload.push({ type: 'text', text: message.content });
      }

      // 2. إضافة الوسائط (الصوت تم تحويله سابقاً، لذا نركز على الصور)
      if (message.mediaType === 'image' && message.mediaUrl && this.enableVisionSupport && this.isVisionCapableModel(this.model)) {
        contentPayload.push({
          type: 'image_url',
          image_url: {
            url: message.mediaUrl,
            // يمكن إضافة detail هنا (low, high, auto) إذا لزم الأمر
            // detail: "auto"
          }
        });
      } else if (message.mediaType && !(message.mediaType === 'image' && this.enableVisionSupport && this.isVisionCapableModel(this.model))) {
        // إذا كانت هناك وسائط أخرى غير مدعومة للتحليل (أو الرؤية معطلة/النموذج غير قادر)
        // نضيف وصفًا نصيًا لها كما كان سابقًا
        const mediaDescription = this.getMediaDescription(message.mediaType);
        // إذا لم يكن هناك نص أصلاً، نستخدم الوصف كمحتوى رئيسي
        if (contentPayload.length === 0) {
          contentPayload.push({ type: 'text', text: mediaDescription });
        } else {
          // إذا كان هناك نص، نضيف الوصف إليه
          contentPayload[0].text = `${mediaDescription}${contentPayload[0].text ? ': ' + contentPayload[0].text : ''}`;
        }
      }

      // التأكد من وجود محتوى قبل إضافته
      if (contentPayload.length > 0) {
        formattedMessages.push({ role, content: contentPayload });
      }
    }
    
    return formattedMessages;
  }

  /**
   * بناء محتوى رسالة النظام
   * @param {Object} customerInfo معلومات العميل
   * @param {Array} previousConversations سجل المحادثات السابقة
   * @returns {String} محتوى رسالة النظام
   */
  buildSystemMessage(customerInfo, previousConversations) {
    let systemMessage = this.systemInstructions;

    // إضافة معلومات العميل
    if (customerInfo) {
      systemMessage += `\n\nمعلومات العميل:`;
      if (customerInfo.name) systemMessage += `\n- الاسم: ${customerInfo.name}`;
      if (customerInfo.phoneNumber) systemMessage += `\n- رقم الهاتف: ${customerInfo.phoneNumber}`;
      if (customerInfo.email) systemMessage += `\n- البريد الإلكتروني: ${customerInfo.email}`;
      if (customerInfo.company) systemMessage += `\n- الشركة: ${customerInfo.company}`;
      if (customerInfo.notes) systemMessage += `\n- ملاحظات: ${customerInfo.notes}`;
    } else {
      systemMessage += `\n\nلا توجد معلومات مسبقة عن هذا العميل. حاول جمع المعلومات الأساسية مثل الاسم أثناء المحادثة.`;
    }

    // إضافة سجل المحادثات السابقة
    if (previousConversations && previousConversations.length > 0) {
      systemMessage += `\n\nسجل المحادثات السابقة مع العميل:`;
      previousConversations.forEach((conv, index) => {
        systemMessage += `\n\nمحادثة سابقة #${index + 1} (${conv.date}):`;
        systemMessage += `\n- بدأت بـ: "${conv.firstMessage.substring(0, 100)}${conv.firstMessage.length > 100 ? '...' : ''}"`;
        systemMessage += `\n- انتهت بـ: "${conv.lastMessage.substring(0, 100)}${conv.lastMessage.length > 100 ? '...' : ''}"`;
        systemMessage += `\n- عدد الرسائل: ${conv.messageCount}`;
      });
      systemMessage += `\n\nاستخدم هذه المعلومات للتعامل بشكل أفضل مع العميل وتذكر تفاصيل التواصل السابق إذا كان ذلك مناسباً.`;
    }

    // تعليمات خاصة بمعالجة اسم العميل
    const customerName = customerInfo?.name || 'العميل';
    systemMessage += `\n\nتعليمات خاصة بمعالجة اسم العميل:
1. قمت بتزويدك باسم العميل: "${customerName}"
2. يجب عليك تحليل هذا الاسم لتحديد ما إذا كان اسم شخص فعلاً أو شيء آخر (مثل اسم شركة أو معرّف)
3. إذا كان اسم شخص، استخدم الاسم الأول فقط عند مخاطبته (مثلاً: إذا كان الاسم "حسام الدين مظلوم"، خاطبه بـ "حسام" فقط)
4. إذا كان الاسم باللغة اللاتينية وتتحدث مع العميل بالعربية، حاول استخدام الاسم بالعربية إذا أمكن
5. إذا لم يكن اسم شخص أو لا تستطيع تحديد ذلك بشكل واضح، استخدم كلمة "عزيزي العميل" أو لا تستخدم الاسم مطلقاً
6. تجنب استخدام الاسم الكامل في المخاطبة، فهذا يبدو رسمياً وغير طبيعي`;

    // إضافة تعليمات التعامل مع العميل
    systemMessage += `\n\nتعليمات التعامل مع العميل:
1. كن مفيداً ودقيقاً ومختصراً في ردودك
2. إذا طلب معلومات تقنية معقدة أو كانت المشكلة تحتاج لتدخل بشري، أخبره بلطف أنك ستقوم بتحويله لمندوب خدمة عملاء
3. لا تخترع معلومات غير موجودة عن العميل أو عن خدماتنا
4. حافظ على أدب الحوار دائماً مهما كانت طريقة التحدث من قبل العميل
5. ذكّر العميل بأنك مساعد آلي إذا سأل عن طبيعتك`;

    return systemMessage;
  }
  
  /**
   * التحقق مما إذا كان النموذج يدعم الرؤية
   * @param {String} model اسم النموذج
   * @returns {Boolean}
   */
  isVisionCapableModel(model) {
    // قائمة النماذج المعروفة بدعم الرؤية
    const visionModels = ['gpt-4o', 'gpt-4.5-preview', 'gpt-4-turbo']; // قد تحتاج للتحديث
    return visionModels.some(vm => model.startsWith(vm));
  }

  /**
   * الحصول على وصف نوع الوسائط
   * @param {String} mediaType نوع الوسائط
   */
  getMediaDescription(mediaType) {
    switch (mediaType) {
      case 'image': return '[صورة]';
      case 'audio': return '[رسالة صوتية]';
      case 'video': return '[فيديو]';
      case 'document': return '[مستند]';
      case 'sticker': return '[ملصق]';
      case 'location': return '[موقع]';
      default: return '[وسائط]';
    }
  }

  /**
   * إرسال المحادثة إلى ChatGPT للحصول على رد
   * @param {Array} formattedMessages الرسائل المنسقة
   */
  async getChatGptResponse(formattedMessages) {
    try {
      if (!this.initialized || !this.apiKey) {
        throw new Error('لم يتم تهيئة خدمة الذكاء الاصطناعي بشكل صحيح');
      }

      // إعداد متغيرات الطلب
      let apiUrl = this.apiEndpoint;
      let data = {
        model: this.model,
        messages: formattedMessages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        top_p: this.topP,
        presence_penalty: this.presencePenalty,
        frequency_penalty: this.frequencyPenalty
      };

      // تعديل هيكل الطلب حسب النموذج
      if (this.model.startsWith('o1') || this.model.startsWith('o3')) {
        // نماذج الاستدلال تستخدم بنية مختلفة للطلب
        data = {
          model: this.model,
          input: {
            messages: formattedMessages
          },
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          top_p: this.topP,
        };
      }
      
      // التحقق إذا كانت الرسائل تحتوي على صور والتأكد من دعم النموذج
      const containsImages = this.checkIfMessagesContainImages(formattedMessages);
      const supportsVision = this.isVisionCapableModel(this.model);
      
      if (containsImages && !supportsVision) {
        logger.warn('chatGptService', `تم اكتشاف صور في الرسائل ولكن النموذج ${this.model} لا يدعم الرؤية. يفضل استخدام نموذج مثل gpt-4o.`);
      }
      
      logger.info('chatGptService', `إرسال طلب إلى OpenAI: نموذج=${this.model}, دعم الرؤية=${supportsVision}, تحتوي على صور=${containsImages}`);
      
      const response = await axios.post(
        apiUrl,
        data,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );
      
      // معالجة الاستجابة حسب نوع النموذج
      if (this.model.startsWith('o1') || this.model.startsWith('o3')) {
        // نماذج الاستدلال لها بنية استجابة مختلفة
        if (response.data && response.data.output && response.data.output.message) {
          return response.data.output.message.content;
        }
      } else {
        // معالجة الاستجابة للنماذج القياسية
        if (response.data && response.data.choices && response.data.choices.length > 0) {
          // رد النموذج قد يكون محتوى نصيًا أو كائن محتوى
          const message = response.data.choices[0].message;
          
          if (typeof message.content === 'string') {
            return message.content;
          } else if (Array.isArray(message.content)) {
            // استخراج النصوص من كائن المحتوى المركب
            return message.content
              .filter(item => item.type === 'text')
              .map(item => item.text)
              .join('\n');
          }
        }
      }

      // إذا لم نجد الرد في أي من الحالات
      throw new Error('لم يتم الحصول على رد من OpenAI');
      
    } catch (error) {
      const errorDetails = error.response?.data || error.message;
      logger.error('chatGptService', `خطأ في الحصول على رد من OpenAI: ${JSON.stringify(errorDetails)}`);
      return null;
    }
  }

  /**
   * التحقق مما إذا كانت الرسائل تحتوي على صور
   * @param {Array} messages الرسائل المنسقة
   * @returns {Boolean}
   */
  checkIfMessagesContainImages(messages) {
    if (!messages || !Array.isArray(messages)) {
      return false;
    }
    
    for (const message of messages) {
      if (message.content && Array.isArray(message.content)) {
        for (const contentItem of message.content) {
          if (contentItem.type === 'image_url') {
            return true;
          }
        }
      }
    }
    
    return false;
  }

  /**
   * معالجة رسالة واردة جديدة باستخدام ChatGPT
   * @param {Object} conversation المحادثة
   * @param {Object} message الرسالة الواردة الجديدة
   */
  async processIncomingMessage(conversation, message) {
    try {
      if (!this.initialized || !this.aiUserId) {
        await this.initialize();
      }
      
      let messageContent = message.content;
      let mediaType = message.mediaType;
      let mediaUrl = message.mediaUrl;
      
      // التحقق من وجود وسائط صوتية وتفعيل الدعم
      if (mediaType === 'audio' && mediaUrl && this.enableAudioSupport) {
        const transcribedText = await this.transcribeAudio(mediaUrl);
        if (transcribedText) {
          logger.info('chatGptService', 'تم تحويل الرسالة الصوتية إلى النص:', transcribedText);
          // استخدام النص المحول كمحتوى للرسالة
          messageContent = transcribedText;
          // يمكن إزالة الوسائط أو تغيير نوعها إلى نص
          mediaType = null; 
          mediaUrl = null;
        } else {
          logger.warn('chatGptService', 'فشل تحويل الرسالة الصوتية، سيتم تجاهل محتواها الصوتي.');
          // إذا فشل التحويل، يمكنك اختيار تجاهل الرسالة أو إرسال رسالة خطأ بسيطة
          // في الوقت الحالي، سنتجاهل المحتوى الصوتي ونعتمد على النص إن وجد
          if (!messageContent) {
            // إذا لم يكن هناك نص مرفق، قد نرسل رسالة تفيد بعدم القدرة على معالجة الصوت
            // return await this.sendProcessingErrorMessage(conversation, "لم نتمكن من معالجة الرسالة الصوتية.");
            return null; // أو ببساطة نتجاهل الرسالة
          }
        }
      } 
      // لاحقًا: أضف هنا معالجة الصور إذا كان mediaType === 'image' و enableVisionSupport مفعل
      
      // التحقق إذا كانت الرسالة تحتاج لتدخل بشري (بعد تحويل الصوت إذا لزم الأمر)
      logger.info('chatGptService', 'فحص حاجة العميل للتدخل البشري', { 
        conversationId: conversation._id,
        messageContent: messageContent?.substring(0, 50) || `[${mediaType}]` // عرض نوع الوسائط إذا لم يكن هناك نص
      });
      
      const needsHumanInterventionCheck = await this.shouldTransferToHuman(messageContent);
      
      if (needsHumanInterventionCheck) {
        logger.info('chatGptService', 'تم اكتشاف حاجة لتدخل بشري:', { 
          conversationId: conversation._id, 
          messagePreview: messageContent.substring(0, 100)
        });
        
        // إنشاء رسالة تنبيه للعميل
        logger.info('chatGptService', 'إنشاء رسالة تنبيه للعميل بالتحويل');
        const responseMessage = await WhatsappMessage.createOutgoingMessage(
          conversation._id,
          'شكراً لتواصلك معنا. سيتم تحويلك لمندوب خدمة عملاء حقيقي في أقرب وقت.',
          this.aiUserId
        );
        
        return responseMessage;
      }
      
      // جلب معلومات العميل من قاعدة البيانات
      const customerInfo = await this.getCustomerInformation(conversation);
      
      // جلب سجل المحادثات السابقة للعميل
      const previousConversations = await this.getCustomerPreviousConversations(conversation.phoneNumber);
      
      // جلب سجل المحادثة السابقة
      const conversationHistory = await this.getConversationHistory(conversation._id, this.conversationHistoryLimit);
      
      // إنشاء كائن رسالة جديد بمعلومات محدثة (نص محول، بدون وسائط صوتية)
      const processedMessage = {
        ...message,
        content: messageContent,
        mediaType: mediaType,
        mediaUrl: mediaUrl
      };
      
      // إضافة الرسالة الجديدة (المعالجة) الواردة إلى نهاية السجل
      conversationHistory.push(processedMessage);
      
      // تحويل المحادثة إلى تنسيق مناسب لـ ChatGPT مع إضافة معلومات العميل
      const formattedMessages = this.formatMessagesForChatGPT(
        conversationHistory, 
        customerInfo, 
        previousConversations
      );
      
      // الحصول على رد من ChatGPT
      const aiResponse = await this.getChatGptResponse(formattedMessages);
      
      if (!aiResponse) {
        logger.error('chatGptService', 'لم يتم الحصول على رد من ChatGPT');
        return null;
      }
      
      // إنشاء رسالة رد من الذكاء الاصطناعي
      const responseMessage = await WhatsappMessage.createOutgoingMessage(
        conversation._id,
        aiResponse,
        this.aiUserId
      );
      
      return responseMessage;
    } catch (error) {
      logger.error('chatGptService', 'خطأ في معالجة الرسالة الواردة:', error);
      return null;
    }
  }

  /**
   * تحليل محتوى الرسالة لتحديد إذا كان يجب تعيين المحادثة لمندوب بشري
   * @param {String} messageContent محتوى الرسالة
   */
  async shouldTransferToHuman(messageContent) {
    try {
      if (!messageContent) return false;
      
      // التأكد من وجود كلمات التحويل
      if (!this.transferKeywords || this.transferKeywords.length === 0) {
        // تحميل الإعدادات من قاعدة البيانات إذا لم تكن كلمات التحويل متوفرة
        await this.loadSettings();
      }
      
      // تحويل النص إلى أحرف صغيرة للمقارنة الدقيقة
      const lowerCaseMessage = messageContent.toLowerCase();
      
      // البحث عن الكلمات المفتاحية في الرسالة
      for (const keyword of this.transferKeywords) {
        const lowerKeyword = keyword.trim().toLowerCase();
        if (lowerCaseMessage.includes(lowerKeyword)) {
          logger.info('chatGptService', 'تم اكتشاف طلب للتحويل لمندوب بشري', { 
            keyword: lowerKeyword,
            messagePreview: messageContent.substring(0, 100)
          });
          return true;
        }
      }
      
      // فحص علامات الغضب أو الإحباط
      const angerIndicators = ['!!!', '???', '؟؟؟', '!!!؟؟؟', 'غير مقبول', 'سيء', 'خدمة سيئة'];
      
      for (const indicator of angerIndicators) {
        if (lowerCaseMessage.includes(indicator.toLowerCase())) {
          // إذا كانت الرسالة طويلة وتحتوي على علامات غضب، فقد تحتاج لتدخل بشري
          if (messageContent.length > 100) {
            logger.info('chatGptService', 'تم اكتشاف علامات إحباط/غضب في رسالة طويلة', { 
              indicator,
              messageLength: messageContent.length
            });
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      logger.error('chatGptService', 'خطأ في تحليل محتوى الرسالة:', error);
      return false;
    }
  }

  /**
   * جلب معلومات العميل من قاعدة البيانات
   * @param {Object} conversation كائن المحادثة
   * @returns {Object} معلومات العميل
   */
  async getCustomerInformation(conversation) {
    try {
      if (!conversation) return null;
      
      // استدعاء نموذج جهات الاتصال
      const Contact = require('../models/Contact');
      
      // فحص وجود معرف جهة اتصال في المحادثة
      if (conversation.contactId) {
        // جلب معلومات جهة الاتصال من قاعدة البيانات
        const contact = await Contact.findById(conversation.contactId).lean();
        
        if (contact) {
          return {
            name: contact.name,
            phoneNumber: contact.phoneNumber,
            email: contact.email,
            company: contact.company,
            notes: contact.notes
          };
        }
      }
      
      // إذا لم يتم العثور على جهة اتصال، استخدم المعلومات المتوفرة في المحادثة
      return {
        name: conversation.customerName || 'العميل',
        phoneNumber: conversation.phoneNumber,
        // لا توجد معلومات إضافية متوفرة
      };
    } catch (error) {
      logger.error('chatGptService', 'خطأ في جلب معلومات العميل:', error);
      // إرجاع معلومات بسيطة في حالة الخطأ
      return {
        name: conversation.customerName || 'العميل',
        phoneNumber: conversation.phoneNumber
      };
    }
  }

  /**
   * جلب محادثات العميل السابقة باستخدام رقم الهاتف
   * @param {String} phoneNumber رقم هاتف العميل
   * @param {Number} limit عدد المحادثات الأقصى للجلب
   * @returns {Array} سجل ملخص للمحادثات السابقة
   */
  async getCustomerPreviousConversations(phoneNumber, limit = 3) {
    try {
      if (!phoneNumber) return [];
      
      // استدعاء نموذج المحادثات
      const Conversation = require('../models/Conversation');
      
      // جلب المحادثات السابقة للعميل (باستثناء المحادثة الحالية)
      const previousConversations = await Conversation.find({
        phoneNumber: phoneNumber,
        status: 'closed' // فقط المحادثات المغلقة (المكتملة سابقاً)
      })
      .sort({ lastMessageAt: -1 }) // أحدث المحادثات أولاً
      .limit(limit)
      .lean();
      
      if (!previousConversations || previousConversations.length === 0) {
        return [];
      }
      
      // جلب ملخص للمحادثات السابقة
      const conversationSummaries = [];
      
      for (const conv of previousConversations) {
        // جلب أول وآخر رسالة من كل محادثة
        const firstMessage = await WhatsappMessage.findOne({
          conversationId: conv._id
        })
        .sort({ timestamp: 1 })
        .lean();
        
        const lastMessage = await WhatsappMessage.findOne({
          conversationId: conv._id
        })
        .sort({ timestamp: -1 })
        .lean();
        
        if (firstMessage && lastMessage) {
          conversationSummaries.push({
            date: conv.lastMessageAt ? new Date(conv.lastMessageAt).toISOString().split('T')[0] : 'غير معروف',
            firstMessage: firstMessage.content || '(رسالة وسائط)',
            lastMessage: lastMessage.content || '(رسالة وسائط)',
            messageCount: await WhatsappMessage.countDocuments({ conversationId: conv._id })
          });
        }
      }
      
      return conversationSummaries;
    } catch (error) {
      logger.error('chatGptService', 'خطأ في جلب محادثات العميل السابقة:', error);
      return [];
    }
  }

  /**
   * الحصول على مندوب بشري متاح يمكن تعيين المحادثة له
   * @returns {Promise<Object|null>} كائن المستخدم المندوب أو null إذا لم يتم العثور على أحد
   */
  async getAvailableHumanAgent() {
    try {
      const eligibleUsers = await this.getEligibleUsers();
      
      if (!eligibleUsers || eligibleUsers.length === 0) {
        logger.warn('chatGptService', 'لا يوجد مندوبين بشريين مؤهلين للتعيين');
        return null;
      }
      const randomIndex = Math.floor(Math.random() * eligibleUsers.length);
      return eligibleUsers[randomIndex];
    } catch (error) {
      logger.error('chatGptService', 'خطأ في الحصول على مندوب بشري متاح:', error);
      return null;
    }
  }

  /**
   * تحويل ملف صوتي إلى نص باستخدام OpenAI Whisper API
   * @param {String} audioUrl رابط الملف الصوتي
   * @returns {Promise<String|null>} النص المحول أو null في حالة الفشل
   */
  async transcribeAudio(audioUrl) {
    if (!this.enableAudioSupport || !audioUrl) {
      return null;
    }

    try {
      logger.info('chatGptService', `بدء تحويل الصوت من الرابط: ${audioUrl}`);
      
      // 1. تحميل الملف الصوتي كـ Buffer
      const audioResponse = await axios({
        method: 'get',
        url: audioUrl,
        responseType: 'arraybuffer' 
      });

      if (audioResponse.status !== 200) {
        throw new Error(`فشل تحميل الملف الصوتي: ${audioResponse.statusText}`);
      }
      const audioBuffer = Buffer.from(audioResponse.data);

      // 2. إعداد بيانات الطلب لـ OpenAI باستخدام form-data
      const formData = new FormData();
      formData.append('file', audioBuffer, { filename: 'audio.ogg' }); // تمرير Buffer واسم الملف
      formData.append('model', this.audioToTextModel);
      formData.append('response_format', 'text'); // نريد نصاً مباشراً

      // 3. إرسال الطلب إلى OpenAI
      const transcriptionEndpoint = 'https://api.openai.com/v1/audio/transcriptions';
      const transcriptionResponse = await axios.post(
        transcriptionEndpoint,
        formData,
        {
          headers: {
            ...formData.getHeaders(), // مكتبة form-data توفر هذه الدالة
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      if (transcriptionResponse.status === 200 && typeof transcriptionResponse.data === 'string') {
        logger.info('chatGptService', 'تم تحويل الصوت إلى نص بنجاح');
        return transcriptionResponse.data; // OpenAI ترجع النص مباشرة
      } else {
        throw new Error(`فشل تحويل الصوت: ${JSON.stringify(transcriptionResponse.data)}`);
      }

    } catch (error) {
      const errorDetails = error.response?.data || error.message;
      logger.error('chatGptService', `خطأ في تحويل الصوت: ${JSON.stringify(errorDetails)}`);
      // قد نضيف رسالة خطأ بسيطة للعميل هنا إذا لزم الأمر
      return null;
    }
  }
}

// إنشاء نسخة واحدة من الخدمة للاستخدام في جميع أنحاء التطبيق
const chatGptService = new ChatGptService();

module.exports = chatGptService; 