/**
 * خدمة ChatGPT للذكاء الاصطناعي
 * هذه الخدمة تتعامل مع واجهة برمجة ChatGPT لمعالجة المحادثات تلقائياً
 */

const axios = require('axios');
const logger = require('./loggerService');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const User = require('../models/User');
const AISettings = require('../models/ai-settings');
const socketService = require('./socketService');
const FormData = require('form-data');
const notificationSocketService = require('./notificationSocketService');
const ContactHelper = require('../utils/contactHelper');
require('dotenv').config();

class ChatGptService {
  constructor() {
    // إعدادات API (سيتم تحميلها من قاعدة البيانات)
    this.apiKey = null;
    this.apiEndpoint = null;
    this.model = null;
    
    // إعدادات الوسائط المتعددة
    this.enableVisionSupport = true;
    this.enableAudioSupport = true;
    this.audioToTextModel = 'whisper-1';
    this.textToSpeechModel = 'tts-1';
    
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
    
    // إعدادات رسالة الترحيب (سيتم تحميلها من قاعدة البيانات)
    this.greetingPrompt = null;
    this.greetingModel = 'gpt-3.5-turbo';
    this.greetingTemperature = 0.8;
    
    // حالة التهيئة
    this.initialized = false;
    this.aiUserId = null;
    
    // إعدادات محدثة
    this.seed = null;
    this.responseFormat = null;
    this.stream = false;
    this.userIdentifier = null;
    this.truncation = 'disabled';
    this.toolChoice = 'auto';
    
    // المعرف الفريد للاستجابة لتتبع التصحيح والاستعلام
    this.lastRequestId = null;
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
        
        // تحميل إعدادات جديدة
        this.seed = settings.seed;
        this.responseFormat = settings.responseFormat;
        this.userIdentifier = settings.userIdentifier;
        this.stream = settings.stream;
        this.truncation = settings.truncation;
        this.toolChoice = settings.toolChoice;
        
        // تحميل إعدادات رسالة الترحيب
        this.greetingPrompt = settings.greetingPrompt || null;
        this.greetingModel = settings.greetingModel || 'gpt-3.5-turbo';
        this.greetingTemperature = settings.greetingTemperature !== undefined ? settings.greetingTemperature : 0.8;

        // تسجيل معلومات مفصلة للتصحيح
        logger.info('chatGptService', 'تم تحميل إعدادات الذكاء الاصطناعي من قاعدة البيانات بنجاح', {
          model: this.model,
          hasSystemInstructions: this.systemInstructions ? 'نعم' : 'لا',
          systemInstructionsLength: this.systemInstructions ? this.systemInstructions.length : 0,
          systemInstructionsPreview: this.systemInstructions ? `${this.systemInstructions.substring(0, 50)}...` : 'فارغة'
        });
        
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
    // تعيين نقاط النهاية المخصصة للنماذج المختلفة
    if (model.startsWith('dall-e')) {
      // نماذج DALL-E للصور
      return 'https://api.openai.com/v1/images/generations';
    } else if (model === 'whisper-1') {
      // نموذج Whisper لتحويل الصوت إلى نص
      return 'https://api.openai.com/v1/audio/transcriptions';
    } else if (model.startsWith('tts-')) {
      // نماذج TTS لتحويل النص إلى صوت
      return 'https://api.openai.com/v1/audio/speech';
    } else {
      // النماذج النصية
      return 'https://api.openai.com/v1/chat/completions';
    }
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
   * @param {String} systemMessageContent محتوى رسالة النظام
   * @param {Object} customerInfo معلومات العميل (اختياري)
   * @param {Array} previousConversations سجل المحادثات السابقة (اختياري)
   */
  formatMessagesForChatGPT(messages, systemMessageContent) {
    const formattedMessages = [];
    
    // إضافة رسالة النظام
    formattedMessages.push({ role: 'system', content: systemMessageContent });

    // تسجيل التصحيح لرسالة النظام النهائية
    logger.debug('chatGptService', 'استخدام رسالة النظام', {
      length: systemMessageContent.length,
      firstChars: systemMessageContent.substring(0, 80) + '...'
    });

    // إضافة رسائل المحادثة
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      // تحديد الدور (مستخدم أو مساعد)
      const role = message.direction === 'incoming' ? 'user' : 'assistant';
      
      // محتوى الرسالة
      let content = message.content || '';
      
      // إضافة وصف للوسائط إذا كانت موجودة ولم يكن هناك محتوى نصي
      if (message.mediaType && !content) {
        content = this.getMediaDescription(message.mediaType);
      }
      
      // تخطي الرسالة إذا لم يكن هناك محتوى نصي أو وسائط صور صالحة
      if (!content.trim() && !(message.mediaType === 'image' && message.mediaUrl)) {
        continue;
      }
      
      // معالجة خاصة للصور إذا كانت موجودة ونموذج الذكاء الاصطناعي يدعم الرؤية
      if (message.mediaType === 'image' && message.mediaUrl && this.isVisionCapableModel(this.model)) {
        // إنشاء مصفوفة content للصور
        const imgContent = [];
        let skipImageProcessing = false;

        // إضافة النص إذا وجد وكان مختلفاً عن الوصف الافتراضي للصورة
        if (content && content !== '[صورة]') {
          imgContent.push({ type: 'text', text: content });
        }

        // التحقق من رابط الصورة وتكوينه إذا لزم الأمر
        let accessibleImageUrl = message.mediaUrl;
        const isMetaId = /^\\d+$/.test(accessibleImageUrl) || (accessibleImageUrl.includes('/') && /^\\d+$/.test(accessibleImageUrl.split('/').pop()));

        if (!accessibleImageUrl.startsWith('data:image/') && (isMetaId || !accessibleImageUrl.startsWith('http'))) {
          if (message._id) {
            const baseUrl = process.env.BASE_URL || 'https://lic.tic-ly.com';
            accessibleImageUrl = `${baseUrl}/whatsapp/media/content/${message._id}`;
            logger.info('chatGptService (formatMessages v2)', `تم تحويل رابط الصورة إلى: ${accessibleImageUrl}`);
          } else {
            logger.warn('chatGptService (formatMessages v2)', 'لا يمكن تحويل رابط الصورة - لا يوجد معرّف رسالة');
            skipImageProcessing = true;
            // إضافة وصف نصي بديل إذا لم يكن هناك نص أصلاً
            if (imgContent.length === 0) {
              imgContent.push({ type: 'text', text: '[صورة غير متاحة]' });
            }
          }
        }
        
        // إضافة الصورة فقط إذا لم يتم تخطي المعالجة وكان الرابط صالحاً
        if (!skipImageProcessing && accessibleImageUrl) {
          imgContent.push({
            type: 'image_url',
            image_url: { 
              url: accessibleImageUrl,
              detail: "auto" 
            }
          });
        }
        
        // إضافة الرسالة بمحتوى الصورة أو الوصف النصي
        if (imgContent.length > 0) { 
          formattedMessages.push({
            role,
            content: imgContent
          });
        }
      } else if (content.trim()) { // إضافة الرسالة النصية فقط إذا كان هناك محتوى نصي
        formattedMessages.push({
          role,
          content
        });
      }
    }
    
    // تسجيل عدد الرسائل المنسقة للتصحيح
    logger.debug('chatGptService', 'مجموع الرسائل المنسقة للمحادثة', {
      totalMessages: formattedMessages.length,
      systemMessagePresent: formattedMessages.length > 0 && formattedMessages[0].role === 'system'
    });
    
    return formattedMessages;
  }

