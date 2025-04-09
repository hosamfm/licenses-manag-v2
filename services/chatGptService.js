/**
 * خدمة ChatGPT للذكاء الاصطناعي
 * هذه الخدمة تتعامل مع واجهة برمجة ChatGPT لمعالجة المحادثات تلقائياً
 */

const axios = require('axios');
const logger = require('./loggerService');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const User = require('../models/User');
const NotificationService = require('./notificationService');
const socketService = require('./socketService');
require('dotenv').config();

class ChatGptService {
  constructor() {
    // إعدادات API
    this.apiKey = process.env.OPENAI_API_KEY;
    this.apiEndpoint = process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
    this.model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
    
    // إعدادات الجودة
    this.temperature = parseFloat(process.env.AI_TEMPERATURE || '0.7');
    this.maxTokens = parseInt(process.env.AI_MAX_TOKENS || '800');
    this.topP = parseFloat(process.env.AI_TOP_P || '0.9');
    this.presencePenalty = parseFloat(process.env.AI_PRESENCE_PENALTY || '0.6');
    this.frequencyPenalty = parseFloat(process.env.AI_FREQUENCY_PENALTY || '0.5');
    
    // إعدادات السياق والتاريخ
    this.conversationHistoryLimit = parseInt(process.env.AI_HISTORY_LIMIT || '15');
    this.previousConversationsLimit = parseInt(process.env.AI_PREVIOUS_CONVERSATIONS_LIMIT || '3');
    
    // تعليمات الذكاء الاصطناعي
    this.systemInstructions = process.env.AI_SYSTEM_INSTRUCTIONS || `أنت مساعد ذكاء اصطناعي مفيد في خدمة العملاء باسم "مساعد". 
مهمتك مساعدة العملاء بلغة عربية فصيحة ومهذبة. استخدم لهجة احترافية ولطيفة.`;
    
    // كلمات تحويل المحادثة لمندوب بشري
    this.transferKeywords = (process.env.AI_TRANSFER_KEYWORDS || '').split(',').filter(k => k.trim() !== '');
    
    // حالة التهيئة
    this.initialized = false;
    this.aiUserId = null;
  }

