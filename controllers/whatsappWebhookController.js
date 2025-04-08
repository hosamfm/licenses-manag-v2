/**
 * وحدة تحكم للتعامل مع Webhook الخاص بحالة رسائل الواتس أب عبر SemySMS
 * 
 * ملاحظة: يستخدم النظام SemySMS كواجهة وسيطة للتعامل مع الواتس أب
 * بالإضافة إلى استخدام واجهة ميتا الرسمية للواتس أب
 * يجب الحفاظ على هذا الملف وعدم حذفه طالما أننا نستخدم SemySMS
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
 * دالة مساعدة لتحليل بيانات الطلب وتوحيدها بغض النظر عن نوع المحتوى
 * 
 * @param {Object} req - كائن الطلب
 * @param {Object} options - خيارات التحليل
 * @param {boolean} options.extractMessageFields - ما إذا كان يجب استخراج حقول الرسالة (الافتراضي: true)
 * @param {boolean} options.normalizeStatusFields - ما إذا كان يجب توحيد حقول الحالة (الافتراضي: true)
 * @returns {Object} كائن يحتوي على البيانات المستخرجة والمعلومات الإضافية
 */
const parseRequestData = (req, options = {}) => {
    const defaultOptions = {
        extractMessageFields: true,
        normalizeStatusFields: true
    };
    
    const opts = { ...defaultOptions, ...options };
    const contentType = req.headers['content-type'] || 'Unknown';
    let data = {};
    
    // 1. استخراج البيانات الأساسية من الطلب بناءً على نوع المحتوى
    if (contentType.includes('multipart/form-data')) {
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
        
        // البحث عن بيانات في معلمات الاستعلام
        if (Object.keys(req.query).length > 0) {
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
        
        // فحص المسار للعثور على معلمات مضمنة
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
    } else if (contentType.includes('application/json') || 
              contentType.includes('application/x-www-form-urlencoded')) {
        // معالجة البيانات بتنسيق JSON أو form-urlencoded
        data = req.body || {};
    } else {
        // إذا كان نوع المحتوى غير معروف، نجمع البيانات من req.body و req.query
        data = { ...req.query, ...req.body };
    }
    
    // 2. استخراج حقول الرسالة الأساسية إذا طلب ذلك
    let messageFields = {};
    if (opts.extractMessageFields) {
        messageFields = {
            id: data.id || data.ID || data.message_id || data.messageId || data.messageid || data.MessageId || data.msg_id || null,
            deviceId: data.device || data.id_device || data.device_id || data.deviceid || data.DeviceId || null,
            phone: data.phoneNumber || data.phone || data.recipient || data.to || data.phone_number || data.from || data.sender || data.number || null,
            status: data.status || data.Status || data.messageStatus || null,
            date: data.date || data.timestamp || data.time || null,
            msg: data.msg || data.message || data.text || data.content || null,
            type: data.type !== undefined ? data.type : 1,
            dir: data.dir || data.direction || null
        };
        
        // تنظيف رقم الهاتف إذا كان موجودًا
        if (messageFields.phone) {
            messageFields.phone = messageFields.phone.replace(/[^\d+]/g, '');
        }
    }
    
    // 3. توحيد حقول الحالة إذا طلب ذلك
    if (opts.normalizeStatusFields) {
        // توحيد is_delivered
        if (data.IsDelivered === "1" || data.IsDelivered === 1 || 
            data.isDelivered === "1" || data.isDelivered === 1 || 
            data.delivered === "1" || data.delivered === 1) {
            data.is_delivered = "1";
        }
        
        // توحيد is_send
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
    }
    
    return {
        data,
        messageFields,
        contentType,
        hasStatusData: data.is_send !== undefined || 
                       data.is_delivered !== undefined || 
                       data.status || 
                       data.send_date || 
                       data.delivered_date ||
                       messageFields.status !== null
    };
};

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
        
        // استخراج البيانات من الطلب
        const { data, messageFields, contentType, hasStatusData } = parseRequestData(req);
        
        // استخراج المعلومات المهمة من البيانات
        const id = messageFields.id;
        const deviceId = messageFields.deviceId;
        const phone = messageFields.phone;
        const status = messageFields.status;
        
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

    
    // استخراج البيانات من الطلب الوارد باستخدام الدالة المساعدة
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
        // استخدام الدالة المساعدة لاستخراج وتوحيد بيانات الطلب
        const { data, messageFields } = parseRequestData(req);
        
        // استخراج البيانات الأساسية للرسالة
        const id = messageFields.id;
        const date = messageFields.date;
        const phone = messageFields.phone;
        const msg = messageFields.msg;
        const type = messageFields.type;
        const deviceId = messageFields.deviceId;
        const dir = messageFields.dir;
        
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

            
            // إرسال إشعار بالرسالة الجديدة عبر Socket.io
            const socketService = require('../services/socketService');
            
            // إذا كانت الرسالة تحتوي على وسائط، نضيف معلومات الوسائط
            if (msg.mediaType) {
                // جلب معلومات الوسائط المرتبطة بالرسالة
                const WhatsappMedia = require('../models/WhatsappMedia');
                const mediaInfo = await WhatsappMedia.findOne({ messageId: msg._id });
                
                // إضافة معلومات الوسائط إلى كائن الرسالة للإشعار
                const messageWithMedia = {
                    _id: msg._id,
                    conversationId: msg.conversationId,
                    content: msg.content,
                    direction: 'incoming',
                    timestamp: msg.timestamp,
                    status: msg.status,
                    externalMessageId: msg.externalMessageId,
                    mediaType: msg.mediaType,
                    fileName: mediaInfo ? mediaInfo.fileName : null,
                    fileSize: mediaInfo ? mediaInfo.fileSize : null
                };
                

                
                socketService.notifyNewMessage(msg.conversationId, messageWithMedia);
            } else {
                // إرسال إشعار برسالة نصية عادية
                socketService.notifyNewMessage(msg.conversationId, {
                    _id: msg._id,
                    conversationId: msg.conversationId,
                    content: msg.content,
                    direction: 'incoming',
                    timestamp: msg.timestamp,
                    status: msg.status,
                    externalMessageId: msg.externalMessageId
                });
            }
            
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