  /**
   * بناء محتوى رسالة النظام
   * @param {Object} customerInfo معلومات العميل
   * @param {Array} previousConversations سجل المحادثات السابقة
   * @returns {Promise<String>} محتوى رسالة النظام
   */
  async buildSystemMessage(customerInfo, previousConversations) {
    // التأكد من أن تعليمات النظام هي نص صالح وغير فارغة
    let systemMessage = (this.systemInstructions && this.systemInstructions.trim()) 
      ? this.systemInstructions 
      : 'أنت مساعد ذكي مفيد.';
    
    // تسجيل تعليمات النظام المستخدمة للتصحيح
    logger.debug('chatGptService', 'إعداد تعليمات النظام', {
      systemInstructionsLength: systemMessage.length,
      systemInstructionsFirst50Chars: systemMessage.substring(0, 50) + '...',
      fromDefault: !this.systemInstructions || !this.systemInstructions.trim()
    });

    // إضافة معلومات العميل إذا كانت متاحة
    if (customerInfo) {
      systemMessage += `\n\nمعلومات العميل:`;
      if (customerInfo.name) systemMessage += `\n- الاسم: "${customerInfo.name}"`;
      if (customerInfo.email) systemMessage += `\n- البريد الإلكتروني: ${customerInfo.email}`;
      if (customerInfo.phone) systemMessage += `\n- رقم الهاتف: ${customerInfo.phone}`;
      if (customerInfo.company) systemMessage += `\n- الشركة: ${customerInfo.company}`;
      if (customerInfo.customId) systemMessage += `\n- الرقم التعريفي: ${customerInfo.customId}`;
      if (customerInfo.notes) systemMessage += `\n- ملاحظات: ${customerInfo.notes}`;
      if (customerInfo.plan) systemMessage += `\n- الباقة: ${customerInfo.plan}`;
      if (customerInfo.isActive !== undefined) systemMessage += `\n- الحساب ${customerInfo.isActive ? 'نشط' : 'غير نشط'}`;
      if (customerInfo.subscriptionExpiryDate) {
        const expiryDate = new Date(customerInfo.subscriptionExpiryDate);
        systemMessage += `\n- تاريخ انتهاء الاشتراك: ${expiryDate.toISOString().split('T')[0]}`;
      }
    }

    // إضافة معلومات المندوبين المتاحين
    try {
      const agents = await this.getEligibleUsers();
      if (agents && agents.length > 0) {
        systemMessage += `\n\nقائمة المندوبين المتاحين للمساعدة:`;
        agents.forEach((agent, index) => {
          systemMessage += `\n- المندوب #${index + 1}: ${agent.full_name || agent.username} (${agent.user_role === 'admin' ? 'مدير' : 'مندوب'})`;
        });
        
        // تعليمات حول مشاركة قائمة المندوبين المتاحين عند طلبها
        systemMessage += `\n\nإذا سأل العميل عن المندوبين أو الموظفين المتاحين:
1. شارك معه القائمة أعلاه مع أسماء المندوبين وأدوارهم. 
2. اشرح له أنه يمكنه اختيار التحدث مع أي منهم.
3. اسأله إذا كان يرغب في التواصل مع أحدهم.
4. اتبع خطوات التحويل إذا طلب ذلك.`;
        
        // تعليمات حول كيفية التعامل مع طلبات تحويل المحادثة للمندوبين
        systemMessage += `\n\nإذا طلب العميل التحدث مع مندوب بشري أو مع مندوب معين، اتبع الخطوات التالية:

1. أولاً، اطلب التأكيد من العميل مع توضيح تبعات قراره:
   - اشرح أنه بعد التحويل للمندوب، لن تتمكن أنت (المساعد الذكي) من الرد على رسائله المستقبلية.
   - ستكون جميع تفاعلات المحادثة مع المندوب البشري فقط.
   - سيتمكن المندوب من رؤية تاريخ المحادثة السابقة.
   - سيستمر التحويل حتى يقوم المندوب بإغلاق المحادثة.

2. اسأل العميل إذا كان لديه مندوب محدد يرغب في التحدث معه:
   - إذا ذكر العميل اسماً محدداً، اذكر أنك ستقوم بتحويله إلى ذلك المندوب.
   - إذا لم يذكر اسماً محدداً، اذكر أنك ستقوم بتحويله إلى أحد المندوبين المتاحين.

3. اطلب منه تأكيد التحويل بشكل واضح، مثال:
   "هل ترغب بالتأكيد في تحويل المحادثة إلى مندوب بشري؟ بعد التحويل لن أتمكن من الرد على رسائلك."

4. فقط بعد تلقي التأكيد الإيجابي من العميل، استخدم علامة التحويل التالية في نهاية رسالتك:
   [تحويل:اسم_المندوب]

5. بعد التأكيد وقبل علامة التحويل، أخبر العميل:
   - أنك قمت بتعيين المحادثة للمندوب (اذكر اسم المندوب).
   - أنه سيتولى الرد على استفساراته قريباً.
   - أنك لن تتمكن من المساعدة بعد الآن في هذه المحادثة.

مثال لاستجابة كاملة بعد التأكيد:
"تم تعيين المحادثة للمندوب أحمد، وسيقوم بالرد على استفساراتك قريباً. لن أتمكن من الرد على رسائلك المستقبلية حتى يقوم المندوب بإغلاق المحادثة. شكراً لتفهمك. [تحويل:أحمد]"

هام: لا تستخدم علامة [تحويل:] دون تأكيد صريح من العميل بعد توضيح التبعات.`;
      }
    } catch (error) {
      logger.error('chatGptService', 'خطأ في الحصول على المندوبين المتاحين للإرسال في رسالة النظام', error);
    }

    // إضافة ملخص المحادثات السابقة
    if (previousConversations && previousConversations.length > 0) {
      systemMessage += `\n\nملخص المحادثات السابقة:`;
      previousConversations.forEach((conv, index) => {
        systemMessage += `\n\nمحادثة #${index + 1} (${new Date(conv.startTime).toISOString().split('T')[0]})`;
        systemMessage += `\n- بدأت بـ: "${conv.firstMessage.substring(0, 100)}${conv.firstMessage.length > 100 ? '...' : ''}"`;
        systemMessage += `\n- انتهت بـ: "${conv.lastMessage.substring(0, 100)}${conv.lastMessage.length > 100 ? '...' : ''}"`;
        systemMessage += `\n- عدد الرسائل: ${conv.messageCount}`;
      });
      systemMessage += `\n\nاستخدم هذه المعلومات للتعامل بشكل أفضل مع العميل وتذكر تفاصيل التواصل السابق إذا كان ذلك مناسباً.`;
    }

    return systemMessage;
  }

