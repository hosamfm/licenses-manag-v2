/**
 * متحكم webhook واتساب الرسمي من ميتا (الإصدار 22)
 */
const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
const MetaWhatsappWebhookLog = require('../models/MetaWhatsappWebhookLog');
const SemMessage = require('../models/SemMessage');
const logger = require('../services/loggerService');
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
            requestBody: body,
            requestHeaders: req.headers,
            requestMethod: req.method,
            requestUrl: req.url,
            receivedAt: new Date()
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
    
    // البحث عن الرسالة في جدول SemMessage
    const message = await SemMessage.findOne({ externalMessageId: messageId });
    
    // إذا وجدنا الرسالة في جدول SemMessage، نحدث حالتها
    if (message) {
      // تحديث الحالة حسب الإشعار
      if (newStatus === 'sent') {
        message.status = 'sent';
      } else if (newStatus === 'delivered') {
        message.status = 'delivered';
        message.deliveredAt = timestamp;
      } else if (newStatus === 'read') {
        message.status = 'read';
        message.readAt = timestamp;
      } else if (newStatus === 'failed') {
        message.status = 'failed';
      }
      
      // تحديث بيانات مزود الخدمة
      if (!message.providerData) {
        message.providerData = { provider: 'metaWhatsapp' };
      }
      
      message.providerData.lastUpdate = timestamp;
      
      // إضافة تحديث الحالة إلى سجل التحديثات
      if (!message.providerData.statusUpdates) {
        message.providerData.statusUpdates = {};
      }
      
      message.providerData.statusUpdates.status = newStatus;
      message.providerData.statusUpdates.timestamp = timestamp;
      
      // حفظ التغييرات
      await message.save();
      
      logger.info('metaWhatsappWebhookController', 'تم تحديث حالة الرسالة في SemMessage', {
        messageId,
        status: newStatus
      });
      
      return { success: true, message };
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
