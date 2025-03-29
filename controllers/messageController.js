const mongoose = require('mongoose');
const SemClient = require('../models/SemClient');
const SemMessage = require('../models/SemMessage');
const WhatsappMessage = require('../models/WhatsappMessage');
const logger = require('../services/loggerService');
const BalanceTransaction = require('../models/BalanceTransaction');
const SmsManager = require('../services/sms/SmsManager');
const SmsSettings = require('../models/SmsSettings');
const SmsStatusService = require('../services/sms/SmsStatusService');
const WhatsappManager = require('../services/whatsapp/WhatsappManager');
const WhatsappSettings = require('../models/WhatsappSettings');
const phoneFormatService = require('../services/phoneFormatService');

/*----------------------------------------------------------
  تهيئة خدمات الرسائل (SMS وواتساب)
----------------------------------------------------------*/
async function _initializeSmsManager() {
  try {
    if (SmsManager.initialized) return true;
    const settings = await SmsSettings.getActiveSettings();
    if (!settings) {
      logger.error('messageController', 'لا يمكن العثور على إعدادات SMS النشطة');
      return false;
    }
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

async function _initializeWhatsappManager() {
  try {
    if (WhatsappManager.initialized) return true;
    const settings = await WhatsappSettings.getActiveSettings();
    if (!settings) {
      logger.error('messageController', 'لا يمكن العثور على إعدادات الواتساب النشطة');
      return false;
    }
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

/*----------------------------------------------------------
  دالة انتظار تحديث حالة الرسالة (Polling)
----------------------------------------------------------*/
const waitForMessageStatus = async (messageId, messageType = 'any', timeout = 30000) => {
  const startTime = Date.now();
  const interval = 5000;
  logger.info(`بدء انتظار تحديث حالة الرسالة (${messageId}) من نوع ${messageType} لمدة ${timeout / 1000} ثانية`);
  
  return new Promise((resolve) => {
    const checkStatus = async () => {
      try {
        // قائمة للبحث المتوازي في كلا الجدولين
        const searchPromises = [];
        
        // البحث في جدول SemMessage إذا كان النوع 'any' أو 'sms'
        if (messageType === 'any' || messageType === 'sms') {
          searchPromises.push(
            SemMessage.findOne({
              $or: [
                { _id: messageId },
                { messageId: messageId },
                { externalMessageId: messageId }
              ]
            }).exec()
          );
        }
        
        // البحث في جدول WhatsappMessage إذا كان النوع 'any' أو 'whatsapp'
        if (messageType === 'any' || messageType === 'whatsapp') {
          searchPromises.push(
            WhatsappMessage.findOne({
              $or: [
                { _id: messageId },
                { messageId: messageId },
                { externalMessageId: messageId }
              ]
            }).exec()
          );
        }
        
        // انتظار نتائج البحث من جميع الجداول
        const results = await Promise.all(searchPromises);
        
        // تصفية النتائج للحصول على سجل رسالة واحد موجود
        const message = results.find(result => result !== null);
        
        // إذا لم تكن الرسالة موجودة أو كانت حالتها "فشل"
        if (!message || message.status === 'failed') {
          logger.warn(`الرسالة (${messageId}) غير موجودة أو فشلت`);
          return resolve({ success: false, status: message?.status || 'unknown', messageType: message ? (message.constructor.modelName === 'WhatsappMessage' ? 'whatsapp' : 'sms') : 'unknown' });
        }
        
        // تحديد نوع الرسالة التي تم العثور عليها
        const foundMessageType = message.constructor.modelName === 'WhatsappMessage' ? 'whatsapp' : 'sms';
        
        // إذا تم تسليم الرسالة أو استلامها أو قراءتها
        if (['delivered', 'received', 'read'].includes(message.status)) {
          logger.info(`تم تحديث حالة الرسالة (${messageId}) إلى: ${message.status}`);
          return resolve({ success: true, status: message.status, messageType: foundMessageType });
        }
        
        // التحقق من انتهاء مهلة الانتظار
        const elapsed = Date.now() - startTime;
        if (elapsed >= timeout) {
          logger.warn(`انتهت مهلة انتظار تحديث حالة الرسالة (${messageId}): لا يزال الوضع ${message.status}`);
          return resolve({ success: false, status: message.status, timedOut: true, messageType: foundMessageType });
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
    
    checkStatus();
  });
};

/*----------------------------------------------------------
  دوال إرسال الرسائل وتحديث السجلات
----------------------------------------------------------*/
/**
 * تحديث رصيد العميل وتسجيل معاملة الاستخدام
 */
async function updateClientBalance(client, smsSent, whatsappSent, msgContent) {
  try {
    const containsArabic = /[\u0600-\u06FF]/.test(msgContent);
    const maxLength = containsArabic ? 70 : 160;
    const messageCount = Math.ceil(msgContent.length / maxLength);
    let points = 0;
    if (smsSent) points += messageCount;               // 1 نقطة لكل رسالة SMS
    if (whatsappSent) points += (messageCount * 0.25);   // 0.25 نقطة لكل رسالة واتساب
    client.balance -= points;
    client.messagesSent += (smsSent ? 1 : 0) + (whatsappSent ? 1 : 0);
    await client.save();
    const balanceTransaction = new BalanceTransaction({
      clientId: client._id,
      type: 'usage',
      amount: points,
      description: `خصم رصيد لإرسال رسالة ${smsSent && whatsappSent ? 'SMS وواتساب' : (smsSent ? 'SMS' : 'واتساب')}`,
      balanceBefore: client.balance + points,
      balanceAfter: client.balance,
      status: 'complete',
      relatedMessageId: client._id, // يمكن ربطها بالرسالة إن لزم الأمر
      notes: `خصم رصيد لإرسال رسالة ${smsSent && whatsappSent ? 'SMS وواتساب' : (smsSent ? 'SMS' : 'واتساب')}`,
      performedBy: process.env.SYSTEM_USER_ID || '6418180ac9e8dffece88d5a6'
    });
    await balanceTransaction.save();
  } catch (e) {
    logger.error('Error updating client balance', e);
  }
}

/**
 * إرسال رسالة SMS وتحديث سجل SemMessage
 */
async function sendSmsAndUpdate(message, client, formattedPhone, msgContent, smsConfig) {
  try {
    const smsResult = await SmsManager.sendSms(formattedPhone, msgContent, {
      deviceId: smsConfig.device || null
    });
    if (smsResult.success) {
      message.status = smsResult.status === 'delivered' ? 'sent' : 'pending';
      message.externalMessageId = smsResult.externalMessageId;
      if (smsResult.status === 'delivered') message.sentAt = new Date();
      message.providerData = {
        provider: 'semysms',
        lastUpdate: new Date(),
        device: smsResult.rawResponse
          ? (smsResult.rawResponse.id_device || smsResult.rawResponse.device_id)
          : null,
        rawResponse: smsResult.rawResponse
      };
      await message.save();
      return true;
    } else {
      logger.error(`SMS sending failed for client ${client.name}`, { error: smsResult.error });
      return false;
    }
  } catch (e) {
    logger.error(`Error sending SMS for client ${client.name}`, e);
    return false;
  }
}

/**
 * إرسال رسالة واتساب وتحديث السجل المناسب.
 * @param {SemMessage|null} message - إذا كانت موجودة (استخدام قناة مشتركة) يتم تحديث سجل SemMessage؛ إذا كانت null (واتساب فقط) يتم إنشاء سجل في WhatsappMessage.
 */
async function sendWhatsappAndUpdate(message, client, formattedPhone, msgContent, whatsappConfig, updateSemMessage = true) {
  try {
    const options = {
      clientId: client._id,
      deviceId: whatsappConfig.device || null
    };
    
    // إذا كنا نستخدم قناة مشتركة أو كنا سننشئ سجل رسالة واتساب يدويًا، نخبر مدير الواتساب بعدم إنشاء سجل
    // هذا يمنع التكرار
    options.skipMessageRecord = true;
    
    const whatsappResult = await WhatsappManager.sendWhatsapp(formattedPhone, msgContent, options);
    let messageId = null;
    
    if (whatsappResult.success) {
      if (updateSemMessage) {
        message.status = 'sent';
        message.externalMessageId = whatsappResult.externalMessageId;
        message.providerData = {
          provider: 'semysms_whatsapp',
          lastUpdate: new Date(),
          device: whatsappResult.rawResponse
            ? (whatsappResult.rawResponse.id_device || whatsappResult.rawResponse.device_id)
            : null,
          rawResponse: whatsappResult.rawResponse
        };
        await message.save();
        messageId = message._id.toString();
      } else {
        // إنشاء سجل جديد في مجموعة WhatsappMessage لعملاء واتساب فقط
        const msgId = new mongoose.Types.ObjectId().toString();
        const whatsappMsg = new WhatsappMessage({
          clientId: client._id,
          phoneNumber: formattedPhone,
          message: msgContent,
          messageId: msgId,
          status: 'sent',
          externalMessageId: whatsappResult.externalMessageId,
          providerData: {
            rawResponse: whatsappResult.rawResponse,
            lastUpdate: new Date(),
            device: whatsappResult.rawResponse
              ? (whatsappResult.rawResponse.id_device || whatsappResult.rawResponse.device_id)
              : null
          }
        });
        await whatsappMsg.save();
        messageId = whatsappMsg._id.toString() || msgId;
      }
      return { success: true, messageId: messageId, externalMessageId: whatsappResult.externalMessageId };
    } else {
      logger.error(`WhatsApp sending failed for client ${client.name}`, { error: whatsappResult.error });
      return { success: false, error: whatsappResult.error };
    }
  } catch (e) {
    logger.error(`Error sending WhatsApp for client ${client.name}`, e);
    return { success: false, error: e.message };
  }
}

/**
 * عملية إرسال الرسالة بالقنوات المتعددة (Fallback)
 * إذا كان العميل يمتلك قناتين (SMS وواتساب) يتم المحاولة بالقناة المفضلة أولاً، ثم استخدام البديلة في حال فشل الإرسال.
 */
async function processChannelFallback(message, client, formattedPhone, msgContent, useWhatsappFirst) {
  let smsSent = false, whatsappSent = false;
  try {
    // تحديث إعدادات الخدمات قبل البدء
    const whatsappSettings = await WhatsappSettings.getActiveSettings();
    const whatsappConfig = whatsappSettings.getProviderConfig();
    await WhatsappManager.initialize(whatsappConfig);
    const smsSettings = await SmsSettings.getActiveSettings();
    const smsConfig = smsSettings.getProviderConfig();
    await SmsManager.initialize(smsConfig);
    
    if (useWhatsappFirst) {
      logger.info(`محاولة إرسال رسالة واتساب للعميل ${client.name} (القناة الأولى)`);
      
      // استخدام دالة إرسال الواتساب بدون ربطها بـ SemMessage (updateSemMessage = false)
      const whatsappSuccess = await sendWhatsappAndUpdate(null, client, formattedPhone, msgContent, whatsappConfig, false);
      
      if (whatsappSuccess.success) {
        // تم إرسال الواتساب بنجاح - تم تخزينها في WhatsappMessage
        logger.info(`تم إرسال واتساب بنجاح للعميل ${client.name} وتخزينها في WhatsappMessage`);
        await updateClientBalance(client, false, true, msgContent);
      } else {
        // فشل إرسال الواتساب - محاولة إرسال SMS كقناة بديلة
        logger.info(`فشل إرسال واتساب للعميل ${client.name}، جاري المحاولة عبر SMS`);
        
        // إنشاء سجل SemMessage الآن (لأننا سنستخدم SMS)
        const semMessage = new SemMessage({
          clientId: client._id,
          recipients: [formattedPhone],
          originalRecipients: [phone],
          content: msgContent,
          status: 'pending',
          messageId: new mongoose.Types.ObjectId().toString()
        });
        await semMessage.save();
        
        const smsSuccess = await sendSmsAndUpdate(semMessage, client, formattedPhone, msgContent, smsConfig);
        if (smsSuccess) {
          // تم إرسال SMS بنجاح
          logger.info(`تم إرسال SMS كقناة بديلة بنجاح للعميل ${client.name}`);
          await updateClientBalance(client, true, false, msgContent);
        }
      }
    } else {
      // محاولة الإرسال عبر SMS أولاً
      logger.info(`محاولة إرسال SMS كقناة أولى للعميل ${client.name}`);
      
      // إنشاء سجل SemMessage لأننا سنجرب SMS أولاً
      const semMessage = new SemMessage({
        clientId: client._id,
        recipients: [formattedPhone],
        originalRecipients: [phone],
        content: msgContent,
        status: 'pending',
        messageId: new mongoose.Types.ObjectId().toString()
      });
      await semMessage.save();
      
      const smsSuccess = await sendSmsAndUpdate(semMessage, client, formattedPhone, msgContent, smsConfig);
      
      if (smsSuccess) {
        // تم إرسال SMS بنجاح - تم تخزينها في SemMessage
        logger.info(`تم إرسال SMS بنجاح للعميل ${client.name}`);
        await updateClientBalance(client, true, false, msgContent);
      } else {
        // فشل إرسال SMS - محاولة إرسال واتساب كقناة بديلة
        logger.info(`فشل إرسال SMS للعميل ${client.name}، جاري المحاولة عبر واتساب`);
        
        // عند استخدام الواتساب كقناة بديلة، نقوم بتحديث سجل SemMessage نفسه (updateSemMessage = true)
        const whatsappSuccess = await sendWhatsappAndUpdate(semMessage, client, formattedPhone, msgContent, whatsappConfig, true);
        if (whatsappSuccess.success) {
          // تم إرسال واتساب بنجاح وتحديث سجل SemMessage
          logger.info(`تم إرسال واتساب كقناة بديلة بنجاح للعميل ${client.name}`);
          await updateClientBalance(client, false, true, msgContent);
        }
      }
    }
    return { smsSent, whatsappSent };
  } catch (error) {
    logger.error('خطأ أثناء عملية تحويل القنوات (Fallback)', { error: error.message, stack: error.stack });
    try {
      message.status = 'failed';
      message.errorMessage = `خطأ أثناء عملية التحويل: ${error.message}`;
      await message.save();
    } catch (e) {
      logger.error('خطأ أثناء حفظ سجل الرسالة الفاشلة', e);
    }
    return { smsSent, whatsappSent, error };
  }
}

/*----------------------------------------------------------
  الدالة الرئيسية لإرسال الرسائل باستخدام مفتاح API
----------------------------------------------------------*/
exports.sendMessage = async (req, res) => {
  try {
    const { token, phone, msg } = req.query;
    if (!token || !phone || !msg) {
      logger.warn('sendMessage', 'محاولة إرسال رسالة بدون توفير جميع المعلومات المطلوبة');
      return res.status(400).send("2");
    }
    logger.debug('sendMessage', 'استلام طلب إرسال رسالة', {
      token: token.slice(0, 4) + '...',
      phone
    });
    const client = await SemClient.validateApiCredentials(token);
    if (!client) {
      logger.error('sendMessage', `محاولة استخدام مفتاح API غير صالح: ${token}`);
      return res.status(401).send("3");
    }
    
    /* معالجة رقم الهاتف وتنسيقه */
    // تحميل إعدادات الدولة للعميل قبل تنسيق رقم الهاتف
    if (client && client.defaultCountry) {
      phoneFormatService.setDefaultCountry({
        countryCode: client.defaultCountry.code,
        countryAlpha2: client.defaultCountry.alpha2
      });
      
      logger.debug('sendMessage', 'تم تحديث إعدادات كود الدولة من معلومات العميل', {
        clientId: client._id,
        countryCode: client.defaultCountry.code,
        countryAlpha2: client.defaultCountry.alpha2
      });
    }
    
    let processedPhone = phone.trim().replace('+ ', '+').replace(/\s+/g, '');
    
    // المعالجة الأولية للرقم المدخل
    if (!processedPhone.startsWith('+')) {
      // إذا كان الرقم يبدأ بـ 00 (صيغة دولية بديلة)
      if (processedPhone.startsWith('00')) {
        processedPhone = '+' + processedPhone.substring(2);
        logger.debug('sendMessage', 'تحويل رقم من صيغة 00 إلى +', { processedPhone });
      } 
      // للأرقام التي تبدأ بـ 0 (قد تكون أرقام محلية)
      else if (processedPhone.startsWith('0')) {
        // إذا كان الرقم طويل (أكثر من 10 أرقام) قد يكون دولي مع 0 بادئة (مثل 0046...)
        if (processedPhone.length > 10 && processedPhone.startsWith('00')) {
          processedPhone = '+' + processedPhone.substring(2);
          logger.debug('sendMessage', 'تحويل رقم دولي طويل يبدأ بـ 00 إلى +', { processedPhone });
        } else {
          // أرقام محلية تبدأ بـ 0
          processedPhone = '+' + processedPhone;
          logger.debug('sendMessage', 'إضافة + لرقم يبدأ بـ 0', { processedPhone });
        }
      }
      // للأرقام الطويلة التي لا تبدأ بـ 0 (غالبًا أرقام دولية بدون + أو 00)
      else if (processedPhone.length > 9) {
        processedPhone = '+' + processedPhone;
        logger.debug('sendMessage', 'إضافة + لرقم دولي طويل', { processedPhone });
      }
      // الأرقام القصيرة التي لا تبدأ بـ 0 ولا + (غالبًا أرقام محلية)
      else {
        processedPhone = '+' + processedPhone;
        logger.debug('sendMessage', 'إضافة + لرقم قصير', { processedPhone });
      }
    }
    
    logger.debug('sendMessage', 'رقم الهاتف بعد المعالجة الأولية', { processedPhone });
    const formattedPhoneResult = phoneFormatService.formatPhoneNumber(processedPhone);
    if (!formattedPhoneResult.isValid) {
      const errorMessage = new SemMessage({
        clientId: client._id,
        recipients: [processedPhone],
        content: msg,
        status: 'failed',
        errorMessage: formattedPhoneResult.error
      });
      await errorMessage.save();
      logger.warn('sendMessage', `رقم الهاتف غير صالح: ${processedPhone}`, { error: formattedPhoneResult.error });
      return res.status(400).send("8");
    }
    const formattedPhone = formattedPhoneResult.phone;
    
    /* التحقق من الحدود والرصيد */
    if (!(await client.checkDailyLimit())) {
      logger.warn('sendMessage', `العميل ${client.name} تجاوز الحد اليومي للرسائل`);
      return res.status(429).send("4");
    }
    if (!(await client.checkMonthlyLimit())) {
      logger.warn('sendMessage', `العميل ${client.name} تجاوز الحد الشهري للرسائل`);
      return res.status(429).send("5");
    }
    const containsArabic = /[\u0600-\u06FF]/.test(msg);
    const maxLength = containsArabic ? 70 : 160;
    const messageCount = Math.ceil(msg.length / maxLength);
    if (client.balance < messageCount) {
      logger.warn('sendMessage', `رصيد العميل ${client.name} غير كافي لإرسال الرسالة`);
      return res.status(402).send("7");
    }
    
    /* تحديد القنوات المفعلة */
    const canSendSms = client.messagingChannels?.sms !== false;
    const canSendWhatsapp = client.messagingChannels?.whatsapp === true;
    if (!canSendSms && !canSendWhatsapp) {
      const errorMessage = new SemMessage({
        clientId: client._id,
        recipients: [formattedPhone],
        originalRecipients: [phone],
        content: msg,
        status: 'failed',
        errorMessage: 'لم يتم تفعيل أي قناة إرسال للعميل'
      });
      await errorMessage.save();
      logger.error('sendMessage', `لا توجد قنوات إرسال مفعلة للعميل ${client.name}`);
      return res.status(400).send("9");
    }
    
    /* تهيئة الخدمات حسب القنوات */
    const smsInitialized = canSendSms ? await _initializeSmsManager() : false;
    const whatsappInitialized = canSendWhatsapp ? await _initializeWhatsappManager() : false;
    if (!smsInitialized && !whatsappInitialized) {
      logger.error('sendMessage', 'فشل في تهيئة أي من خدمات الرسائل');
      return res.status(500).send("6");
    }
    
    /* استراتيجية الإرسال */
    if (canSendSms && canSendWhatsapp && smsInitialized && whatsappInitialized) {
      // الحالة: قناتان (SMS وواتساب)
      res.status(200).send("1"); // الرد الفوري للعميل
      
      setImmediate(async () => {
        try {
          const preferred = client.preferredChannel || 'none';
          const whatsappConfig = (await WhatsappSettings.getActiveSettings()).getProviderConfig();
          const smsConfig = (await SmsSettings.getActiveSettings()).getProviderConfig();
          
          // تحديد القناة الأولى للمحاولة بناءً على التفضيل
          const tryWhatsappFirst = preferred === 'whatsapp' || (preferred === 'none' && Math.random() < 0.5);
          
          if (tryWhatsappFirst) {
            // محاولة الإرسال عبر الواتساب أولاً
            logger.info(`محاولة إرسال واتساب كقناة أولى للعميل ${client.name}`);
            
            // استخدام دالة إرسال الواتساب مع إنشاء سجل WhatsappMessage
            const whatsappResult = await sendWhatsappAndUpdate(null, client, formattedPhone, msg, whatsappConfig, false);
            
            if (whatsappResult.success) {
              logger.info(`تم إرسال واتساب بنجاح للعميل ${client.name} وتخزينها في WhatsappMessage، معرف الرسالة: ${whatsappResult.messageId}`);
              
              // انتظار 30 ثانية للتأكد من التسليم
              const deliveryStatus = await waitForMessageStatus(whatsappResult.messageId, 'whatsapp', 30000);
              
              if (deliveryStatus.success) {
                // تم تسليم رسالة الواتساب بنجاح
                logger.info(`تأكيد تسليم رسالة الواتساب (${whatsappResult.messageId}) للعميل ${client.name}`);
                await updateClientBalance(client, false, true, msg);
              } else if (deliveryStatus.timedOut) {
                // لم يتم تأكيد تسليم رسالة الواتساب - محاولة إرسال SMS كقناة بديلة
                logger.info(`انتهت مهلة تأكيد تسليم رسالة الواتساب (${whatsappResult.messageId}) للعميل ${client.name}، جاري المحاولة عبر SMS`);
                
                // إنشاء سجل SemMessage لإرسال SMS
                const semMessage = new SemMessage({
                  clientId: client._id,
                  recipients: [formattedPhone],
                  originalRecipients: [phone],
                  content: msg,
                  status: 'pending',
                  messageId: new mongoose.Types.ObjectId().toString()
                });
                await semMessage.save();
                
                const smsSuccess = await sendSmsAndUpdate(semMessage, client, formattedPhone, msg, smsConfig);
                if (smsSuccess) {
                  // تم إرسال SMS بنجاح
                  logger.info(`تم إرسال SMS كقناة بديلة بنجاح للعميل ${client.name}`);
                  await updateClientBalance(client, true, false, msg);
                }
              } else {
                // فشل تسليم رسالة الواتساب (معروف أنه فشل، ليس مجرد انتهاء مهلة)
                logger.warn(`فشل تسليم رسالة الواتساب (${whatsappResult.messageId}) للعميل ${client.name}، حالة: ${deliveryStatus.status}`);
                
                // إنشاء سجل SemMessage لإرسال SMS
                const semMessage = new SemMessage({
                  clientId: client._id,
                  recipients: [formattedPhone],
                  originalRecipients: [phone],
                  content: msg,
                  status: 'pending',
                  messageId: new mongoose.Types.ObjectId().toString()
                });
                await semMessage.save();
                
                const smsSuccess = await sendSmsAndUpdate(semMessage, client, formattedPhone, msg, smsConfig);
                if (smsSuccess) {
                  // تم إرسال SMS بنجاح
                  logger.info(`تم إرسال SMS كقناة بديلة بنجاح للعميل ${client.name}`);
                  await updateClientBalance(client, true, false, msg);
                }
              }
            } else {
              // فشل إرسال الواتساب من البداية - محاولة إرسال SMS كقناة بديلة
              logger.info(`فشل إرسال واتساب للعميل ${client.name}، جاري المحاولة عبر SMS`);
              
              // إنشاء سجل SemMessage للإرسال عبر SMS
              const semMessage = new SemMessage({
                clientId: client._id,
                recipients: [formattedPhone],
                originalRecipients: [phone],
                content: msg,
                status: 'pending',
                messageId: new mongoose.Types.ObjectId().toString()
              });
              await semMessage.save();
              
              const smsSuccess = await sendSmsAndUpdate(semMessage, client, formattedPhone, msg, smsConfig);
              if (smsSuccess) {
                // تم إرسال SMS بنجاح
                logger.info(`تم إرسال SMS كقناة بديلة بنجاح للعميل ${client.name}`);
                await updateClientBalance(client, true, false, msg);
              }
            }
          } else {
            // محاولة الإرسال عبر SMS أولاً
            logger.info(`محاولة إرسال SMS كقناة أولى للعميل ${client.name}`);
            
            // إنشاء سجل SemMessage لأننا سنجرب SMS أولاً
            const semMessage = new SemMessage({
              clientId: client._id,
              recipients: [formattedPhone],
              originalRecipients: [phone],
              content: msg,
              status: 'pending',
              messageId: new mongoose.Types.ObjectId().toString()
            });
            await semMessage.save();
            
            const smsSuccess = await sendSmsAndUpdate(semMessage, client, formattedPhone, msg, smsConfig);
            
            if (smsSuccess) {
              // تم إرسال SMS بنجاح - تم تخزينها في SemMessage
              logger.info(`تم إرسال SMS بنجاح للعميل ${client.name}`);
              await updateClientBalance(client, true, false, msg);
            } else {
              // فشل إرسال SMS - محاولة إرسال واتساب كقناة بديلة
              logger.info(`فشل إرسال SMS للعميل ${client.name}، جاري المحاولة عبر واتساب`);
              
              // عند استخدام الواتساب كقناة بديلة، نقوم بتحديث سجل SemMessage نفسه (updateSemMessage = true)
              const whatsappSuccess = await sendWhatsappAndUpdate(semMessage, client, formattedPhone, msg, whatsappConfig, true);
              if (whatsappSuccess.success) {
                // تم إرسال واتساب بنجاح وتحديث سجل SemMessage
                logger.info(`تم إرسال واتساب كقناة بديلة بنجاح للعميل ${client.name}`);
                await updateClientBalance(client, false, true, msg);
              }
            }
          }
        } catch (e) {
          logger.error('Error in dual-channel background processing', e);
        }
      });
    } else if (canSendWhatsapp && whatsappInitialized && !canSendSms) {
      // الحالة: واتساب فقط
      res.status(200).send("1");
      setImmediate(async () => {
        try {
          const whatsappConfig = (await WhatsappSettings.getActiveSettings()).getProviderConfig();
          const sent = await sendWhatsappAndUpdate(null, client, formattedPhone, msg, whatsappConfig, false);
          if (sent.success) {
            await updateClientBalance(client, false, true, msg);
          }
        } catch (e) {
          logger.error('Error in WhatsApp-only background processing', e);
        }
      });
    } else if (canSendSms && smsInitialized && !canSendWhatsapp) {
      // الحالة: SMS فقط
      const semMessage = new SemMessage({
        clientId: client._id,
        recipients: [formattedPhone],
        originalRecipients: [phone],
        content: msg,
        status: 'pending',
        messageId: new mongoose.Types.ObjectId().toString()
      });
      await semMessage.save();
      res.status(200).send("1");
      setImmediate(async () => {
        try {
          const smsConfig = (await SmsSettings.getActiveSettings()).getProviderConfig();
          const sent = await sendSmsAndUpdate(semMessage, client, formattedPhone, msg, smsConfig);
          if (sent) {
            await updateClientBalance(client, true, false, msg);
          }
        } catch (e) {
          logger.error('Error in SMS-only background processing', e);
        }
      });
    }
  } catch (error) {
    logger.error('sendMessage', 'خطأ في إرسال الرسالة', {
      error: error.message || 'خطأ غير معروف',
      stack: error.stack
    });
    return res.status(500).send("6");
  }
};

/*----------------------------------------------------------
  الدوال الأخرى (للإدارة)
----------------------------------------------------------*/
/**
 * التحقق من الرصيد المتبقي للعميل
 */
exports.checkBalance = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send("2");
    const client = await SemClient.validateApiCredentials(token);
    if (!client) {
      logger.error('checkBalance', `محاولة استخدام مفتاح API غير صالح: ${token}`);
      return res.status(401).send("3");
    }
    return res.status(200).send(client.balance.toString());
  } catch (error) {
    logger.error('checkBalance', 'خطأ في التحقق من الرصيد', {
      error: error.message || 'خطأ غير معروف',
      stack: error.stack
    });
    return res.status(500).send("6");
  }
};

/**
 * التحقق من رصيد حساب SemySMS (للمدراء فقط)
 */
exports.checkSmsProviderBalance = async (req, res) => {
  try {
    const userRole = req.session.userRole;
    if (userRole !== 'admin') {
      logger.warn('checkSmsProviderBalance', 'محاولة وصول غير مصرح به');
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بالوصول إلى هذه البيانات'
      });
    }
    const smsManagerInitialized = await _initializeSmsManager();
    if (!smsManagerInitialized) {
      return res.status(500).json({
        success: false,
        message: 'فشل في تهيئة خدمة الرسائل'
      });
    }
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
    logger.error('checkSmsProviderBalance', 'خطأ في التحقق من رصيد مزود الخدمة', {
      error: error.message || 'خطأ غير معروف',
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء التحقق من رصيد مزود الخدمة'
    });
  }
};

/**
 * تحديث حالة الرسائل المعلقة (للمدراء فقط)
 */
exports.updatePendingMessagesStatus = async (req, res) => {
  try {
    const userRole = req.session.userRole;
    if (userRole !== 'admin') {
      logger.warn('updatePendingMessagesStatus', 'محاولة وصول غير مصرح به');
      return res.status(403).json({
        success: false,
        message: 'غير مصرح لك بالوصول إلى هذه الوظيفة'
      });
    }
    const smsManagerInitialized = await _initializeSmsManager();
    if (!smsManagerInitialized) {
      return res.status(500).json({
        success: false,
        message: 'فشل في تهيئة خدمة الرسائل'
      });
    }
    const updateResult = await SmsStatusService.updatePendingMessagesStatus();
    return res.status(200).json({ success: updateResult.success, ...updateResult });
  } catch (error) {
    logger.error('updatePendingMessagesStatus', 'خطأ في تحديث حالة الرسائل المعلقة', {
      error: error.message || 'خطأ غير معروف',
      stack: error.stack
    });
    return res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث حالة الرسائل' });
  }
};

/**
 * الحصول على سجل رسائل عميل معين - (للأدمن فقط)
 */
exports.getClientMessages = async (req, res) => {
  try {
    const userRole = req.session.userRole;
    if (userRole !== 'admin') {
      logger.warn('getClientMessages', 'محاولة وصول غير مصرح به');
      return res.status(403).json({ success: false, message: 'غير مصرح لك بالوصول إلى هذه البيانات' });
    }
    const clientId = req.params.clientId;
    if (!clientId) {
      return res.status(400).json({ success: false, message: 'معرف العميل مطلوب' });
    }
    const client = await SemClient.findById(clientId);
    if (!client) {
      return res.status(404).json({ success: false, message: 'العميل غير موجود' });
    }
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const totalMessages = await SemMessage.countDocuments({ clientId });
    const messages = await SemMessage.find({ clientId }).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const totalPages = Math.ceil(totalMessages / limit);
    return res.status(200).json({
      success: true,
      messages,
      pagination: { page, totalPages, totalMessages, limit },
      client: { id: client._id, name: client.name }
    });
  } catch (error) {
    logger.error('getClientMessages', 'خطأ في الحصول على رسائل العميل', {
      error: error.message || 'خطأ غير معروف',
      stack: error.stack
    });
    return res.status(500).json({ success: false, message: 'حدث خطأ أثناء معالجة الطلب' });
  }
};