  /**
   * التحقق مما إذا كان النموذج يدعم الرؤية
   * @param {String} model اسم النموذج
   * @returns {Boolean}
   */
  isVisionCapableModel(model) {
    // قائمة النماذج المعروفة بدعم الرؤية وفقاً لتوثيق OpenAI الرسمي
    const visionModels = ['gpt-4o', 'gpt-4-vision-preview', 'gpt-4-turbo'];
    return visionModels.some(vm => model.includes(vm));
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
      // التحقق من تنسيق الرسائل
      if (!Array.isArray(formattedMessages) || formattedMessages.length === 0) {
        throw new Error('الرسائل المقدمة ليست مصفوفة أو أنها فارغة');
      }

      // التحقق مما إذا كانت الرسائل تحتوي على صور
      const containsImages = this.checkIfMessagesContainImages(formattedMessages);
      
      // الإعدادات الأساسية للطلب
      const requestData = {
        model: this.model,
        messages: formattedMessages,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
        top_p: this.topP,
        presence_penalty: this.presencePenalty,
        frequency_penalty: this.frequencyPenalty
      };
      
      // إذا كان هناك صور، تأكد من استخدام نموذج يدعم الرؤية
      if (containsImages && !this.isVisionCapableModel(this.model)) {
        logger.warn('chatGptService', 'الرسائل تحتوي على صور ولكن النموذج المُحدد لا يدعم تحليل الصور');
        
        // تصفية محتوى الصور من الرسائل إذا كان النموذج لا يدعم الرؤية
        requestData.messages = formattedMessages.map(msg => {
          if (msg.content && Array.isArray(msg.content)) {
            return {
              ...msg,
              content: msg.content
                .filter(item => item.type !== 'image_url')
                .map(item => item.text || '')
                .join('\n')
            };
          }
          return msg;
        });
      }
      
      // إضافة الخيارات المتقدمة إذا كانت متوفرة
      if (this.seed !== null && this.seed !== undefined) {
        requestData.seed = this.seed;
      }
      
      if (this.responseFormat) {
        requestData.response_format = { type: this.responseFormat };
      }
      
      if (this.userIdentifier) {
        requestData.user = this.userIdentifier;
      }
      
      if (this.truncation && this.truncation !== 'disabled') {
        requestData.truncation = this.truncation;
      }
      
      if (this.toolChoice && this.toolChoice !== 'auto') {
        requestData.tool_choice = this.toolChoice;
      }
      
      // التحقق من خيار التدفق واستخدام التنفيذ المناسب
      if (this.stream) {
        return await this.getChatGptStreamingResponse(requestData);
      }
      
      // إرسال الطلب إلى واجهة برمجة التطبيقات
      logger.debug('chatGptService', 'إرسال طلب إلى OpenAI', {
        apiEndpoint: this.apiEndpoint,
        model: this.model,
        messagesCount: formattedMessages.length,
        containsImages
      });
      
      const response = await axios.post(
        this.apiEndpoint,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      // حفظ معرف الطلب للتصحيح
      this.lastRequestId = response.headers['x-request-id'];
      
      // استخراج الرد من استجابة OpenAI
      const result = response.data;
      
      if (!result.choices || result.choices.length === 0) {
        throw new Error('لم يتم استلام خيارات في الرد من OpenAI');
      }
      
      const aiMessage = result.choices[0].message.content;
      
      // تسجيل المعلومات حول الاستخدام
      logger.debug('chatGptService', 'استلام رد من OpenAI', {
        tokens: result.usage,
        modelUsed: result.model,
        systemFingerprint: result.system_fingerprint || 'غير متوفر',
        aiMessageLength: aiMessage ? aiMessage.length : 0,
        requestId: this.lastRequestId
      });
      
      return {
        content: aiMessage,
        model: result.model,
        usage: result.usage,
        systemFingerprint: result.system_fingerprint,
        requestId: this.lastRequestId,
        finishReason: result.choices[0].finish_reason
      };
    } catch (error) {
      // التعامل مع أخطاء API
      const errorDetails = error.response?.data || { error: { message: error.message } };
      const statusCode = error.response?.status || 500;
      
      logger.error('chatGptService', 'خطأ في الحصول على رد من OpenAI', {
        error: errorDetails.error.message,
        statusCode,
        type: errorDetails.error.type || 'unknown',
        requestId: error.response?.headers?.['x-request-id']
      });
      
      throw new Error(`فشل في الحصول على رد من الذكاء الاصطناعي: ${errorDetails.error.message} (${statusCode})`);
    }
  }
  
