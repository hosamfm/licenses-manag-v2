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
        // سجل الحد الأدنى من المعلومات عن الطلب الوارد
        logger.info('smsWebhookController', 'استلام تحديث حالة من webhook', {
            method: req.method,
            contentType: req.headers['content-type']
        });

        // استخراج المعلومات من الطلب - قد تكون في body أو query
        const data = { ...req.query, ...req.body };
        
        // تسجيل البيانات الواردة كاملة للتشخيص
        logger.debug('smsWebhookController', 'بيانات webhook كاملة', data);

        // استخراج معرف الرسالة (قد يكون بأسماء مختلفة)
        let id = data.id || data.message_id || data.messageId || null;
        
        // التعامل مع المعرفات الرقمية والنصية
        if (id && typeof id === 'string' && id.includes('_')) {
            // بعض الأنظمة قد ترسل المعرف بتنسيق "deviceId_messageId"
            id = id.split('_').pop();
        }

        if (!id) {
            logger.warn('smsWebhookController', 'تم استلام طلب webhook بدون معرف الرسالة', data);
            // نرسل استجابة إيجابية لتجنب إعادة المحاولة من الخدمة
            return res.status(200).json({ 
                success: false, 
                error: 'معرف الرسالة مطلوب'
            });
        }

        // تحسين آلية البحث عن الرسالة
        let message = null;
        
        // محاولة 1: البحث بالمعرف الدقيق
        message = await SemMessage.findOne({ messageId: id });
        
        // محاولة 2: البحث بمعرف SemySMS المُضمّن في حقل MessageId
        if (!message) {
            message = await SemMessage.findOne({ 
                messageId: { $regex: new RegExp(`${id}$`) } 
            });
        }
        
        // محاولة 3: البحث بمعرف مخزن في حقل externalMessageId
        if (!message) {
            message = await SemMessage.findOne({ 
                externalMessageId: id 
            });
        }
        
        // محاولة 4: البحث بمعرف SemySMS كجزء من معرف الرسالة
        if (!message) {
            message = await SemMessage.findOne({ 
                messageId: { $regex: new RegExp(id, 'i') } 
            });
        }

        // محاولة 5: البحث باستخدام رقم الهاتف إذا توفر
        if (!message && data.phone) {
            // تنظيف رقم الهاتف من الأحرف الخاصة للبحث
            const cleanPhone = data.phone.replace(/[^\d]/g, '');
            
            // البحث عن أحدث رسالة مرسلة إلى هذا الرقم
            message = await SemMessage.findOne({ 
                recipient: { $regex: cleanPhone }
            }).sort({ createdAt: -1 });
            
            if (message) {
                // تحديث السجل لمراقبة هذه الحالة
                logger.info('smsWebhookController', `تم العثور على رسالة لرقم الهاتف ${data.phone} بمعرف ${message.messageId}`);
                
                // تخزين معرف SemySMS في الرسالة للمستقبل
                message.externalMessageId = id;
            }
        }

        if (!message) {
            logger.warn('smsWebhookController', `لم يتم العثور على رسالة بالمعرف ${id}`, {
                searchId: id,
                phone: data.phone || 'غير محدد'
            });
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
            // إرسال استجابة نجاح بدون تحديث الحالة
            return res.json({
                success: true,
                message: 'تم استلام الإشعار المتوسط',
                messageId: id,
                status: message.status,
                statusChanged: false
            });
        }

        // استخراج معلومات الحالة من البيانات الواردة بشكل موسع
        const is_send = data.is_send || data.status === 'sent' || data.status === 'delivered' || data.status === 'success';
        const is_delivered = data.is_delivered || data.status === 'delivered' || data.status === 'success';
        const send_date = data.send_date || data.sent_date || data.date || new Date();
        const delivered_date = data.delivered_date || data.delivery_date || send_date;

        // إذا تم إرسال الرسالة أو تسليمها، نعتبرها مرسلة (تحويل القيم إلى منطقية)
        if (is_delivered === '1' || is_delivered === 1 || is_delivered === true || 
            is_send === '1' || is_send === 1 || is_send === true) {
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
            
            // إذا لم يكن لدينا معرف خارجي مخزن، نحفظه الآن
            if (!message.externalMessageId && id) {
                message.externalMessageId = id;
            }
            
            await message.save();
            
            logger.info('smsWebhookController', `تم تحديث حالة الرسالة ${id}`, {
                from: message.status,
                to: newStatus,
                phone: data.phone || message.recipient || 'غير معروف'
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
            error: 'حدث خطأ أثناء معالجة الطلب'
        });
    }
};
