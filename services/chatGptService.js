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
        let accessibleImageUrl = message.mediaUrl;
        let skipImageProcessing = false;
        
        // التحقق مما إذا كان الرابط يحتوي على معرف ميتا واتساب (معرف رقمي فقط)
        const isMetaId = /^\d+$/.test(accessibleImageUrl) || (accessibleImageUrl.includes('/') && /^\d+$/.test(accessibleImageUrl.split('/').pop()));
        
        if (!accessibleImageUrl.startsWith('data:image/') && (isMetaId || !accessibleImageUrl.startsWith('http'))) {
          logger.info('chatGptService', 'تحويل رابط غير مباشر للصورة في formatMessagesForChatGPT');
          
          // محاولة تحويل الرابط إلى عنوان صحيح
          if (message._id) {
            const baseUrl = process.env.BASE_URL || 'https://lic.tic-ly.com';
            accessibleImageUrl = `${baseUrl}/whatsapp/media/content/${message._id}`;
            logger.info('chatGptService', `تم تحويل رابط الصورة إلى: ${accessibleImageUrl}`);
          } else {
            logger.warn('chatGptService', 'لا يمكن تحويل رابط الصورة - لا يوجد معرّف رسالة');
            skipImageProcessing = true;
            
            // إضافة وصف نصي بديل
            if (contentPayload.length === 0) {
              contentPayload.push({ type: 'text', text: '[صورة غير متاحة]' });
            }
          }
        }
        
        if (!skipImageProcessing) {
          contentPayload.push({
            type: 'image_url',
            image_url: {
              url: accessibleImageUrl,
              detail: "auto"
            }
          });
        }
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

    // تعليمات خاصة بمعالجة اسم العميل
    const customerName = customerInfo?.name || 'العميل';
    systemMessage += `

تعليمات خاصة بتحليل ومعالجة اسم العميل:
1. تم تزويدك باسم العميل: "${customerName}".
2. يجب أن تقوم بتحليل الاسم لتحديد ما إذا كان اسم شخص حقيقي أو اسم شركة أو معرّف عام.
3. في حال كان الاسم اسم شخص، استخرج الاسم الأول فقط واستخدمه عند المخاطبة. مثال: الاسم الكامل "حسام الدين مظلوم" يتم مخاطبته باسم "حسام" فقط.
4. إذا كان الاسم مكتوبًا بالحروف اللاتينية والرد باللغة العربية، حاول استخدام النسخة العربية إن أمكن (مثلاً: "Mohamed" تصبح "محمد").
5. إذا لم تتمكن من تحديد ما إذا كان الاسم يعود لشخص أو كان عامًا/غريبًا، استخدم عبارة عامة مثل "عزيزي العميل" أو تجاهل الاسم.
6. لا تستخدم الاسم الكامل في المخاطبة، لأن ذلك قد يبدو رسميًا أو غير مناسب في بعض السياقات.`;

    // تعليمات التعامل مع العملاء
    systemMessage += `

تعليمات التعامل مع العملاء:
1. طبيعة أسلوبك يجب أن تكون مهنيًا وودودًا دون مبالغة. لا تكن رسميًا جدًا، ولا تستخدم أسلوبًا ساخرًا أو غير احترافي.
2. قم بتقديم المعلومة بشكل واضح، دقيق، ومباشر. اختصر قدر الإمكان مع الحفاظ على وضوح المعنى.
3. عند استقبال استفسارات تقنية معقدة أو مشكلات تتطلب تدخلًا بشريًا، يجب تحويل المحادثة لمندوب خدمة عملاء مع تنويه مهذب بأنك مساعد آلي.
4. لا تفترض أو تنشئ معلومات غير موثوقة سواءً عن العميل أو عن منتجات الشركة.
5. عند الحاجة، يمكنك إجراء بحث معقول على الإنترنت أو ضمن قاعدة بياناتك للإجابة عن أسئلة العميل، ولكن لا تعتمد على مصادر غير رسمية.
6. إذا سأل العميل عن طبيعتك، عرّف نفسك بوضوح كمساعد ذكي تابع لشركة "الترابط التقني"، مهمتك هي تسهيل التواصل وتقديم المساعدة الأساسية.
7. عندما يكون العميل غير مشترك في خدماتنا، شجعه بأسلوب لبق على التعرف على خدماتنا المتميزة، مثل: أنظمة سراج ERP، برنامج كريستال، منصة تاجر Link، حلول Yeastar للاتصالات، وخدمات الرسائل والواتساب.
8. ركّز دائمًا على إبراز نقاط القوة في الشركة: الدعم الفني السريع، الفريق الهندسي المتعاون، وجودة الخدمات.
9. أخبر العميل - عند الحاجة - بمعلومات أساسية عن الشركة:
  • الاسم: شركة الترابط التقني لتقنية المعلومات والاتصالات
  • العنوان: طرابلس، ليبيا، شارع بوظهير – طريق المشتل
  • الهاتف: +218 91 456 7777 أو +218 92 456 7777
  • البريد الإلكتروني: info@tic-ly.com
  • أوقات الدوام: من السبت إلى الخميس – من 10 صباحًا حتى 7 مساءً (بتوقيت ليبيا)
10. لا تخرج عن نطاق العمل إلا بشكل بسيط جدًا عند الحاجة لكسر الجمود، ثم عُد بسرعة لجو الخدمة والعمل.`;

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
          // في الوقت الحالي، سنتجاهل المحتوى الصوتي ونعتمد على النص إن وجد
          if (!messageContent) {
            // إذا لم يكن هناك نص مرفق، قد نرسل رسالة تفيد بعدم القدرة على معالجة الصوت
            // return await this.sendProcessingErrorMessage(conversation, "لم نتمكن من معالجة الرسالة الصوتية.");
            return null; // أو ببساطة نتجاهل الرسالة
          }
        }
      } 
      // معالجة الصور إذا كان mediaType === 'image' و enableVisionSupport مفعل
      else if (mediaType === 'image' && mediaUrl && this.enableVisionSupport && this.isVisionCapableModel(this.model)) {
        // متغير لتحديد ما إذا وجدنا صورة صالحة
        let validImageFound = false;
        
        // التحقق مما إذا كان الرابط يحتوي على معرف ميتا واتساب (معرف رقمي فقط)
        const isMetaId = /^\d+$/.test(mediaUrl) || (mediaUrl.includes('/') && /^\d+$/.test(mediaUrl.split('/').pop()));
        
        // تحويل الروابط حسب نوعها
        if (mediaUrl.startsWith('data:image/')) {
          // صورة Data URI - صالحة مباشرة للاستخدام
          logger.info('chatGptService', 'استخدام Data URI للصورة مباشرة');
          validImageFound = true;
        } 
        else if (isMetaId || !mediaUrl.startsWith('http')) {
          // الحصول على الصورة من قاعدة البيانات
          try {
            const WhatsappMedia = require('../models/WhatsappMedia');
            const mediaRecord = await WhatsappMedia.findOne({ messageId: message._id });
            
            if (mediaRecord && mediaRecord.fileData) {
              // تحويل الصورة إلى data URI
              const mimeType = mediaRecord.mimeType || 'image/jpeg';
              mediaUrl = `data:${mimeType};base64,${mediaRecord.fileData}`;
              logger.info('chatGptService', 'تم تحويل الصورة إلى Data URI مباشر');
              validImageFound = true;
            } 
            else if (message._id) {
              // استخدام واجهة API
              const baseUrl = process.env.BASE_URL || 'https://lic.tic-ly.com';
              mediaUrl = `${baseUrl}/whatsapp/media/content/${message._id}`;
              logger.info('chatGptService', `تم إنشاء رابط عام للصورة: ${mediaUrl}`);
              validImageFound = true;
            }
          } catch (error) {
            logger.error('chatGptService', 'خطأ في معالجة الصورة:', error);
            // سنتجاهل الصورة في حالة حدوث خطأ
          }
        }
        else {
          // رابط HTTP خارجي - نفترض أنه صالح
          validImageFound = true;
        }
        
        // إذا لم نتمكن من العثور على صورة صالحة
        if (!validImageFound) {
          logger.warn('chatGptService', 'لم يتم العثور على صورة صالحة للمعالجة');
          // إضافة محتوى نصي بديل
          if (!messageContent) {
            messageContent = '[صورة غير متاحة للمعالجة]';
          }
          // إلغاء معلومات الصورة
          mediaType = null;
          mediaUrl = null;
        }
      }
      
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
        aiResponse.content,
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