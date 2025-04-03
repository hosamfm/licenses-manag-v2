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
      logger.info('metaWhatsappWebhookController', 'تم التحقق من webhook بنجاح');
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
              if (change.field === 'messages') {
                if (change.value.messages && change.value.messages.length > 0) {
                  requestType = 'message';
                } else if (change.value.statuses && change.value.statuses.length > 0) {
                  requestType = 'status';
                } else if (change.value.reactions && change.value.reactions.length > 0) {
                  requestType = 'reaction';
                }
              }

              logger.info('metaWhatsappWebhookController', 'تغيير في الحقل ' + change.field, {
                requestId,
                field: change.field
              });

              // تحديث الحالة
              if (change.field === 'messages' && change.value.statuses?.length > 0) {
                for (const st of change.value.statuses) {
                  logger.info('metaWhatsappWebhookController', 'تحديث حالة رسالة', {
                    requestId,
                    messageId: st.id,
                    newStatus: st.status
                  });
                  await updateMessageStatus(st.id, st.status, new Date(st.timestamp * 1000));
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
                  // أو ربما entry.messaging_product, تأكد من المصدر
                  metadata: change.value.metadata || {}
                });
              }
            }
          }
        }
      }
    }

    webhookLog.requestType = requestType;
    await webhookLog.save();

    logger.info('metaWhatsappWebhookController', 'تم حفظ سجل webhook', { requestId, requestType });
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
async function updateMessageStatus(externalId, newStatus, timestamp) {
  try {
    logger.info('metaWhatsappWebhookController', 'تحديث حالة الرسالة', { externalId, newStatus });
    
    let systemStatus = newStatus; 
    if (newStatus === 'sent') systemStatus = 'sent';
    if (newStatus === 'delivered') systemStatus = 'delivered';
    if (newStatus === 'read') systemStatus = 'read';
    if (newStatus === 'failed') systemStatus = 'failed';

    // البحث عن الرسالة في WhatsappMessage
    const wMsg = await WhatsappMessage.findOne({ externalMessageId: externalId });
    if (wMsg) {
      wMsg.status = systemStatus;
      if (systemStatus === 'delivered' && !wMsg.deliveredAt) wMsg.deliveredAt = timestamp;
      if (systemStatus === 'read' && !wMsg.readAt) wMsg.readAt = timestamp;
      await wMsg.save();

      // إشعار socket - استخدام الطريقة الصحيحة في socketService
      socketService.notifyMessageStatusUpdate(wMsg.conversationId, externalId, systemStatus);
      
      // إذا كانت الحالة "sent" وهي أول تحديث، فهذا يعني أننا استلمنا المعرف الخارجي للرسالة
      // سنرسل إشعارًا إضافيًا لربط المعرف الداخلي بالمعرف الخارجي
      if (systemStatus === 'sent') {
        logger.info('metaWhatsappWebhookController', 'إرسال تحديث بربط المعرف الخارجي بالداخلي', { 
          messageId: wMsg._id, 
          externalId: externalId 
        });
        socketService.notifyMessageExternalIdUpdate(wMsg.conversationId, wMsg._id.toString(), externalId);
      }
    } else {
      logger.warn('metaWhatsappWebhookController', 'رسالة غير موجودة في WhatsappMessage', { externalId });
    }

    // البحث في SemMessage (لو كنت تستخدمها للإرسال)
    const semMsg = await SemMessage.findOne({ externalMessageId: externalId });
    if (semMsg) {
      semMsg.status = systemStatus;
      if (systemStatus === 'delivered') semMsg.deliveredAt = timestamp;
      if (systemStatus === 'read') semMsg.readAt = timestamp;

      if (!semMsg.providerData) semMsg.providerData = {};
      semMsg.providerData.lastUpdate = timestamp;
      semMsg.providerData.status = systemStatus;
      await semMsg.save();

      logger.info('metaWhatsappWebhookController', 'تم تحديث حالة الرسالة في SemMessage أيضاً', { externalId });
    }

  } catch (err) {
    logger.error('metaWhatsappWebhookController', 'خطأ في updateMessageStatus', err);
  }
}

/**
 * معالجة التفاعلات على الرسائل
 */
