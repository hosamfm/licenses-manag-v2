/**
 * متحكم المحادثات باستخدام الذكاء الاصطناعي
 * مسؤول عن معالجة المحادثات باستخدام ChatGPT
 */
const chatGptService = require('../services/chatGptService');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const Conversation = require('../models/Conversation');
const logger = require('../services/loggerService');
const metaWhatsappService = require('../services/whatsapp/MetaWhatsappService');
const socketService = require('../services/socketService');
const User = require('../models/User');
const WhatsAppChannel = require('../models/WhatsAppChannel');

/**
 * معالجة رسالة واردة جديدة باستخدام الذكاء الاصطناعي
 * @param {Object} message الرسالة الواردة
 * @param {Object} conversation المحادثة
 * @param {Boolean} autoAssignAI ما إذا كان يجب تعيين المحادثة تلقائياً للذكاء الاصطناعي
 */
exports.processIncomingMessage = async (message, conversation, autoAssignAI = true) => {
  try {
    // تهيئة خدمة الذكاء الاصطناعي
    if (!chatGptService.initialized) {
      await chatGptService.initialize();
    }

    // فحص إذا كان يجب تعيين المحادثة لمندوب بشري
    const shouldTransfer = message.content && await exports.shouldTransferToHuman(message.content);
    
    // التحقق من حالة المحادثة
    const assignedToOtherAgent = conversation.assignedTo && 
                                conversation.assignedTo.toString() !== chatGptService.aiUserId.toString();
    
    // إذا كانت المحادثة معينة بالفعل لمندوب آخر، لا تستخدم الذكاء الاصطناعي
    if (assignedToOtherAgent) {
      logger.info('aiConversationController', 'تجاوز معالجة الذكاء الاصطناعي للرسالة الواردة - المحادثة معينة لمندوب آخر', { 
        conversationId: conversation._id,
        alreadyAssigned: true,
        assignedToOtherAgent: true
      });
      return null;
    }
    
    // إذا تم اكتشاف كلمة مفتاحية ولم تكن المحادثة معينة للذكاء الاصطناعي بعد
    if (shouldTransfer && !conversation.assignedTo) {
      // نعين المحادثة للذكاء الاصطناعي أولاً ليتمكن من معالجة الطلب
      conversation.assignedTo = chatGptService.aiUserId;
      conversation.status = 'assigned';
      await conversation.save();
      
      // إشعار الواجهة بتحديث المحادثة
      socketService.emitToRoom(
        'admin',
        'conversation:updated',
        {
          _id: conversation._id,
          assignedTo: chatGptService.aiUserId,
          status: 'assigned'
        }
      );
    } 
    // إذا كانت المحادثة معينة للذكاء الاصطناعي وتم اكتشاف كلمة مفتاحية
    else if (shouldTransfer && conversation.assignedTo && 
             conversation.assignedTo.toString() === chatGptService.aiUserId.toString()) {
      // نترك الذكاء الاصطناعي يعالج الطلب
      logger.info('aiConversationController', 'اكتشاف طلب تحويل المحادثة لمندوب بشري، سيتم معالجته بواسطة الذكاء الاصطناعي', {
        conversationId: conversation._id
      });
    }
    
    // معالجة الرسالة الواردة وإرسال رد الذكاء الاصطناعي
    logger.info('aiConversationController', 'معالجة رسالة واردة باستخدام الذكاء الاصطناعي', { 
      conversationId: conversation._id,
      messageId: message._id,
      mediaType: message.mediaType || 'text'
    });
    
    // التحقق من إذا كان يجب تعيين المحادثة للذكاء الاصطناعي
    const assignToAI = autoAssignAI || 
                      (conversation.assignedTo && conversation.assignedTo.toString() === chatGptService.aiUserId.toString());
    
    // إذا لم تكن المحادثة معينة للذكاء الاصطناعي، قم بتعيينها
    if (autoAssignAI && (!conversation.assignedTo || conversation.assignedTo.toString() !== chatGptService.aiUserId.toString())) {
      conversation.assignedTo = chatGptService.aiUserId;
      conversation.status = 'assigned';
      await conversation.save();
      
      // إشعار الواجهة بتحديث المحادثة
      socketService.emitToRoom(
        'admin',
        'conversation:updated',
        {
          _id: conversation._id,
          assignedTo: chatGptService.aiUserId,
          status: 'assigned'
        }
      );
      
      // استخدام معلومات العميل من جهة الاتصال المرتبطة بالمحادثة إن وجدت
      let customerInfo = null;
      
      // التحقق من وجود معرف جهة اتصال في المحادثة وتحميل معلوماته
      if (conversation.contactId) {
        try {
          const Contact = require('../models/Contact');
          const contact = await Contact.findById(conversation.contactId).lean();
          
          if (contact) {
            customerInfo = {
              name: contact.name,
              email: contact.email,
              company: contact.company,
              phoneNumber: contact.phoneNumber
            };
            
            logger.debug('aiConversationController', 'تم تحميل معلومات العميل من جهة الاتصال', {
              conversationId: conversation._id,
              contactId: conversation.contactId,
              customerName: customerInfo.name
            });
          }
        } catch (error) {
          logger.error('aiConversationController', 'خطأ في تحميل بيانات جهة الاتصال', {
            conversationId: conversation._id,
            contactId: conversation.contactId,
            error: error.message
          });
        }
      }
      
      // إذا لم يتم العثور على معلومات من جهة الاتصال، استخدم المعلومات المتوفرة في المحادثة
      if (!customerInfo) {
        customerInfo = {
          name: conversation.customerName || '',
          phoneNumber: conversation.phoneNumber
        };
      }
      
      // إرسال رسالة أولى مخصصة بناءً على إعدادات النظام
      // استدعاء خدمة الذكاء الاصطناعي لإنشاء رسالة استقبال مخصصة
      const initialResponse = await chatGptService.getInitialGreeting(customerInfo.name);
      
      // إرسال الرد المخصص للعميل
      await exports.sendAiResponseToCustomer(conversation, initialResponse);
    }
    
    // معالجة الرسالة واستخراج الرد من ChatGPT فقط إذا كان التعيين التلقائي مفعلاً أو المحادثة معينة للذكاء الاصطناعي بالفعل
    if (assignToAI) {
      logger.debug('aiConversationController', 'ما قبل معالجة chatGptService للرسالة', { 
        messageId: message._id, 
        hasContent: !!message.content, 
        mediaType: message.mediaType || 'text' 
      });
      
      // معالجة الرسالة واستخراج الرد من ChatGPT
      const response = await chatGptService.processIncomingMessage(conversation, message);
      
      if (response) {
        // إرسال رد الذكاء الاصطناعي للعميل
        await exports.sendAiResponseToCustomer(conversation, response);
        return response;
      }
    } else {
      logger.debug('aiConversationController', 'تخطي الذكاء الاصطناعي لعدم تعيين المحادثة له', {
        conversationId: conversation._id,
        autoAssignAI,
        hasAssignedTo: !!conversation.assignedTo
      });
    }
    
    return null;
  } catch (error) {
    logger.error('aiConversationController', 'خطأ في معالجة رسالة واردة للذكاء الاصطناعي', error);
    return null;
  }
};

