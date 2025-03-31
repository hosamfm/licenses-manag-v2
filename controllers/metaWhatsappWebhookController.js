/**
 * متحكم webhook واتساب الرسمي من ميتا (الإصدار 22)
 */
const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
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
    const requestId = Date.now().toString();
    
    logger.debug('metaWhatsappWebhookController', 'استلام webhook جديد', {
        requestId: requestId,
        body: req.body
    });
    
    try {
        // إرسال استجابة سريعة لتجنب إعادة الإرسال من ميتا
        res.status(200).send('EVENT_RECEIVED');
        
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
                
                // التحقق من نوع التغيير
                if (change.field === 'messages') {
                    // معالجة الرسائل الواردة
                    if (value.messages && Array.isArray(value.messages)) {
                        for (const message of value.messages) {
                            logger.info('metaWhatsappWebhookController', 'رسالة واردة جديدة', {
                                requestId: requestId,
                                messageId: message.id,
                                from: message.from,
                                type: message.type
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
                                recipientId: status.recipient_id
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
