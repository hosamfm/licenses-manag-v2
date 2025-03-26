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
        
        // تسجيل البيانات الواردة كاملة للتشخيص
        logger.debug('whatsappWebhookController', 'بيانات webhook كاملة', data);

        // استخراج معرف الرسالة (قد يكون بأسماء مختلفة)
        let id = data.id || data.message_id || data.messageId || null;
        
        // التعامل مع المعرفات الرقمية والنصية
        if (id && typeof id === 'string' && id.includes('_')) {
            // بعض الأنظمة قد ترسل المعرف بتنسيق "deviceId_messageId"
            id = id.split('_').pop();
        }

        if (!id) {
            logger.warn('whatsappWebhookController', 'تم استلام طلب webhook بدون معرف الرسالة', data);
            // نرسل استجابة إيجابية لتجنب إعادة المحاولة من الخدمة
            return res.status(200).json({ 
                success: false, 
                error: 'معرف الرسالة مطلوب'
            });
        }

        // تحسين آلية البحث عن الرسالة
        let message = null;
        
        // محاولة 1: البحث بالمعرف الدقيق
        message = await WhatsappMessage.findOne({ messageId: id });
        
        // محاولة 2: البحث بمعرف SemySMS المُضمّن في حقل MessageId
        if (!message) {
            message = await WhatsappMessage.findOne({ 
                messageId: { $regex: new RegExp(`${id}$`) } 
            });
        }
        
        // محاولة 3: البحث بمعرف مخزن في حقل externalMessageId
        if (!message) {
            message = await WhatsappMessage.findOne({ 
                externalMessageId: id 
            });
        }
        
        // محاولة 4: البحث بمعرف SemySMS كجزء من معرف الرسالة
        if (!message) {
            message = await WhatsappMessage.findOne({ 
                messageId: { $regex: new RegExp(id, 'i') } 
            });
        }

        // محاولة 5: البحث باستخدام رقم الهاتف إذا توفر
        if (!message && data.phone) {
            // تنظيف رقم الهاتف من الأحرف الخاصة للبحث
            const cleanPhone = data.phone.replace(/[^\d]/g, '');
            
            // البحث عن أحدث رسالة مرسلة إلى هذا الرقم
            message = await WhatsappMessage.findOne({ 
                recipient: { $regex: cleanPhone }
            }).sort({ createdAt: -1 });
            
            if (message) {
                // تحديث السجل لمراقبة هذه الحالة
                logger.info('whatsappWebhookController', `تم العثور على رسالة لرقم الهاتف ${data.phone} بمعرف ${message.messageId}`);
                
                // تخزين معرف SemySMS في الرسالة للمستقبل
                message.externalMessageId = id;
            }
        }

        if (!message) {
            logger.warn('whatsappWebhookController', `لم يتم العثور على رسالة بالمعرف ${id}`, {
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

        // إذا تم تسليم الرسالة، نحدث حالتها إلى "تم التسليم"
        if (is_delivered === '1' || is_delivered === 1 || is_delivered === true) {
            if (message.status !== 'delivered') {
                newStatus = 'delivered';
                statusChanged = true;
                message.deliveredAt = new Date(delivered_date);
            }
        }
        // إذا تم إرسال الرسالة ولم يتم تسليمها بعد، نحدث حالتها إلى "تم الإرسال"
        else if ((is_send === '1' || is_send === 1 || is_send === true) && message.status !== 'delivered') {
            if (message.status !== 'sent') {
                newStatus = 'sent';
                statusChanged = true;
                message.sentAt = new Date(send_date);
            }
        }

        // إذا تغيرت الحالة، نحفظ التغييرات
        if (statusChanged) {
            message.status = newStatus;
            
            // إذا لم يكن لدينا معرف خارجي مخزن، نحفظه الآن
            if (!message.externalMessageId && id) {
                message.externalMessageId = id;
            }
            
            // تخزين بيانات إضافية من مزود الخدمة
            message.providerData = {
                ...message.providerData,
                lastUpdate: new Date(),
                webhookData: data
            };
            
            await message.save();
            
            logger.info('whatsappWebhookController', `تم تحديث حالة الرسالة ${id}`, {
                from: message.status,
                to: newStatus,
                phone: data.phone || message.recipient || 'غير معروف'
            });
        }

        // إرسال استجابة نجاح
        return res.status(200).json({ 
            success: true, 
            message: `تم استلام التحديث بنجاح`,
            statusChanged,
            messageId: id,
            newStatus
        });
    } catch (error) {
        logger.error('whatsappWebhookController', 'خطأ في معالجة تحديث حالة الرسالة', error);
        // نرسل استجابة إيجابية لتجنب إعادة المحاولة من الخدمة
        return res.status(200).json({ 
            success: false, 
            error: 'خطأ في معالجة التحديث'
        });
    }
};
