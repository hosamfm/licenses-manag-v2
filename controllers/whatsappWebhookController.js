/**
 * وحدة تحكم للتعامل مع Webhook الخاص بحالة رسائل الواتس أب
 */
const SemMessage = require('../models/SemMessage');
const WhatsappIncomingMessage = require('../models/WhatsappIncomingMessage');
const logger = require('../services/loggerService');
const path = require('path');
const fs = require('fs');
const SemClient = require('../models/SemClient');
const URLSearchParams = require('url').URLSearchParams;
const { v4: uuidv4 } = require('uuid');

/**
 * معالجة التحديثات الواردة من SemySMS Webhook لرسائل الواتس أب
 */
exports.handleStatusUpdate = async (req, res) => {
    try {
        // سجل الحد الأدنى من المعلومات عن الطلب الوارد - فقط في حالة الأخطاء
        if (req.headers['content-type'] && !req.headers['content-type'].includes('multipart/form-data') && 
            !req.headers['content-type'].includes('application/json') && 
            !req.headers['content-type'].includes('application/x-www-form-urlencoded')) {
            logger.warn('whatsappWebhookController', 'استلام تحديث حالة من webhook بتنسيق غير متوقع', {
                method: req.method,
                contentType: req.headers['content-type']
            });
        }
        
        // التحقق من نوع المحتوى وتحليله بطريقة مناسبة
        let data = {};
        
        if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
            // معالجة البيانات بتنسيق multipart/form-data
            data = { ...req.query, ...req.body };
            
            // في بعض حالات multipart/form-data، قد تكون البيانات في req.files
            if (req.files && req.files.length > 0) {
                for (const file of req.files) {
                    try {
                        // محاولة تحليل البيانات كـ JSON إذا كانت نصية
                        if (file.buffer) {
                            const fieldValue = file.buffer.toString('utf8');
                            try {
                                const jsonData = JSON.parse(fieldValue);
                                data = { ...data, ...jsonData };
                            } catch (e) {
                                // إذا لم تكن JSON، نخزن النص كما هو
                                data[file.fieldname] = fieldValue;
                            }
                        }
                    } catch (error) {
                        logger.error('whatsappWebhookController', 'خطأ أثناء معالجة ملف في طلب webhook', error);
                    }
                }
            }
        } else if (req.headers['content-type'] && 
                  (req.headers['content-type'].includes('application/json') || 
                   req.headers['content-type'].includes('application/x-www-form-urlencoded'))) {
            // معالجة البيانات بتنسيق JSON أو form-urlencoded
            data = req.body || {};
        } else {
            // إذا كان نوع المحتوى غير معروف، نجمع البيانات من req.body و req.query
            data = { ...req.query, ...req.body };
        }
        
        // استخراج المعلومات المهمة من البيانات
        const id = data.id || data.ID || data.message_id || data.messageId || data.messageid || data.MessageId || null;
        const deviceId = data.device || data.id_device || data.device_id || data.deviceid || data.DeviceId || null;
        const phone = data.phoneNumber || data.phone || data.recipient || data.to || data.phone_number || null;
        const status = data.status || data.Status || data.messageStatus || null;
        
        // توحيد حقول الحالة لتسهيل معالجتها
        // توحيد is_delivered
        if (data.IsDelivered === "1" || data.IsDelivered === 1 || 
            data.isDelivered === "1" || data.isDelivered === 1 || 
            data.delivered === "1" || data.delivered === 1) {
            data.is_delivered = "1";
        }
        
        if (data.Sent === "1" || data.Sent === 1 || 
            data.sent === "1" || data.sent === 1 || 
            data.is_send === "1" || data.is_send === 1) {
            data.is_send = "1";
        }
        
        // التحقق من وجود messageStatus (عند استخدام واجهة META)
        if (data.messageStatus) {
            if (data.messageStatus === "read" || data.messageStatus === "delivered" || 
                data.messageStatus === "DELIVERED" || data.messageStatus === "READ") {
                data.is_delivered = "1";
                data.is_send = "1";
            } else if (data.messageStatus === "sent" || data.messageStatus === "SENT") {
                data.is_send = "1";
                data.is_delivered = "0";
            } else if (data.messageStatus === "failed" || data.messageStatus === "FAILED") {
                data.is_send = "0";
            }
        }
        
        // التحقق من حقول خاصة بـ SemySMS WhatsApp إذا كان الطلب مرسلاً بتنسيق form-data
        if (req.body) {
            // يتم أحياناً إرسال بيانات كمفاتيح منفصلة
            if (req.body.status || req.body.Status) {
                const statusValue = req.body.status || req.body.Status;
                data.status = statusValue;
                
                if (statusValue.toLowerCase() === "delivered" || statusValue.toLowerCase() === "read") {
                    data.is_delivered = "1";
                    data.is_send = "1";
                } else if (statusValue.toLowerCase() === "sent") {
                    data.is_send = "1";
                    data.is_delivered = "0";
                } else if (statusValue.toLowerCase() === "failed") {
                    data.is_send = "0";
                }
            }
            
            // التحقق من وجود مفاتيح is_sent أو is_delivered في الطلب
            if (req.body.is_delivered === "1" || req.body.isDelivered === "1" || req.body.delivered === "1") {
                data.is_delivered = "1";
            }
            
            if (req.body.is_send === "1" || req.body.is_sent === "1" || req.body.sent === "1") {
                data.is_send = "1";
            }
        }
        
        // تسجيل بيانات الرسالة المستخرجة لأغراض التشخيص - فقط في حالة الأخطاء
        if (!id && !deviceId && !phone) {
            logger.warn('whatsappWebhookController', 'بيانات غير مكتملة من webhook', {
                externalId: id,
                deviceId,
                phone,
                status
            });
        }

        // إذا كان معرف الرسالة غير موجود، نسجل تحذيراً ونرسل استجابة مناسبة
        if (!id && !deviceId && !phone) {
            logger.warn('whatsappWebhookController', 'تم استلام طلب webhook بدون معرف الرسالة أو معرف الجهاز أو رقم هاتف', data);
            // نرسل استجابة إيجابية لتجنب إعادة المحاولة من الخدمة
            return res.status(200).json({ 
                success: false, 
                error: 'معرف الرسالة أو معرف الجهاز أو رقم الهاتف مطلوب'
            });
        }

        // البحث عن الرسالة في جدول SemMessage
        let message = null;
        
        // محاولة 1: البحث باستخدام externalMessageId
        if (id) {
            message = await SemMessage.findOne({ externalMessageId: id });
        }
        
        // محاولة 2: البحث باستخدام messageId
        if (!message && id) {
            message = await SemMessage.findOne({ messageId: id });
        }
        
        // محاولة 3: البحث باستخدام معرف الجهاز ورقم الهاتف
        if (!message && deviceId && phone) {
            // تنظيف رقم الهاتف من الأحرف الخاصة للبحث
            const cleanPhone = phone.replace(/[^\d]/g, '');
            
            // البحث عن أحدث رسالة مرسلة إلى هذا الرقم باستخدام هذا الجهاز
            message = await SemMessage.findOne({ 
                'recipients': { $in: [new RegExp(cleanPhone)] },
                'providerData.device': deviceId,
                'providerData.provider': 'semysms_whatsapp'
            }).sort({ createdAt: -1 });
            
            if (message && id) {
                // تخزين معرف الرسالة الخارجي للمستقبل
                message.externalMessageId = id;
            }
        }
        
        // محاولة 4: البحث باستخدام رقم الهاتف فقط كملاذ أخير
        if (!message && phone) {
            // تنظيف رقم الهاتف من الأحرف الخاصة للبحث
            const cleanPhone = phone.replace(/[^\d]/g, '');
            
            // البحث عن أحدث رسالة مرسلة إلى هذا الرقم
            message = await SemMessage.findOne({ 
                'recipients': { $in: [new RegExp(cleanPhone)] },
                'providerData.provider': 'semysms_whatsapp'
            }).sort({ createdAt: -1 });
            
            if (message) {
                // تخزين معرف الرسالة الخارجي للمستقبل
                if (id) {
                    message.externalMessageId = id;
                }
                
                // تخزين معرف الجهاز إذا كان متوفراً
                if (deviceId && !message.providerData.device) {
                    message.providerData.device = deviceId;
                }
            }
        }

        if (!message) {
            logger.warn('whatsappWebhookController', `لم يتم العثور على رسالة مطابقة`, {
                searchId: id || 'غير محدد',
                deviceId: deviceId || 'غير محدد',
                phone: phone || 'غير محدد'
            });
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
        const hasStatusData = data.is_send !== undefined || 
                              data.is_delivered !== undefined || 
                              data.status || 
                              data.send_date || 
                              data.delivered_date ||
                              status !== null;

        // إذا كانت البيانات المستلمة لا تحتوي على معلومات الحالة، نرسل استجابة إيجابية بدون تغيير
        if (!hasStatusData) {
            logger.warn('whatsappWebhookController', `استلام طلب webhook بدون معلومات حالة، لن يتم تحديث الحالة`, {
                messageId: message.messageId,
                currentStatus: message.status
            });
            return res.status(200).json({ 
                success: true, 
                info: 'تم استلام الطلب ولكن لم يتم تحديث الحالة لعدم وجود معلومات حالة',
                messageId: message.messageId
            });
        }

        // تحديد الحالة الجديدة بناءً على المعلومات الواردة
        // 1. إذا كانت الحالة محددة بشكل صريح في البيانات، نستخدمها
        if (data.status) {
            newStatus = data.status;
            statusChanged = newStatus !== message.status;
        }
        // 2. وإلا، إذا كان الحقل is_delivered مضبوطاً على "1"، نضبط الحالة على "delivered"
        else if (data.is_delivered === "1" || data.is_delivered === 1 || status === "delivered") {
            newStatus = "delivered";
            statusChanged = message.status !== "delivered";
        }
        // 3. وإلا، إذا كان الحقل is_send مضبوطاً على "1" والحقل is_delivered مضبوطاً على "0"، نضبط الحالة على "sent"
        else if ((data.is_send === "1" || data.is_send === 1) && (data.is_delivered === "0" || data.is_delivered === 0)) {
            newStatus = "sent";
            statusChanged = message.status !== "sent";
        }
        // 4. إذا كان الحقل is_send مضبوطاً على "0"، نضبط الحالة على "failed"
        else if (data.is_send === "0" || data.is_send === 0) {
            newStatus = "failed";
            statusChanged = message.status !== "failed";
        }
        // 5. إذا كانت الحقول فارغة بشكل صريح، نعتبرها حالة فشل أيضًا
        else if (data.is_send === "" && data.is_delivered === "") {
            newStatus = "failed";
            statusChanged = message.status !== "failed";
        }

        // إذا لم تتغير الحالة، نرسل استجابة إيجابية بدون تحديث
        if (!statusChanged) {
            // لا نحتاج لتسجيل سجل هنا لتجنب كثرة السجلات
            return res.status(200).json({ 
                success: true, 
                info: 'تم استلام الطلب ولكن لم يتم تحديث الحالة لأنها لم تتغير',
                messageId: message.messageId,
                status: message.status
            });
        }

        // تحديث حالة الرسالة وحفظها
        const oldStatus = message.status;
        message.status = newStatus;
        
        // تحديث تاريخ الإرسال أو التسليم إذا كان موجوداً في البيانات
        if (data.send_date) {
            message.sentAt = new Date(data.send_date);
        }
        if (data.delivered_date) {
            message.deliveredAt = new Date(data.delivered_date);
        }
        
        // تحديث معلومات مزود الخدمة
        if (message.providerData) {
            message.providerData.lastUpdate = new Date();
            if (!message.providerData.statusUpdates) {
                message.providerData.statusUpdates = {};
            }
            message.providerData.statusUpdates.status = newStatus;
            message.providerData.statusUpdates.timestamp = new Date();
        }

        // حفظ التغييرات
        await message.save();
        
        logger.info('whatsappWebhookController', `تم تحديث حالة الرسالة في جدول SemMessage من ${oldStatus} إلى ${newStatus}`, {
            messageId: message._id,
            externalMessageId: message.externalMessageId
        });

        // إرسال استجابة نجاح
        return res.status(200).json({ 
            success: true, 
            messageId: message.messageId,
            oldStatus: oldStatus,
            newStatus: newStatus,
            message: `تم تحديث حالة الرسالة من ${oldStatus} إلى ${newStatus}`
        });
    } catch (error) {
        logger.error('whatsappWebhookController', 'خطأ في معالجة webhook', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message
        });
    }
};
