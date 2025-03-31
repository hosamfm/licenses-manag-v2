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
const crypto = require('crypto');

/**
 * مصادقة webhook واتساب من ميتا
 * يستخدم للتحقق من مصدر الطلب عند إعداد webhook
 */
exports.verifyWebhook = async (req, res) => {
    logger.debug('metaWhatsappWebhookController', 'التحقق من webhook واتساب الرسمي', { 
        query: req.query 
    });

    try {
        // الحصول على إعدادات واتساب الرسمي
        const settings = await MetaWhatsappSettings.getActiveSettings();
        
        // الحصول على معلمات التحقق من الطلب
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];
        
        // السجل التوكن الذي تم استلامه وتوكن التحقق المخزن
        logger.debug('metaWhatsappWebhookController', 'بيانات التحقق', { 
            receivedToken: token,
            storedToken: settings.config.verifyToken,
            mode: mode
        });
        
        // التحقق من وضع الطلب وتوكن التحقق
        if (mode === 'subscribe' && token === settings.config.verifyToken) {
            logger.info('metaWhatsappWebhookController', 'تم التحقق من webhook بنجاح');
            
            // الرد بالتحدي لتأكيد نجاح التحقق
            res.status(200).send(challenge);
        } else {
            // فشل التحقق، رفض الطلب
            logger.warn('metaWhatsappWebhookController', 'فشل التحقق من webhook', {
                mode: mode,
                receivedToken: token
            });
            
            res.status(403).json({ error: 'التحقق غير صالح' });
        }
    } catch (error) {
        logger.error('metaWhatsappWebhookController', 'خطأ أثناء التحقق من webhook', error);
        res.status(500).json({ error: 'حدث خطأ أثناء التحقق من webhook' });
    }
};

/**
 * معالجة webhook واتساب من ميتا
 * يستقبل الإشعارات من واتساب مثل الرسائل الواردة وتحديثات حالة الرسائل
 */
exports.handleWebhook = async (req, res) => {
    try {
        const requestId = Date.now().toString();
        const body = req.body;
        
        logger.debug('metaWhatsappWebhookController', 'استلام webhook جديد من ميتا', {
            requestId: requestId,
            body: JSON.stringify(body, null, 2),
            headers: JSON.stringify(req.headers, null, 2),
            method: req.method,
            url: req.url,
            timestamp: new Date()
        });
        
        // تحديد نوع الطلب
        let requestType = 'unknown';
        
        // حفظ سجل webhook
        const webhookLog = new MetaWhatsappWebhookLog({
            requestId: requestId,
            body: body,
            headers: req.headers,
            method: req.method,
            url: req.url,
            timestamp: new Date()
        });
        
        // معالجة البيانات
        if (body.object === 'whatsapp_business_account') {
            // التحقق من وجود تغييرات
            if (body.entry && body.entry.length > 0) {
                for (const entry of body.entry) {
                    if (entry.changes && entry.changes.length > 0) {
                        for (const change of entry.changes) {
                            if (change.field === 'messages') {
                                if (change.value.messages && change.value.messages.length > 0) {
                                    requestType = 'message';
                                } else if (change.value.statuses && change.value.statuses.length > 0) {
                                    requestType = 'status';
                                }
                            }
                            
                            logger.info('metaWhatsappWebhookController', 'تغيير في ' + change.field, {
                                requestId: requestId,
                                field: change.field,
                                value: JSON.stringify(change.value)
                            });
                            
                            // معالجة تحديثات الحالة
                            if (change.field === 'messages' && change.value.statuses && change.value.statuses.length > 0) {
                                for (const status of change.value.statuses) {
                                    logger.info('metaWhatsappWebhookController', 'تحديث حالة رسالة', {
                                        requestId: requestId,
                                        messageId: status.id,
                                        status: status.status,
                                        recipientId: status.recipient_id,
                                        statusDetails: JSON.stringify(status)
                                    });
                                    
                                    // تحديث حالة الرسالة في قاعدة البيانات
                                    await updateMessageStatus(status.id, status.status, new Date(status.timestamp * 1000));
                                }
                            }
                            
                            // معالجة الرسائل الواردة
                            if (change.field === 'messages' && change.value.messages && change.value.messages.length > 0) {
                                await handleIncomingMessages(change.value.messages, {
                                    phone_number_id: entry.messaging_product,
                                    metadata: change.value.metadata
                                });
                            }
                        }
                    }
                }
            }
        }
        
        // تحديث نوع الطلب وحفظ السجل
        webhookLog.requestType = requestType;
        await webhookLog.save();
        
        logger.info('metaWhatsappWebhookController', 'تم حفظ سجل webhook في قاعدة البيانات', {
            requestId: requestId,
            type: requestType
        });
        
        return res.status(200).send('EVENT_RECEIVED');
    } catch (error) {
        logger.error('metaWhatsappWebhookController', 'خطأ في معالجة webhook ميتا', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).send('ERROR');
    }
};

