/**
 * وحدة تحكم للتعامل مع Webhook الخاص بحالة رسائل الواتس أب
 */
const WhatsappMessage = require('../models/WhatsappMessage');
const logger = require('../services/loggerService');

/**
 * معالجة التحديثات الواردة من SemySMS Webhook لرسائل الواتس أب
 */
exports.handleStatusUpdate = async (req, res) => {
    try {
        // سجل الحد الأدنى من المعلومات عن الطلب الوارد
        logger.info('whatsappWebhookController', 'استلام تحديث حالة من webhook', {
            method: req.method,
            contentType: req.headers['content-type']
        });

        // استخراج المعلومات من الطلب - قد تكون في body أو query
        const data = { ...req.query, ...req.body };

        // استخراج معرف الرسالة (قد يكون بأسماء مختلفة)
        const id = data.id || data.message_id || data.messageId || null;

        if (!id) {
            logger.warn('whatsappWebhookController', 'تم استلام طلب webhook بدون معرف الرسالة');
            // نرسل استجابة إيجابية لتجنب إعادة المحاولة من الخدمة
            return res.status(200).json({ 
                success: false, 
                error: 'معرف الرسالة مطلوب'
            });
        }

        // البحث عن الرسالة في قاعدة البيانات
        const message = await WhatsappMessage.findOne({ messageId: id });

        if (!message) {
            logger.warn('whatsappWebhookController', `لم يتم العثور على رسالة بالمعرف ${id}`);
            return res.status(200).json({ 
                success: false, 
                error: 'الرسالة غير موجودة',
                messageId: id
            });
        }

        // تحديد حالة الرسالة بناءً على المعلومات الواردة
        let statusChanged = false;
        let newStatus = message.status;
        
        // التحقق من وجود بيانات حالة في الطلب
        const hasStatusData = data.is_send || data.is_delivered || data.status || 
                             (data.send_date && data.send_date.trim() !== '') || 
                             (data.delivered_date && data.delivered_date.trim() !== '');
        
        if (!hasStatusData) {
            logger.warn('whatsappWebhookController', `لا توجد بيانات حالة في الطلب للرسالة ${id}`);
            return res.status(200).json({ 
                success: false, 
                error: 'لا توجد بيانات حالة',
                messageId: id
            });
        }

        // تحديث المعلومات استنادًا إلى البيانات الواردة
        // أولاً: تحديث حالة التسليم إذا كانت متوفرة
        if (data.is_delivered === '1' || data.status === 'delivered' || 
            (data.delivered_date && data.delivered_date.trim() !== '')) {
            
            if (message.status !== 'delivered') {
                newStatus = 'delivered';
                statusChanged = true;
                message.deliveredAt = new Date();
            }
        }
        // ثانيًا: تحديث حالة الإرسال إذا لم تكن مسلمة بالفعل
        else if ((data.is_send === '1' || data.status === 'sent' || 
                 (data.send_date && data.send_date.trim() !== '')) && 
                 message.status !== 'delivered') {
            
            if (message.status !== 'sent') {
                newStatus = 'sent';
                statusChanged = true;
                message.sentAt = new Date();
            }
        }

        if (statusChanged) {
            message.status = newStatus;
            
            // تخزين بيانات إضافية من مزود الخدمة
            message.providerData = {
                ...message.providerData,
                lastUpdate: new Date(),
                webhookData: data
            };
            
            await message.save();
            
            logger.info('whatsappWebhookController', `تم تحديث حالة الرسالة ${id} إلى ${newStatus}`);
        }

        return res.status(200).json({ 
            success: true, 
            message: `تم استلام التحديث بنجاح`,
            statusChanged,
            messageId: id,
            newStatus
        });
    } catch (error) {
        logger.error('whatsappWebhookController', 'خطأ في معالجة تحديث حالة الرسالة', error);
        return res.status(200).json({ 
            success: false, 
            error: 'خطأ في معالجة التحديث'
        });
    }
};
