/**
 * متحكم webhook واتساب الرسمي من ميتا (الإصدار 22)
 */
const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
const MetaWhatsappWebhookLog = require('../models/MetaWhatsappWebhookLog');
const SemMessage = require('../models/SemMessage');
const WhatsAppChannel = require('../models/WhatsAppChannel');
const Conversation = require('../models/Conversation');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const logger = require('../services/loggerService');
const socketService = require('../services/socketService');
const whatsappMediaController = require('./whatsappMediaController');
const mediaService = require('../services/mediaService');
const NotificationSocketService = require('../services/notificationSocketService');
const metaWhatsappService = require('../services/whatsapp/MetaWhatsappService');
const Contact = require('../models/Contact');
const ContactHelper = require('../utils/contactHelper');

/**
 * مصادقة webhook واتساب من ميتا
 */
exports.verifyWebhook = async (req, res) => {
  try {
    const settings = await MetaWhatsappSettings.getActiveSettings();

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === settings.config.verifyToken) {
      return res.status(200).send(challenge);
    } else {
      logger.warn('metaWhatsappWebhookController', 'فشل التحقق من webhook', { mode, token });
      return res.status(403).json({ error: 'التحقق غير صالح' });
    }
  } catch (error) {
    logger.error('metaWhatsappWebhookController', 'خطأ أثناء التحقق من webhook', error);
    res.status(500).json({ error: 'خطأ أثناء التحقق من webhook' });
  }
};

/**
 * معالجة webhook واتساب من ميتا
 */
exports.handleWebhook = async (req, res) => {
  try {
    const requestId = Date.now().toString();
    const body = req.body;

    let requestType = 'unknown';

    // حفظ السجل
    const webhookLog = new MetaWhatsappWebhookLog({
      requestId,
      body,
      headers: req.headers,
      method: req.method,
      url: req.url,
      timestamp: new Date()
    });

    if (body.object === 'whatsapp_business_account') {
      if (body.entry?.length > 0) {
        for (const entry of body.entry) {
          if (entry.changes?.length > 0) {
            for (const change of entry.changes) {
              // معالجة معلومات جهة الاتصال للعميل إذا كانت موجودة
              if (change.field === 'messages' && change.value.contacts?.length > 0) {
                // استخراج معلومات الملف الشخصي
                const contactInfo = change.value.contacts[0];
                const phone = contactInfo.wa_id;
                const customerName = contactInfo.profile?.name;
                
                if (phone && customerName) {
                  // البحث عن المحادثة الموجودة وتحديثها
                  const existingConversation = await Conversation.findOne({ phoneNumber: phone });
                  if (existingConversation) {
                    existingConversation.customerName = customerName;
                    existingConversation.customerData = contactInfo;
                    await existingConversation.save();
                  }
                }
              }

              if (change.field === 'messages') {
                if (change.value.messages && change.value.messages.length > 0) {
                  requestType = 'message';
                } else if (change.value.statuses && change.value.statuses.length > 0) {
                  requestType = 'status';
                } else if (change.value.reactions && change.value.reactions.length > 0) {
                  requestType = 'reaction';
                }
              }

              // تحديث الحالة
              if (change.field === 'messages' && change.value.statuses?.length > 0) {
                for (const st of change.value.statuses) {
                  await exports.updateMessageStatus(st.id, st.status, new Date(st.timestamp * 1000));
                }
              }

              // معالجة التفاعلات
              if (change.field === 'messages' && change.value.reactions?.length > 0) {
                await handleReactions(change.value.reactions, {
                  phone_number_id: change.value.metadata?.phone_number_id,
                  metadata: change.value.metadata || {}
                });
              }

              // رسائل واردة
              if (change.field === 'messages' && change.value.messages?.length > 0) {
                await exports.handleIncomingMessages(change.value.messages, {
                  phone_number_id: change.value.metadata?.phone_number_id,
                  metadata: change.value.metadata || {},
                  contactInfo: change.value.contacts && change.value.contacts.length > 0 ? 
                               change.value.contacts[0] : null
                });
              }
            }
          }
        }
      }
    }

    webhookLog.requestType = requestType;
    await webhookLog.save();

    return res.status(200).send('EVENT_RECEIVED');
  } catch (error) {
    logger.error('metaWhatsappWebhookController', 'خطأ في معالجة webhook', error);
    return res.status(500).send('ERROR');
  }
};

// مجموعة لتتبع الرسائل التي تمت معالجتها خلال دورة حياة التطبيق
// لمنع معالجة نفس الرسالة مرتين
const processedMessageIds = new Set();

