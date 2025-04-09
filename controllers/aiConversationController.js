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
    const shouldTransfer = message.content && await chatGptService.shouldTransferToHuman(message.content);
    
    // التحقق من حالة المحادثة
    const assignedToOtherAgent = conversation.assignedTo && 
                                conversation.assignedTo.toString() !== chatGptService.aiUserId.toString();
    
    if (shouldTransfer || assignedToOtherAgent) {
      // إذا كانت المحادثة معينة بالفعل لمندوب آخر أو يجب تحويلها، لا تستخدم الذكاء الاصطناعي
      logger.info('aiConversationController', 'تجاوز معالجة الذكاء الاصطناعي للرسالة الواردة', { 
        conversationId: conversation._id,
        shouldTransfer,
        alreadyAssigned: !!conversation.assignedTo,
        assignedToOtherAgent
      });
      
      // إذا كان لدينا الكلمات المفتاحية لتحويل المحادثة وليست معينة بالفعل
      if (shouldTransfer && !conversation.assignedTo) {
        // تعيين المحادثة لمندوب بشري متاح
        const humanAgent = await chatGptService.getAvailableHumanAgent();
        if (humanAgent) {
          // تحديث المحادثة وتعيينها للمندوب البشري
          conversation.assignedTo = humanAgent._id;
          conversation.status = 'assigned';
          await conversation.save();
          
          // إرسال إشعار بالتعيين
          socketService.notifyConversationUpdate(conversation._id.toString(), {
            type: 'assigned',
            status: conversation.status,
            assignedTo: humanAgent._id,
            assignedBy: chatGptService.aiUserId,
            assignee: {
              _id: humanAgent._id,
              username: humanAgent.username,
              full_name: humanAgent.full_name
            }
          });
          
          // إرسال رسالة للعميل بأنه تم تحويله لمندوب بشري
          const transferMessage = 'سيتم تحويلك الآن إلى مندوب خدمة عملاء للمساعدة.';
          await sendAiResponseToCustomer(conversation, transferMessage);
          
          // إشعار المندوب البشري المعين بالتعيين
          socketService.notifyUser(humanAgent._id, 'conversation_assigned', {
            conversationId: conversation._id,
            assignedBy: 'مساعد الذكاء الاصطناعي',
            customerName: conversation.customerName || conversation.phoneNumber,
            phoneNumber: conversation.phoneNumber
          });
        }
        
        // إرسال إشعار لجميع الموظفين المؤهلين بأن هناك محادثة تحتاج لتدخل بشري
        // حتى وإن لم يكن هناك مندوب متاح للتعيين التلقائي أو تم تعيين مندوب محدد
        try {
          const messagePreview = message.content?.substring(0, 100) || '[رسالة وسائط]';
          logger.info('aiConversationController', 'إرسال إشعار لجميع الموظفين المؤهلين بطلب التدخل البشري', {
            conversationId: conversation._id,
            messagePreview: messagePreview
          });
          
          // استخدام خدمة chatGptService لإرسال إشعار لجميع الموظفين المؤهلين
          await chatGptService.notifyEligibleUsers(
            conversation._id,
            'ai_detected_transfer_request',
            messagePreview
          );
        } catch (notifyError) {
          logger.error('aiConversationController', 'خطأ في إرسال إشعار للموظفين المؤهلين', {
            conversationId: conversation._id,
            error: notifyError.message
          });
        }
      } else if (shouldTransfer && conversation.assignedTo && 
                 conversation.assignedTo.toString() === chatGptService.aiUserId.toString()) {
        // المحادثة معينة للذكاء الاصطناعي ولكن تحتاج للتدخل البشري
        logger.info('aiConversationController', 'المحادثة معينة للذكاء الاصطناعي ولكن تحتاج لتدخل بشري', {
          conversationId: conversation._id
        });
        
        try {
          // إرسال إشعار لجميع الموظفين المؤهلين
          const messagePreview = message.content?.substring(0, 100) || '[رسالة وسائط]';
          await chatGptService.notifyEligibleUsers(
            conversation._id,
            'ai_detected_transfer_request',
            messagePreview
          );
          
          // إرسال رسالة للعميل
          const transferMessage = 'سنقوم بتحويلك إلى مندوب خدمة عملاء بشري في أقرب وقت. شكراً لصبرك.';
          await sendAiResponseToCustomer(conversation, transferMessage);
          
        } catch (notifyError) {
          logger.error('aiConversationController', 'خطأ في إرسال إشعار للموظفين المؤهلين', {
            conversationId: conversation._id,
            error: notifyError.message
          });
        }
      }
      
      return null;
    }
    
    // معالجة الرسالة الواردة وإرسال رد الذكاء الاصطناعي
    logger.info('aiConversationController', 'معالجة رسالة واردة باستخدام الذكاء الاصطناعي', { 
      conversationId: conversation._id,
      messageId: message._id,
      autoAssignAI: autoAssignAI
    });
    
    // تعيين المحادثة لمستخدم الذكاء الاصطناعي إذا لم تكن معينة وكان التعيين التلقائي مفعلاً
    if (!conversation.assignedTo && autoAssignAI) {
      conversation.assignedTo = chatGptService.aiUserId;
      conversation.status = 'assigned';
      await conversation.save();
      
      socketService.notifyConversationUpdate(conversation._id.toString(), {
        type: 'assigned',
        status: conversation.status,
        assignedTo: chatGptService.aiUserId,
        assignedBy: chatGptService.aiUserId
      });
      
      logger.info('aiConversationController', 'تم تعيين المحادثة تلقائياً للذكاء الاصطناعي', { 
        conversationId: conversation._id
      });
    } else if (!conversation.assignedTo && !autoAssignAI) {
      logger.info('aiConversationController', 'تم تجاوز التعيين التلقائي للذكاء الاصطناعي', { 
        conversationId: conversation._id
      });
      
      // المحادثة غير معينة للذكاء الاصطناعي ولا نرغب في التعيين التلقائي، لذا لا نعالج الرسالة
      logger.info('aiConversationController', 'تجاوز معالجة الرسالة لأن المحادثة غير معينة للذكاء الاصطناعي', {
        conversationId: conversation._id
      });
      return null;
    }
    
    // التحقق من أن المحادثة معينة للذكاء الاصطناعي قبل معالجة الرسالة
    if (!conversation.assignedTo || conversation.assignedTo.toString() !== chatGptService.aiUserId.toString()) {
      logger.info('aiConversationController', 'تجاوز معالجة الرسالة لأن المحادثة غير معينة للذكاء الاصطناعي', {
        conversationId: conversation._id
      });
      return null;
    }
    
    // الحصول على رد الذكاء الاصطناعي (فقط إذا كانت المحادثة معينة للذكاء الاصطناعي)
    const aiResponseMessage = await chatGptService.processIncomingMessage(conversation, message);
    
    if (aiResponseMessage && aiResponseMessage.content) {
      // إرسال الرد إلى العميل عبر واتساب
      await sendAiResponseToCustomer(conversation, aiResponseMessage.content, aiResponseMessage);
    }
    
    return aiResponseMessage;
  } catch (error) {
    logger.error('aiConversationController', 'خطأ في معالجة رسالة باستخدام الذكاء الاصطناعي', error);
    return null;
  }
};

