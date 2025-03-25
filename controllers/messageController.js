const SemClient = require('../models/SemClient');
const SemMessage = require('../models/SemMessage');
const logger = require('../services/loggerService');
const BalanceTransaction = require('../models/BalanceTransaction');
const SmsManager = require('../services/sms/SmsManager');
const SmsSettings = require('../models/SmsSettings');
const SmsStatusService = require('../services/sms/SmsStatusService');

/**
 * تهيئة مدير خدمة الرسائل
 * @private
 */
async function _initializeSmsManager() {
    try {
        // التحقق مما إذا كان مدير الرسائل قد تم تهيئته بالفعل
        if (SmsManager.initialized) {
            return true;
        }

        // الحصول على إعدادات SMS النشطة
        const settings = await SmsSettings.getActiveSettings();
        
        if (!settings) {
            logger.error('messageController', 'لا يمكن العثور على إعدادات SMS النشطة');
            return false;
        }

        // تهيئة مدير خدمة الرسائل
        const config = settings.getProviderConfig();
        const initialized = await SmsManager.initialize(config);
        
        if (!initialized) {
            logger.error('messageController', 'فشل في تهيئة مدير خدمة الرسائل');
            return false;
        }
        
        return true;
    } catch (error) {
        logger.error('messageController', 'خطأ في تهيئة مدير خدمة الرسائل', error);
        return false;
    }
}

/**
 * إرسال رسالة باستخدام مفتاح API
 */
exports.sendMessage = async (req, res) => {
    try {
        const { token, phone, msg } = req.query;

        // التحقق من توفر البيانات المطلوبة
        if (!token || !phone || !msg) {
            return res.status(400).send("2"); // كود خطأ 2: بيانات غير مكتملة
        }

        // التحقق من صحة مفتاح API
        const client = await SemClient.validateApiCredentials(token);
        if (!client) {
            logger.error(`محاولة استخدام مفتاح API غير صالح: ${token}`);
            return res.status(401).send("3"); // كود خطأ 3: مفتاح API غير صالح
        }

        // التحقق من الحدود اليومية والشهرية
        const withinDailyLimit = await client.checkDailyLimit();
        if (!withinDailyLimit) {
            logger.warn(`العميل ${client.name} تجاوز الحد اليومي للرسائل`);
            return res.status(429).send("4"); // كود خطأ 4: تجاوز الحد اليومي
        }

        const withinMonthlyLimit = await client.checkMonthlyLimit();
        if (!withinMonthlyLimit) {
            logger.warn(`العميل ${client.name} تجاوز الحد الشهري للرسائل`);
            return res.status(429).send("5"); // كود خطأ 5: تجاوز الحد الشهري
        }

        // التحقق إذا كانت الرسالة تحتوي على حروف عربية
        const containsArabic = /[\u0600-\u06FF]/.test(msg);
        const maxLength = containsArabic ? 70 : 160;
        
        // حساب عدد الرسائل المطلوبة
        const messageCount = Math.ceil(msg.length / maxLength);
        
        // نقطة واحدة لكل رسالة
        const requiredPoints = messageCount;
        
        // التحقق من وجود رصيد كافٍ
        if (client.balance < requiredPoints) {
            logger.warn(`العميل ${client.name} لا يملك رصيدًا كافيًا لإرسال الرسالة (مطلوب: ${requiredPoints}, متوفر: ${client.balance})`);
            return res.status(402).send("7"); // كود خطأ 7: رصيد غير كافٍ
        }

        // تهيئة مدير خدمة الرسائل
        const smsManagerInitialized = await _initializeSmsManager();
        if (!smsManagerInitialized) {
            logger.error('فشل في تهيئة خدمة الرسائل');
            return res.status(500).send("6"); // خطأ في النظام
        }

        // إنشاء سجل للرسالة
        const newMessage = new SemMessage({
            clientId: client._id,
            recipients: [phone],
            content: msg,
            status: 'pending'
        });

        // حفظ الرسالة في قاعدة البيانات
        await newMessage.save();

        // إرسال الرسالة فعلياً باستخدام SmsManager
        const smsResult = await SmsManager.sendSms(phone, msg);

        if (!smsResult.success) {
            // فشل في إرسال الرسالة
            newMessage.status = 'failed';
            newMessage.errorMessage = smsResult.error || 'فشل في إرسال الرسالة';
            await newMessage.save();
            
            logger.error(`فشل في إرسال رسالة للعميل ${client.name} إلى ${phone}`, {
                error: smsResult.error
            });
            return res.status(500).send("6"); // كود خطأ 6: خطأ في النظام
        }

        // تم إرسال الرسالة بنجاح، تحديث المعلومات
        newMessage.status = smsResult.status === 'delivered' ? 'sent' : 'pending';
        newMessage.messageId = smsResult.messageId;
        if (smsResult.status === 'delivered') {
            newMessage.sentAt = new Date();
        }
        await newMessage.save();

        // زيادة عدد الرسائل المرسلة للعميل
        client.messagesSent += 1;
        
        // خصم الرصيد بناءً على طول الرسالة
        client.balance -= requiredPoints;
        await client.save();

        // تسجيل عملية استخدام الرصيد
        const transaction = new BalanceTransaction({
            clientId: client._id,
            amount: requiredPoints,
            type: 'usage',
            notes: `إرسال رسالة (${messageCount} رسائل) إلى ${phone}`,
            performedBy: client._id // استخدام معرف العميل نفسه كمنفذ للعملية
        });
        await transaction.save();

        logger.info(`تم إرسال رسالة للعميل ${client.name} إلى ${phone} بنجاح`);

        // إعادة استجابة نجاح مبسطة (رقم فقط)
        return res.status(200).send("1");

    } catch (error) {
        logger.error('خطأ في إرسال الرسالة:', error);
        return res.status(500).send("6");
    }
};