/**
 * تحديث حالة الرسالة
 */
exports.updateMessageStatus = async (externalId, newStatus, timestamp) => {
  try {
    // تحويل الحالات الواردة من واتساب إلى الحالات المستخدمة في النظام
    if (newStatus === 'delivered') {
      newStatus = 'delivered';
    } else if (newStatus === 'read') {
      newStatus = 'read';
    } else if (newStatus === 'failed') {
      newStatus = 'failed';
    }
    
    let message = await WhatsappMessage.findOne({ externalMessageId: externalId });
    
    if (message) {
      message.status = newStatus;
      if (newStatus === 'delivered') {
        message.deliveredAt = timestamp;
      } else if (newStatus === 'read') {
        message.readAt = timestamp;
      }
      await message.save();
      
      if (message.conversationId) {
        socketService.notifyMessageStatusUpdate(
          message.conversationId.toString(),
          externalId,
          newStatus
        );
      }
      
      if (message.metadata && message.metadata.semMessageId) {
        try {
          await SemMessage.findByIdAndUpdate(
            message.metadata.semMessageId.toString(),
            { 
              status: newStatus, 
              ...(newStatus === 'delivered' ? { deliveredAt: timestamp } : {}),
              ...(newStatus === 'read' ? { readAt: timestamp } : {})
            }
          );
        } catch (semUpdateErr) {
          logger.error('metaWhatsappWebhookController', 'خطأ في تحديث SemMessage', semUpdateErr);
        }
      }
    } else {
      logger.warn('metaWhatsappWebhookController', 'رسالة غير موجودة في WhatsappMessage، تم تجاهل الحالة', { externalId, newStatus });
    }
  } catch (err) {
    logger.error('metaWhatsappWebhookController', 'خطأ في updateMessageStatus', err);
  }
};

/**
 * معالجة التفاعلات على الرسائل
 */
async function handleReactions(reactions, meta) {
  try {
    const phoneNumberId = meta.phone_number_id;
    let channel = await WhatsAppChannel.getChannelByPhoneNumberId(phoneNumberId);
    if (!channel) {
      channel = await WhatsAppChannel.getDefaultChannel();
    }

    for (const reaction of reactions) {
      try {
        const sender = reaction.from;
        const messageId = reaction.message_id;
        const emoji = reaction.emoji || '';
        
        const conversation = await Conversation.findOne({ 
          phoneNumber: sender 
        });
        if (!conversation) {
          logger.warn('metaWhatsappWebhookController', 'محادثة غير موجودة للتفاعل', { sender });
          continue;
        }

        const originalMessage = await WhatsappMessage.findOne({ externalMessageId: messageId });
        if (!originalMessage) {
          logger.warn('metaWhatsappWebhookController', 'الرسالة المتفاعل معها غير موجودة', { messageId });
          continue;
        }

        const reactionData = {
          sender,
          emoji,
          timestamp: new Date(parseInt(reaction.timestamp) * 1000 || Date.now())
        };
        
        await WhatsappMessage.updateReaction(messageId, reactionData);
        
        socketService.notifyMessageReaction(
          conversation._id.toString(),
          messageId,
          reactionData
        );

      } catch (errReaction) {
        logger.error('metaWhatsappWebhookController', 'خطأ في معالجة تفاعل وارد', errReaction);
      }
    }
  } catch (err) {
    logger.error('metaWhatsappWebhookController', 'خطأ في handleReactions', err);
  }
}

/**
 * معالجة الرسائل الواردة
 */
