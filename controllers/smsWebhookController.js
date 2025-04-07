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
        /* logger.info('smsWebhookController', 'استلام تحديث حالة من webhook', {
            method: req.method,
            contentType: req.headers['content-type']
        }); */

        // استخراج المعلومات من الطلب - قد تكون في body أو query
        const data = { ...req.query, ...req.body };
        
        // تسجيل البيانات الواردة كاملة للتشخيص
        logger.debug('smsWebhookController', 'بيانات webhook كاملة', data);

        // استخراج معرف الرسالة حسب توثيق SemySMS (الحقل الرئيسي id)
        // مع دعم أسماء حقول بديلة للتوافق مع مختلف إصدارات API
        let id = data.id || data.message_id || data.messageId || null;
        
        // التعامل مع المعرفات الرقمية والنصية
        if (id && typeof id === 'string' && id.includes('_')) {
            // بعض الأنظمة قد ترسل المعرف بتنسيق "deviceId_messageId"
            id = id.split('_').pop();
        }

        // استخراج معرف الجهاز إذا كان موجوداً في البيانات
        const deviceId = data.device_id || data.id_device || data.device || null;

        // إذا كان معرف الرسالة غير موجود، نسجل تحذيراً ونرسل استجابة مناسبة
        if (!id && !deviceId) {
            // logger.warn('smsWebhookController', 'تم استلام طلب webhook بدون معرف الرسالة أو معرف الجهاز', data);
            // نرسل استجابة إيجابية لتجنب إعادة المحاولة من الخدمة
            return res.status(200).json({ 
                success: false, 
                error: 'معرف الرسالة أو معرف الجهاز مطلوب'
            });
        }

        // تحسين آلية البحث عن الرسالة
        let message = null;
        
        // محاولة 1: البحث باستخدام externalMessageId (الموصى به)
        if (id) {
            message = await SemMessage.findOne({ externalMessageId: id });
        }
        
        // محاولة 2: البحث بمعرف MongoDB
        if (!message && id) {
            message = await SemMessage.findOne({ messageId: id });
        }
        
        // محاولة 3: البحث بمعرف SemySMS المُضمّن في حقل MessageId
        if (!message && id) {
            message = await SemMessage.findOne({ 
                messageId: { $regex: new RegExp(`${id}$`) } 
            });
        }
        
        // محاولة 4: البحث بمعرف SemySMS كجزء من معرف الرسالة
        if (!message && id) {
            message = await SemMessage.findOne({ 
                messageId: { $regex: new RegExp(id, 'i') } 
            });
        }

        // محاولة 5: البحث باستخدام معرف الجهاز والرقم إذا توفر
        if (!message && deviceId && data.phone) {
            // تنظيف رقم الهاتف من الأحرف الخاصة للبحث
            const cleanPhone = data.phone.replace(/[^\d]/g, '');
            
            // البحث عن أحدث رسالة مرسلة إلى هذا الرقم باستخدام هذا الجهاز
            message = await SemMessage.findOne({ 
                recipient: { $regex: cleanPhone },
                'providerData.device': deviceId
            }).sort({ createdAt: -1 });
            
            if (message) {
                // تحديث السجل لمراقبة هذه الحالة
                /* logger.info('smsWebhookController', `تم العثور على رسالة لرقم الهاتف ${data.phone} بمعرف ${message.messageId}`, {
                    deviceId: deviceId
                }); */
                
                // تخزين معرف SemySMS في الرسالة للمستقبل إذا كان متوفراً
                if (id) {
                    message.externalMessageId = id;
                }
            }
        }

        // محاولة 6: البحث باستخدام رقم الهاتف فقط كملاذ أخير
        if (!message && data.phone) {
            // تنظيف رقم الهاتف من الأحرف الخاصة للبحث
            const cleanPhone = data.phone.replace(/[^\d]/g, '');
            
            // البحث عن أحدث رسالة مرسلة إلى هذا الرقم
            message = await SemMessage.findOne({ 
                recipient: { $regex: cleanPhone }
            }).sort({ createdAt: -1 });
            
            if (message) {
                // تحديث السجل لمراقبة هذه الحالة
                // logger.info('smsWebhookController', `تم العثور على رسالة لرقم الهاتف ${data.phone} بمعرف ${message.messageId}`);
                
                // تخزين معرف SemySMS في الرسالة للمستقبل إذا كان متوفراً
                if (id) {
                    message.externalMessageId = id;
                }
                
                // تخزين معرف الجهاز إذا كان متوفراً
                if (deviceId && message.providerData) {
                    message.providerData.device = deviceId;
                }
            }
        }

        if (!message) {
            // logger.warn('smsWebhookController', `لم يتم العثور على رسالة مطابقة`, {
            //     searchId: id || 'غير محدد',
            //     deviceId: deviceId || 'غير محدد',
            //     phone: data.phone || 'غير محدد'
            // });
            return res.status(200).json({ 
                success: false, 
                error: 'الرسالة غير موجودة',
                messageId: id,
                deviceId: deviceId
            });
        }

        // تحديد حالة الرسالة بناءً على المعلومات الواردة
        let statusChanged = false;
        let newStatus = message.status;
        
        // التحقق من وجود بيانات حالة في الطلب
        // وفقاً لتوثيق SemySMS، الحقول الرئيسية هي is_send و is_delivered و send_date و delivered_date
        const hasStatusData = data.is_send !== undefined || 
                             data.is_delivered !== undefined || 
                             data.status || 
                             data.send_date || 
                             data.delivered_date;
        
        // إذا كانت جميع قيم الحالة فارغة، قد يكون هذا مجرد إشعار متوسط من الخدمة
        if (!hasStatusData) {
            // إرسال استجابة نجاح بدون تحديث الحالة
            return res.json({
                success: true,
                message: 'تم استلام الإشعار المتوسط',
                messageId: id,
                deviceId: deviceId,
                status: message.status,
                statusChanged: false
            });
        }

        // استخراج معلومات الحالة من البيانات الواردة وفقاً لتوثيق SemySMS
        // في التوثيق، is_send و is_delivered هما 0 أو 1
        const is_send = data.is_send == 1 || data.is_send === '1' || 
                       data.status === 'sent' || data.status === 'delivered';
        const is_delivered = data.is_delivered == 1 || data.is_delivered === '1' || 
                            data.status === 'delivered';

        // معالجة التواريخ
        let send_date = null;
        if (data.send_date) {
            send_date = new Date(data.send_date);
        }

        let delivered_date = null;
        if (data.delivered_date) {
            delivered_date = new Date(data.delivered_date);
        }

        // تحديث حالة الرسالة استنادًا إلى البيانات المستلمة
        if (is_delivered) {
            if (message.status !== 'delivered') {
                newStatus = 'delivered';
                statusChanged = true;
                message.deliveredAt = delivered_date || new Date();
            }
        } 
        else if (is_send && message.status !== 'delivered') {
            if (message.status !== 'sent') {
                newStatus = 'sent';
                statusChanged = true;
                message.sentAt = send_date || new Date();
            }
        }

        // إذا تغيرت الحالة، نحفظ التغييرات
        if (statusChanged) {
            message.status = newStatus;
            
            // إذا لم يكن لدينا معرف خارجي مخزن، نحفظه الآن
            if (!message.externalMessageId && id) {
                message.externalMessageId = id;
            }
            
            // تخزين معرف الجهاز إذا كان متوفراً
            if (deviceId && message.providerData) {
                if (!message.providerData) {
                    message.providerData = {};
                }
                message.providerData.device = deviceId;
            }
            
            // تخزين بيانات إضافية من مزود الخدمة
            message.providerData = {
                ...message.providerData,
                lastUpdate: new Date(),
                webhookData: data
            };
            
            await message.save();
            
            /* logger.info('smsWebhookController', `تم تحديث حالة الرسالة`, {
                messageId: id || message.messageId,
                deviceId: deviceId || 'غير معروف',
                from: message.status,
                to: newStatus,
                phone: data.phone || message.recipient || 'غير معروف'
            }); */
        }

        // إرسال استجابة نجاح
        return res.status(200).json({ 
            success: true, 
            message: `تم استلام التحديث بنجاح`,
            statusChanged,
            messageId: id,
            deviceId: deviceId,
            newStatus
        });
    } catch (error) {
        logger.error('smsWebhookController', 'خطأ في معالجة webhook', error);
        // نرسل استجابة إيجابية لتجنب إعادة المحاولة من الخدمة
        return res.status(200).json({ 
            success: false, 
            error: 'حدث خطأ أثناء معالجة الطلب'
        });
    }
};