/**
 * إرسال رد من الذكاء الاصطناعي إلى العميل
 * @param {Object} conversation المحادثة
 * @param {String} response نص الرد
 * @param {Object} existingMessage الرسالة الموجودة من chatGPT (اختياري)
 */
exports.sendAiResponseToCustomer = async (conversation, response, existingMessage = null) => {
  try {
    logger.info('aiConversationController', 'إرسال رد الذكاء الاصطناعي إلى العميل', { 
      conversationId: conversation._id 
    });
    
    // === بداية التعديل: استخدام آخر قناة استخدمها العميل للتواصل ===
    // جلب رقم هاتف العميل
    const phoneNumber = conversation.phoneNumber;
    
    // استخراج معرف رقم الهاتف وتوكن الوصول
    let phoneNumberId = null;
    let accessToken = null;
    
    // تحميل المحادثة كاملة مع بيانات القناة للتأكد من استخدام آخر قناة
    const Conversation = require('../models/Conversation');
    
    try {
      // تحميل المحادثة كاملة مع القناة المرتبطة
      const fullConversation = await Conversation.findById(conversation._id)
        .populate({
          path: 'channelId',
          populate: {
            path: 'settingsId'
          }
        });
      
      if (fullConversation && fullConversation.channelId) {
        logger.info('aiConversationController', 'تم الحصول على بيانات القناة من المحادثة المحملة', {
          conversationId: conversation._id,
          channelId: fullConversation.channelId._id,
          hasSettingsId: !!fullConversation.channelId.settingsId
        });
        
        // 1. استخدام settingsId مباشرة من القناة المحملة
        if (fullConversation.channelId.settingsId) {
          const settings = fullConversation.channelId.settingsId;
          
          if (settings.config && settings.config.phoneNumberId && settings.config.accessToken) {
            phoneNumberId = settings.config.phoneNumberId;
            accessToken = settings.config.accessToken;
            
            logger.debug('aiConversationController', 'تم استخراج بيانات القناة مباشرة من المحادثة المحملة', {
              conversationId: conversation._id,
              phoneNumberId,
              settingsId: settings._id
            });
          }
        }
      } else {
        logger.warn('aiConversationController', 'المحادثة أو القناة غير متوفرة في المحادثة المحملة', {
          conversationId: conversation._id
        });
      }
    } catch (loadError) {
      logger.error('aiConversationController', 'خطأ في تحميل المحادثة الكاملة مع بيانات القناة', {
        conversationId: conversation._id,
        error: loadError.message
      });
    }
    
    // 2. إذا لم نتمكن من الحصول على البيانات، نحاول استخدام MetaWhatsappSettings
    if (!phoneNumberId || !accessToken) {
      const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
      
      // تحديد settingsId من channelId
      let settingsId = null;
      
      if (conversation.channelId) {
        // يمكن أن يكون channelId كائن أو قيمة _id
        if (typeof conversation.channelId === 'object') {
          settingsId = conversation.channelId.settingsId;
        } else {
          // محاولة استخراج المعرف من WhatsAppChannel
          try {
            const channel = await WhatsAppChannel.findById(conversation.channelId);
            if (channel && channel.settingsId) {
              settingsId = channel.settingsId;
            }
          } catch (channelError) {
            logger.warn('aiConversationController', 'خطأ في استخراج settingsId من channelId', {
              conversationId: conversation._id,
              error: channelError.message
            });
          }
        }
      }
      
      // استخراج الإعدادات من settingsId إذا كان متوفرًا
      if (settingsId) {
        try {
          const settings = await MetaWhatsappSettings.findById(settingsId).lean();
          if (settings && settings.config) {
            phoneNumberId = settings.config.phoneNumberId;
            accessToken = settings.config.accessToken;
            
            logger.debug('aiConversationController', 'تم استخراج بيانات القناة من MetaWhatsappSettings', {
              conversationId: conversation._id,
              phoneNumberId,
              settingsId
            });
          }
        } catch (settingsError) {
          logger.warn('aiConversationController', 'خطأ في استخراج بيانات من MetaWhatsappSettings', {
            conversationId: conversation._id,
            settingsId,
            error: settingsError.message
          });
        }
      }
    }

    // 3. إذا لم نتمكن من الحصول على البيانات، نحاول استخدام طريقة النظام القديم
    if (!phoneNumberId || !accessToken) {
      try {
        const channel = await WhatsAppChannel.findById(conversation.channelId);
        
        if (channel) {
          phoneNumberId = channel.config?.phoneNumberId || channel.whatsappBusinessPhoneNumberId;
          accessToken = channel.config?.accessToken || channel.accessToken;
          
          logger.debug('aiConversationController', 'تم استخراج بيانات القناة من طريقة النظام القديم', {
            conversationId: conversation._id,
            phoneNumberId,
            channelId: conversation.channelId
          });
        }
      } catch (error) {
        logger.warn('aiConversationController', 'فشل جميع طرق استخراج بيانات القناة', {
          conversationId: conversation._id,
          error: error.message
        });
      }
    }
    
    // 4. إذا كانت البيانات غير متوفرة بعد، نحاول استخدام خدمة metaWhatsappService مباشرة
    if (!phoneNumberId || !accessToken) {
      try {
        // تهيئة الخدمة إذا لم تكن مهيأة
        if (!metaWhatsappService.initialized) {
          await metaWhatsappService.initialize();
        }
        
        // محاولة استخدام الإعدادات الافتراضية
        phoneNumberId = metaWhatsappService.settings?.config?.phoneNumberId;
        accessToken = metaWhatsappService.settings?.config?.accessToken;
        
        logger.debug('aiConversationController', 'تم استخدام الإعدادات الافتراضية من metaWhatsappService', {
          conversationId: conversation._id,
          phoneNumberId
        });
      } catch (serviceError) {
        logger.error('aiConversationController', 'خطأ في استخدام الإعدادات الافتراضية', {
          conversationId: conversation._id,
          error: serviceError.message
        });
      }
    }
    // === نهاية التعديل ===
    
    // التحقق من وجود البيانات المطلوبة
    if (!phoneNumber || !phoneNumberId || !accessToken) {
      logger.error('aiConversationController', 'بيانات القناة أو العميل غير مكتملة', {
        conversationId: conversation._id,
        phoneNumber: !!phoneNumber,
        phoneNumberId: !!phoneNumberId,
        accessTokenExists: !!accessToken
      });
      return null;
    }
    
    // سجل البيانات للتصحيح
    logger.debug('aiConversationController', 'بيانات إرسال الرسالة', {
      conversationId: conversation._id,
      phoneNumber: phoneNumber,
      phoneNumberId: phoneNumberId,
      responseType: typeof response,
      responseLength: response ? response.length : 0
    });
    
    // التأكد من أن نص الرسالة هو سلسلة نصية
    let messageText = '';
    
    if (typeof response === 'string') {
      // إذا كان الرد سلسلة نصية، استخدمها مباشرة
      messageText = response;
      
    } else if (response && typeof response === 'object') {
      // إذا كان الرد كائناً، تحقق مما إذا كان يحتوي على حقل content
      if (response.content && typeof response.content === 'string') {
        // استخدم محتوى الرسالة إذا كان موجوداً في الكائن
        messageText = response.content;
        logger.debug('aiConversationController', 'تم استخراج محتوى الرسالة من كائن الرد', {
          messageContent: messageText.substring(0, 50) + (messageText.length > 50 ? '...' : '')
        });
      } else {
        // لا تحاول تحويل الكائن كاملاً إلى سلسلة نصية
        logger.warn('aiConversationController', 'تم استلام كائن بدون حقل content صالح', {
          responseType: typeof response,
          hasContent: !!response.content,
          contentType: typeof response.content
        });
        messageText = chatGptService.defaultResponse;
      }
      
    } else if (response) {
      // التعامل مع أنواع البيانات الأخرى
      try {
        messageText = String(response);
        logger.debug('aiConversationController', 'تم تحويل نص الرسالة إلى سلسلة نصية', {
          originalType: typeof response
        });
      } catch (conversionError) {
        logger.error('aiConversationController', 'فشل تحويل نص الرسالة إلى سلسلة نصية', {
          error: conversionError.message
        });
        messageText = chatGptService.defaultResponse;
      }
      
    } else {
      // الرد غير موجود
      messageText = chatGptService.defaultResponse;
    }
    
    // إرسال الرسالة عبر خدمة ميتا واتساب
    const messageResult = await metaWhatsappService.sendTextMessage(
      phoneNumber,  // رقم الهاتف المستلم (المعلمة الأولى)
      messageText,  // نص الرسالة (المعلمة الثانية) - بعد التأكد من أنه سلسلة نصية
      phoneNumberId // معرف رقم الهاتف المرسل (المعلمة الثالثة)
    );
    
    if (!messageResult || !messageResult.messages || messageResult.messages.length === 0) {
      logger.error('aiConversationController', 'فشل في إرسال رسالة الذكاء الاصطناعي للعميل', {
        conversationId: conversation._id,
        phoneNumber,
        phoneNumberId
      });
      return null;
    }
    
    // 3. تحديث وقت آخر رسالة للمحادثة
    conversation.lastMessageAt = new Date();
    await conversation.save();
    
    let savedMessage;
    
    // 4. معالجة تخزين الرسالة
    if (existingMessage && existingMessage._id) {
      // إذا كانت الرسالة موجودة بالفعل، نقوم فقط بتحديثها بمعرف الرسالة الخارجي
      savedMessage = await WhatsappMessage.findByIdAndUpdate(
        existingMessage._id,
        { 
          externalMessageId: messageResult.messages?.[0]?.id || null,
          status: 'sent'
        },
        { new: true }
      );
      
      logger.debug('aiConversationController', 'تم تحديث رسالة الرد الموجودة من الذكاء الاصطناعي', {
        messageId: savedMessage._id
      });
    } else {
      // إنشاء رسالة جديدة إذا لم تكن موجودة بالفعل (لا يحدث عادة)
      const aiUser = await User.findById(chatGptService.aiUserId).select('username full_name').lean();
      
      // إنشاء كائن رسالة جديد
      const newMessage = new WhatsappMessage({
        conversationId: conversation._id,
        content: typeof response === 'object' ? response.content : response,
        direction: 'outgoing',
        timestamp: new Date(),
        status: 'sent',
        mediaType: null,
        mediaUrl: null,
        externalMessageId: messageResult.messages?.[0]?.id || null,
        sentBy: chatGptService.aiUserId,
        sentByUsername: aiUser ? aiUser.username : 'ai-assistant',
        metadata: {
          senderInfo: {
            userId: chatGptService.aiUserId,
            username: aiUser ? aiUser.username : 'ai-assistant',
            full_name: aiUser ? aiUser.full_name : 'مساعد الذكاء الاصطناعي'
          },
          ...(typeof response === 'object' && response.metadata ? { aiResponseMeta: response.metadata } : {})
        }
      });
      
      // حفظ الرسالة في قاعدة البيانات
      savedMessage = await newMessage.save();
      
      logger.debug('aiConversationController', 'تم إنشاء رسالة رد جديدة من الذكاء الاصطناعي', {
        messageId: savedMessage._id
      });
    }
    
    // 5. إرسال إشعار عبر السوكت فقط لتحديث واجهة المستخدم
    const currentDate = new Date();
    const isoDateString = currentDate.toISOString();
    
    // إنشاء كائن الرسالة الذي سيتم إرساله للواجهة
    const messageForUI = {
      _id: savedMessage._id.toString(),
      conversationId: conversation._id.toString(),
      content: savedMessage.content,
      direction: 'outgoing',
      timestamp: isoDateString,
      status: 'sent',
      mediaType: null,
      mediaUrl: null,
      externalMessageId: messageResult.messages?.[0]?.id || null,
      sentBy: chatGptService.aiUserId,
      sentByUsername: 'ai-assistant',
      metadata: {
        senderInfo: {
          userId: chatGptService.aiUserId,
          username: 'ai-assistant',
          full_name: 'مساعد الذكاء الاصطناعي'
        }
      },
      createdAt: isoDateString
    };
    
    // إرسال إشعار واحد فقط عن الرسالة الجديدة
    socketService.notifyNewMessage(conversation._id.toString(), messageForUI);
    
    // تحديث واجهة المستخدم لقائمة المحادثات بشكل منفصل عن الرسالة
    // ولكن بدون إرسال بيانات الرسالة الكاملة مرة أخرى
    socketService.emitToRoom(
      'admin',
      'conversation-list-update',
      {
        _id: conversation._id.toString(),
        status: conversation.status,
        assignedTo: conversation.assignedTo,
        lastMessageAt: isoDateString,
        phoneNumber: conversation.phoneNumber,
        customerName: conversation.customerName,
        lastMessage: {
          _id: savedMessage._id.toString(),
          content: savedMessage.content,
          direction: 'outgoing',
          timestamp: isoDateString,
          status: 'sent'
        }
      }
    );
    
    return messageResult;
  } catch (error) {
    logger.error('aiConversationController', 'خطأ في إرسال رد الذكاء الاصطناعي', error);
    return null;
  }
}