exports.handleIncomingMessages = async (messages, meta) => {
  try {
    for (const msg of messages) {
      try {
        // تجاهل الرسائل التي تمت معالجتها
        if (processedMessageIds.has(msg.id)) {
          continue;
        }
        
        processedMessageIds.add(msg.id);
        if (processedMessageIds.size > 1000) {
          const oldestItems = Array.from(processedMessageIds).slice(0, 500);
          oldestItems.forEach(id => processedMessageIds.delete(id));
        }
        
        if (!msg.from) {
          logger.warn('metaWhatsappWebhookController', 'رسالة بدون مصدر', { id: msg.id });
          continue;
        }
        
        const phoneNumberId = meta.phone_number_id;
        const channel = await WhatsAppChannel.getChannelByPhoneNumberId(phoneNumberId);
        
        if (!channel) {
          logger.error('metaWhatsappWebhookController', 'لم يتم العثور على قناة مطابقة', { 
            phoneNumberId, 
            msgId: msg.id 
          });
          continue;
        }
        
        const phone = msg.from;
        let conversationInstance = await Conversation.findOne({ phoneNumber: phone });
        
        let isNewConversation = false;
        if (conversationInstance) {
          conversationInstance.channelId = channel._id; 

          // استخدام معلومات الملف الشخصي التي تم تمريرها من handleWebhook
          if (meta.contactInfo) {
            if (meta.contactInfo.profile && meta.contactInfo.profile.name) {
              conversationInstance.customerName = meta.contactInfo.profile.name;
            }
            conversationInstance.customerData = meta.contactInfo;
          }
          // التحقق مما إذا كانت الرسالة تحتوي على معلومات ملف تعريف
          else if (msg.contacts && msg.contacts.length > 0) {
            const contact = msg.contacts[0];
            conversationInstance.customerData = contact;
            if (contact.profile && contact.profile.name) {
              conversationInstance.customerName = contact.profile.name;
            }
          } 
          // إذا لم تكن معلومات الملف الشخصي متوفرة في الرسالة وليست متوفرة في المحادثة
          else if (!conversationInstance.customerData || Object.keys(conversationInstance.customerData).length === 0) {
            try {
              const profileInfo = await metaWhatsappService.getCustomerProfileInfo(phone, meta.phone_number_id);
              if (profileInfo) {
                conversationInstance.customerData = profileInfo;
              }
            } catch (profileError) {
              logger.error('metaWhatsappWebhookController', 'خطأ في الحصول على معلومات الملف الشخصي', {
                error: profileError.message,
                phone
              });
            }
          }

          // التحقق من حالة المحادثة وإعادة فتحها تلقائيًا إذا كانت مغلقة
          if (conversationInstance.status === 'closed') {
            await conversationInstance.automaticReopen();
            conversationInstance.lastMessageAt = new Date(); 
          } else {
            conversationInstance.lastMessageAt = new Date();
          }
          await conversationInstance.save();
        } else {
          isNewConversation = true;
          
          const conversationData = {
            channelId: channel._id,
            phoneNumber: phone,
            status: 'open',
            lastMessageAt: new Date(),
            lastOpenedAt: new Date()
          };
          
          if (meta.contactInfo) {
            conversationData.customerData = meta.contactInfo;
            if (meta.contactInfo.profile && meta.contactInfo.profile.name) {
              conversationData.customerName = meta.contactInfo.profile.name;
            }
          }
          else if (msg.contacts && msg.contacts.length > 0) {
            const contact = msg.contacts[0];
            conversationData.customerData = contact;
            if (contact.profile && contact.profile.name) {
              conversationData.customerName = contact.profile.name;
            }
          } 
          else {
            try {
              const profileInfo = await metaWhatsappService.getCustomerProfileInfo(phone, meta.phone_number_id);
              if (profileInfo) {
                conversationData.customerData = profileInfo;
                if (!conversationData.customerName) {
                  conversationData.customerName = `عميل ${phone.substring(phone.length - 6)}`;
                }
              }
            } catch (profileError) {
              logger.error('metaWhatsappWebhookController', 'خطأ في الحصول على معلومات الملف الشخصي لمحادثة جديدة', {
                error: profileError.message,
                phone
              });
            }
          }
          
          conversationInstance = await Conversation.create(conversationData);
        }

        const conversation = conversationInstance.toObject();

        // --- إضافة كود إنشاء جهة الاتصال التلقائي ---
        try {
          const phone = conversationInstance.phoneNumber;
          let contact = await Contact.findByPhoneNumber(phone);

          if (!contact && conversationInstance.customerName) { // أنشئ فقط إذا لم يكن موجوداً ولدينا اسم
            // تحقق أن الاسم ليس هو الاسم المؤقت
            const temporaryNamePattern = /^عميل \d{6}$/;
            if (!temporaryNamePattern.test(conversationInstance.customerName)) {
              contact = await Contact.create({
                name: conversationInstance.customerName,
                phoneNumber: phone,
                createdBy: null // يمكنك تعيين مستخدم نظام هنا إذا أردت
              });
            } else {
            }
          } else if (!contact) {
          }

          // ربط المحادثة بجهة الاتصال إذا وجدت
          if (contact && !conversationInstance.contactId) {
            conversationInstance.contactId = contact._id;
            await conversationInstance.save();
          }
        } catch (contactError) {
          // تم إزالة logger.error - استمر في معالجة الرسالة حتى لو فشل إنشاء جهة الاتصال
        }
        // --- نهاية كود إنشاء جهة الاتصال التلقائي ---

        const messageData = {
          conversationId: conversation._id.toString(),
          externalMessageId: msg.id,
          direction: 'incoming',
          content: msg.text?.body || '',
          timestamp: new Date(parseInt(msg.timestamp) * 1000),
          status: 'delivered',
          from: msg.from
        };
        
        if (msg.context && msg.context.id) {
          const originalMsg = await WhatsappMessage.findOne({ 
            externalMessageId: msg.context.id 
          });
          
          if (originalMsg) {
            const originalMsgId = originalMsg._id ? originalMsg._id.toString() : null;
            messageData.replyToMessageId = originalMsgId;
            messageData.replyToExternalId = msg.context.id;
          } else {
            logger.warn('metaWhatsappWebhookController', 'الرسالة الأصلية المردود عليها غير موجودة', {
              messageId: msg.id,
              originalExternalId: msg.context.id
            });
          }
        }
        
        if (msg.type === 'reaction') {
          const originalMsg = await WhatsappMessage.findOne({ 
            externalMessageId: msg.reaction.message_id 
          });
          
          if (originalMsg) {
            const originalMsgId = originalMsg._id ? originalMsg._id.toString() : null;
            const reactionData = {
              sender: msg.from,
              emoji: msg.reaction.emoji || '',
              timestamp: new Date(parseInt(msg.timestamp) * 1000 || Date.now())
            };
            
            await WhatsappMessage.updateReaction(msg.reaction.message_id, reactionData);
            
            socketService.notifyMessageReaction(
              conversation._id.toString(),
              originalMsgId,
              reactionData
            );
            
            continue;
          } else {
            logger.warn('metaWhatsappWebhookController', 'الرسالة المتفاعل معها غير موجودة', { 
              messageId: msg.reaction.message_id 
            });
            continue;
          }
        }

        if (['image', 'video', 'audio', 'document', 'sticker', 'location'].includes(msg.type)) {
          messageData.mediaType = msg.type;
          messageData.content = msg.text?.body || '';
          
          switch (msg.type) {
            case 'image':
              messageData.mediaUrl = msg.image?.link || msg.image?.id;
              break;
            case 'video':
              messageData.mediaUrl = msg.video?.link || msg.video?.id;
              break;
            case 'audio':
              messageData.mediaUrl = msg.audio?.link || msg.audio?.id;
              break;
            case 'document':
              messageData.mediaUrl = msg.document?.link || msg.document?.id;
              messageData.fileName = msg.document?.filename || 'document';
              break;
            case 'sticker':
              messageData.mediaUrl = msg.sticker?.link || msg.sticker?.id;
              break;
            case 'location':
              messageData.content = `الموقع: ${msg.location?.name || ''} - عرض: ${msg.location?.latitude}, طول: ${msg.location?.longitude}`;
              break;
          }
        }
        
        const savedMsg = await WhatsappMessage.create(messageData);
        
        if (savedMsg.mediaType) {
          try {
            let mediaInfo = null;
            
            switch (msg.type) {
              case 'image':
                mediaInfo = msg.image;
                mediaInfo.type = 'image';
                break;
              case 'video':
                mediaInfo = msg.video;
                mediaInfo.type = 'video';
                break;
              case 'audio':
                mediaInfo = msg.audio;
                mediaInfo.type = 'audio';
                break;
              case 'document':
                mediaInfo = msg.document;
                mediaInfo.type = 'document';
                break;
              case 'sticker':
                mediaInfo = msg.sticker;
                mediaInfo.type = 'sticker';
                break;
              case 'location':
                mediaInfo = msg.location;
                mediaInfo.type = 'location';
                break;
            }
            
            if (mediaInfo) {
              const result = await whatsappMediaController.downloadAndSaveMedia(mediaInfo, savedMsg);
              if (!(result && result.success && result.media)) {
                logger.warn('metaWhatsappWebhookController', 'لم يتم تنزيل أو ربط الوسائط بنجاح', {
                  messageId: savedMsg._id,
                  mediaType: mediaInfo.type,
                  mediaResult: result
                });
              }
            }
          } catch (mediaError) {
            logger.error('metaWhatsappWebhookController', 'خطأ في معالجة الوسائط', {
              error: mediaError.message,
              messageId: savedMsg._id,
              type: msg.type
            });
          }
        }

        let messageWithMedia = savedMsg.toObject();
        
        if (savedMsg.mediaType) {
          const media = await mediaService.findMediaForMessage(savedMsg);
          if (media) {
            messageWithMedia = mediaService.prepareMessageWithMedia(messageWithMedia, media);
          } else {
            logger.warn('metaWhatsappWebhookController', 'الرسالة تحتوي على نوع وسائط ولكن لم يتم العثور على سجل الوسائط', { 
              messageId: savedMsg._id,
              mediaType: savedMsg.mediaType
            });
          }
        }
        
        socketService.notifyNewMessage(
          conversation._id.toString(), 
          messageWithMedia
        );
        
        const updatedConversationForNotification = await Conversation.findById(conversation._id)
          .populate('contactId', 'name phoneNumber')
          .lean();
          
        if (updatedConversationForNotification) {
          // تحضير بيانات التحديث باستخدام الدالة المساعدة للاسم
          const conversationData = {
            _id: updatedConversationForNotification._id,
            lastMessageAt: updatedConversationForNotification.lastMessageAt,
            status: updatedConversationForNotification.status,
            unreadCount: await WhatsappMessage.countDocuments({
              conversationId: conversation._id,
              direction: 'incoming',
              status: { $ne: 'read' }
            }),
            lastMessage: messageWithMedia,
            phoneNumber: updatedConversationForNotification.phoneNumber,
            customerName: updatedConversationForNotification.customerName,
            contactId: updatedConversationForNotification.contactId,
            // إضافة الاسم المعروض الموحد
            displayName: ContactHelper.getServerDisplayName(updatedConversationForNotification)
          };
          
          socketService.notifyConversationUpdate(conversation._id.toString(), conversationData);
        }

        if (messageWithMedia) {
          await processNewMessage(messageWithMedia, conversationInstance, isNewConversation);
        }
      } catch (err) {
        logger.error('metaWhatsappWebhookController', 'خطأ في معالجة رسالة فردية', err);
      }
    }
  } catch (err) {
    logger.error('metaWhatsappWebhookController', 'خطأ في handleIncomingMessages', err);
  }
};

