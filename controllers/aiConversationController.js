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
 */
exports.processIncomingMessage = async (message, conversation) => {
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
          
          // إشعار المندوب البشري بالتعيين
          socketService.notifyUser(humanAgent._id, 'conversation_assigned', {
            conversationId: conversation._id,
            assignedBy: 'مساعد الذكاء الاصطناعي',
            customerName: conversation.customerName || conversation.phoneNumber,
            phoneNumber: conversation.phoneNumber
          });
        }
      }
      
      return null;
    }
    
    // معالجة الرسالة الواردة وإرسال رد الذكاء الاصطناعي
    logger.info('aiConversationController', 'معالجة رسالة واردة باستخدام الذكاء الاصطناعي', { 
      conversationId: conversation._id,
      messageId: message._id
    });
    
    // تعيين المحادثة لمستخدم الذكاء الاصطناعي إذا لم تكن معينة
    if (!conversation.assignedTo) {
      conversation.assignedTo = chatGptService.aiUserId;
      conversation.status = 'assigned';
      await conversation.save();
      
      socketService.notifyConversationUpdate(conversation._id.toString(), {
        type: 'assigned',
        status: conversation.status,
        assignedTo: chatGptService.aiUserId,
        assignedBy: chatGptService.aiUserId
      });
    }
    
    // الحصول على رد الذكاء الاصطناعي
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
    
    // استخدام خدمة ميتا لإرسال الرسالة
    const messageResult = await metaWhatsappService.sendTextMessage(
      phoneNumber,
      response,
      channel.phoneNumberId
    );
    
    if (!messageResult) {
      logger.error('aiConversationController', 'فشل في إرسال رد الذكاء الاصطناعي', { 
        conversationId: conversation._id,
        channelId: channel._id,
        phoneNumber
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