/**
 * تحديث حالة الرسالة بناءً على إشعار الحالة
 * @param {string} messageId - معرف الرسالة الخارجي 
 * @param {string} newStatus - الحالة الجديدة للرسالة
 * @param {Date} timestamp - توقيت تحديث الحالة
 */
async function updateMessageStatus(messageId, newStatus, timestamp) {
  try {
    logger.debug('metaWhatsappWebhookController', 'محاولة تحديث حالة الرسالة', {
      messageId,
      newStatus,
      timestamp
    });
    
    // تحويل حالات واتساب إلى حالات النظام الداخلي
    let systemStatus = newStatus;
    if (newStatus === 'sent') {
      systemStatus = 'sent';
    } else if (newStatus === 'delivered') {
      systemStatus = 'delivered';
    } else if (newStatus === 'read') {
      systemStatus = 'read';
    } else if (newStatus === 'failed') {
      systemStatus = 'failed';
    }
    
    // البحث عن الرسالة في جدول WhatsappMessage
    const whatsappMessage = await WhatsappMessage.findOne({ externalMessageId: messageId });
    let conversationId = null;
    
    // تحديث رسالة WhatsappMessage إذا وجدت
    if (whatsappMessage) {
      // تخزين معرف المحادثة للاستخدام لاحقًا في إشعارات Socket.io
      conversationId = whatsappMessage.conversationId;
      
      // تحديث الحالة حسب الإشعار
      whatsappMessage.status = systemStatus;
      
      // تسجيل وقت التسليم والقراءة إذا كانت متوفرة
      if (newStatus === 'delivered' && !whatsappMessage.deliveredAt) {
        whatsappMessage.deliveredAt = timestamp;
      } else if (newStatus === 'read' && !whatsappMessage.readAt) {
        whatsappMessage.readAt = timestamp;
      }
      
      // حفظ التغييرات
      await whatsappMessage.save();
      
      logger.info('metaWhatsappWebhookController', 'تم تحديث حالة الرسالة في WhatsappMessage', {
        messageId,
        status: systemStatus,
        conversationId
      });
      
      // إرسال إشعار بتحديث حالة الرسالة عبر Socket.io
      if (conversationId) {
        socketService.emitToRoom(`conversation-${conversationId}`, 'message_status_update', {
          externalMessageId: messageId,
          status: systemStatus,
          timestamp: new Date()
        });
      }
    }
    
    // البحث عن الرسالة في جدول SemMessage
    const semMessage = await SemMessage.findOne({ externalMessageId: messageId });
    
    // إذا وجدنا الرسالة في جدول SemMessage، نحدث حالتها
    if (semMessage) {
      // تحديث الحالة حسب الإشعار
      semMessage.status = systemStatus;
      
      // تحديث أوقات التسليم والقراءة
      if (newStatus === 'delivered') {
        semMessage.deliveredAt = timestamp;
      } else if (newStatus === 'read') {
        semMessage.readAt = timestamp;
      }
      
      // تحديث بيانات مزود الخدمة
      if (!semMessage.providerData) {
        semMessage.providerData = { provider: 'metaWhatsapp' };
      }
      
      semMessage.providerData.lastUpdate = timestamp;
      
      // إضافة تحديث الحالة إلى سجل التحديثات
      if (!semMessage.providerData.statusUpdates) {
        semMessage.providerData.statusUpdates = {};
      }
      
      semMessage.providerData.statusUpdates.status = newStatus;
      semMessage.providerData.statusUpdates.timestamp = timestamp;
      
      // حفظ التغييرات
      await semMessage.save();
      
      logger.info('metaWhatsappWebhookController', 'تم تحديث حالة الرسالة في SemMessage', {
        messageId,
        status: systemStatus
      });
    }
    
    if (whatsappMessage || semMessage) {
      return { success: true, whatsappMessage, semMessage, conversationId };
    } else {
      logger.warn('metaWhatsappWebhookController', 'لم يتم العثور على الرسالة في قاعدة البيانات', { messageId });
      return { success: false, error: 'رسالة غير موجودة' };
    }
  } catch (error) {
    logger.error('metaWhatsappWebhookController', 'خطأ في تحديث حالة الرسالة', {
      error: error.message,
      stack: error.stack,
      messageId,
      newStatus
    });
    return { success: false, error: error.message };
  }
}