/**
 * معالجة نهاية إضافة الرسالة الواردة
 * @param {Object} message - كائن الرسالة التي تم حفظها
 * @param {Object} conversationInstance - كائن المحادثة 
 * @param {Boolean} isNewConversation - هل المحادثة جديدة
 */
async function processNewMessage(message, conversationInstance, isNewConversation) {
  try {
    socketService.notifyNewMessage(
      conversationInstance._id.toString(),
      message
    );
    
    const isActive = socketService.io ? 
      socketService.io.sockets.adapter.rooms.has(`conversation-${conversationInstance._id.toString()}`) : 
      false;
    
    // إذا كانت المحادثة نشطة، قم بتحديث الرسالة كمقروءة تلقائياً
    if (isActive && message.direction === 'incoming') {
      // وضع علامة "مقروءة" على الرسالة إذا كان هناك مستخدم مشاهد للمحادثة حالياً
      try {
        // إيجاد أول مستخدم نشط في الغرفة
        let activeUserId = null;
        const roomName = `conversation-${conversationInstance._id.toString()}`;
        const room = socketService.io.sockets.adapter.rooms.get(roomName);
        
        if (room) {
          for (const socketId of room) {
            const socket = socketService.io.sockets.sockets.get(socketId);
            if (socket && socket.userId && socket.userId !== 'guest') {
              activeUserId = socket.userId;
              break;
            }
          }
        }
        
        if (activeUserId) {
          // استخدام الوظيفة الموجودة لتحديث حالة الرسالة
          await require('../models/WhatsappMessageModel').updateOne(
            { _id: message._id },
            { $set: { status: 'read', readAt: new Date() } }
          );
        }
      } catch (readError) {
        logger.error('metaWhatsappWebhookController', 'خطأ في وضع علامة مقروء تلقائياً', { 
          error: readError.message, 
          messageId: message._id,
          conversationId: conversationInstance._id.toString()
        });
      }
    }
    
    // جلب بيانات المحادثة مع بيانات جهة الاتصال الكاملة قبل إرسالها للإشعارات
    const populatedConversation = await Conversation.findById(conversationInstance._id)
      .populate('contactId', 'name phoneNumber')
      .lean();
    
    await NotificationSocketService.sendMessageNotification(
      conversationInstance._id.toString(),
      message,
      populatedConversation || conversationInstance, // استخدام البيانات المجلوبة إذا كانت متاحة
      isActive
    );
    
  } catch (error) {
    logger.error('metaWhatsappWebhookController', 'خطأ في معالجة نهاية إضافة الرسالة', error);
  }
}
