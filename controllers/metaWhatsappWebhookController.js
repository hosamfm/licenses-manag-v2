/**
 * متحكم webhook واتساب الرسمي من ميتا (الإصدار 22)
 */
const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
const MetaWhatsappWebhookLog = require('../models/MetaWhatsappWebhookLog');
const logger = require('../services/loggerService');
const crypto = require('crypto');
const WebhookForwardService = require('../services/whatsapp/WebhookForwardService');

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
            
            // تمرير طلب التحقق إلى الخدمة المستهدفة
            try {
                await WebhookForwardService.forwardVerification(req.query);
                logger.info('metaWhatsappWebhookController', 'تم تمرير طلب التحقق بنجاح');
            } catch (forwardError) {
                logger.error('metaWhatsappWebhookController', 'خطأ في تمرير طلب التحقق', forwardError);
            }
            
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
    const requestId = Date.now().toString();
    
    // تسجيل كامل للبيانات الواردة
    logger.debug('metaWhatsappWebhookController', 'استلام webhook جديد من ميتا', {
        requestId: requestId,
        body: JSON.stringify(req.body, null, 2),
        headers: JSON.stringify(req.headers, null, 2),
        method: req.method,
        url: req.originalUrl,
        timestamp: new Date().toISOString()
    });
    
    try {
        // إرسال استجابة سريعة لتجنب إعادة الإرسال من ميتا
        res.status(200).send('EVENT_RECEIVED');
        
        // تمرير الويب هوك إلى الخدمة المستهدفة
        try {
            // تمرير الطلب كاملاً مع نفس المحتوى والترويسات تماماً
            const forwardResult = await WebhookForwardService.forwardWebhook(
                req.body,
                req.headers,
                req.method,
                requestId
            );
            
            logger.info('metaWhatsappWebhookController', 'نتيجة تمرير الويب هوك', {
                requestId: requestId,
                success: forwardResult.success,
                status: forwardResult.status
            });
        } catch (forwardError) {
            logger.error('metaWhatsappWebhookController', 'خطأ في تمرير الويب هوك', {
                requestId: requestId,
                error: forwardError.message
            });
        }
        
        // تخزين سجل الطلب
        try {
            // تحديد نوع الطلب
            let requestType = 'unknown';
            if (req.body && req.body.entry && req.body.entry[0] && req.body.entry[0].changes && req.body.entry[0].changes[0]) {
                const change = req.body.entry[0].changes[0];
                if (change.field === 'messages') {
                    if (change.value.messages && change.value.messages.length > 0) {
                        requestType = 'message';
                    } else if (change.value.statuses && change.value.statuses.length > 0) {
                        requestType = 'status';
                    }
                }
            }
            
            // حفظ سجل الطلب في قاعدة البيانات
            const webhookLog = new MetaWhatsappWebhookLog({
                requestId: requestId,
                timestamp: new Date(),
                method: req.method,
                url: req.originalUrl,
                headers: req.headers,
                body: req.body,
                rawBody: JSON.stringify(req.body, null, 2),
                type: requestType
            });
            
            await webhookLog.save();
            logger.info('metaWhatsappWebhookController', 'تم حفظ سجل webhook في قاعدة البيانات', { 
                requestId: requestId,
                type: requestType
            });
        } catch (logError) {
            logger.error('metaWhatsappWebhookController', 'خطأ في حفظ سجل webhook', {
                requestId: requestId,
                error: logError.message
            });
        }
        
        // التحقق من أن البيانات بالتنسيق المتوقع
        if (!req.body || !req.body.object || !req.body.entry || !Array.isArray(req.body.entry)) {
            logger.warn('metaWhatsappWebhookController', 'بيانات webhook بتنسيق غير متوقع', {
                requestId: requestId,
                body: req.body
            });
            return;
        }
        
        const data = req.body;
        
        // التأكد من أن الكائن هو حساب واتساب تجاري
        if (data.object !== 'whatsapp_business_account') {
            logger.warn('metaWhatsappWebhookController', 'كائن webhook غير معروف', {
                requestId: requestId,
                object: data.object
            });
            return;
        }
        
        // معالجة كل إدخال في البيانات
        for (const entry of data.entry) {
            // التحقق من وجود التغييرات
            if (!entry.changes || !Array.isArray(entry.changes)) {
                continue;
            }
            
            // معالجة كل تغيير
            for (const change of entry.changes) {
                const value = change.value;
                
                // تسجيل كل تغيير بالتفصيل
                logger.info('metaWhatsappWebhookController', `تغيير في ${change.field}`, {
                    requestId: requestId,
                    field: change.field,
                    value: JSON.stringify(value)
                });
                
                // التحقق من نوع التغيير
                if (change.field === 'messages') {
                    // معالجة الرسائل الواردة
                    if (value.messages && Array.isArray(value.messages)) {
                        for (const message of value.messages) {
                            logger.info('metaWhatsappWebhookController', 'رسالة واردة جديدة', {
                                requestId: requestId,
                                messageId: message.id,
                                from: message.from,
                                type: message.type,
                                content: JSON.stringify(message)
                            });
                            
                            // يمكنك التعامل مع الرسالة الواردة هنا
                            // حاليًا نقوم فقط بتسجيلها دون تخزينها في قاعدة البيانات
                        }
                    }
                    
                    // معالجة تحديثات حالة الرسائل
                    if (value.statuses && Array.isArray(value.statuses)) {
                        for (const status of value.statuses) {
                            logger.info('metaWhatsappWebhookController', 'تحديث حالة رسالة', {
                                requestId: requestId,
                                messageId: status.id,
                                status: status.status,
                                recipientId: status.recipient_id,
                                statusDetails: JSON.stringify(status)
                            });
                            
                            // يمكنك التعامل مع تحديث الحالة هنا
                            // حاليًا نقوم فقط بتسجيلها دون تخزينها في قاعدة البيانات
                        }
                    }
                }
            }
        }
    } catch (error) {
        logger.error('metaWhatsappWebhookController', 'خطأ في معالجة webhook', {
            requestId: requestId,
            error: error.message,
            stack: error.stack
        });
    }
};