/**
 * التحقق مما إذا كان يجب تحويل المحادثة إلى مندوب بشري
 * @param {String} messageContent محتوى الرسالة
 * @returns {Boolean} إذا كان يجب تحويل المحادثة
 * 
 * ملاحظة: تستخدم هذه الدالة كلمات التحويل من إعدادات chatGptService والتي يتم تحميلها 
 * مباشرة من قاعدة البيانات عبر نموذج AISettings بدلاً من استخدام قائمة ثابتة في الكود.
 */
exports.shouldTransferToHuman = async (messageContent) => {
  try {
    if (!messageContent) return false;
    
    // استخدام كلمات التحويل من إعدادات chatGptService بدلاً من القائمة الثابتة
    if (!chatGptService.initialized) {
      await chatGptService.initialize();
    }

    // تحويل النص إلى أحرف صغيرة للمقارنة
    const lowerCaseMessage = messageContent.toLowerCase();

    // البحث عن الكلمات المفتاحية في الرسالة
    for (const keyword of chatGptService.transferKeywords) {
      if (lowerCaseMessage.includes(keyword.toLowerCase())) {
        logger.info('aiConversationController', 'تم اكتشاف طلب للتحويل لمندوب بشري', { 
          keyword,
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
          logger.info('aiConversationController', 'تم اكتشاف علامات إحباط/غضب في رسالة طويلة', { 
            indicator,
            messageLength: messageContent.length
          });
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    logger.error('aiConversationController', 'خطأ في تحليل محتوى الرسالة:', error);
    return false;
  }
};