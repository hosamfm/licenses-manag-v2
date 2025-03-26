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
 * وظيفة مساعدة لانتظار تحديث حالة الرسالة
 * @param {string} messageId معرف الرسالة
 * @param {number} timeout مهلة الانتظار بالمللي ثانية
 * @returns {Promise<{ success: boolean, status: string, timedOut: boolean }>} نتيجة انتظار تحديث حالة الرسالة
 */
const waitForMessageStatus = async (messageId, timeout = 30000) => {
    const startTime = Date.now();
    // فترة الاستعلام المتكرر (كل 5 ثواني)
    const interval = 5000;
    
    logger.info(`بدء انتظار تحديث حالة الرسالة (${messageId}) لمدة ${timeout/1000} ثانية`);
    
    return new Promise((resolve) => {
        const checkStatus = async () => {
            try {
                // البحث عن الرسالة في قاعدة البيانات
                const message = await SemMessage.findOne({ 
                    $or: [
                        { _id: messageId },
                        { messageId: messageId },
                        { externalMessageId: messageId }
                    ]
                });
                
                // إذا لم تكن الرسالة موجودة أو كانت حالتها "فشل"
                if (!message || message.status === 'failed') {
                    logger.warn(`الرسالة (${messageId}) غير موجودة أو فشلت`);
                    return resolve({ success: false, status: message?.status || 'unknown' });
                }
                
                // إذا كانت الرسالة "تم تسليمها" أو "تم إيصالها" أو "تم قراءتها"
                if (['delivered', 'received', 'read'].includes(message.status)) {
                    logger.info(`تم تحديث حالة الرسالة (${messageId}) إلى: ${message.status}`);
                    return resolve({ success: true, status: message.status });
                }
                
                // التحقق من انتهاء مهلة الانتظار
                const elapsed = Date.now() - startTime;
                if (elapsed >= timeout) {
                    logger.warn(`انتهت مهلة انتظار تحديث حالة الرسالة (${messageId}): لا يزال الوضع ${message.status}`);
                    return resolve({ success: false, status: message.status, timedOut: true });
                }
                
                // جدولة عملية فحص أخرى بعد الفاصل الزمني
                setTimeout(checkStatus, interval);
            } catch (error) {
                logger.error(`خطأ أثناء التحقق من حالة الرسالة (${messageId})`, error);
                const elapsed = Date.now() - startTime;
                if (elapsed >= timeout) {
                    return resolve({ success: false, error: error.message, timedOut: true });
                }
                setTimeout(checkStatus, interval);
            }
        };
        
        // بدء عملية الفحص الأولى
        checkStatus();
    });
};

/**
 * وظيفة مساعدة لإدارة إرسال الرسائل بين القنوات بشكل متتالي بدلاً من انتظار استجابة API
 * @param {SemMessage} message سجل الرسالة
 * @param {SemClient} client سجل العميل
 * @param {string} formattedPhone رقم الهاتف المنسق
 * @param {string} msgContent محتوى الرسالة
 * @param {boolean} useWhatsappFirst استخدام الواتساب أولاً
 * @returns {Promise<{ smsSent: boolean, whatsappSent: boolean }>} نتيجة إرسال الرسالة
 */
