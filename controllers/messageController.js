const SemClient = require('../models/SemClient');
const SemMessage = require('../models/SemMessage');
const logger = require('../services/loggerService');
const BalanceTransaction = require('../models/BalanceTransaction');
const SmsManager = require('../services/sms/SmsManager');
const SmsSettings = require('../models/SmsSettings');
const SmsStatusService = require('../services/sms/SmsStatusService');
// إضافة مدير خدمة الواتساب
const WhatsappManager = require('../services/whatsapp/WhatsappManager');
const WhatsappSettings = require('../models/WhatsappSettings');
const WhatsappMessage = require('../models/WhatsappMessage');
// استيراد خدمة تنسيق أرقام الهواتف
const phoneFormatService = require('../services/phoneFormatService');

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
 * تهيئة مدير خدمة الواتساب
 * @private
 */
async function _initializeWhatsappManager() {
    try {
        // التحقق مما إذا كان مدير الواتساب قد تم تهيئته بالفعل
        if (WhatsappManager.initialized) {
            return true;
        }

        // الحصول على إعدادات الواتساب النشطة
        const settings = await WhatsappSettings.getActiveSettings();
        
        if (!settings) {
            logger.error('messageController', 'لا يمكن العثور على إعدادات الواتساب النشطة');
            return false;
        }

        // تهيئة مدير خدمة الواتساب
        const config = settings.getProviderConfig();
        const initialized = await WhatsappManager.initialize(config);
        
        if (!initialized) {
            logger.error('messageController', 'فشل في تهيئة مدير خدمة الواتساب');
            return false;
        }
        
        return true;
    } catch (error) {
        logger.error('messageController', 'خطأ في تهيئة مدير خدمة الواتساب', error);
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

        // تنسيق رقم الهاتف باستخدام الخدمة المركزية
        const formattedPhoneResult = phoneFormatService.formatPhoneNumber(phone);
        
        // إنشاء سجل للرسالة حتى في حالة فشل التنسيق
        const newMessage = new SemMessage({
            clientId: client._id,
            recipients: [phone],
            content: msg,
            status: 'pending'
        });
        
        // إذا كان الرقم غير صالح
        if (!formattedPhoneResult.isValid) {
            newMessage.status = 'failed';
            newMessage.errorMessage = formattedPhoneResult.error;
            await newMessage.save();
            
            logger.warn(`فشل في إرسال رسالة للعميل ${client.name} بسبب رقم هاتف غير صالح: ${phone}`, {
                error: formattedPhoneResult.error
            });
            return res.status(400).send("8"); // كود خطأ 8: رقم هاتف غير صالح
        }
        
        // الآن لدينا رقم صحيح - نحفظ الرقم المنسق
        const formattedPhone = formattedPhoneResult.phone;
        
        // تحديث الرقم في سجل الرسالة
        newMessage.recipients = [formattedPhone];
        newMessage.originalRecipients = [phone]; // حفظ الرقم الأصلي

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

        // تحديد قنوات الإرسال المتاحة للعميل
        const canSendSms = client.messagingChannels?.sms !== false; // افتراضيًا: نعم
        const canSendWhatsapp = client.messagingChannels?.whatsapp === true; // افتراضيًا: لا

        // إذا كانت قنوات الإرسال معطلة تمامًا
        if (!canSendSms && !canSendWhatsapp) {
            newMessage.status = 'failed';
            newMessage.errorMessage = 'لم يتم تفعيل أي قناة إرسال للعميل';
            await newMessage.save();
            
            logger.error(`محاولة إرسال رسالة للعميل ${client.name} لكن لم يتم تفعيل أي قناة إرسال`);
            return res.status(400).send("9"); // كود خطأ 9: لم يتم تفعيل قنوات إرسال
        }

        // تهيئة مدير خدمة الرسائل SMS إذا كان مسموحًا
        let smsManagerInitialized = false;
        if (canSendSms) {
            smsManagerInitialized = await _initializeSmsManager();
            if (!smsManagerInitialized) {
                logger.error('فشل في تهيئة خدمة الرسائل SMS');
                // لا نريد إنهاء الطلب هنا، فقد يكون بإمكاننا إرسال واتساب
            }
        }

        // تهيئة مدير خدمة الواتساب إذا كان مسموحًا
        let whatsappManagerInitialized = false;
        if (canSendWhatsapp) {
            whatsappManagerInitialized = await _initializeWhatsappManager();
            if (!whatsappManagerInitialized) {
                logger.error('فشل في تهيئة خدمة الواتساب');
                // لا نريد إنهاء الطلب هنا، فقد يكون بإمكاننا إرسال SMS
            }
        }

        // التحقق مما إذا كانت أي من الخدمات متاحة
        if (!smsManagerInitialized && !whatsappManagerInitialized) {
            logger.error('فشل في تهيئة أي من خدمات الرسائل');
            return res.status(500).send("6"); // خطأ في النظام
        }

        // حفظ الرسالة في قاعدة البيانات
        await newMessage.save();

        // متغيرات لتتبع نتائج الإرسال
        let smsSent = false;
        let whatsappSent = false;
        let smsError = null;
        let whatsappError = null;
        let smsResult = null;
        let whatsappResult = null;

        // تحديد وسيلة الإرسال
        // يمكن تغيير هذا المنطق حسب متطلباتك، مثلاً يمكن إرسال SMS فقط إذا فشل الواتساب
        // أو العكس، أو إرسال الرسالة عبر كلتا الوسيلتين

        // المنطق الحالي: استخدام كلتا الوسيلتين إذا كانتا متاحتين، لكن مع التأكد من إرسال كل وسيلة مرة واحدة فقط
        
        // إرسال رسالة SMS إذا كان مسموحًا ومهيأ
        if (canSendSms && smsManagerInitialized) {
            // إرسال الرسالة فعلياً باستخدام SmsManager
            // نستخدم الرقم الأصلي، وسيتم تنسيقه داخليًا
            smsResult = await SmsManager.sendSms(phone, msg);

            if (smsResult.success) {
                smsSent = true;
                newMessage.status = smsResult.status === 'delivered' ? 'sent' : 'pending';
                
                // تخزين المعرف الداخلي والخارجي
                newMessage.messageId = newMessage._id.toString(); // استخدام معرف MongoDB كمعرف داخلي
                newMessage.externalMessageId = smsResult.externalMessageId; // حفظ المعرف الخارجي من SemySMS
                
                if (smsResult.status === 'delivered') {
                    newMessage.sentAt = new Date();
                }
                
                // استخراج معرف الجهاز من استجابة الAPI إذا وجد
                let deviceId = null;
                if (smsResult.rawResponse) {
                    deviceId = smsResult.rawResponse.id_device || 
                              smsResult.rawResponse.device_id || 
                              (smsResult.rawResponse.device ? smsResult.rawResponse.device : null);
                }
                
                // حفظ بيانات مزود الخدمة
                newMessage.providerData = {
                    provider: 'semysms',
                    lastUpdate: new Date(),
                    device: deviceId, // حفظ معرف الجهاز
                    rawResponse: smsResult.rawResponse
                };
                
                // حفظ معلومات الرسالة SMS في قاعدة البيانات
                await newMessage.save();
                
                // تسجيل معلومات إضافية لتسهيل عملية التشخيص
                logger.info(`تم إرسال رسالة SMS للعميل ${client.name} إلى ${formattedPhone} بنجاح`, {
                    data: {
                        internalId: newMessage.messageId,
                        externalId: newMessage.externalMessageId,
                        deviceId: deviceId
                    }
                });
            } else {
                smsError = smsResult.error || 'فشل في إرسال الرسالة SMS';
            }
        }

        // إرسال رسالة واتساب إذا كان مسموحًا ومهيأ
        if (canSendWhatsapp && whatsappManagerInitialized) {
            // إرسال رسالة الواتساب
            // نستخدم الرقم الأصلي، وسيتم تنسيقه داخليًا
            whatsappResult = await WhatsappManager.sendWhatsapp(phone, msg, { clientId: client._id });

            if (whatsappResult.success) {
                whatsappSent = true;
                
                // إذا لم يتم إرسال SMS بنجاح، أو لم نحاول إرسال SMS، نستخدم الواتساب كوسيلة رئيسية
                if (!smsSent) {
                    newMessage.status = 'sent'; // اعتبار الإرسال ناجحًا إذا تم عبر الواتساب
                    
                    // تخزين المعرفات بشكل صحيح
                    newMessage.messageId = newMessage._id.toString(); // استخدام معرف MongoDB كمعرف داخلي
                    newMessage.externalMessageId = whatsappResult.externalMessageId; // حفظ المعرف الخارجي
                    
                    // استخراج معرف الجهاز من استجابة الAPI إذا وجد
                    let deviceId = null;
                    if (whatsappResult.rawResponse) {
                        deviceId = whatsappResult.rawResponse.id_device || 
                                  whatsappResult.rawResponse.device_id || 
                                  (whatsappResult.rawResponse.device ? whatsappResult.rawResponse.device : null);
                    }
                    
                    // حفظ بيانات مزود الخدمة
                    newMessage.providerData = {
                        provider: 'semysms_whatsapp',
                        lastUpdate: new Date(),
                        device: deviceId, // حفظ معرف الجهاز
                        rawResponse: whatsappResult.rawResponse
                    };
                    
                    await newMessage.save();
                }
                
                // تسجيل معلومات إضافية لتسهيل عملية التشخيص
                logger.info(`تم إرسال رسالة واتساب للعميل ${client.name} إلى ${formattedPhone} بنجاح`, {
                    data: {
                        internalId: newMessage.messageId || whatsappResult.messageRecordId,
                        externalId: whatsappResult.externalMessageId,
                        deviceId: newMessage.providerData?.device || null
                    }
                });
            } else {
                whatsappError = whatsappResult.error || 'فشل في إرسال رسالة الواتساب';
            }
        }

        // التحقق مما إذا تم إرسال أي رسالة بنجاح
        if (!smsSent && !whatsappSent) {
            // فشل في إرسال أي رسالة
            newMessage.status = 'failed';
            newMessage.errorMessage = `${smsError || 'SMS غير مفعل'} | ${whatsappError || 'الواتساب غير مفعل'}`;
            await newMessage.save();
            
            logger.error(`فشل في إرسال رسالة للعميل ${client.name} إلى ${formattedPhone}`, {
                smsError, whatsappError
            });
            return res.status(500).send("6"); // كود خطأ 6: خطأ في النظام
        }

        // زيادة عدد الرسائل المرسلة للعميل
        client.messagesSent += 1;
        
        // خصم الرصيد بناءً على طول الرسالة (يتم خصم نقاط واحدة فقط حتى لو تم إرسال الرسالة بأكثر من طريقة)
        client.balance -= requiredPoints;
        await client.save();

        // تسجيل عملية استخدام الرصيد
        const transaction = new BalanceTransaction({
            clientId: client._id,
            amount: requiredPoints,
            type: 'usage',
            notes: `إرسال رسالة (${messageCount} رسائل) إلى ${formattedPhone}${smsSent && whatsappSent ? ' عبر SMS وواتساب' : (smsSent ? ' عبر SMS' : ' عبر واتساب')}`,
            performedBy: client._id // استخدام معرف العميل نفسه كمنفذ للعملية
        });
        await transaction.save();

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
