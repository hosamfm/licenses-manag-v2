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

/**
 * مصادقة webhook واتساب من ميتا
 */
exports.verifyWebhook = async (req, res) => {
  logger.debug('metaWhatsappWebhookController', 'التحقق من webhook واتساب الرسمي', { query: req.query });
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

    logger.debug('metaWhatsappWebhookController', 'استلام webhook جديد', {
      requestId,
      body: JSON.stringify(body, null, 2),
      headers: req.headers,
      timestamp: new Date()
    });

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

              // رسائل واردة
              if (change.field === 'messages' && change.value.messages?.length > 0) {
                await handleIncomingMessages(change.value.messages, {
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

/**
 * تحديث حالة الرسالة
 */
async function updateMessageStatus(externalId, newStatus, timestamp) {
  try {
    logger.debug('metaWhatsappWebhookController', 'تحديث حالة الرسالة', { externalId, newStatus });
    
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

      logger.debug('metaWhatsappWebhookController', 'تم تحديث حالة الرسالة في SemMessage أيضاً', { externalId });
    }

  } catch (err) {
    logger.error('metaWhatsappWebhookController', 'خطأ في updateMessageStatus', err);
  }
}

/**
 * معالجة الرسائل الواردة
 */
async function handleIncomingMessages(messages, meta) {
  try {
    const phoneNumberId = meta.phone_number_id;
    logger.debug('metaWhatsappWebhookController', 'رسائل واردة', {
      phoneNumberId, count: messages.length
    });

    // حاول الحصول على القناة
    let channel = await WhatsAppChannel.getChannelByPhoneNumberId(phoneNumberId);
    if (!channel) {
      channel = await WhatsAppChannel.getDefaultChannel();
      logger.info('metaWhatsappWebhookController','القناة غير موجودة، تم استخدام الافتراضية',{ phoneNumberId });
    }

    for (const msg of messages) {
      try {
        logger.info('metaWhatsappWebhookController','رسالة واردة', {
          from: msg.from,
          id: msg.id,
          type: msg.type
        });

        // ابحث/أنشئ محادثة
        const conversation = await Conversation.findOrCreate(msg.from, channel._id);
        // إذا كانت مغلقة، افتحها
        if (conversation.status === 'closed') {
          await conversation.reopen();
        }
        conversation.lastMessageAt = new Date();
        await conversation.save();

        // أنشئ رسالة واردة في DB
        const savedMsg = await WhatsappMessage.createIncomingMessage(conversation._id, msg);

        // إشعار Socket.io
        socketService.notifyNewMessage(conversation._id.toString(), {
          _id: savedMsg._id,
          content: savedMsg.content,
          mediaUrl: savedMsg.mediaUrl,
          mediaType: savedMsg.mediaType,
          direction: savedMsg.direction, // مفترض incoming
          timestamp: savedMsg.timestamp,
          status: savedMsg.status
        });

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
}
