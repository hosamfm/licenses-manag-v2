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
        // سجل الطلب الوارد للتتبع
        logger.info('smsWebhookController', 'استلام تحديث حالة من webhook', {
            body: req.body
        });

        // استخراج المعلومات من الطلب
        const { id, phone, is_send, send_date, is_delivered, delivered_date, msg } = req.body;

        if (!id) {
            logger.warn('smsWebhookController', 'تم استلام طلب webhook بدون معرف الرسالة', req.body);
            return res.status(400).json({ success: false, error: 'معرف الرسالة مطلوب' });
        }

        // البحث عن الرسالة في قاعدة البيانات
        const message = await SemMessage.findOne({ messageId: id });

        if (!message) {
            logger.warn('smsWebhookController', `لم يتم العثور على رسالة بالمعرف ${id}`, req.body);
            return res.status(404).json({ success: false, error: 'الرسالة غير موجودة' });
        }

        // تحديد حالة الرسالة بناءً على المعلومات الواردة
        let statusChanged = false;
        let newStatus = message.status;

        // إذا تم إرسال الرسالة أو تسليمها، نعتبرها مرسلة
        if (is_delivered === '1' || is_send === '1') {
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
                phone
            });
        }

        // إرسال استجابة نجاح
        res.json({
            success: true,
            message: 'تم تحديث حالة الرسالة بنجاح',
            messageId: id,
            status: newStatus
        });
    } catch (error) {
        logger.error('smsWebhookController', 'خطأ في معالجة webhook', error);
        res.status(500).json({ success: false, error: 'حدث خطأ أثناء معالجة الطلب' });
    }
};