const processChannelFallback = async (message, client, formattedPhone, msgContent, useWhatsappFirst) => {
    let smsSent = false;
    let whatsappSent = false;
    let smsError = null;
    let whatsappError = null;
    let smsResult = null;
    let whatsappResult = null;
    
    try {
        // تهيئة مدراء الرسائل مرة أخرى للتأكد من استخدام الإعدادات الحالية
        const whatsappSettings = await WhatsappSettings.getActiveSettings();
        const whatsappConfig = whatsappSettings.getProviderConfig();
        await WhatsappManager.initialize(whatsappConfig);
        
        const smsSettings = await SmsSettings.getActiveSettings();
        const smsConfig = smsSettings.getProviderConfig();
        await SmsManager.initialize(smsConfig);
        
        // الإرسال باستخدام القناة الأولى
        if (useWhatsappFirst) {
            // استخدام الواتساب أولاً
            logger.info(`محاولة إرسال رسالة للعميل ${client.name} عبر واتساب (القناة الأولى)`);
            
            whatsappResult = await WhatsappManager.sendWhatsapp(formattedPhone, msgContent, { clientId: client._id });
            
            if (whatsappResult.success) {
                whatsappSent = true;
                message.status = 'sent';
                message.messageId = message._id.toString();
                message.externalMessageId = whatsappResult.externalMessageId;
                
                let deviceId = null;
                if (whatsappResult.rawResponse) {
                    deviceId = whatsappResult.rawResponse.id_device || 
                             whatsappResult.rawResponse.device_id || 
                             (whatsappResult.rawResponse.device ? whatsappResult.rawResponse.device : null);
                }
                
                // تخزين بيانات مزود الخدمة
                message.providerData = {
                    provider: 'semysms_whatsapp',
                    lastUpdate: new Date(),
                    device: deviceId,
                    rawResponse: whatsappResult.rawResponse
                };
                
                await message.save();
                
                logger.info(`تم إرسال رسالة واتساب للعميل ${client.name} إلى ${formattedPhone} بنجاح`, {
                    data: {
                        internalId: message.messageId,
                        externalId: message.externalMessageId,
                        deviceId: deviceId
                    }
                });
                
                // انتظار تحديث حالة الرسالة لمدة 30 ثانية
                const statusResult = await waitForMessageStatus(message._id.toString(), 30000);
                
                if (statusResult.success) {
                    // تم تسليم الرسالة بنجاح - لا داعي لاستخدام القناة الثانية
                    logger.info(`تم تأكيد تسليم رسالة الواتساب بنجاح للعميل ${client.name}، لن يتم استخدام SMS`);
                } else {
                    // لم يتم تسليم الرسالة بعد - محاولة استخدام SMS كقناة بديلة
                    logger.info(`لم يتم تأكيد تسليم رسالة الواتساب للعميل ${client.name} خلال المهلة المحددة (${statusResult.status})، جاري المحاولة عبر SMS`);
                    
                    // إرسال عبر SMS كقناة بديلة
                    smsResult = await SmsManager.sendSms(formattedPhone, msgContent);
                    
                    if (smsResult.success) {
                        smsSent = true;
                        
                        // تحديث حالة الرسالة والبيانات
                        message.externalMessageId = `${message.externalMessageId},${smsResult.externalMessageId}`;
                        
                        let deviceId = null;
                        if (smsResult.rawResponse) {
                            deviceId = smsResult.rawResponse.id_device || 
                                    smsResult.rawResponse.device_id || 
                                    (smsResult.rawResponse.device ? smsResult.rawResponse.device : null);
                        }
                        
                        // تخزين بيانات كلا المزودين
                        message.providerData = {
                            provider: 'semysms_both',
                            lastUpdate: new Date(),
                            device: deviceId,
                            rawSmsResponse: smsResult.rawResponse,
                            rawWhatsappResponse: whatsappResult.rawResponse
                        };
                        
                        await message.save();
                        
                        logger.info(`تم إرسال رسالة SMS للعميل ${client.name} إلى ${formattedPhone} بنجاح (كقناة بديلة)`);
                    } else {
                        smsError = smsResult.error || 'فشل في إرسال الرسالة SMS';
                        logger.warn(`فشل في إرسال رسالة SMS للعميل ${client.name} (كقناة بديلة)`, {
                            error: smsError
                        });
                    }
                }
            } else {
                whatsappError = whatsappResult.error || 'فشل في إرسال رسالة الواتساب';
                logger.warn(`فشل في إرسال رسالة واتساب للعميل ${client.name} (جاري المحاولة عبر SMS)`, {
                    error: whatsappError
                });
                
                // محاولة إرسال عبر SMS
                smsResult = await SmsManager.sendSms(formattedPhone, msgContent);
                
                if (smsResult.success) {
                    smsSent = true;
                    message.status = smsResult.status === 'delivered' ? 'sent' : 'pending';
                    message.messageId = message._id.toString();
                    message.externalMessageId = smsResult.externalMessageId;
                    
                    if (smsResult.status === 'delivered') {
                        message.sentAt = new Date();
                    }
                    
                    let deviceId = null;
                    if (smsResult.rawResponse) {
                        deviceId = smsResult.rawResponse.id_device || 
                                 smsResult.rawResponse.device_id || 
                                 (smsResult.rawResponse.device ? smsResult.rawResponse.device : null);
                    }
                    
                    message.providerData = {
                        provider: 'semysms',
                        lastUpdate: new Date(),
                        device: deviceId,
                        rawResponse: smsResult.rawResponse
                    };
                    
                    await message.save();
                    
                    logger.info(`تم إرسال رسالة SMS للعميل ${client.name} إلى ${formattedPhone} بنجاح بعد فشل الواتساب`);
                } else {
                    smsError = smsResult.error || 'فشل في إرسال الرسالة SMS';
                    
                    message.status = 'failed';
                    message.errorMessage = `فشل في إرسال الرسالة عبر كلتا القناتين: واتساب (${whatsappError}) و SMS (${smsError})`;
                    await message.save();
                    
                    logger.error(`فشل في إرسال رسالة للعميل ${client.name} عبر جميع القنوات المتاحة`);
                }
            }
        } else {
            // استخدام SMS أولاً
            logger.info(`محاولة إرسال رسالة للعميل ${client.name} عبر SMS (القناة الأولى)`);
            
            smsResult = await SmsManager.sendSms(formattedPhone, msgContent);
            
            if (smsResult.success) {
                smsSent = true;
                message.status = smsResult.status === 'delivered' ? 'sent' : 'pending';
                message.messageId = message._id.toString();
                message.externalMessageId = smsResult.externalMessageId;
                
                if (smsResult.status === 'delivered') {
                    message.sentAt = new Date();
                }
                
                let deviceId = null;
                if (smsResult.rawResponse) {
                    deviceId = smsResult.rawResponse.id_device || 
                             smsResult.rawResponse.device_id || 
                             (smsResult.rawResponse.device ? smsResult.rawResponse.device : null);
                }
                
                message.providerData = {
                    provider: 'semysms',
                    lastUpdate: new Date(),
                    device: deviceId,
                    rawResponse: smsResult.rawResponse
                };
                
                await message.save();
                
                logger.info(`تم إرسال رسالة SMS للعميل ${client.name} إلى ${formattedPhone} بنجاح`, {
                    data: {
                        internalId: message.messageId,
                        externalId: message.externalMessageId,
                        deviceId: deviceId
                    }
                });
                
                // انتظار تحديث حالة الرسالة لمدة 30 ثانية
                const statusResult = await waitForMessageStatus(message._id.toString(), 30000);
                
                if (statusResult.success) {
                    // تم تسليم الرسالة بنجاح - لا داعي لاستخدام القناة الثانية
                    logger.info(`تم تأكيد تسليم رسالة SMS بنجاح للعميل ${client.name}، لن يتم استخدام الواتساب`);
                } else {
                    // لم يتم تسليم الرسالة بعد - محاولة استخدام الواتساب كقناة بديلة
                    logger.info(`لم يتم تأكيد تسليم رسالة SMS للعميل ${client.name} خلال المهلة المحددة (${statusResult.status})، جاري المحاولة عبر الواتساب`);
                    
                    // إرسال عبر الواتساب كقناة بديلة
                    whatsappResult = await WhatsappManager.sendWhatsapp(formattedPhone, msgContent, { clientId: client._id });
                    
                    if (whatsappResult.success) {
                        whatsappSent = true;
                        
                        // تحديث حالة الرسالة والبيانات
                        message.externalMessageId = `${message.externalMessageId},${whatsappResult.externalMessageId}`;
                        
                        let deviceId = null;
                        if (whatsappResult.rawResponse) {
                            deviceId = whatsappResult.rawResponse.id_device || 
                                    whatsappResult.rawResponse.device_id || 
                                    (whatsappResult.rawResponse.device ? whatsappResult.rawResponse.device : null);
                        }
                        
                        // تخزين بيانات كلا المزودين
                        message.providerData = {
                            provider: 'semysms_both',
                            lastUpdate: new Date(),
                            device: deviceId,
                            rawSmsResponse: smsResult.rawResponse,
                            rawWhatsappResponse: whatsappResult.rawResponse
                        };
                        
                        await message.save();
                        
                        logger.info(`تم إرسال رسالة واتساب للعميل ${client.name} إلى ${formattedPhone} بنجاح (كقناة بديلة)`);
                    } else {
                        whatsappError = whatsappResult.error || 'فشل في إرسال رسالة الواتساب';
                        logger.warn(`فشل في إرسال رسالة واتساب للعميل ${client.name} (كقناة بديلة)`, {
                            error: whatsappError
                        });
                    }
                }
            } else {
                smsError = smsResult.error || 'فشل في إرسال الرسالة SMS';
                logger.warn(`فشل في إرسال رسالة SMS للعميل ${client.name} (جاري المحاولة عبر الواتساب)`, {
                    error: smsError
                });
                
                // محاولة إرسال عبر الواتساب
                whatsappResult = await WhatsappManager.sendWhatsapp(formattedPhone, msgContent, { clientId: client._id });
                
                if (whatsappResult.success) {
                    whatsappSent = true;
                    message.status = 'sent';
                    message.messageId = message._id.toString();
                    message.externalMessageId = whatsappResult.externalMessageId;
                    
                    let deviceId = null;
                    if (whatsappResult.rawResponse) {
                        deviceId = whatsappResult.rawResponse.id_device || 
                                 whatsappResult.rawResponse.device_id || 
                                 (whatsappResult.rawResponse.device ? whatsappResult.rawResponse.device : null);
                    }
                    
                    message.providerData = {
                        provider: 'semysms_whatsapp',
                        lastUpdate: new Date(),
                        device: deviceId,
                        rawResponse: whatsappResult.rawResponse
                    };
                    
                    await message.save();
                    
                    logger.info(`تم إرسال رسالة واتساب للعميل ${client.name} إلى ${formattedPhone} بنجاح بعد فشل SMS`);
                } else {
                    whatsappError = whatsappResult.error || 'فشل في إرسال رسالة الواتساب';
                    
                    message.status = 'failed';
                    message.errorMessage = `فشل في إرسال الرسالة عبر كلتا القناتين: SMS (${smsError}) و واتساب (${whatsappError})`;
                    await message.save();
                    
                    logger.error(`فشل في إرسال رسالة للعميل ${client.name} عبر جميع القنوات المتاحة`);
                }
            }
        }
        
        // تحديث رصيد العميل إذا تم إرسال الرسالة بنجاح
        if (smsSent || whatsappSent) {
            // حساب عدد الرسائل المطلوبة
            const containsArabic = /[\u0600-\u06FF]/.test(msgContent);
            const maxLength = containsArabic ? 70 : 160;
            const messageCount = Math.ceil(msgContent.length / maxLength);
            
            // نقطة واحدة لكل رسالة SMS و 0.25 نقطة لكل رسالة واتساب
            let pointsToDeduct = 0;
            if (smsSent) pointsToDeduct += messageCount; // 1 نقطة لكل رسالة SMS
            if (whatsappSent) pointsToDeduct += (messageCount * 0.25); // 0.25 نقطة لكل رسالة واتساب
            
            client.balance -= pointsToDeduct;
            
            // إضافة رسالة واحدة لكل قناة إرسال ناجحة بدلاً من استخدام النقاط
            let sentMessagesCount = 0;
            if (smsSent) sentMessagesCount += 1; // إضافة 1 لكل رسالة SMS مرسلة
            if (whatsappSent) sentMessagesCount += 1; // إضافة 1 لكل رسالة واتساب مرسلة
            
            client.messagesSent += sentMessagesCount;
            await client.save();
            
            // تسجيل عملية استخدام الرصيد
            const balanceTransaction = new BalanceTransaction({
                clientId: client._id,
                type: 'usage',
                amount: pointsToDeduct,
                description: `خصم رصيد لإرسال رسالة ${smsSent && whatsappSent ? 'SMS وواتساب' : (smsSent ? 'SMS' : 'واتساب')}`,
                balanceBefore: client.balance + pointsToDeduct,
                balanceAfter: client.balance,
                status: 'complete',
                relatedMessageId: message._id,
                notes: `خصم رصيد لإرسال رسالة ${smsSent && whatsappSent ? 'SMS وواتساب' : (smsSent ? 'SMS' : 'واتساب')}`,
                performedBy: process.env.SYSTEM_USER_ID || '6418180ac9e8dffece88d5a6' // استخدام معرف المستخدم النظامي
            });
            await balanceTransaction.save();
        }
        
        return { smsSent, whatsappSent };
    } catch (error) {
        logger.error(`خطأ أثناء معالجة الرسالة في الخلفية`, error);
        // حفظ الخطأ في سجل الرسالة
        try {
            message.status = 'failed';
            message.errorMessage = `خطأ أثناء معالجة الرسالة: ${error.message}`;
            await message.save();
        } catch (saveError) {
            logger.error(`خطأ أثناء حفظ حالة الرسالة الفاشلة`, saveError);
        }
        return { smsSent, whatsappSent, error };
    }
};

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
        
        // إذا كان الرقم غير صالح
        if (!formattedPhoneResult.isValid) {
            // إنشاء سجل للرسالة فقط لتسجيل الخطأ
            const errorMessage = new SemMessage({
                clientId: client._id,
                recipients: [processedPhone], // استخدام الرقم المعالج أولياً
                content: msg,
                status: 'failed',
                errorMessage: formattedPhoneResult.error
            });
            await errorMessage.save();
            
            logger.warn(`فشل في إرسال رسالة للعميل ${client.name} بسبب رقم هاتف غير صالح: ${processedPhone}`, {
                error: formattedPhoneResult.error
            });
            return res.status(400).send("8"); // كود خطأ 8: رقم هاتف غير صالح
        }
        
        // الآن لدينا رقم صحيح - نحفظ الرقم المنسق
        const formattedPhone = formattedPhoneResult.phone;

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
            // إنشاء سجل للرسالة فقط لتسجيل الخطأ
            const errorMessage = new SemMessage({
                clientId: client._id,
                recipients: [formattedPhone],
                originalRecipients: [phone],
                content: msg,
                status: 'failed',
                errorMessage: 'لم يتم تفعيل أي قناة إرسال للعميل'
            });
            await errorMessage.save();
            
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

        // الحالة 3: كلا الوسيلتين (واتساب و SMS)
        if (canSendSms && canSendWhatsapp && smsManagerInitialized && whatsappManagerInitialized) {
            // تحديد القناة المفضلة للعميل
            const preferredChannel = client.preferredChannel || 'none';
            
            logger.info(`تجهيز رسالة للعميل ${client.name} عبر القناة المفضلة (${preferredChannel})`);
            
            // إنشاء سجل الرسالة الآن بعد تحديد القناة المفضلة
            const newMessage = new SemMessage({
                clientId: client._id,
                recipients: [formattedPhone],
                originalRecipients: [phone],
                content: msg,
                status: 'pending',
                messageId: new mongoose.Types.ObjectId().toString()
            });
            
            // حفظ الرسالة في قاعدة البيانات
            await newMessage.save();
            
            // تحديد ترتيب الإرسال بناءً على القناة المفضلة
            const useWhatsappFirst = preferredChannel === 'whatsapp' || (preferredChannel === 'none' && Math.random() < 0.5);
            
            // تسجيل الخيار المفضل
            logger.info(`سيتم إرسال الرسالة أولاً عبر ${useWhatsappFirst ? 'واتساب' : 'SMS'} للعميل ${client.name}`);
            
            // نبدأ عملية الإرسال في الخلفية دون انتظار نتيجتها
            setImmediate(async () => {
                try {
                    await processChannelFallback(newMessage, client, formattedPhone, msg, useWhatsappFirst);
                } catch (error) {
                    logger.error(`خطأ أثناء معالجة الرسالة في الخلفية للعميل ${client.name}`, error);
                }
            });
            
            // إرسال رد فوري للعميل
            return res.status(200).send("1");
        }
        // الحالة 1: واتساب فقط
        else if (canSendWhatsapp && !canSendSms && whatsappManagerInitialized) {
            logger.info(`إرسال رسالة للعميل ${client.name} عبر واتساب فقط حسب الإعدادات`);
            
            // إنشاء سجل الرسالة الآن لقناة الواتساب فقط
            const newMessage = new SemMessage({
                clientId: client._id,
                recipients: [formattedPhone],
                originalRecipients: [phone],
                content: msg,
                status: 'pending',
                messageId: new mongoose.Types.ObjectId().toString()
            });
            
            // حفظ الرسالة في قاعدة البيانات
            await newMessage.save();
            
            // إرسال عبر الواتساب
            const whatsappResult = await WhatsappManager.sendWhatsapp(formattedPhone, msg, { clientId: client._id });
            
            if (whatsappResult.success) {
                newMessage.status = 'sent';
                newMessage.messageId = newMessage._id.toString();
                newMessage.externalMessageId = whatsappResult.externalMessageId;
                
                let deviceId = null;
                if (whatsappResult.rawResponse) {
                    deviceId = whatsappResult.rawResponse.id_device || 
                             whatsappResult.rawResponse.device_id || 
                             (whatsappResult.rawResponse.device ? whatsappResult.rawResponse.device : null);
                }
                
                // تخزين بيانات مزود الخدمة
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
                        deviceId: deviceId
                    }
                });
                
                // انتظار تحديث حالة الرسالة لمدة 30 ثانية
                const statusResult = await waitForMessageStatus(newMessage._id.toString(), 30000);
                
                if (statusResult.success) {
                    // تم تسليم الرسالة بنجاح - لا داعي لاستخدام القناة الثانية
                    logger.info(`تم تأكيد تسليم رسالة الواتساب بنجاح للعميل ${client.name}، لن يتم استخدام SMS`);
                } else {
                    // لم يتم تسليم الرسالة بعد - محاولة استخدام SMS كقناة بديلة
                    logger.info(`لم يتم تأكيد تسليم رسالة الواتساب للعميل ${client.name} خلال المهلة المحددة (${statusResult.status})، جاري المحاولة عبر SMS`);
                    
                    // إرسال عبر SMS كقناة بديلة
                    const smsResult = await SmsManager.sendSms(formattedPhone, msg);
                    
                    if (smsResult.success) {
                        newMessage.externalMessageId = `${newMessage.externalMessageId},${smsResult.externalMessageId}`;
                        
                        let deviceId = null;
                        if (smsResult.rawResponse) {
                            deviceId = smsResult.rawResponse.id_device || 
                                    smsResult.rawResponse.device_id || 
                                    (smsResult.rawResponse.device ? smsResult.rawResponse.device : null);
                        }
                        
                        // تخزين بيانات كلا المزودين
                        newMessage.providerData = {
                            provider: 'semysms_both',
                            lastUpdate: new Date(),
                            device: deviceId,
                            rawSmsResponse: smsResult.rawResponse,
                            rawWhatsappResponse: whatsappResult.rawResponse
                        };
                        
                        await newMessage.save();
                        
                        logger.info(`تم إرسال رسالة SMS للعميل ${client.name} إلى ${formattedPhone} بنجاح (كقناة بديلة)`);
                    } else {
                        logger.warn(`فشل في إرسال رسالة SMS للعميل ${client.name} (كقناة بديلة)`, {
                            error: smsResult.error
                        });
                    }
                }
            } else {
                logger.error(`فشل في إرسال رسالة واتساب للعميل ${client.name} إلى ${formattedPhone}`, {
                    error: whatsappResult.error
                });
            }
        }
        // الحالة 2: SMS فقط
        else if (canSendSms && !canSendWhatsapp && smsManagerInitialized) {
            logger.info(`إرسال رسالة للعميل ${client.name} عبر SMS فقط حسب الإعدادات`);
            
            // إنشاء سجل الرسالة الآن لقناة SMS فقط
            const newMessage = new SemMessage({
                clientId: client._id,
                recipients: [formattedPhone],
                originalRecipients: [phone],
                content: msg,
                status: 'pending',
                messageId: new mongoose.Types.ObjectId().toString()
            });
            
            // حفظ الرسالة في قاعدة البيانات
            await newMessage.save();
            
            // إرسال عبر SMS
            const smsResult = await SmsManager.sendSms(formattedPhone, msg);
            
            if (smsResult.success) {
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
                
                // انتظار تحديث حالة الرسالة لمدة 30 ثانية
                const statusResult = await waitForMessageStatus(newMessage._id.toString(), 30000);
                
                if (statusResult.success) {
                    // تم تسليم الرسالة بنجاح - لا داعي لاستخدام القناة الثانية
                    logger.info(`تم تأكيد تسليم رسالة SMS بنجاح للعميل ${client.name}، لن يتم استخدام الواتساب`);
                } else {
                    // لم يتم تسليم الرسالة بعد - محاولة استخدام الواتساب كقناة بديلة
                    logger.info(`لم يتم تأكيد تسليم رسالة SMS للعميل ${client.name} خلال المهلة المحددة (${statusResult.status})، جاري المحاولة عبر الواتساب`);
                    
                    // إرسال عبر الواتساب كقناة بديلة
                    const whatsappResult = await WhatsappManager.sendWhatsapp(formattedPhone, msg, { clientId: client._id });
                    
                    if (whatsappResult.success) {
                        newMessage.externalMessageId = `${newMessage.externalMessageId},${whatsappResult.externalMessageId}`;
                        
                        let deviceId = null;
                        if (whatsappResult.rawResponse) {
                            deviceId = whatsappResult.rawResponse.id_device || 
                                    whatsappResult.rawResponse.device_id || 
                                    (whatsappResult.rawResponse.device ? whatsappResult.rawResponse.device : null);
                        }
                        
                        // تخزين بيانات كلا المزودين
                        newMessage.providerData = {
                            provider: 'semysms_both',
                            lastUpdate: new Date(),
                            device: deviceId,
                            rawSmsResponse: smsResult.rawResponse,
                            rawWhatsappResponse: whatsappResult.rawResponse
                        };
                        
                        await newMessage.save();
                        
                        logger.info(`تم إرسال رسالة واتساب للعميل ${client.name} إلى ${formattedPhone} بنجاح (كقناة بديلة)`);
                    } else {
                        logger.warn(`فشل في إرسال رسالة واتساب للعميل ${client.name} (كقناة بديلة)`, {
                            error: whatsappResult.error
                        });
                    }
                }
            } else {
                logger.error(`فشل في إرسال رسالة SMS للعميل ${client.name} إلى ${formattedPhone}`, {
                    error: smsResult.error
                });
            }
        }
        // حالة الفشل: قنوات مفعلة ولكن مدراء الخدمات غير متاحين
        else {
            logger.error(`فشل في إرسال رسالة للعميل ${client.name} بسبب عدم توفر قنوات إرسال صالحة (تمت تهيئة: SMS=${smsManagerInitialized}, واتساب=${whatsappManagerInitialized})`);
            
            return res.status(500).send("6"); // خطأ في النظام
        }

        // تحديث رصيد العميل إذا تم إرسال الرسالة بنجاح
        if (newMessage.status === 'sent' || newMessage.status === 'pending') {
            // حساب عدد الرسائل المطلوبة
            const containsArabic = /[\u0600-\u06FF]/.test(msg);
            const maxLength = containsArabic ? 70 : 160;
            const messageCount = Math.ceil(msg.length / maxLength);
            
            // نقطة واحدة لكل رسالة
            const requiredPoints = messageCount;
            
            // خصم نقطة واحدة لكل رسالة SMS و 0.25 نقطة لكل رسالة واتساب
            let pointsToDeduct = 0;
            if (newMessage.providerData.provider === 'semysms') pointsToDeduct += requiredPoints; // 1 نقطة لكل رسالة SMS
            if (newMessage.providerData.provider === 'semysms_whatsapp') pointsToDeduct += (requiredPoints * 0.25); // 0.25 نقطة لكل رسالة واتساب
            
            client.balance -= pointsToDeduct;
            
            // إضافة رسالة واحدة لكل قناة إرسال ناجحة بدلاً من استخدام النقاط
            let sentMessagesCount = 0;
            if (newMessage.providerData.provider === 'semysms') sentMessagesCount += 1; // إضافة 1 لكل رسالة SMS مرسلة
            if (newMessage.providerData.provider === 'semysms_whatsapp') sentMessagesCount += 1; // إضافة 1 لكل رسالة واتساب مرسلة
            
            client.messagesSent += sentMessagesCount;
            await client.save();
            
            // تسجيل عملية استخدام الرصيد
            const balanceTransaction = new BalanceTransaction({
                clientId: client._id,
                type: 'usage',
                amount: pointsToDeduct,
                description: `خصم رصيد لإرسال رسالة ${newMessage.providerData.provider === 'semysms' ? 'SMS' : 'واتساب'}`,
                balanceBefore: client.balance + pointsToDeduct,
                balanceAfter: client.balance,
                status: 'complete',
                relatedMessageId: newMessage._id,
                notes: `خصم رصيد لإرسال رسالة ${newMessage.providerData.provider === 'semysms' ? 'SMS' : 'واتساب'}`,
                performedBy: process.env.SYSTEM_USER_ID || '6418180ac9e8dffece88d5a6' // استخدام معرف المستخدم النظامي
            });
            await balanceTransaction.save();
        }
        
        // إرجاع استجابة نجاح
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
