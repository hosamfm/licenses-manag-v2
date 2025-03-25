/**
 * وحدة تحكم للتعامل مع Webhook الخاص بحالة الرسائل
 */
const SemMessage = require('../models/SemMessage');
const logger = require('../services/loggerService');

/**
 * معالجة التحديثات الواردة من SemySMS Webhook
 */
exports.handleStatusUpdate = async (req, res) => {
    try {
        // سجل الطلب الوارد للتتبع بشكل تفصيلي
        logger.info('smsWebhookController', 'استلام تحديث حالة من webhook', {
            body: req.body,
            headers: req.headers,
            method: req.method,
            query: req.query
        });

        // استخراج المعلومات من الطلب - قد تكون في body أو query
        const data = { ...req.query, ...req.body };
        
        // تسجيل البيانات المستخرجة للتحقق
        logger.info('smsWebhookController', 'البيانات المستخرجة من الطلب', data);

        // استخراج معرف الرسالة (قد يكون بأسماء مختلفة)
        const id = data.id || data.message_id || data.messageId || null;

        if (!id) {
            logger.warn('smsWebhookController', 'تم استلام طلب webhook بدون معرف الرسالة', data);
            // نرسل استجابة إيجابية لتجنب إعادة المحاولة من الخدمة
            return res.status(200).json({ 
                success: false, 
                error: 'معرف الرسالة مطلوب',
                received: data 
            });
        }

        // البحث عن الرسالة في قاعدة البيانات
        const message = await SemMessage.findOne({ messageId: id });

        if (!message) {
            logger.warn('smsWebhookController', `لم يتم العثور على رسالة بالمعرف ${id}`, data);
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
        
        // إذا كانت جميع قيم الحالة فارغة، قد يكون هذا مجرد إشعار متوسط من الخدمة
        if (!hasStatusData) {
            logger.info('smsWebhookController', 'تم استلام إشعار متوسط بدون معلومات تحديث الحالة', {
                messageId: id,
                phone: data.phone || 'غير معروف'
            });
            
            // إرسال استجابة نجاح بدون تحديث الحالة
            return res.json({
                success: true,
                message: 'تم استلام الإشعار المتوسط',
                messageId: id,
                status: message.status,
                statusChanged: false,
                note: 'لم يتم تقديم معلومات لتحديث الحالة'
            });
        }

        // استخراج معلومات الحالة من البيانات الواردة
        const is_send = data.is_send || data.status === 'sent' || data.status === 'delivered';
        const is_delivered = data.is_delivered || data.status === 'delivered';
        const send_date = data.send_date || data.sent_date || data.date;
        const delivered_date = data.delivered_date || data.delivery_date;

        // إذا تم إرسال الرسالة أو تسليمها، نعتبرها مرسلة
        if (is_delivered === '1' || is_delivered === true || is_send === '1' || is_send === true) {
            newStatus = 'sent';
            statusChanged = message.status !== 'sent';
            
            // تحديث وقت الإرسال إذا كان متوفرًا
            if (statusChanged) {
                message.sentAt = delivered_date ? new Date(delivered_date) : 
                                send_date ? new Date(send_date) : new Date();
            }
        }

        // إذا تغيرت الحالة، نحفظ التغييرات
        if (statusChanged) {
            message.status = newStatus;
            await message.save();
            
            logger.info('smsWebhookController', `تم تحديث حالة الرسالة ${id}`, {
                from: message.status,
                to: newStatus,
                phone: data.phone || 'غير معروف'
            });
        }

        // إرسال استجابة نجاح
        res.json({
            success: true,
            message: 'تم معالجة طلب webhook بنجاح',
            messageId: id,
            status: newStatus,
            statusChanged: statusChanged
        });
    } catch (error) {
        logger.error('smsWebhookController', 'خطأ في معالجة webhook', error);
        // نرسل استجابة إيجابية لتجنب إعادة المحاولة من الخدمة
        res.status(200).json({ 
            success: false, 
            error: 'حدث خطأ أثناء معالجة الطلب',
            errorMessage: error.message
        });
    }
};
