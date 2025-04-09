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
      
      // استخدام اسم العميل إن وجد من أجل التخصيص
      const customerName = conversation.customerName || '';
      
      // إرسال رسالة أولى مخصصة بناءً على إعدادات النظام
      // استدعاء خدمة الذكاء الاصطناعي لإنشاء رسالة استقبال مخصصة
      const initialResponse = await chatGptService.getInitialGreeting(customerName);
      
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
    
    // جلب معلومات قناة واتساب
    const channel = await WhatsAppChannel.findById(conversation.channelId);
    
    if (!channel) {
      logger.error('aiConversationController', 'لم يتم العثور على قناة واتساب', { 
        conversationId: conversation._id,
        channelId: conversation.channelId 
      });
      return null;
    }
    
    // جلب رقم الهاتف ومعرف هاتف العميل
    const phoneNumber = conversation.phoneNumber;
    // استخدام معرف رقم الهاتف من تكوين القناة
    const phoneNumberId = channel.config.phoneNumberId || channel.whatsappBusinessPhoneNumberId;
    // استخدام توكن الوصول من تكوين القناة
    const accessToken = channel.config.accessToken || channel.accessToken;
    
    // التحقق من وجود البيانات المطلوبة
    if (!phoneNumber || !phoneNumberId || !accessToken) {
      logger.error('aiConversationController', 'بيانات القناة أو العميل غير مكتملة', {
        phoneNumber: !!phoneNumber,
        phoneNumberId: !!phoneNumberId,
        accessTokenExists: !!accessToken
      });
      return null;
    }
    
    // سجل البيانات للتصحيح
    logger.debug('aiConversationController', 'بيانات إرسال الرسالة', {
      channelId: conversation.channelId,
      phoneNumber: phoneNumber,
      phoneNumberId: phoneNumberId,
    });
    
    // إرسال الرسالة عبر خدمة ميتا واتساب
    const messageResult = await metaWhatsappService.sendTextMessage(
      accessToken,
      phoneNumberId,
      phoneNumber,
      response
    );
    
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