  /**
   * التحقق مما إذا كانت الرسائل تحتوي على صور
   * @param {Array} messages مصفوفة الرسائل
   * @returns {Boolean} ما إذا كانت تحتوي على صور
   */
  checkIfMessagesContainImages(messages) {
    return messages.some(msg => 
      msg.content && Array.isArray(msg.content) && 
      msg.content.some(item => item.type === 'image_url')
    );
  }

  /**
   * الحصول على رد من OpenAI بتقنية التدفق (Streaming)
   * @param {Object} requestData بيانات الطلب المُعدة
   * @returns {Promise<Object>} الرد المجمع من البيانات المتدفقة
   */
  async getChatGptStreamingResponse(requestData) {
    try {
      // تكوين الطلب للتدفق
      requestData.stream = true;
      
      // إرسال الطلب مع تحديد responseType كـ 'stream'
      const response = await axios.post(
        this.apiEndpoint,
        requestData,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          responseType: 'stream'
        }
      );
      
      // حفظ معرف الطلب للتصحيح
      this.lastRequestId = response.headers['x-request-id'];
      
      return new Promise((resolve, reject) => {
        let completeMessage = '';
        let usageData = null;
        let model = this.model;
        let systemFingerprint = null;
        let finishReason = null;
        
        // معالجة البيانات المتدفقة
        response.data.on('data', (chunk) => {
          try {
            // تحويل البيانات المستلمة إلى نص
            const chunkText = chunk.toString();
            
            // OpenAI يرسل البيانات كـ "data: {JSON}" لكل جزء
            const lines = chunkText.split('\n').filter(line => line.trim() !== '');
            
            // معالجة كل سطر
            for (const line of lines) {
              // تخطي رسائل [DONE]
              if (line.includes('[DONE]')) continue;
              
              // استخراج بيانات JSON
              const jsonLine = line.replace(/^data: /, '').trim();
              if (!jsonLine) continue;
              
              try {
                const chunkData = JSON.parse(jsonLine);
                
                // تخزين معلومات النموذج والنظام إذا كانت متوفرة
                if (chunkData.model) model = chunkData.model;
                if (chunkData.system_fingerprint) systemFingerprint = chunkData.system_fingerprint;
                
                // تجميع محتوى الرسالة
                if (chunkData.choices && chunkData.choices.length > 0) {
                  const choice = chunkData.choices[0];
                  
                  // تجميع محتوى الرسالة من الخاصية delta للتدفق
                  if (choice.delta && choice.delta.content) {
                    completeMessage += choice.delta.content;
                  }
                  
                  // حفظ بيانات الاستخدام إذا كانت متوفرة
                  if (chunkData.usage) {
                    usageData = chunkData.usage;
                  }
                  
                  // حفظ سبب الإنهاء إذا وُجد
                  if (choice.finish_reason) {
                    finishReason = choice.finish_reason;
                  }
                }
              } catch (parseError) {
                logger.error('chatGptService', 'خطأ في تحليل بيانات التدفق', parseError);
              }
            }
          } catch (chunkError) {
            logger.error('chatGptService', 'خطأ في معالجة جزء البيانات', chunkError);
          }
        });
        
        // عند انتهاء التدفق
        response.data.on('end', () => {
          logger.debug('chatGptService', 'اكتمل تدفق رد OpenAI', {
            messageLength: completeMessage.length,
            modelUsed: model,
            requestId: this.lastRequestId
          });
          
          resolve({
            content: completeMessage,
            model: model,
            usage: usageData,
            systemFingerprint: systemFingerprint,
            requestId: this.lastRequestId,
            finishReason: finishReason
          });
        });
        
        // في حالة حدوث خطأ أثناء التدفق
        response.data.on('error', (error) => {
          logger.error('chatGptService', 'خطأ في تدفق رد OpenAI', error);
          reject(new Error(`فشل في معالجة التدفق: ${error.message}`));
        });
      });
    } catch (error) {
      // التعامل مع أخطاء API
      const errorDetails = error.response?.data || error.message;
      const statusCode = error.response?.status || 500;
      
      logger.error('chatGptService', 'خطأ في الحصول على رد متدفق من OpenAI', {
        error: errorDetails.error?.message || error.message,
        statusCode,
        type: errorDetails.error?.type || 'unknown',
        requestId: error.response?.headers?.['x-request-id']
      });
      
      throw new Error(`فشل في الحصول على رد متدفق من الذكاء الاصطناعي: ${errorDetails.error?.message || error.message} (${statusCode})`);
    }
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
      
