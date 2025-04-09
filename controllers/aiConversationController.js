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
          
          // إرسال رسالة للعميل بأنه تم تحويله لمندوب خدمة عملاء
          const transferMessage = 'سيتم تحويلك الآن إلى مندوب خدمة عملاء للمساعدة.';
          await exports.sendAiResponseToCustomer(conversation, transferMessage);
        }
      } else if (shouldTransfer && conversation.assignedTo && 
                 conversation.assignedTo.toString() === chatGptService.aiUserId.toString()) {
        // المحادثة معينة للذكاء الاصطناعي ولكن تحتاج للتدخل البشري
        logger.info('aiConversationController', 'المحادثة معينة للذكاء الاصطناعي ولكن تحتاج لتدخل بشري', {
          conversationId: conversation._id
        });
        
        // إرسال رسالة للعميل فقط
        const transferMessage = 'سنقوم بتحويلك إلى مندوب خدمة عملاء بشري في أقرب وقت. شكراً لصبرك.';
        await exports.sendAiResponseToCustomer(conversation, transferMessage);
      }
      
      return null;
    }
    
    // معالجة الرسالة الواردة وإرسال رد الذكاء الاصطناعي
    logger.info('aiConversationController', 'معالجة رسالة واردة باستخدام الذكاء الاصطناعي', { 
      conversationId: conversation._id,
      messageId: message._id,
      mediaType: message.mediaType || 'text'
    });
    
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
      
      // إرسال رسالة ترحيب
      const welcomeMessage = 'مرحباً! أنا المساعد الآلي وسأكون سعيداً بمساعدتك اليوم. كيف يمكنني خدمتك؟';
      await exports.sendAiResponseToCustomer(conversation, welcomeMessage);
    }
    
    // معالجة الرسالة واستخراج الرد من ChatGPT
    // هذا سيقوم بإدارة الرد على الصور والملفات الصوتية أيضاً
    logger.debug('aiConversationController', 'ما قبل معالجة chatGptService للرسالة', { 
      messageId: message._id, 
      hasContent: !!message.content, 
      mediaType: message.mediaType || 'text' 
    });
    
    // تهيئة متغيرات المعالجة
    conversation.status = 'open';
    let aiResponse;
    let responseContentForWhatsapp;
    
    try {
      // إرسال الرسالة إلى ChatGPT للحصول على رد
      logger.info('aiConversationController', 'معالجة الرسالة باستخدام الذكاء الاصطناعي', {
        conversationId: conversation._id
      });
      
      // إذا كانت المحادثة غير معينة لأحد، قم بتعيينها للذكاء الاصطناعي
      if (!conversation.assignedTo && autoAssignAI) {
        conversation.assignedTo = chatGptService.aiUserId;
        await conversation.save();
      }
      
      // معالجة الرسالة ببرمجيات الذكاء الاصطناعي
      aiResponse = await chatGptService.processIncomingMessage(conversation, message);
      
      if (!aiResponse) {
        logger.warn('aiConversationController', 'لم يتم الحصول على رد من الذكاء الاصطناعي', {
          conversationId: conversation._id
        });
        return null;
      }
      
      // استخراج محتوى الرد من كائن الاستجابة
      responseContentForWhatsapp = aiResponse.content;
      
      // تسجيل معلومات الرد وإحصائيات الاستخدام
      if (aiResponse.usage) {
        logger.info('aiConversationController', 'إحصائيات استخدام OpenAI', {
          promptTokens: aiResponse.usage.prompt_tokens,
          completionTokens: aiResponse.usage.completion_tokens,
          totalTokens: aiResponse.usage.total_tokens,
          model: aiResponse.model || chatGptService.model
        });
      }
      
      // إرسال الرد إلى العميل
      await exports.sendAiResponseToCustomer(conversation, responseContentForWhatsapp);
      
      return aiResponse;
      
    } catch (error) {
      logger.error('aiConversationController', 'خطأ أثناء معالجة رسالة الذكاء الاصطناعي', error);
      
      // إرسال رسالة خطأ بسيطة للعميل إذا فشلت المعالجة
      const errorMessage = 'عذراً، حدث خطأ أثناء معالجة طلبك. سيتم توجيهك إلى مندوب خدمة عملاء في أقرب وقت.';
      
      try {
        await exports.sendAiResponseToCustomer(conversation, errorMessage);
      } catch (sendError) {
        logger.error('aiConversationController', 'فشل في إرسال رسالة الخطأ للعميل', sendError);
      }
      
      return null;
    }
    
    // إذا كانت المحادثة معينة للذكاء الاصطناعي ولكنها لم تتم معالجتها، قم بإرسال رسالة اعتذار
    if (conversation.status === 'abandoned') {
      // تعيين المحادثة إلى مندوب بشري إذا فشل الذكاء الاصطناعي
      logger.warn('aiConversationController', 'تعيين المحادثة إلى مندوب بشري بعد فشل الذكاء الاصطناعي', {
        conversationId: conversation._id
      });
      
      // تحديث المحادثة
      conversation.status = 'unassigned';
      conversation.assignedTo = null;
      await conversation.save();
      
      // إشعار الواجهة
      socketService.emitToRoom(
        'admin',
        'conversation:updated',
        {
          _id: conversation._id,
          assignedTo: null,
          status: 'unassigned'
        }
      );
      
      // إرسال رسالة اعتذار
      const apologizeMessage = 'عذراً، أواجه بعض الصعوبات في التعامل مع طلبك. سأقوم بتحويلك إلى مندوب خدمة عملاء بشري في أقرب وقت ممكن.';
      await exports.sendAiResponseToCustomer(conversation, apologizeMessage);
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
    if (!response || typeof response !== 'string' || !conversation) {
      logger.error('aiConversationController', 'تم تمرير بيانات غير صالحة إلى sendAiResponseToCustomer', {
        hasResponse: !!response, 
        responseType: typeof response,
        hasConversation: !!conversation
      });
      return null;
    }
    
    const { phoneNumber, channelId, phoneNumberId } = conversation;
    
    if (!phoneNumber || !channelId) {
      logger.error('aiConversationController', 'بيانات المحادثة غير مكتملة', {
        phoneNumber,
        channelId
      });
      return null;
    }
    
    // 1. إرسال الرسالة عبر WhatsApp
    logger.debug('aiConversationController', 'جاري إرسال رسالة الذكاء الاصطناعي للعميل', {
      phoneNumber, 
      responseLength: response.length 
    });
    
    const channel = await metaWhatsappService.getChannelById(channelId);
    
    if (!channel) {
      logger.error('aiConversationController', 'لم يتم العثور على قناة الواتس أب', {
        channelId
      });
      return null;
    }
    
    // إرسال الرسالة عبر API الواتس أب
    const messageResult = await metaWhatsappService.sendTextMessage({
      phoneNumber,
      message: response,
      phoneNumberId: phoneNumberId || channel.phoneNumberId
    });
    
    if (!messageResult || !messageResult.messages || messageResult.messages.length === 0) {
      logger.error('aiConversationController', 'فشل في إرسال رسالة الذكاء الاصطناعي للعميل', {
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
    
    // 5. إرسال إشعار عبر السوكت فقط لتحديث واجهة المستخدم
    const currentDate = new Date();
    const isoDateString = currentDate.toISOString();
    
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
    
    // تحديث واجهة المستخدم لقائمة المحادثات
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