async function handleReactions(reactions, meta) {
  try {
    const phoneNumberId = meta.phone_number_id;
    logger.info('metaWhatsappWebhookController', 'تفاعلات واردة', {
      phoneNumberId, count: reactions.length
    });

    // الحصول على القناة
    let channel = await WhatsAppChannel.getChannelByPhoneNumberId(phoneNumberId);
    if (!channel) {
      channel = await WhatsAppChannel.getDefaultChannel();
      logger.info('metaWhatsappWebhookController', 'القناة غير موجودة، تم استخدام الافتراضية', { phoneNumberId });
    }

    for (const reaction of reactions) {
      try {
        const sender = reaction.from;
        const messageId = reaction.message_id;
        const emoji = reaction.emoji || '';
        
        logger.info('metaWhatsappWebhookController', 'تفاعل وارد', {
          from: sender,
          messageId,
          emoji
        });

        // ابحث عن المحادثة المرتبطة بالهاتف المرسل
        const conversation = await Conversation.findOne({ 
          phoneNumber: sender 
        });
        if (!conversation) {
          logger.warn('metaWhatsappWebhookController', 'محادثة غير موجودة للتفاعل', { sender });
          continue;
        }

        // ابحث عن الرسالة المتفاعل معها
        const originalMessage = await WhatsappMessage.findOne({ externalMessageId: messageId });
        if (!originalMessage) {
          logger.warn('metaWhatsappWebhookController', 'الرسالة المتفاعل معها غير موجودة', { messageId });
          continue;
        }

        // تحديث التفاعل في الرسالة
        const reactionData = {
          sender,
          emoji,
          timestamp: new Date(parseInt(reaction.timestamp) * 1000 || Date.now())
        };
        
        const updatedMessage = await WhatsappMessage.updateReaction(messageId, reactionData);
        
        // إشعار بالتفاعل
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
          logger.info('metaWhatsappWebhookController', 'تجاهل رسالة تمت معالجتها مسبقًا', { id: msg.id });
          continue;
        }
        
        // إضافة إلى قائمة المعالجة
        processedMessageIds.add(msg.id);
        
        // للمراقبة فقط، حذف بعد تأكيد صحة النظام
        if (processedMessageIds.size > 1000) {
          // تنظيف القائمة لمنع استهلاك الذاكرة
          const oldestItems = Array.from(processedMessageIds).slice(0, 500);
          oldestItems.forEach(id => processedMessageIds.delete(id));
        }
        
        logger.info('metaWhatsappWebhookController', 'معالجة رسالة واردة', { 
          id: msg.id, 
          type: msg.type, 
          from: msg.from 
        });
        
        if (!msg.from) {
          logger.warn('metaWhatsappWebhookController', 'رسالة بدون مصدر', { id: msg.id });
          continue;
        }
        
        // البحث عن القناة باستخدام phone_number_id
        const phoneNumberId = meta.phone_number_id;
        const channel = await WhatsAppChannel.findOne({ wabaPhoneNumberId: phoneNumberId }).lean();
        
        if (!channel) {
          logger.error('metaWhatsappWebhookController', 'لم يتم العثور على قناة مطابقة', { 
            phoneNumberId, 
            msgId: msg.id 
          });
          continue;
        }
        
        // البحث عن المحادثة أو إنشاء واحدة جديدة
        const phone = msg.from;
        let conversation = await Conversation.findOne({ 
          phoneNumber: phone, 
          channelId: channel._id 
        }).lean();
        
        if (!conversation) {
          logger.info('metaWhatsappWebhookController', 'إنشاء محادثة جديدة', { phone, channelId: channel._id });
          
          // إنشاء محادثة جديدة
          conversation = await Conversation.create({
            channelId: channel._id,
            phoneNumber: phone,
            platform: 'whatsapp',
            status: 'open',
            lastMessageAt: new Date()
          });
        } else {
          // تحديث وقت آخر رسالة
          await Conversation.findByIdAndUpdate(conversation._id, { 
            lastMessageAt: new Date(),
            // إرجاع المحادثة المغلقة إلى حالة مفتوحة
            status: conversation.status === 'closed' ? 'open' : conversation.status
          });
          
          // تحديث المحادثة المستخدمة
          conversation = await Conversation.findById(conversation._id).lean();
        }
        
        // إنشاء كائن رسالة جديد
        const messageData = {
          conversationId: conversation._id,
          externalMessageId: msg.id,
          direction: 'incoming',
          content: msg.text?.body || '',
          timestamp: new Date(parseInt(msg.timestamp) * 1000),
          status: 'delivered',
          from: msg.from
        };
        
        // إذا كانت الرسالة رداً على رسالة أخرى
        if (msg.context && msg.context.id) {
          const originalMsg = await WhatsappMessage.findOne({ 
            externalMessageId: msg.context.id 
          }).lean();
          
          if (originalMsg) {
            messageData.replyToMessageId = originalMsg._id;
            messageData.replyToExternalId = msg.context.id;
          }
        }
        
        // إذا كانت الرسالة تفاعل
        if (msg.type === 'reaction') {
          const originalMsg = await WhatsappMessage.findOne({ 
            externalMessageId: msg.reaction.message_id 
          }).lean();
          
          if (originalMsg) {
            messageData.isReaction = true;
            messageData.reaction = msg.reaction.emoji;
            messageData.originalMessageId = originalMsg._id;
            messageData.originalExternalId = msg.reaction.message_id;
          }
        }
        
        // إذا كانت الرسالة تحتوي على وسائط
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
              // حفظ معلومات الموقع في الرسالة
              messageData.content = `الموقع: ${msg.location?.name || ''} - عرض: ${msg.location?.latitude}, طول: ${msg.location?.longitude}`;
              break;
          }
        }
        
        // حفظ الرسالة
        const savedMsg = await WhatsappMessage.create(messageData);
        
        // معالجة الوسائط إذا وجدت
        if (savedMsg.mediaType) {
          try {
            // تحضير معلومات الوسائط
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
              // استخدام خدمة الوسائط بدلاً من متحكم الوسائط مباشرة
              const result = await whatsappMediaController.downloadAndSaveMedia(mediaInfo, savedMsg);
              
              // التأكد من وجود وسائط وربطها مع الرسالة
              if (result && result.success && result.media) {
                logger.info('metaWhatsappWebhookController', 'تم تنزيل الوسائط بنجاح', { 
                  messageId: savedMsg._id, 
                  mediaId: result.media._id,
                  mediaType: mediaInfo.type 
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

        logger.info('metaWhatsappWebhookController', 'تم حفظ رسالة واردة وسيتم إرسال إشعار', { 
          messageId: savedMsg._id,
          externalId: savedMsg.externalMessageId 
        });

        // التحقق ما إذا كانت تفاعل
        if (savedMsg && savedMsg.isReaction) {
          // إرسال إشعار بالتفاعل على الرسالة الأصلية
          socketService.notifyMessageReaction(
            conversation._id.toString(),
            savedMsg.originalMessageId,
            savedMsg.reaction
          );
        }
        // التحقق إذا كانت رد على رسالة وإرسال إشعار خاص بالرد
        else if (savedMsg && savedMsg.replyToMessageId) {
          socketService.notifyMessageReply(
            conversation._id.toString(),
            {
              _id: savedMsg._id,
              content: savedMsg.content,
              mediaUrl: savedMsg.mediaUrl,
              mediaType: savedMsg.mediaType,
              direction: savedMsg.direction,
              timestamp: savedMsg.timestamp,
              status: savedMsg.status,
              externalMessageId: savedMsg.externalMessageId
            },
            savedMsg.replyToMessageId
          );
        } else if (savedMsg) {
          // جلب معلومات الوسائط إذا كانت الرسالة تحتوي على وسائط
          let messageWithMedia = savedMsg.toObject();
          
          if (savedMsg.mediaType) {
            const media = await mediaService.findMediaForMessage(savedMsg);
            if (media) {
              messageWithMedia = mediaService.prepareMessageWithMedia(messageWithMedia, media);
              // تسجيل نجاح ربط الوسائط
              logger.info('metaWhatsappWebhookController', 'تم ربط الوسائط بالإشعار', { 
                messageId: savedMsg._id,
                mediaId: media._id,
                mediaType: savedMsg.mediaType
              });
            } else {
              // تسجيل عدم وجود وسائط بالرغم من وجود نوع وسائط
              logger.warn('metaWhatsappWebhookController', 'الرسالة تحتوي على نوع وسائط ولكن لم يتم العثور على سجل الوسائط', { 
                messageId: savedMsg._id,
                mediaType: savedMsg.mediaType
              });
            }
          }
          
          // إشعار Socket.io بالرسالة الجديدة
          socketService.notifyNewMessage(
            conversation._id.toString(), 
            messageWithMedia
          );
        }

        // إشعار بتحديث المحادثة
        socketService.notifyConversationUpdate(conversation._id.toString(), {
          _id: conversation._id,
          lastMessageAt: conversation.lastMessageAt,
          status: conversation.status
        });
      } catch (errMsg) {
        logger.error('metaWhatsappWebhookController','خطأ في معالجة رسالة واردة', errMsg);
      }
    }
  } catch (err) {
    logger.error('metaWhatsappWebhookController','خطأ في handleIncomingMessages', err);
  }
};