  /**
   * تهيئة الخدمة والتأكد من وجود مستخدم الذكاء الاصطناعي
   */
  async initialize() {
    if (!this.apiKey) {
      logger.error('chatGptService', 'مفتاح API غير موجود. يرجى ضبط OPENAI_API_KEY في ملف البيئة.');
      return false;
    }

    try {
      // التأكد من وجود مستخدم AI
      const aiUser = await this.ensureAiUserExists();
      this.aiUserId = aiUser._id;
      this.initialized = true;
      logger.info('chatGptService', `تم تهيئة خدمة الذكاء الاصطناعي بنجاح. مستخدم AI ID: ${this.aiUserId}`);
      return true;
    } catch (error) {
      logger.error('chatGptService', 'فشل في تهيئة خدمة الذكاء الاصطناعي:', error);
      return false;
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
   * إرسال إشعار لجميع المستخدمين المؤهلين عن محادثة تحتاج للتدخل
   * @param {String} conversationId معرف المحادثة
   * @param {String} reason سبب الإشعار (طلب عميل، اكتشاف آلي، محادثة جديدة)
   * @param {String} messagePreview مقتطف من الرسالة
   */
  async notifyEligibleUsers(conversationId, reason, messagePreview) {
    try {
      // الحصول على المستخدمين المؤهلين
      const eligibleUsers = await this.getEligibleUsers();
      
      if (!eligibleUsers || eligibleUsers.length === 0) {
        logger.warn('chatGptService', 'لا يوجد مستخدمين مؤهلين لإرسال الإشعارات إليهم');
        return;
      }
      
      logger.info('chatGptService', `إرسال إشعارات إلى ${eligibleUsers.length} مستخدم مؤهل بغض النظر عن نشاطهم`, { 
        conversationId, 
        reason,
        userIds: eligibleUsers.map(u => u._id)
      });
      
      // إنشاء عنوان ومحتوى الإشعار بناءً على السبب
      let title, content;
      
      switch (reason) {
        case 'ai_detected_transfer_request':
          title = 'طلب تدخل بشري (تم اكتشافه تلقائياً)';
          content = `اكتشف الذكاء الاصطناعي حاجة لتدخل بشري في المحادثة. محتوى الرسالة: "${messagePreview}"`;
          break;
        case 'customer_requested_human':
          title = 'طلب التحدث مع مندوب بشري';
          content = `طلب العميل التحدث مع مندوب بشري. محتوى الرسالة: "${messagePreview}"`;
          break;
        case 'new_conversation':
        default:
          title = 'محادثة جديدة تحتاج إلى رد';
          content = `هناك محادثة جديدة غير معينة تحتاج إلى الرد. محتوى الرسالة: "${messagePreview}"`;
      }
      
      // محاولة جلب بيانات المحادثة للإشعار
      let conversation = null;
      try {
        const Conversation = require('../models/Conversation');
        conversation = await Conversation.findById(conversationId)
          .select('assignedTo status contactId customerName phoneNumber')
          .lean();
        
        logger.info('chatGptService', 'تم العثور على معلومات المحادثة', { 
          conversationId,
          customerName: conversation?.customerName,
          phoneNumber: conversation?.phoneNumber
        });
      } catch (err) {
        logger.warn('chatGptService', 'لم يتم العثور على بيانات المحادثة للإشعار', { conversationId });
      }
      
      // إرسال إشعار لكل مستخدم مؤهل
      let successCount = 0;
      let failCount = 0;
      
      for (const user of eligibleUsers) {
        try {
          logger.info('chatGptService', `إرسال إشعار للمستخدم ${user._id} بغض النظر عن نشاطه`, {
            username: user.username,
            fullName: user.full_name
          });
          
          // محاولة جلب معلومات إضافية عن المستخدم (مثل اشتراكات Web Push)
          const userDetails = await User.findById(user._id)
            .select('_id username full_name webPushSubscriptions')
            .lean();
          
          const hasWebPushSubscriptions = !!(userDetails?.webPushSubscriptions?.length);
          
          logger.info('chatGptService', `معلومات المستخدم ${user._id}`, {
            hasWebPushSubscriptions,
            subscriptionCount: userDetails?.webPushSubscriptions?.length || 0
          });
          
          // إرسال الإشعار عبر جميع القنوات المتاحة (إشعارات قاعدة البيانات + Socket + Web Push)
          const notification = await NotificationService.createAndSendNotification({
            recipient: user._id,
            type: 'conversation',
            title: title,
            content: content,
            link: `/crm/conversations/${conversationId}`,
            reference: {
              model: 'Conversation',
              id: conversationId
            }
          }, conversation);
          
          if (notification) {
            successCount++;
            logger.info('chatGptService', `تم إنشاء الإشعار بنجاح للمستخدم ${user._id}`, {
              notificationId: notification._id
            });
          } else {
            failCount++;
            logger.warn('chatGptService', `فشل إنشاء الإشعار للمستخدم ${user._id}`);
          }
        } catch (userError) {
          failCount++;
          logger.error('chatGptService', `خطأ في إرسال الإشعار للمستخدم ${user._id}`, {
            error: userError.message,
            stack: userError.stack?.split('\n')[0]
          });
        }
      }
      
      logger.info('chatGptService', `تم إرسال الإشعارات: ${successCount} ناجح, ${failCount} فاشل`);
    } catch (error) {
      logger.error('chatGptService', 'خطأ في إرسال الإشعارات للمستخدمين المؤهلين:', error);
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
    // تحويل المحادثة إلى تنسيق مناسب لـ ChatGPT
    const formattedMessages = [];
    
    // إنشاء رسالة النظام مع معلومات العميل
    let systemMessage = this.systemInstructions;

    // إضافة معلومات العميل إذا كانت متوفرة
    if (customerInfo) {
      systemMessage += `\n\nمعلومات العميل:`;
      
      if (customerInfo.name) {
        systemMessage += `\n- الاسم: ${customerInfo.name}`;
      }
      
      if (customerInfo.phoneNumber) {
        systemMessage += `\n- رقم الهاتف: ${customerInfo.phoneNumber}`;
      }
      
      if (customerInfo.email) {
        systemMessage += `\n- البريد الإلكتروني: ${customerInfo.email}`;
      }
      
      if (customerInfo.company) {
        systemMessage += `\n- الشركة: ${customerInfo.company}`;
      }
      
      if (customerInfo.notes) {
        systemMessage += `\n- ملاحظات: ${customerInfo.notes}`;
      }
    } else {
      systemMessage += `\n\nلا توجد معلومات مسبقة عن هذا العميل. حاول جمع المعلومات الأساسية مثل الاسم أثناء المحادثة.`;
    }
    
    // إضافة سجل المحادثات السابقة إذا كان متوفراً
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
    
    // إضافة تعليمات التعامل مع العميل
    systemMessage += `\n\nتعليمات التعامل مع العميل:
1. ناديه باسمه: "${customerInfo?.name || 'العميل'}" عند بدء المحادثة
2. كن مفيداً ودقيقاً ومختصراً في ردودك
3. إذا طلب معلومات تقنية معقدة أو كانت المشكلة تحتاج لتدخل بشري، أخبره بلطف أنك ستقوم بتحويله لمندوب خدمة عملاء
4. لا تخترع معلومات غير موجودة عن العميل أو عن خدماتنا
5. حافظ على أدب الحوار دائماً مهما كانت طريقة التحدث من قبل العميل
6. ذكّر العميل بأنك مساعد آلي إذا سأل عن طبيعتك`;
    
    // إضافة رسالة النظام
    formattedMessages.push({
      role: 'system',
      content: systemMessage
    });

    // إضافة رسائل المحادثة
    for (const message of messages) {
      // تحديد الدور بناءً على اتجاه الرسالة
      let role = 'user'; // افتراضي للرسائل الواردة من العميل
      
      if (message.direction === 'outgoing') {
        role = 'assistant'; // للردود السابقة من النظام أو المندوبين
      } else if (message.direction === 'internal') {
        continue; // تجاهل الملاحظات الداخلية
      }
      
      // تجاهل الرسائل الفارغة
      if (!message.content && !message.mediaType) continue;
      
      // إضافة محتوى الرسالة
      let content = message.content || '';
      
      // إضافة وصف للوسائط إذا وجدت
      if (message.mediaType) {
        const mediaDescription = this.getMediaDescription(message.mediaType);
        content = `${mediaDescription}${content ? ': ' + content : ''}`;
      }
      
      formattedMessages.push({ role, content });
    }
    
    return formattedMessages;
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
      
      const response = await axios.post(
        this.apiEndpoint,
        {
          model: this.model,
          messages: formattedMessages,
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          top_p: this.topP,
          presence_penalty: this.presencePenalty,
          frequency_penalty: this.frequencyPenalty
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );
      
      if (response.data && response.data.choices && response.data.choices.length > 0) {
        return response.data.choices[0].message.content;
      } else {
        throw new Error('لم يتم الحصول على رد من ChatGPT');
      }
    } catch (error) {
      logger.error('chatGptService', 'خطأ في الحصول على رد من ChatGPT:', error.response?.data || error.message);
      return null;
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
      
      // التحقق إذا كانت الرسالة تحتاج لتدخل بشري
      logger.info('chatGptService', 'فحص حاجة العميل للتدخل البشري', { 
        conversationId: conversation._id,
        messageContent: message.content?.substring(0, 50) 
      });
      
      const needsHumanIntervention = await this.shouldTransferToHuman(message.content);
      
      if (needsHumanIntervention) {
        logger.info('chatGptService', 'تم اكتشاف حاجة لتدخل بشري:', { 
          conversationId: conversation._id, 
          messagePreview: message.content?.substring(0, 100) || '[رسالة وسائط]' 
        });
        
        try {
          // الحصول على المستخدمين المؤهلين للإشعار (للتأكد من وجودهم)
          const eligibleUsers = await this.getEligibleUsers();
          logger.info('chatGptService', `تم العثور على ${eligibleUsers.length} مستخدم مؤهل للإشعار`, {
            userIds: eligibleUsers.map(u => u._id)
          });
          
          // إرسال إشعار للمستخدمين المؤهلين
          logger.info('chatGptService', 'محاولة إرسال إشعارات للمستخدمين المؤهلين');
          await this.notifyEligibleUsers(
            conversation._id,
            'ai_detected_transfer_request',
            message.content?.substring(0, 100) || '[رسالة وسائط]'
          );
          logger.info('chatGptService', 'تم استكمال عملية محاولة إرسال الإشعارات');
        } catch (notifyError) {
          logger.error('chatGptService', 'خطأ أثناء محاولة إرسال إشعارات المستخدمين المؤهلين:', {
            error: notifyError.message,
            stack: notifyError.stack
          });
        }
        
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
      
      // إضافة الرسالة الجديدة الواردة إلى نهاية السجل
      conversationHistory.push(message);
      
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
        // إضافة كلمات التحويل الافتراضية إذا لم يتم تعبئتها من ملف البيئة
        this.transferKeywords = [
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
        ];
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
   * التحقق مما إذا كان سوكت المستخدم موجودًا في غرفة معينة
   * @param {String} roomName - اسم الغرفة
   * @param {String} userId - معرف المستخدم
   * @returns {Boolean} نتيجة التحقق
   */
  isSocketInRoom(roomName, userId) {
    try {
      return socketService.isSocketInRoom ? 
        socketService.isSocketInRoom(roomName, userId) : 
        false;
    } catch (error) {
      logger.warn('chatGptService', 'خطأ في التحقق من وجود المستخدم في الغرفة', {
        roomName, userId, error: error.message
      });
      return false;
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
      
      // ملاحظة: يمكن تحسين آلية الاختيار هنا لاختيار أفضل مندوب متاح
      // مثلاً، باستخدام قواعد توزيع الحمل، أو تحليل نشاط المندوبين، إلخ.
      
      // حاليًا، نختار مندوبًا عشوائيًا من المندوبين المؤهلين
      const randomIndex = Math.floor(Math.random() * eligibleUsers.length);
      return eligibleUsers[randomIndex];
    } catch (error) {
      logger.error('chatGptService', 'خطأ في الحصول على مندوب بشري متاح:', error);
      return null;
    }
  }
}

// إنشاء نسخة واحدة من الخدمة للاستخدام في جميع أنحاء التطبيق
const chatGptService = new ChatGptService();

module.exports = chatGptService; 