/**
 * معالجة الرسائل الواردة من واتساب
 * @param {Array} messages - مصفوفة الرسائل الواردة
 * @param {Object} metadata - البيانات الوصفية للرسائل
 */
async function handleIncomingMessages(messages, metadata) {
  try {
    // استخراج رقم الهاتف للقناة
    const phoneNumberId = metadata.phone_number_id;
    
    logger.debug('metaWhatsappWebhookController', 'معالجة الرسائل الواردة', {
      phoneNumberId,
      messagesCount: messages.length
    });
    
    // الحصول على القناة المرتبطة برقم الهاتف
    let channel;
    try {
      channel = await WhatsAppChannel.getChannelByPhoneNumberId(phoneNumberId);
      
      // إذا لم يتم العثور على القناة، إنشاء القناة الافتراضية
      if (!channel) {
        channel = await WhatsAppChannel.getDefaultChannel();
        logger.info('metaWhatsappWebhookController', 'إنشاء قناة افتراضية لعدم وجود قناة مطابقة', {
          phoneNumberId,
          defaultChannelId: channel._id
        });
      }
    } catch (error) {
      logger.error('metaWhatsappWebhookController', 'خطأ في الحصول على القناة', {
        error: error.message,
        phoneNumberId
      });
      return;
    }
    
    // معالجة كل رسالة واردة
    for (const message of messages) {
      try {
        logger.info('metaWhatsappWebhookController', 'استلام رسالة جديدة', {
          from: message.from,
          type: message.type,
          messageId: message.id,
          timestamp: new Date(parseInt(message.timestamp) * 1000)
        });
        
        // البحث عن محادثة موجودة أو إنشاء محادثة جديدة
        let conversation = await Conversation.findOrCreate(message.from, channel._id);
        
        // تحديث وقت آخر رسالة وإعادة فتح المحادثة إذا كانت مغلقة
        conversation.lastMessageAt = new Date();
        if (conversation.status === 'closed') {
          await conversation.reopen();
          logger.info('metaWhatsappWebhookController', 'إعادة فتح محادثة مغلقة', {
            conversationId: conversation._id,
            phoneNumber: message.from
          });
        } else {
          await conversation.save();
        }
        
        // حفظ الرسالة
        const savedMessage = await WhatsappMessage.createIncomingMessage(conversation._id, message);
        
        logger.info('metaWhatsappWebhookController', 'تم حفظ رسالة واردة', {
          messageId: savedMessage._id,
          externalId: message.id,
          conversationId: conversation._id
        });
        
        // إرسال إشعار بالرسالة الجديدة عبر Socket.io
        socketService.notifyNewMessage(conversation._id.toString(), {
          _id: savedMessage._id,
          content: savedMessage.content,
          mediaUrl: savedMessage.mediaUrl,
          mediaType: savedMessage.mediaType,
          direction: savedMessage.direction,
          timestamp: savedMessage.timestamp,
          status: savedMessage.status
        });
        
        // إرسال إشعار بتحديث المحادثة (تاريخ آخر رسالة)
        socketService.notifyConversationUpdate(conversation._id.toString(), {
          _id: conversation._id,
          lastMessageAt: conversation.lastMessageAt,
          status: conversation.status
        });
        
      } catch (error) {
        logger.error('metaWhatsappWebhookController', 'خطأ في معالجة رسالة واردة', {
          error: error.message,
          stack: error.stack,
          messageFrom: message.from,
          messageId: message.id
        });
      }
    }
  } catch (error) {
    logger.error('metaWhatsappWebhookController', 'خطأ في معالجة الرسائل الواردة', {
      error: error.message,
      stack: error.stack
    });
  }
}