/**
 * التحقق من الرصيد المتبقي للعميل
 */
exports.checkBalance = async (req, res) => {
    try {
        const { token } = req.query;

        // التحقق من توفر مفتاح API
        if (!token) {
            return res.status(400).send("2"); // كود خطأ 2: بيانات غير مكتملة
        }

        // التحقق من صحة مفتاح API
        const client = await SemClient.validateApiCredentials(token);
        if (!client) {
            logger.error(`محاولة استخدام مفتاح API غير صالح: ${token}`);
            return res.status(401).send("3"); // كود خطأ 3: مفتاح API غير صالح
        }

        // إرجاع الرصيد الفعلي للعميل
        return res.status(200).send(client.balance.toString());

    } catch (error) {
        logger.error('خطأ في التحقق من الرصيد:', error);
        return res.status(500).send("6");
    }
};

/**
 * التحقق من رصيد حساب SemySMS
 * متاح فقط للمدراء
 */
exports.checkSmsProviderBalance = async (req, res) => {
    try {
        // التحقق من وجود المستخدم وأنه أدمن فقط
        const userRole = req.session.userRole;
        if (userRole !== 'admin') {
            logger.warn(`محاولة وصول غير مصرح به لرصيد مزود الخدمة من قبل مستخدم غير مدير`);
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بالوصول إلى هذه البيانات'
            });
        }
        
        // تهيئة مدير خدمة الرسائل
        const smsManagerInitialized = await _initializeSmsManager();
        if (!smsManagerInitialized) {
            return res.status(500).json({
                success: false,
                message: 'فشل في تهيئة خدمة الرسائل'
            });
        }
        
        // الحصول على رصيد الحساب
        const balanceResult = await SmsManager.checkAccountBalance();
        
        if (!balanceResult.success) {
            return res.status(500).json({
                success: false,
                message: `فشل في التحقق من رصيد الحساب: ${balanceResult.error}`
            });
        }
        
        return res.status(200).json({
            success: true,
            balance: balanceResult.balance,
            provider: balanceResult.provider || 'semysms'
        });
    } catch (error) {
        logger.error('خطأ في التحقق من رصيد مزود الخدمة:', error);
        return res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء التحقق من رصيد مزود الخدمة'
        });
    }
};

/**
 * تحديث حالة الرسائل المعلقة
 * متاح فقط للمدراء
 */
exports.updatePendingMessagesStatus = async (req, res) => {
    try {
        // التحقق من وجود المستخدم وأنه أدمن فقط
        const userRole = req.session.userRole;
        if (userRole !== 'admin') {
            logger.warn(`محاولة وصول غير مصرح به لتحديث حالة الرسائل من قبل مستخدم غير مدير`);
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بالوصول إلى هذه الوظيفة'
            });
        }
        
        // تهيئة مدير خدمة الرسائل
        const smsManagerInitialized = await _initializeSmsManager();
        if (!smsManagerInitialized) {
            return res.status(500).json({
                success: false,
                message: 'فشل في تهيئة خدمة الرسائل'
            });
        }
        
        // تحديث حالة الرسائل المعلقة
        const updateResult = await SmsStatusService.updatePendingMessagesStatus();
        
        return res.status(200).json({
            success: updateResult.success,
            ...updateResult
        });
    } catch (error) {
        logger.error('خطأ في تحديث حالة الرسائل المعلقة:', error);
        return res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء تحديث حالة الرسائل'
        });
    }
};

/**
 * الحصول على سجل رسائل عميل معين - متاح فقط للأدمن
 */
exports.getClientMessages = async (req, res) => {
    try {
        // التحقق من وجود المستخدم وأنه أدمن فقط
        const userRole = req.session.userRole;
        if (userRole !== 'admin') {
            logger.warn(`محاولة وصول غير مصرح به للرسائل من قبل مستخدم غير مدير`);
            return res.status(403).json({
                success: false,
                message: 'غير مصرح لك بالوصول إلى هذه البيانات'
            });
        }

        const clientId = req.params.clientId;
        if (!clientId) {
            return res.status(400).json({
                success: false,
                message: 'معرف العميل مطلوب'
            });
        }

        // التحقق من وجود العميل
        const client = await SemClient.findById(clientId);
        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'العميل غير موجود'
            });
        }

        // الحصول على الصفحة الحالية والحجم
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // الحصول على إجمالي عدد الرسائل للعميل
        const totalMessages = await SemMessage.countDocuments({ clientId });

        // الحصول على رسائل العميل مع ترتيبها من الأحدث إلى الأقدم
        const messages = await SemMessage.find({ clientId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // إعداد بيانات الصفحات
        const totalPages = Math.ceil(totalMessages / limit);
        
        return res.status(200).json({
            success: true,
            messages,
            pagination: {
                page: page,
                totalPages,
                totalMessages,
                limit
            },
            client: {
                id: client._id,
                name: client.name
            }
        });

    } catch (error) {
        logger.error('خطأ في الحصول على رسائل العميل:', error);
        return res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء معالجة الطلب'
        });
    }
};
