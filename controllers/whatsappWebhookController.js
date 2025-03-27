/**
 * وحدة تحكم للتعامل مع Webhook الخاص بحالة رسائل الواتس أب
 */
const WhatsappMessage = require('../models/WhatsappMessage');
const SemMessage = require('../models/SemMessage');
const WhatsappIncomingMessage = require('../models/WhatsappIncomingMessage');
const logger = require('../services/loggerService');
const multer = require('multer');
const upload = multer();

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
                        logger.error('whatsappWebhookController', `خطأ في تحليل الملف ${file.fieldname}`, error);
                    }
                }
            }
        } else {
            // استخراج المعلومات من الطلب العادي - قد تكون في body أو query
            data = { ...req.query, ...req.body };
        }
        
        // التحقق من وجود البيانات في شكل سلسلة نصية JSON
        if (typeof data === 'string' || (req.body && typeof req.body === 'string')) {
            try {
                const jsonString = typeof data === 'string' ? data : req.body;
                const jsonData = JSON.parse(jsonString);
                data = jsonData;
            } catch (error) {
                logger.error('whatsappWebhookController', `خطأ في تحليل البيانات كـ JSON`, {
                    dataType: typeof data,
                    dataPreview: typeof data === 'string' ? data.substring(0, 100) : null,
                    error: error.message
                });
            }
        }
        
        // فحص القيم الفارغة والاعتبار أنها تشير إلى فشل في الإرسال في بعض الحالات
        if (data.is_send === "" && data.is_delivered === "") {
            // عندما تكون جميع الحقول فارغة، غالباً ما يشير ذلك إلى فشل في الإرسال أو رفض من الطرف الآخر
            data.is_send = "0"; // نعتبرها فشل
        }
        
        // استخراج معرف الرسالة حسب توثيق SemySMS (الحقل الرئيسي id)
        // مع دعم أسماء حقول بديلة للتوافق مع مختلف إصدارات API
        let id = data.id || data.message_id || data.messageId || data.msg_id || data.externalId || null;
        
        // استخراج معرف الجهاز إذا كان موجوداً في البيانات
        const deviceId = data.device_id || data.id_device || data.device || data.deviceId || null;

        // استخراج رقم الهاتف من البيانات
        const phone = data.phone || data.recipient || data.to || data.number || null;

        // استخراج الحالة من البيانات إذا كانت متوفرة
        const status = data.status || 
                      (data.is_delivered === "1" || data.is_delivered === 1 ? "delivered" : 
                      (data.is_delivered === "0" && (data.is_send === "1" || data.is_send === 1) ? "sent" : 
                      (data.is_send === "0" || data.is_send === 0 ? "failed" : 
                      (data.delivered === "1" || data.delivered === 1 ? "delivered" : null))));
        
        // فحص البيانات المخصصة للواتساب - أحياناً تأتي في تنسيقات مختلفة
        if (data.Delivered === "1" || data.Delivered === 1 || 
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
        if (!id || !deviceId || !phone) {
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

        // تحسين آلية البحث عن الرسالة
        let message = null;
        
        // محاولة 1: البحث باستخدام externalMessageId (الموصى به)
        if (id) {
            message = await WhatsappMessage.findOne({ externalMessageId: id });
        }
        
        // محاولة 2: البحث بمعرف MongoDB
        if (!message && id) {
            message = await WhatsappMessage.findOne({ messageId: id });
        }
        
        // محاولة 3: البحث بمعرف SemySMS المُضمّن في حقل MessageId
        if (!message && id) {
            message = await WhatsappMessage.findOne({ 
                messageId: { $regex: new RegExp(`${id}$`) } 
            });
        }
        
        // محاولة 4: البحث بمعرف SemySMS كجزء من معرف الرسالة
        if (!message && id) {
            message = await WhatsappMessage.findOne({ 
                messageId: { $regex: new RegExp(id, 'i') } 
            });
        }

        // محاولة 5: البحث باستخدام معرف الجهاز والرقم إذا توفر
        if (!message && deviceId && phone) {
            // تنظيف رقم الهاتف من الأحرف الخاصة للبحث
            const cleanPhone = phone.replace(/[^\d]/g, '');
            
            // البحث عن أحدث رسالة مرسلة إلى هذا الرقم باستخدام هذا الجهاز
            message = await WhatsappMessage.findOne({ 
                recipient: { $regex: cleanPhone },
                'providerData.device': deviceId
            }).sort({ createdAt: -1 });
            
            if (message) {
                // تخزين معرف SemySMS في الرسالة للمستقبل إذا كان متوفراً
                if (id) {
                    message.externalMessageId = id;
                }
            }
        }

        // محاولة 6: البحث باستخدام رقم الهاتف فقط كملاذ أخير
        if (!message && phone) {
            // تنظيف رقم الهاتف من الأحرف الخاصة للبحث
            const cleanPhone = phone.replace(/[^\d]/g, '');
            
            // البحث عن أحدث رسالة مرسلة إلى هذا الرقم
            message = await WhatsappMessage.findOne({ 
                recipient: { $regex: cleanPhone }
            }).sort({ createdAt: -1 });
            
            if (message) {
                // تخزين معرف SemySMS في الرسالة للمستقبل إذا كان متوفراً
                if (id) {
                    message.externalMessageId = id;
                }
                
                // تخزين معرف الجهاز إذا كان متوفراً
                if (deviceId && message.providerData) {
                    if (!message.providerData) {
                        message.providerData = {};
                    }
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
        // وفقاً لتوثيق SemySMS، الحقول الرئيسية هي is_send و is_delivered و send_date و delivered_date
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
            message.sendDate = new Date(data.send_date);
        }
        if (data.delivered_date) {
            message.deliveredDate = new Date(data.delivered_date);
        }

        // حفظ التغييرات
        await message.save();

        // تحديث حالة الرسالة في جدول SemMessage أيضًا إذا كان ذلك ممكناً
        try {
            // البحث عن الرسالة في جدول SemMessage باستخدام externalMessageId المطابق
            const semMessage = await SemMessage.findOne({
                $or: [
                    { messageId: message.messageId },
                    { externalMessageId: message.externalMessageId },
                    { "providerData.whatsappMessageId": message._id.toString() }
                ]
            });

            if (semMessage) {
                logger.info('whatsappWebhookController', `تم تحديث حالة الرسالة من ${semMessage.status} إلى ${newStatus}`, {
                    messageId: semMessage._id
                });
                
                // تحديث حالة الرسالة
                semMessage.status = newStatus;
                await semMessage.save();
            } else {
                // محاولة البحث عن الرسالة بطرق إضافية
                const alternativeSearch = await SemMessage.findOne({
                    $or: [
                        // البحث بناءً على رقم الهاتف والوقت القريب
                        { 
                            recipients: { $in: [message.phoneNumber] },
                            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                        },
                        // البحث بناءً على محتوى الرسالة مطابق
                        {
                            content: message.message,
                            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                        }
                    ]
                }).sort({ createdAt: -1 }); // الأحدث أولاً
                
                if (alternativeSearch) {
                    logger.info('whatsappWebhookController', `تم تحديث حالة الرسالة من ${alternativeSearch.status} إلى ${newStatus}`, {
                        messageId: alternativeSearch._id
                    });
                    
                    // حفظ العلاقة لتسهيل البحث في المستقبل
                    alternativeSearch.externalMessageId = message.externalMessageId;
                    if (!alternativeSearch.providerData) {
                        alternativeSearch.providerData = {};
                    }
                    alternativeSearch.providerData.whatsappMessageId = message._id.toString();
                    
                    // تحديث الحالة
                    alternativeSearch.status = newStatus;
                    await alternativeSearch.save();
                } else {
                    logger.warn('whatsappWebhookController', `لم يتم العثور على رسالة في جدول SemMessage متصلة برسالة واتساب ${message._id}`, {
                        whatsappExternalId: message.externalMessageId,
                        phoneNumber: message.phoneNumber
                    });
                }
            }
        } catch (error) {
            logger.error('whatsappWebhookController', `خطأ أثناء تحديث حالة الرسالة في جدول SemMessage`, error);
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
        logger.error('whatsappWebhookController', 'خطأ في معالجة تحديث حالة الرسالة', error);
        // نرسل استجابة إيجابية لتجنب إعادة المحاولة من الخدمة
        return res.status(200).json({ 
            success: false, 
            error: 'حدث خطأ أثناء معالجة الطلب'
        });
    }
};

/**
 * معالجة الرسائل الواردة من SemySMS Webhook لرسائل الواتس أب
 */
exports.handleIncomingMessage = async (req, res) => {
    try {
        // طباعة كاملة للطلب الوارد لأغراض التشخيص
        const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        
        // سجل تفاصيل الطلب الوارد بالكامل
        logger.info('whatsappWebhookController', '====== بيانات الطلب الوارد من SemySMS =====', {
            ip: ipAddress,
            path: req.path,
            method: req.method,
            headers: req.headers,
            query: req.query,
            body: req.body,
            userAgent: req.headers['user-agent'] || 'غير محدد',
            contentType: req.headers['content-type'] || 'غير محدد',
            raw: req.rawBody || 'غير متوفر'
        });
        
        // طباعة نص الطلب إذا كان بتنسيق غير JSON
        if (req.body && typeof req.body === 'string') {
            logger.info('whatsappWebhookController', 'نص الطلب الخام: ' + req.body);
        }
        
        // إذا كانت البيانات في الملفات، نطبع تفاصيلها أيضًا
        if (req.files) {
            logger.info('whatsappWebhookController', 'ملفات الطلب: ', {
                count: req.files.length,
                details: req.files.map(f => ({
                    fieldname: f.fieldname,
                    size: f.size,
                    contentType: f.mimetype
                }))
            });
        }
        
        // سجل الحد الأدنى من المعلومات عن الطلب الوارد
        logger.debug('whatsappWebhookController', 'استلام رسالة واردة من webhook', {
            method: req.method,
            contentType: req.headers['content-type'] || 'غير محدد'
        });
        
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
                        logger.error('whatsappWebhookController', `خطأ في تحليل الملف ${file.fieldname}`, error);
                    }
                }
            }
        } else {
            // استخراج المعلومات من الطلب العادي - قد تكون في body أو query
            data = { ...req.query, ...req.body };
        }
        
        // التحقق من وجود البيانات في شكل سلسلة نصية JSON
        if (typeof data === 'string' || (req.body && typeof req.body === 'string')) {
            try {
                const jsonString = typeof data === 'string' ? data : req.body;
                const jsonData = JSON.parse(jsonString);
                data = jsonData;
            } catch (error) {
                logger.error('whatsappWebhookController', `خطأ في تحليل البيانات كـ JSON`, {
                    dataType: typeof data,
                    dataPreview: typeof data === 'string' ? data.substring(0, 100) : null,
                    error: error.message
                });
            }
        }
        
        // استخراج المعلومات الأساسية من البيانات الواردة
        // وفقاً للتوثيق، نحتاج للمعلومات التالية:
        // 'id' (معرف الرسالة)
        // 'date' (تاريخ وصول الرسالة)
        // 'phone' (رقم الهاتف المرسل)
        // 'msg' (محتوى الرسالة)
        // 'type' (نوع الرسالة: 0 للرسائل القصيرة، 1 للواتس أب)
        // 'id_device' (معرف الجهاز)
        // 'dir' (اتجاه الرسالة)
        
        // استخراج المعلومات باستخدام مختلف أسماء الحقول المحتملة
        const id = data.id || data.message_id || data.messageId || null;
        const date = data.date || data.timestamp || data.time || null;
        let phone = data.phone || data.from || data.sender || data.number || null;
        const msg = data.msg || data.message || data.text || data.content || null;
        const type = data.type !== undefined ? data.type : 1; // افتراض نوع واتس أب (1) إذا لم يتم تحديد النوع
        const deviceId = data.id_device || data.device_id || data.device || null;
        const dir = data.dir || data.direction || null;
        
        // تنظيف رقم الهاتف إذا كان متوفراً
        if (phone) {
            // إزالة أي أحرف غير رقمية من رقم الهاتف ما عدا علامة +
            phone = phone.replace(/[^\d+]/g, '');
        }
        
        // التحقق من وجود المعلومات الأساسية للرسالة
        if (!id || !phone || !msg) {
            logger.warn('whatsappWebhookController', 'معلومات الرسالة الواردة غير مكتملة', {
                id: id || 'غير محدد',
                phone: phone || 'غير محدد',
                msg: msg ? 'متوفر' : 'غير متوفر',
                type: type
            });
            
            // نرسل استجابة إيجابية لتجنب إعادة إرسال الرسالة مع تحذير
            return res.status(200).json({
                success: false,
                error: 'معلومات الرسالة غير مكتملة',
                message: 'يجب توفير معرف الرسالة ورقم الهاتف ومحتوى الرسالة'
            });
        }
        
        // التحقق من وجود رسالة مستلمة بنفس المعرف لتجنب التكرار
        let existingMessage = await WhatsappIncomingMessage.findOne({ id: id });
        
        if (existingMessage) {
            logger.info('whatsappWebhookController', 'تم استلام رسالة مكررة من webhook', {
                id: id,
                phone: phone
            });
            
            // إذا كانت الرسالة موجودة بالفعل، نرسل استجابة إيجابية دون معالجة
            return res.status(200).json({
                success: true,
                info: 'تم استلام هذه الرسالة من قبل',
                messageId: id
            });
        }
        
        // إنشاء سجل للرسالة المستلمة في قاعدة البيانات
        const incomingMessage = new WhatsappIncomingMessage({
            id: id,
            phone: phone,
            msg: msg,
            date: date,
            type: type,
            id_device: deviceId,
            dir: dir,
            rawData: data // تخزين البيانات الخام للاستخدام المستقبلي
        });
        
        // حفظ السجل في قاعدة البيانات
        await incomingMessage.save();
        
        logger.info('whatsappWebhookController', 'تم حفظ رسالة واتس أب واردة بنجاح', {
            id: id,
            phone: phone,
            messageLength: msg ? msg.length : 0
        });
        
        // إرسال استجابة نجاح
        return res.status(200).json({
            success: true,
            message: 'تم استلام الرسالة بنجاح',
            messageId: id
        });
    } catch (error) {
        logger.error('whatsappWebhookController', 'خطأ أثناء معالجة رسالة واتس أب واردة', error);
        
        // إرسال استجابة خطأ
        return res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء معالجة الرسالة',
            message: error.message
        });
    }
};