      // الحصول على معلومات العميل الكاملة من جهة الاتصال
      const customerInfo = await this.getCustomerInformation(conversation);
      
      // الحصول على سجل المحادثات السابقة إذا كان ذلك ممكناً
      const previousConversations = await this.getCustomerPreviousConversations(conversation.phoneNumber);
      
      logger.info('chatGptService', 'معالجة رسالة واردة مع معلومات العميل', {
        conversationId: conversation._id,
        customerName: customerInfo?.name || 'غير معروف',
        previousConversationsCount: previousConversations?.length || 0
      });
      
      let messageContent = message.content;
      let mediaType = message.mediaType;
      let mediaUrl = message.mediaUrl;
      
      // التحقق من وجود وسائط صوتية وتفعيل الدعم
      if (mediaType === 'audio' && mediaUrl && this.enableAudioSupport) {
        let accessibleAudioUrl = mediaUrl;
        // التحقق مما إذا كان الرابط يحتوي على معرف ميتا أو رابط داخلي
        const isMetaIdAudio = /^\d+$/.test(accessibleAudioUrl) || (accessibleAudioUrl.includes('/') && /^\d+$/.test(accessibleAudioUrl.split('/').pop()));
        
        if (isMetaIdAudio || !accessibleAudioUrl.startsWith('http')) {
          // إذا كان معرف، حاول بناء رابط API
          if (message._id) {
            const baseUrl = process.env.BASE_URL || 'https://lic.tic-ly.com';
            accessibleAudioUrl = `${baseUrl}/whatsapp/media/content/${message._id}`;
            logger.info('chatGptService', `تم تحويل رابط الصوت إلى: ${accessibleAudioUrl}`);
          } else {
            logger.warn('chatGptService', 'تعذر تحويل رابط الصوت - لا يوجد معرّف رسالة');
            accessibleAudioUrl = null; // لا يمكن المتابعة بدون رابط صالح
          }
        }
        
        // محاولة التحويل فقط إذا كان لدينا رابط صالح
        let transcribedText = null;
        if (accessibleAudioUrl) {
          transcribedText = await this.transcribeAudio(accessibleAudioUrl);
        }
        
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
          if (!messageContent) {
            return null; // نتجاهل الرسالة إذا لم يكن هناك نص
          }
        }
      } 
      // معالجة الصور إذا كان mediaType === 'image' و enableVisionSupport مفعل
      else if (mediaType === 'image' && mediaUrl && this.enableVisionSupport) {
        // معالجة الصور إذا كان النموذج يدعم الرؤية
        if (!this.isVisionCapableModel(this.model)) {
          logger.warn('chatGptService', 'الرسالة تحتوي على صورة ولكن النموذج المستخدم لا يدعم تحليل الصور');
          // استمر في معالجة الرسالة ولكن تجاهل الصورة
          if (!messageContent) {
            // إذا كانت الرسالة تحتوي فقط على صورة بدون نص، أرسل رسالة تنبيه
            const responseMessage = 'عذراً، أنا لا أستطيع تحليل الصور في الوقت الحالي. هل يمكنك وصف ما في الصورة أو طرح سؤالك نصياً؟';
            return responseMessage;
          }
        }
      }
      
      // إنشاء كائن رسالة جديد بمعلومات محدثة (مثل النص المحول من الصوت)
      const processedMessage = {
        ...message,
        content: messageContent,
        mediaType: mediaType,
        mediaUrl: mediaUrl
      };
      
      // جلب سجل المحادثة السابقة
      const conversationHistory = await this.getConversationHistory(conversation._id, this.conversationHistoryLimit);
      
      // إضافة الرسالة الحالية (المعالجة) إلى نهاية السجل
      conversationHistory.push(processedMessage);
      
      // بناء رسائل المحادثة للإرسال إلى ChatGPT
      
      // إنشاء رسالة النظام باستخدام معلومات العميل المفصلة
      const systemMessageContent = await this.buildSystemMessage(customerInfo, previousConversations);
      
      // تحويل المحادثة إلى تنسيق مناسب لـ ChatGPT مع إضافة معلومات العميل
      const formattedMessages = this.formatMessagesForChatGPT(
        conversationHistory, 
        systemMessageContent
      );
      
      // إرسال المحادثة إلى ChatGPT
      logger.debug('chatGptService', 'إرسال المحادثة إلى ChatGPT', { 
        messagesCount: formattedMessages.length,
        lastMessage: messageContent ? messageContent.substring(0, 100) : '(وسائط)'
      });
      
      const gptResponse = await this.getChatGptResponse(formattedMessages);
      
      if (!gptResponse || !gptResponse.content) {
        throw new Error('لم يتم استلام رد صالح من ChatGPT');
      }
      
      // استخراج نص الرد من استجابة ChatGPT
      const responseContent = gptResponse.content.trim();
      
      // فحص إذا كان هناك طلب لتحويل المحادثة إلى مندوب معين
      const transferPattern = /\[تحويل:(.*?)\]/;
      const transferMatch = responseContent.match(transferPattern);
      
      if (transferMatch) {
        const agentName = transferMatch[1].trim();
        // الحصول على المندوبين المتاحين
        const availableAgents = await this.getEligibleUsers();
        
        // البحث عن المندوب المطلوب
        const agent = availableAgents.find(a => 
          (a.full_name && a.full_name.includes(agentName)) || 
          (a.username && a.username.includes(agentName))
        );
        
        if (agent) {
          logger.info('chatGptService', 'تم العثور على المندوب المطلوب للتحويل', {
            agentName,
            agentId: agent._id,
            conversationId: conversation._id
          });
          
          // تعيين المحادثة للمندوب المطلوب
          conversation.assignedTo = agent._id;
          conversation.status = 'assigned';
          conversation.updatedAt = new Date();
          await conversation.save();
          
          // إرسال إشعار بتحديث المحادثة (استخدام نفس الآلية التي يستخدمها النظام)
          socketService.notifyConversationUpdate(conversation._id, {
            type: 'assigned',
            status: conversation.status,
            assignedTo: agent._id,
            assignedBy: this.aiUserId,
            assignee: {
              _id: agent._id,
              username: agent.username,
              full_name: agent.full_name
            }
          });
          
          // إرسال إشعار شخصي للمندوب
          let customerName = 'العميل';
          try {
            customerName = ContactHelper.getServerDisplayName(conversation);
          } catch (error) {
            logger.error('chatGptService', 'خطأ في الحصول على اسم العميل المعروض', error);
            customerName = conversation.customerName || conversation.phoneNumber || 'العميل';
          }
          
          socketService.notifyUser(agent._id, 'conversation_assigned', {
            conversationId: conversation._id,
            assignedBy: 'مساعد الذكاء الاصطناعي',
            customerName: customerName,
            phoneNumber: conversation.phoneNumber,
            displayName: customerName
          });
          
          // تحديث إشعارات المحادثة
          await notificationSocketService.updateConversationNotifications(conversation._id, conversation);
          
          // حذف علامة التحويل من الرسالة
          const cleanedResponse = responseContent.replace(transferPattern, '').trim();
          
          // تسجيل معلومات عن تحويل المحادثة
          logger.info('chatGptService', 'تم تحويل المحادثة بنجاح للمندوب', {
            conversationId: conversation._id,
            assignedToAgent: agent.full_name || agent.username
          });
          
          return {
            content: cleanedResponse,
            metadata: {
              model: gptResponse.model,
              usage: gptResponse.usage,
              requestId: gptResponse.requestId,
              transferredTo: agent.full_name || agent.username
            }
          };
        } else {
          logger.warn('chatGptService', 'لم يتم العثور على المندوب المطلوب للتحويل', {
            requestedAgent: agentName,
            availableAgentsCount: availableAgents.length
          });
        }
      }
      
      // يمكن تخزين الرسالة في قاعدة البيانات هنا إذا لزم الأمر
      
      return {
        content: responseContent,
        metadata: {
          model: gptResponse.model,
          usage: gptResponse.usage,
          requestId: gptResponse.requestId
        }
      };
    } catch (error) {
      logger.error('chatGptService', 'خطأ في معالجة رسالة واردة:', error);
      return null;
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
   * إنشاء رسالة استقبال مخصصة باستخدام إعدادات النظام
   * @param {String} customerName اسم العميل (اختياري)
   * @returns {Promise<String>} رسالة الاستقبال المخصصة
   */
  async getInitialGreeting(customerName = '') {
    try {
      if (!this.initialized) {
        await this.initialize(); // تأكد من تحميل الإعدادات
      }
      
      // التعامل مع حالة عدم وجود نص ترحيب مخصص في الإعدادات
      if (!this.greetingPrompt) {
          logger.warn('chatGptService', 'لم يتم تكوين نص رسالة الترحيب في الإعدادات. سيتم استخدام رسالة ترحيب بسيطة.');
          // استخراج الاسم الأول فقط
          let firstName = '';
          if (customerName) {
              const nameParts = customerName.split(' ');
              firstName = nameParts[0].length > 1 ? nameParts[0] : customerName;
              firstName = firstName.replace(/[^\p{L}\p{N}\s]/gu, '').trim(); // إزالة الرموز
          }
          // إرجاع رسالة بسيطة جداً
          return firstName ? `مرحباً ${firstName}!` : 'مرحباً!';
      }
      
      // استبدال placeholder باسم العميل إذا وجد في النص
      let finalGreetingPrompt = this.greetingPrompt.replace('{customerName}', customerName || 'العميل');

      // استخدام تعليمات محددة لإنشاء رسالة ترحيب مخصصة
      const prompt = finalGreetingPrompt; // استخدام النص المحمل من الإعدادات

      // إنشاء رسالة مخصصة باستخدام OpenAI
      const requestData = {
        model: this.greetingModel, // استخدام النموذج المحمل من الإعدادات
        messages: [
          {
            role: "system",
            content: "أنت مساعد ودود وغير رسمي لشركة الترابط التقني. مهمتك كتابة رسائل ترحيب قصيرة وودية باللغة العربية."
          },
          { role: "user", content: prompt }
        ],
        temperature: this.greetingTemperature, // استخدام درجة الحرارة المحملة
        max_tokens: 100, // حد مناسب لرسالة قصيرة
        presence_penalty: 0.4
      };

      // إرسال الطلب إلى واجهة برمجة التطبيقات
      const headers = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      };

      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        requestData,
        { headers }
      );

      // استخراج الرد من استجابة OpenAI
      const greeting = response.data.choices[0].message.content.trim();
      
      return greeting;
    } catch (error) {
      // تسجيل معلومات أكثر تفصيلاً عن الخطأ
      logger.error('chatGptService', 'خطأ في إنشاء رسالة استقبال مخصصة:', {
        error: error.message,
        customerName: customerName || 'غير متوفر',
        errorDetails: error.response?.data?.error || error.stack
      });
      
      // في حالة الخطأ أو عدم وجود رد من OpenAI، نستخدم نفس الرسالة البسيطة كاحتياط
      let firstName = '';
      if (customerName) {
        const nameParts = customerName.split(' ');
        firstName = nameParts[0].length > 1 ? nameParts[0] : customerName;
        firstName = firstName.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
      }
      return firstName ? `مرحباً ${firstName}!` : 'مرحباً!'; // استخدام الرسالة البسيطة كاحتياط
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