/**
 * إرسال رد من الذكاء الاصطناعي إلى العميل
 * @param {Object} conversation المحادثة
 * @param {String} response نص الرد
 * @param {Object} existingMessage الرسالة الموجودة من chatGPT (اختياري)
 */
async function sendAiResponseToCustomer(conversation, response, existingMessage = null) {
  try {
    // 1. جلب معلومات القناة من المحادثة
    const WhatsAppChannel = require('../models/WhatsAppChannel');
    const channel = await WhatsAppChannel.findById(conversation.channelId);
    
    if (!channel) {
      logger.error('aiConversationController', 'القناة غير موجودة', { conversationId: conversation._id });
      return null;
    }
    
    // 2. إرسال الرد عبر واتساب
    const phoneNumber = conversation.phoneNumber;
    
    // --- بداية: جلب phoneNumberId الصحيح ---
    let phoneNumberId = null;
    const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
    
    if (channel && channel.settingsId) {
      const settings = await MetaWhatsappSettings.findById(channel.settingsId).lean();
      if (settings && settings.config && settings.config.phoneNumberId) {
        phoneNumberId = settings.config.phoneNumberId;
        logger.info('aiConversationController', 'تم تحديد رقم الهاتف للإرسال من القناة', { 
          channelId: channel._id,
          settingsId: channel.settingsId,
          phoneNumberId
        });
      } else {
        logger.warn('aiConversationController', 'لم يتم العثور على إعدادات أو phoneNumberId للقناة المرتبطة بالمحادثة', {
          conversationId: conversation._id,
          channelId: channel._id,
          settingsId: channel.settingsId
        });
      }
    } else {
      logger.warn('aiConversationController', 'لم يتم العثور على settingsId في القناة لجلب phoneNumberId', {
        conversationId: conversation._id,
        channelId: conversation.channelId
      });
    }
    
    // التحقق النهائي قبل الإرسال
    if (!phoneNumberId) {
      logger.error('aiConversationController', 'فشل في تحديد رقم هاتف الإرسال الصحيح للقناة', {
        conversationId: conversation._id,
        channelId: conversation.channelId
      });
      
      // محاولة استخدام الرقم الافتراضي من المتغير المخزن في channel.phoneNumberId كاختيار ثانوي
      phoneNumberId = channel.phoneNumberId || null;
    }
    // --- نهاية: جلب phoneNumberId الصحيح ---
    
    // استخدام خدمة ميتا لإرسال الرسالة مع تمرير phoneNumberId
    const messageResult = await metaWhatsappService.sendTextMessage(
      phoneNumber,
      response,
      phoneNumberId
    );
    
    if (!messageResult) {
      logger.error('aiConversationController', 'فشل في إرسال رد الذكاء الاصطناعي', { 
        conversationId: conversation._id,
        channelId: channel._id,
        phoneNumber,
        phoneNumberId
      });
      return null;
    }
    
    // 3. تحديث وقت آخر رسالة للمحادثة
    conversation.lastMessageAt = new Date();
    await conversation.save();
    
    let savedMessage;
    
    // 4. معالجة تخزين وإرسال الرسالة
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
        content: response,
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
          }
        }
      });
      
      // حفظ الرسالة في قاعدة البيانات
      savedMessage = await newMessage.save();
      
      logger.debug('aiConversationController', 'تم إنشاء رسالة رد جديدة من الذكاء الاصطناعي', {
        messageId: savedMessage._id
      });
    }
    
    // 5. إرسال إشعار عبر السوكت لجميع المستخدمين لتحديث واجهة المستخدم
    const currentDate = new Date();
    const isoDateString = currentDate.toISOString();
    
    // 1. إرسال الرسالة كما هي للمستخدمين المتصلين في غرفة المحادثة
    // ملاحظة: يجب أن يكون شكل messageData متطابقًا مع ما تتوقعه addMessageToConversation
    socketService.notifyNewMessage(conversation._id.toString(), {
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
    });
    
    // 2. إرسال تحديث للمحادثة لتحديث آخر رسالة في قائمة المحادثات
    socketService.notifyConversationUpdate(conversation._id.toString(), {
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
    });
    
    return messageResult;
  } catch (error) {
    logger.error('aiConversationController', 'خطأ في إرسال رد الذكاء الاصطناعي', error);
    return null;
  }
} 