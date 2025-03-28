/**
 * وحدة تحكم للتعامل مع Webhook الخاص بحالة رسائل الواتس أب
 */
const WhatsappMessage = require('../models/WhatsappMessage');
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
    const timestamp = new Date().toISOString();
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';
    const contentType = req.headers['content-type'] || 'Unknown';
    
    // تسجيل بداية استلام الطلب
    logger.debug('whatsappWebhookController', '=== بداية معالجة رسالة واتس أب واردة جديدة ===', {
        timestamp,
        ip: ipAddress,
        userAgent,
        contentType,
        url: req.url,
        method: req.method
    });
    
    // تكوين بيانات الطلب بدون استخدام حفظ الملفات
    const requestId = Date.now().toString();
    const reqData = {
        timestamp,
        ip: ipAddress,
        path: req.path,
        method: req.method,
        headers: req.headers,
        query: req.query,
        body: req.body
    };
    
    logger.info('whatsappWebhookController', `معالجة طلب جديد رقم: ${requestId}`, { 
        ip: ipAddress,
        method: req.method,
        path: req.path,
        contentType
    });
    
    // استخراج البيانات من الطلب الوارد
    let data = {};
    let rawData = null;
    
    // تسجيل بيانات الطلب الأولية
    logger.debug('whatsappWebhookController', 'بيانات الطلب الأولية', {
        contentType,
        hasBody: !!req.body,
        bodyType: typeof req.body,
        hasQuery: !!req.query && Object.keys(req.query).length > 0
    });
    
    // طباعة البيانات الخام للتشخيص
    logger.debug('whatsappWebhookController', 'بيانات الطلب الخام', {
        body: JSON.stringify(req.body),
        query: JSON.stringify(req.query),
        headers: JSON.stringify(req.headers)
    });
    
    // معالجة بيانات الطلب بناءً على نوع المحتوى
    try {
        if (contentType.includes('multipart/form-data')) {
            // تحسين معالجة بيانات multipart/form-data
            
            // طريقة 1: الوصول المباشر لبيانات req.body
            data = { ...req.query, ...req.body };
            
            // تسجيل ما إذا كانت هناك بيانات في الـ body
            logger.debug('whatsappWebhookController', 'بيانات الطلب من multipart/form-data', {
                bodyFields: Object.keys(req.body),
                bodyValues: req.body
            });
            
            // استكشاف البيانات من الحقول الخام والملفات إذا كانت موجودة
            if (req.files && Object.keys(req.files).length > 0) {
                logger.debug('whatsappWebhookController', 'تم العثور على ملفات', { 
                    filesCount: Object.keys(req.files).length,
                    fileNames: Object.keys(req.files) 
                });
            }
            
            // طريقة 2: فحص بيانات الاستعلام للعثور على البيانات
            if (Object.keys(req.query).length > 0) {
                logger.debug('whatsappWebhookController', 'بيانات الاستعلام', { query: req.query });
                
                // البحث عن بيانات في المعلمات
                for (const key in req.query) {
                    if (typeof req.query[key] === 'string' && req.query[key].includes('=')) {
                        try {
                            // محاولة تفسير المعلمة كسلسلة استعلام
                            const params = new URLSearchParams(req.query[key]);
                            for (const [paramKey, paramValue] of params.entries()) {
                                data[paramKey] = paramValue;
                            }
                        } catch (e) {
                            // تجاهل أخطاء التحليل
                        }
                    }
                }
            }
            
            // طريقة 3: فحص المسار للعثور على معلمات مضمنة
            if (req.path.includes('?')) {
                try {
                    const pathParts = req.path.split('?');
                    if (pathParts.length > 1) {
                        const params = new URLSearchParams(pathParts[1]);
                        for (const [key, value] of params.entries()) {
                            data[key] = value;
                        }
                    }
                } catch (e) {
                    // تجاهل أخطاء التحليل
                }
            }
            
            // طريقة 4: فحص عناوين HTTP للحصول على معلومات
            if (req.headers['content-type'].includes('boundary=')) {
                logger.debug('whatsappWebhookController', 'تم العثور على boundary', { 
                    boundary: req.headers['content-type'].split('boundary=')[1] 
                });
            }
        } else if (contentType.includes('application/json')) {
            // استخراج البيانات من JSON
            data = req.body;
        } else {
            // استخراج البيانات من الاستعلام
            data = req.query;
        }
        
        // استخراج البيانات الأساسية للرسالة
        let id = data.id || data.message_id || data.messageId || data.msg_id || null;
        let date = data.date || data.timestamp || data.time || null;
        let phone = data.phone || data.from || data.sender || data.number || null;
        let msg = data.msg || data.message || data.text || data.content || null;
        let type = data.type !== undefined ? data.type : 1;
        let deviceId = data.id_device || data.device_id || data.device || null;
        let dir = data.dir || data.direction || null;
        
        // تجميع البيانات التشخيصية
        const diagnosticInfo = {
            ip: ipAddress,
            userAgent: userAgent,
            contentType: contentType,
            headers: req.headers,
            query: req.query,
            body: data,
            rawData: rawData,
            extractedData: {
                id, date, phone, msg, type, deviceId, dir
            },
            queryString: req.url
        };
        
        // لأغراض التشخيص، إذا لم يكن هناك معرف رسالة، نقوم بإنشاء واحد
        if (!id && (phone || msg)) {
            id = 'temp_' + Date.now();
        }
        
        // التنظيف والتحقق من الصحة
        if (phone) {
            phone = phone.replace(/[^\d+]/g, '');
            logger.debug('whatsappWebhookController', 'تنظيف رقم الهاتف', { cleanedPhone: phone });
        }
        
        // التحقق من وجود المعلومات الأساسية للرسالة
        if (!id || !phone || !msg) {
            logger.warn('whatsappWebhookController', 'معلومات الرسالة غير مكتملة', {
                missingId: !id,
                missingPhone: !phone,
                missingMsg: !msg
            });
            
            // إرجاع استجابة تشخيصية مع كل المعلومات
            return res.status(200).json({
                success: false,
                error: 'معلومات الرسالة غير مكتملة',
                message: 'يجب توفير معرف الرسالة ورقم الهاتف ومحتوى الرسالة',
                diagnosticInfo: diagnosticInfo,
                missingFields: {
                    id: !id,
                    phone: !phone,
                    msg: !msg
                }
            });
        }
        
        // التحقق من وجود رسالة مستلمة بنفس المعرف لتجنب التكرار
        try {
            let existingMessage = await WhatsappIncomingMessage.findOne({ id: id });
            
            if (existingMessage) {
                logger.info('whatsappWebhookController', 'تم استلام رسالة مكررة', { 
                    messageId: id, 
                    phone: phone 
                });
                
                return res.status(200).json({
                    success: true,
                    message: 'تم استلام هذه الرسالة مسبقًا',
                    duplicate: true,
                    diagnosticInfo: diagnosticInfo
                });
            }
            
            // البحث عن العميل المرتبط برقم الهاتف
            let client = null;
            try {
                client = await SemClient.findOne({ phone: phone });
                
                if (client) {
                    logger.debug('whatsappWebhookController', 'تم العثور على عميل مرتبط برقم الهاتف', { 
                        clientId: client._id,
                        clientName: client.name
                    });
                } else {
                    logger.debug('whatsappWebhookController', 'لم يتم العثور على عميل مرتبط برقم الهاتف', { phone });
                }
            } catch (clientError) {
                logger.error('whatsappWebhookController', 'خطأ أثناء البحث عن العميل', clientError);
            }
            
            // حفظ الرسالة الواردة في قاعدة البيانات
            const incomingMessage = new WhatsappIncomingMessage({
                id,
                phone,
                msg,
                date,
                type,
                id_device: deviceId,
                dir,
                clientId: client ? client._id : null,
                rawData: reqData
            });
            
            await incomingMessage.save();
            logger.info('whatsappWebhookController', 'تم حفظ رسالة واتس أب واردة جديدة بنجاح', { 
                messageId: id, 
                phone: phone 
            });
            
            // إرجاع استجابة نجاح
            return res.status(200).json({
                success: true,
                message: 'تم استلام الرسالة بنجاح',
                savedMessage: {
                    id: incomingMessage.id,
                    phone: incomingMessage.phone,
                    date: incomingMessage.date
                },
                diagnosticInfo: diagnosticInfo
            });
            
        } catch (error) {
            logger.error('whatsappWebhookController', 'خطأ أثناء معالجة رسالة واتس أب واردة', error);
            
            // إرجاع استجابة خطأ
            return res.status(200).json({
                success: false,
                error: 'خطأ في معالجة الرسالة الواردة',
                message: error.message,
                diagnosticInfo: diagnosticInfo
            });
        }
    } catch (error) {
        logger.error('whatsappWebhookController', 'خطأ أثناء معالجة طلب رسالة واتس أب', error);
        
        // إرجاع استجابة خطأ
        return res.status(200).json({
            success: false,
            error: 'خطأ في معالجة الطلب',
            message: error.message
        });
    }
};
