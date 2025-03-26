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
 * وظيفة مساعدة للتحقق من حالة الرسالة بعد 30 ثانية
 * @param {string} messageId معرف الرسالة
 * @param {string} messageType نوع الرسالة (whatsapp/sms)
 * @param {number} timeout مدة الانتظار بالمللي ثانية
 * @returns {object} نتيجة التحقق من حالة الرسالة
 */
async function _checkMessageStatus(messageId, messageType, timeout = 30000) {
    try {
        logger.info('messageController', `انتظار ${timeout/1000} ثانية للتحقق من حالة الرسالة ${messageId}`);
        
        // انتظار الوقت المحدد
        await new Promise(resolve => setTimeout(resolve, timeout));
        
        // التحقق من نوع الرسالة وتنفيذ الاستعلام المناسب
        let message = null;
        if (messageType === 'whatsapp') {
            message = await WhatsappMessage.findOne({ messageId });
        } else if (messageType === 'sms') {
            message = await SemMessage.findOne({ messageId });
        }
        
        // إذا لم يتم العثور على الرسالة
        if (!message) {
            logger.warn('messageController', `لم يتم العثور على الرسالة ${messageId} للتحقق من حالتها`);
            return { 
                success: false, 
                status: null, 
                error: 'لم يتم العثور على الرسالة' 
            };
        }
        
        logger.info('messageController', `تم التحقق من حالة الرسالة ${messageId}: ${message.status}`);
        
        return {
            success: true,
            status: message.status,
            message
        };
    } catch (error) {
        logger.error('messageController', `خطأ أثناء التحقق من حالة الرسالة ${messageId}`, error);
        return { 
            success: false, 
            status: null, 
            error: error.message 
        };
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

        // تسجيل البيانات المستلمة للتشخيص
        logger.debug('messageController', 'بيانات الطلب المستلمة', {
            receivedPhone: phone,
            phoneType: typeof phone,
            urlEncoded: encodeURIComponent(phone),
            urlDecoded: decodeURIComponent(phone)
        });

        // التحقق من صحة مفتاح API
        const client = await SemClient.validateApiCredentials(token);
        if (!client) {
            logger.error(`محاولة استخدام مفتاح API غير صالح: ${token}`);
            return res.status(401).send("3"); // كود خطأ 3: مفتاح API غير صالح
        }

        // معالجة أولية لرقم الهاتف
        let processedPhone = phone;
        
        // إذا كان الرقم يبدأ بمسافة، نقوم بإزالتها
        if (typeof processedPhone === 'string') {
            processedPhone = processedPhone.trim();
            
            // إذا كان الرقم يحتوي على "+ " (علامة + متبوعة بمسافة)
            if (processedPhone.includes('+ ')) {
                processedPhone = processedPhone.replace('+ ', '+');
            }
            
            // إذا كان الرقم لا يبدأ بـ + ولكنه يبدأ برقم، نضيف +
            if (!processedPhone.startsWith('+') && /^\d/.test(processedPhone)) {
                processedPhone = '+' + processedPhone;
            }
            
            // التأكد من أن الرقم لا يحتوي على مسافات
            processedPhone = processedPhone.replace(/\s+/g, '');
        }
        
        // تسجيل الرقم بعد المعالجة الأولية
        logger.debug('messageController', 'رقم الهاتف بعد المعالجة الأولية', {
            processedPhone: processedPhone
        });

        // تنسيق رقم الهاتف باستخدام الخدمة المركزية
        const formattedPhoneResult = phoneFormatService.formatPhoneNumber(processedPhone);
        
        // إنشاء سجل للرسالة حتى في حالة فشل التنسيق
        const newMessage = new SemMessage({
            clientId: client._id,
            recipients: [processedPhone], // استخدام الرقم المعالج أولياً
            content: msg,
            status: 'pending'
        });
        
        // إذا كان الرقم غير صالح
        if (!formattedPhoneResult.isValid) {
            newMessage.status = 'failed';
            newMessage.errorMessage = formattedPhoneResult.error;
            await newMessage.save();
            
            logger.warn(`فشل في إرسال رسالة للعميل ${client.name} بسبب رقم هاتف غير صالح: ${processedPhone}`, {
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

        // تحديد القناة المفضلة
        const preferredChannel = client.preferredChannel || 'none'; // في حالة عدم وجود تفضيل
        
        logger.info('messageController', `قنوات الإرسال المتاحة للعميل ${client.name}`, {
            canSendSms,
            canSendWhatsapp,
            preferredChannel
        });

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

        // تنفيذ منطق الإرسال حسب قنوات الاتصال المفعلة للعميل
        
        // الحالة 1: واتساب فقط
        if (canSendWhatsapp && !canSendSms && whatsappManagerInitialized) {
            logger.info(`إرسال رسالة للعميل ${client.name} عبر واتساب فقط حسب الإعدادات`);
            
            whatsappResult = await WhatsappManager.sendWhatsapp(formattedPhone, msg, { clientId: client._id });
            
            if (whatsappResult.success) {
                whatsappSent = true;
                newMessage.status = 'sent';
                newMessage.messageId = newMessage._id.toString();
                newMessage.externalMessageId = whatsappResult.externalMessageId;
                
                // استخراج معرف الجهاز
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
                    device: deviceId,
                    rawResponse: whatsappResult.rawResponse
                };
                
                await newMessage.save();
                
                logger.info(`تم إرسال رسالة واتساب للعميل ${client.name} إلى ${formattedPhone} بنجاح`, {
                    data: {
                        internalId: newMessage.messageId,
                        externalId: newMessage.externalMessageId,
                        deviceId: newMessage.providerData?.device || null
                    }
                });
            } else {
                whatsappError = whatsappResult.error || 'فشل في إرسال رسالة الواتساب';
                
                newMessage.status = 'failed';
                newMessage.errorMessage = whatsappError;
                await newMessage.save();
                
                logger.error(`فشل في إرسال رسالة واتساب للعميل ${client.name} إلى ${formattedPhone}`, {
                    error: whatsappError
                });
            }
        }
        // الحالة 2: SMS فقط
        else if (canSendSms && !canSendWhatsapp && smsManagerInitialized) {
            logger.info(`إرسال رسالة للعميل ${client.name} عبر SMS فقط حسب الإعدادات`);
            
            smsResult = await SmsManager.sendSms(formattedPhone, msg);
            
            if (smsResult.success) {
                smsSent = true;
                newMessage.status = smsResult.status === 'delivered' ? 'sent' : 'pending';
                newMessage.messageId = newMessage._id.toString();
                newMessage.externalMessageId = smsResult.externalMessageId;
                
                if (smsResult.status === 'delivered') {
                    newMessage.sentAt = new Date();
                }
                
                let deviceId = null;
                if (smsResult.rawResponse) {
                    deviceId = smsResult.rawResponse.id_device || 
                            smsResult.rawResponse.device_id || 
                            (smsResult.rawResponse.device ? smsResult.rawResponse.device : null);
                }
                
                newMessage.providerData = {
                    provider: 'semysms',
                    lastUpdate: new Date(),
                    device: deviceId,
                    rawResponse: smsResult.rawResponse
                };
                
                await newMessage.save();
                
                logger.info(`تم إرسال رسالة SMS للعميل ${client.name} إلى ${formattedPhone} بنجاح`, {
                    data: {
                        internalId: newMessage.messageId,
                        externalId: newMessage.externalMessageId,
                        deviceId: deviceId
                    }
                });
            } else {
                smsError = smsResult.error || 'فشل في إرسال الرسالة SMS';
                
                newMessage.status = 'failed';
                newMessage.errorMessage = smsError;
                await newMessage.save();
                
                logger.error(`فشل في إرسال رسالة SMS للعميل ${client.name} إلى ${formattedPhone}`, {
                    error: smsError
                });
            }
        }
        // الحالة 3: كلا الوسيلتين (واتساب و SMS) مع استخدام القناة المفضلة
        else if (canSendSms && canSendWhatsapp && smsManagerInitialized && whatsappManagerInitialized) {
            // تهيئة مدراء الخدمات
            const whatsappSettings = await WhatsappSettings.getActiveSettings();
            const whatsappConfig = whatsappSettings.getProviderConfig();
            await WhatsappManager.initialize(whatsappConfig);
            
            const smsSettings = await SmsSettings.getActiveSettings();
            const smsConfig = smsSettings.getProviderConfig();
            await SmsManager.initialize(smsConfig);
            
            // حسب القناة المفضلة
            if (preferredChannel === 'whatsapp') {
                logger.info(`محاولة إرسال رسالة للعميل ${client.name} عبر واتس أب (القناة المفضلة)`);
                
                // 1. محاولة الإرسال عبر واتساب أولاً
                whatsappResult = await WhatsappManager.sendWhatsapp(formattedPhone, msg, { clientId: client._id });
                
                if (whatsappResult.success) {
                    whatsappSent = true;
                    
                    let deviceId = null;
                    if (whatsappResult.rawResponse) {
                        deviceId = whatsappResult.rawResponse.id_device || 
                                whatsappResult.rawResponse.device_id || 
                                (whatsappResult.rawResponse.device ? whatsappResult.rawResponse.device : null);
                    }
                    
                    // تخزين معلومات الرسالة مؤقتًا
                    const whatsappMessageId = whatsappResult.externalMessageId;
                    
                    // إنشاء سجل لرسالة الواتساب
                    const whatsappMessage = new WhatsappMessage({
                        clientId: client._id,
                        messageId: whatsappMessageId,
                        phoneNumber: formattedPhone,
                        message: msg,
                        status: 'sent',
                        providerData: {
                            provider: 'semysms_whatsapp',
                            device: deviceId,
                            rawResponse: whatsappResult.rawResponse
                        }
                    });
                    
                    await whatsappMessage.save();
                    
                    // تحديث سجل رسالة النظام
                    newMessage.status = 'sent';
                    newMessage.messageId = newMessage._id.toString();
                    newMessage.externalMessageId = whatsappMessageId;
                    newMessage.providerData = {
                        provider: 'semysms_whatsapp',
                        lastUpdate: new Date(),
                        device: deviceId,
                        rawResponse: whatsappResult.rawResponse
                    };
                    
                    await newMessage.save();
                    
                    logger.info(`تم إرسال رسالة واتساب للعميل ${client.name} - الانتظار 30 ثانية للتحقق من حالة التسليم`, {
                        messageId: whatsappMessageId,
                        deviceId
                    });
                    
                    // 2. انتظار للتحقق من حالة التسليم
                    const statusCheckResult = await _checkMessageStatus(whatsappMessageId, 'whatsapp');
                    
                    // 3. التحقق من النتيجة
                    if (statusCheckResult.success && (statusCheckResult.status === 'delivered' || statusCheckResult.status === 'read')) {
                        // تم التسليم بنجاح - لا حاجة للإرسال عبر SMS
                        logger.info(`تم تسليم رسالة الواتساب للعميل ${client.name} بنجاح، لن نرسل عبر SMS`);
                    } else {
                        // لم يتم التسليم بنجاح - نحاول الإرسال عبر SMS
                        logger.info(`لم يتم تسليم رسالة الواتساب للعميل ${client.name} خلال 30 ثانية، جاري المحاولة عبر SMS`);
                        
                        smsResult = await SmsManager.sendSms(formattedPhone, msg);
                        
                        if (smsResult.success) {
                            smsSent = true;
                            
                            let smsDeviceId = null;
                            if (smsResult.rawResponse) {
                                smsDeviceId = smsResult.rawResponse.id_device || 
                                        smsResult.rawResponse.device_id || 
                                        (smsResult.rawResponse.device ? smsResult.rawResponse.device : null);
                            }
                            
                            // تحديث سجل الرسالة الأصلية بمعلومات القناتين
                            newMessage.providerData = {
                                provider: 'semysms_both',
                                lastUpdate: new Date(),
                                device: smsDeviceId,
                                rawSmsResponse: smsResult.rawResponse,
                                rawWhatsappResponse: whatsappResult.rawResponse
                            };
                            
                            await newMessage.save();
                            
                            logger.info(`تم إرسال الرسالة للعميل ${client.name} باستخدام SMS بعد فشل تسليم الواتساب`);
                        } else {
                            smsError = smsResult.error || 'فشل في إرسال الرسالة SMS';
                            logger.warn(`فشل في إرسال رسالة SMS للعميل ${client.name} بعد فشل تسليم الواتساب`, {
                                error: smsError
                            });
                        }
                    }
                } else {
                    // فشل إرسال الواتساب - نحاول الإرسال عبر SMS مباشرة
                    whatsappError = whatsappResult.error || 'فشل في إرسال رسالة الواتساب';
                    logger.warn(`فشل في إرسال رسالة واتساب للعميل ${client.name} - جاري المحاولة عبر SMS`, {
                        error: whatsappError
                    });
                    
                    smsResult = await SmsManager.sendSms(formattedPhone, msg);
                    
                    if (smsResult.success) {
                        smsSent = true;
                        
                        let deviceId = null;
                        if (smsResult.rawResponse) {
                            deviceId = smsResult.rawResponse.id_device || 
                                    smsResult.rawResponse.device_id || 
                                    (smsResult.rawResponse.device ? smsResult.rawResponse.device : null);
                        }
                        
                        newMessage.status = 'sent';
                        newMessage.messageId = newMessage._id.toString();
                        newMessage.externalMessageId = smsResult.externalMessageId;
                        
                        if (smsResult.status === 'delivered') {
                            newMessage.sentAt = new Date();
                        }
                        
                        newMessage.providerData = {
                            provider: 'semysms',
                            lastUpdate: new Date(),
                            device: deviceId,
                            rawResponse: smsResult.rawResponse
                        };
                        
                        await newMessage.save();
                        
                        logger.info(`تم إرسال رسالة SMS للعميل ${client.name} بعد فشل إرسال الواتساب`);
                    } else {
                        smsError = smsResult.error || 'فشل في إرسال الرسالة SMS';
                        
                        newMessage.status = 'failed';
                        newMessage.errorMessage = `فشل في إرسال الرسالة عبر كلتا القناتين: واتساب (${whatsappError}) و SMS (${smsError})`;
                        await newMessage.save();
                        
                        logger.error(`فشل في إرسال رسالة للعميل ${client.name} عبر جميع القنوات المتاحة`);
                    }
                }
            } else if (preferredChannel === 'sms') {
                logger.info(`محاولة إرسال رسالة للعميل ${client.name} عبر SMS (القناة المفضلة)`);
                
                // 1. محاولة الإرسال عبر SMS أولاً
                smsResult = await SmsManager.sendSms(formattedPhone, msg);
                
                if (smsResult.success) {
                    smsSent = true;
                    
                    let deviceId = null;
                    if (smsResult.rawResponse) {
                        deviceId = smsResult.rawResponse.id_device || 
                                smsResult.rawResponse.device_id || 
                                (smsResult.rawResponse.device ? smsResult.rawResponse.device : null);
                    }
                    
                    // تخزين معلومات الرسالة مؤقتًا
                    const smsMessageId = smsResult.externalMessageId;
                    
                    // تحديث سجل الرسالة
                    newMessage.status = 'sent';
                    newMessage.messageId = newMessage._id.toString();
                    newMessage.externalMessageId = smsMessageId;
                    
                    if (smsResult.status === 'delivered') {
                        newMessage.sentAt = new Date();
                    }
                    
                    newMessage.providerData = {
                        provider: 'semysms',
                        lastUpdate: new Date(),
                        device: deviceId,
                        rawResponse: smsResult.rawResponse
                    };
                    
                    await newMessage.save();
                    
                    logger.info(`تم إرسال رسالة SMS للعميل ${client.name} - الانتظار 30 ثانية للتحقق من حالة التسليم`, {
                        messageId: smsMessageId,
                        deviceId
                    });
                    
                    // 2. انتظار للتحقق من حالة التسليم
                    const statusCheckResult = await _checkMessageStatus(smsMessageId, 'sms');
                    
                    // 3. التحقق من النتيجة
                    if (statusCheckResult.success && (statusCheckResult.status === 'delivered' || statusCheckResult.status === 'read')) {
                        // تم التسليم بنجاح - لا حاجة للإرسال عبر واتساب
                        logger.info(`تم تسليم رسالة SMS للعميل ${client.name} بنجاح، لن نرسل عبر واتساب`);
                    } else {
                        // لم يتم التسليم بنجاح - نحاول الإرسال عبر واتساب
                        logger.info(`لم يتم تسليم رسالة SMS للعميل ${client.name} خلال 30 ثانية، جاري المحاولة عبر واتساب`);
                        
                        whatsappResult = await WhatsappManager.sendWhatsapp(formattedPhone, msg, { clientId: client._id });
                        
                        if (whatsappResult.success) {
                            whatsappSent = true;
                            
                            let whatsappDeviceId = null;
                            if (whatsappResult.rawResponse) {
                                whatsappDeviceId = whatsappResult.rawResponse.id_device || 
                                        whatsappResult.rawResponse.device_id || 
                                        (whatsappResult.rawResponse.device ? whatsappResult.rawResponse.device : null);
                            }
                            
                            // تحديث سجل الرسالة الأصلية بمعلومات القناتين
                            newMessage.providerData = {
                                provider: 'semysms_both',
                                lastUpdate: new Date(),
                                device: deviceId,
                                rawSmsResponse: smsResult.rawResponse,
                                rawWhatsappResponse: whatsappResult.rawResponse
                            };
                            
                            await newMessage.save();
                            
                            logger.info(`تم إرسال الرسالة للعميل ${client.name} باستخدام واتساب بعد فشل تسليم SMS`);
                        } else {
                            whatsappError = whatsappResult.error || 'فشل في إرسال رسالة الواتساب';
                            logger.warn(`فشل في إرسال رسالة واتساب للعميل ${client.name} بعد فشل تسليم SMS`, {
                                error: whatsappError
                            });
                        }
                    }
                } else {
                    // فشل إرسال SMS - نحاول الإرسال عبر واتساب مباشرة
                    smsError = smsResult.error || 'فشل في إرسال الرسالة SMS';
                    logger.warn(`فشل في إرسال رسالة SMS للعميل ${client.name} - جاري المحاولة عبر واتساب`, {
                        error: smsError
                    });
                    
                    whatsappResult = await WhatsappManager.sendWhatsapp(formattedPhone, msg, { clientId: client._id });
                    
                    if (whatsappResult.success) {
                        whatsappSent = true;
                        
                        let deviceId = null;
                        if (whatsappResult.rawResponse) {
                            deviceId = whatsappResult.rawResponse.id_device || 
                                    whatsappResult.rawResponse.device_id || 
                                    (whatsappResult.rawResponse.device ? whatsappResult.rawResponse.device : null);
                        }
                        
                        newMessage.status = 'sent';
                        newMessage.messageId = newMessage._id.toString();
                        newMessage.externalMessageId = whatsappResult.externalMessageId;
                        
                        newMessage.providerData = {
                            provider: 'semysms_whatsapp',
                            lastUpdate: new Date(),
                            device: deviceId,
                            rawResponse: whatsappResult.rawResponse
                        };
                        
                        await newMessage.save();
                        
                        logger.info(`تم إرسال رسالة واتساب للعميل ${client.name} بعد فشل إرسال SMS`);
                    } else {
                        whatsappError = whatsappResult.error || 'فشل في إرسال رسالة الواتساب';
                        
                        newMessage.status = 'failed';
                        newMessage.errorMessage = `فشل في إرسال الرسالة عبر كلتا القناتين: SMS (${smsError}) و واتساب (${whatsappError})`;
                        await newMessage.save();
                        
                        logger.error(`فشل في إرسال رسالة للعميل ${client.name} عبر جميع القنوات المتاحة`);
                    }
                }
            } else {
                // لا توجد قناة مفضلة محددة - استخدام كلتا القناتين كما في السابق
                logger.info(`إرسال رسالة للعميل ${client.name} عبر كلتا القناتين (لا توجد قناة مفضلة محددة)`);
                
                // للتأكد من استخدام إعدادات مختلفة لكل قناة، نقوم بتهيئة كل مدير مرة أخرى قبل الإرسال
                // 1. إعادة تهيئة مدير الواتساب للتأكد من استخدام معرف الجهاز الصحيح
                await WhatsappManager.initialize(whatsappConfig);
                
                // 2. إعادة تهيئة مدير الرسائل SMS للتأكد من استخدام معرف الجهاز الصحيح
                await SmsManager.initialize(smsConfig);
                
                // إرسال عبر واتساب
                whatsappResult = await WhatsappManager.sendWhatsapp(formattedPhone, msg, { clientId: client._id });
                
                if (whatsappResult.success) {
                    whatsappSent = true;
                    
                    // لا نحدث حالة الرسالة بعد لأننا سنرسل عبر SMS أيضًا
                    let deviceId = null;
                    if (whatsappResult.rawResponse) {
                        deviceId = whatsappResult.rawResponse.id_device || 
                                whatsappResult.rawResponse.device_id || 
                                (whatsappResult.rawResponse.device ? whatsappResult.rawResponse.device : null);
                    }
                    
                    // تخزين معلومات الرسالة مؤقتًا
                    const whatsappMessageId = whatsappResult.externalMessageId;
                    
                    // إنشاء سجل لرسالة الواتساب
                    const whatsappMessage = new WhatsappMessage({
                        clientId: client._id,
                        messageId: whatsappMessageId,
                        phoneNumber: formattedPhone,
                        message: msg,
                        status: 'sent',
                        providerData: {
                            provider: 'semysms_whatsapp',
                            device: deviceId,
                            rawResponse: whatsappResult.rawResponse
                        }
                    });
                    
                    await whatsappMessage.save();
                    
                    logger.info(`تم إرسال رسالة واتساب للعميل ${client.name} إلى ${formattedPhone} بنجاح (جزء 1/2)`, {
                        data: {
                            externalId: whatsappMessageId,
                            deviceId: deviceId
                        }
                    });
                } else {
                    whatsappError = whatsappResult.error || 'فشل في إرسال رسالة الواتساب';
                    logger.warn(`فشل في إرسال رسالة واتساب للعميل ${client.name} (سيتم المحاولة عبر SMS أيضًا)`, {
                        error: whatsappError
                    });
                }
                
                // إرسال عبر SMS بغض النظر عن نتيجة الواتساب
                smsResult = await SmsManager.sendSms(formattedPhone, msg);
                
                if (smsResult.success) {
                    smsSent = true;
                    
                    logger.info(`تم إرسال رسالة SMS للعميل ${client.name} إلى ${formattedPhone} بنجاح (جزء 2/2)`);
                } else {
                    smsError = smsResult.error || 'فشل في إرسال الرسالة SMS';
                    logger.warn(`فشل في إرسال رسالة SMS للعميل ${client.name}`, {
                        error: smsError
                    });
                }
                
                // تحديث حالة الرسالة الإجمالية بناءً على نتائج القناتين
                if (whatsappSent || smsSent) {
                    newMessage.status = 'sent';
                    newMessage.messageId = newMessage._id.toString();
                    
                    // استخدام معرف الرسالة من القناة الناجحة
                    if (smsSent) {
                        newMessage.externalMessageId = smsResult.externalMessageId;
                        
                        if (smsResult.status === 'delivered') {
                            newMessage.sentAt = new Date();
                        }
                        
                        let deviceId = null;
                        if (smsResult.rawResponse) {
                            deviceId = smsResult.rawResponse.id_device || 
                                    smsResult.rawResponse.device_id || 
                                    (smsResult.rawResponse.device ? smsResult.rawResponse.device : null);
                        }
                        
                        // تخزين بيانات كلا المزودين
                        newMessage.providerData = {
                            provider: whatsappSent ? 'semysms_both' : 'semysms',
                            lastUpdate: new Date(),
                            device: deviceId,
                            rawSmsResponse: smsResult.rawResponse,
                            rawWhatsappResponse: whatsappSent ? whatsappResult.rawResponse : null
                        };
                    } else {
                        // تم إرسال واتساب فقط
                        newMessage.externalMessageId = whatsappResult.externalMessageId;
                        
                        let deviceId = null;
                        if (whatsappResult.rawResponse) {
                            deviceId = whatsappResult.rawResponse.id_device || 
                                    whatsappResult.rawResponse.device_id || 
                                    (whatsappResult.rawResponse.device ? whatsappResult.rawResponse.device : null);
                        }
                        
                        newMessage.providerData = {
                            provider: 'semysms_whatsapp',
                            lastUpdate: new Date(),
                            device: deviceId,
                            rawResponse: whatsappResult.rawResponse
                        };
                    }
                    
                    await newMessage.save();
                    
                    logger.info(`تم إرسال رسالة للعميل ${client.name} باستخدام ${smsSent && whatsappSent ? 'كلتا القناتين' : (smsSent ? 'SMS فقط' : 'واتساب فقط')}`);
                } else {
                    // فشلت كلتا القناتين
                    newMessage.status = 'failed';
                    newMessage.errorMessage = `فشل في إرسال الرسالة عبر كلتا القناتين: واتساب (${whatsappError}) و SMS (${smsError})`;
                    await newMessage.save();
                    
                    logger.error(`فشل في إرسال رسالة للعميل ${client.name} عبر جميع القنوات المتاحة`);
                }
            }
        }
        // حالة الفشل: قنوات مفعلة ولكن مدراء الخدمات غير متاحين
        else {
            newMessage.status = 'failed';
            newMessage.errorMessage = 'لم تتوفر أي قناة إرسال صالحة';
            await newMessage.save();
            
            logger.error(`فشل في إرسال رسالة للعميل ${client.name} بسبب عدم توفر قنوات إرسال صالحة (تمت تهيئة: SMS=${smsManagerInitialized}, واتساب=${whatsappManagerInitialized})`);
            
            return res.status(500).send("6"); // خطأ في النظام
        }

        // تحديث رصيد العميل إذا تم إرسال الرسالة بنجاح
        if (smsSent || whatsappSent) {
            // خصم نقطة واحدة لكل رسالة SMS و 0.25 نقطة لكل رسالة واتساب
            let pointsToDeduct = 0;
            if (smsSent) pointsToDeduct += requiredPoints; // 1 نقطة لكل رسالة SMS
            if (whatsappSent) pointsToDeduct += (requiredPoints * 0.25); // 0.25 نقطة لكل رسالة واتساب
            
            client.balance -= pointsToDeduct;
            
            // إضافة رسالة واحدة لكل قناة إرسال ناجحة بدلاً من استخدام النقاط
            let sentMessagesCount = 0;
            if (smsSent) sentMessagesCount += 1; // إضافة 1 لكل رسالة SMS مرسلة
            if (whatsappSent) sentMessagesCount += 1; // إضافة 1 لكل رسالة واتساب مرسلة
            
            client.messagesSent += sentMessagesCount;
            await client.save();
            
            // تسجيل عملية خصم الرصيد
            const balanceTransaction = new BalanceTransaction({
                clientId: client._id,
                messageId: newMessage._id,
                amount: -pointsToDeduct,
                balanceAfter: client.balance,
                type: 'usage',
                description: `إرسال رسالة ${smsSent && whatsappSent ? 'عبر SMS وواتساب' : (smsSent ? 'عبر SMS' : 'عبر واتساب')}`,
                performedBy: client._id // إضافة حقل performedBy المطلوب
            });
            await balanceTransaction.save();
            
            // إرجاع استجابة نجاح
            return res.status(200).send("1");
        } else {
            // لم يتم إرسال الرسالة بنجاح عبر أي وسيلة
            logger.error(`فشل في إرسال رسالة للعميل ${client.name} إلى ${formattedPhone}`, {
                smsError: smsError,
                whatsappError: whatsappError
            });
            
            return res.status(500).send("6"); // خطأ في النظام
        }
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
