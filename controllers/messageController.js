const mongoose = require('mongoose');
const SemClient = require('../models/SemClient');
const SemMessage = require('../models/SemMessage');
const logger = require('../services/loggerService');
const BalanceTransaction = require('../models/BalanceTransaction');
const SmsManager = require('../services/sms/SmsManager');
const SmsSettings = require('../models/SmsSettings');
const SmsStatusService = require('../services/sms/SmsStatusService');
const WhatsappManager = require('../services/whatsapp/WhatsappManager');
const WhatsappSettings = require('../models/WhatsappSettings');
const MetaWhatsappService = require('../services/whatsapp/MetaWhatsappService');
const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
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

async function _initializeMetaWhatsappManager() {
  try {
    if (MetaWhatsappService.initialized) return true;
    const settings = await MetaWhatsappSettings.getActiveSettings();
    if (!settings) {
      logger.error('messageController', 'لا يمكن العثور على إعدادات Meta الواتساب النشطة');
      return false;
    }
    const config = settings.config;
    const initialized = await MetaWhatsappService.initialize(config);
    if (!initialized) {
      logger.error('messageController', 'فشل في تهيئة مدير خدمة Meta الواتساب');
      return false;
    }
    return true;
  } catch (error) {
    logger.error('messageController', 'خطأ في تهيئة مدير خدمة Meta الواتساب', error);
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
        // البحث في جدول SemMessage فقط لجميع أنواع الرسائل
        let message = await SemMessage.findOne({
          $or: [
            { _id: messageId },
            { messageId: messageId },
            { externalMessageId: messageId }
          ]
        }).exec();
        
        // إذا لم تكن الرسالة موجودة أو كانت حالتها "فشل"
        if (!message || message.status === 'failed') {
          logger.warn(`الرسالة (${messageId}) غير موجودة أو فشلت`);
          return resolve({ success: false, status: message?.status || 'unknown', messageType: 'unknown' });
        }
        
        // تحديد نوع الرسالة من خلال بيانات المزود
        const foundMessageType = message.providerData?.provider?.includes('whatsapp') ? 'whatsapp' : 'sms';
        
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
 * @param {SemMessage|null} message - سجل الرسالة، وإذا كان null سيتم إنشاء سجل جديد في SemMessage
 */
async function sendWhatsappAndUpdate(message, client, formattedPhone, msgContent, whatsappConfig, updateSemMessage = true) {
  try {
    const options = {
      clientId: client._id,
      deviceId: whatsappConfig.device || null,
      skipMessageRecord: true // نخبر مدير الواتساب بعدم إنشاء سجل لمنع التكرار
    };
    
    const whatsappResult = await WhatsappManager.sendWhatsapp(formattedPhone, msgContent, options);
    let messageId = null;
    
    if (whatsappResult.success) {
      if (message && updateSemMessage) {
        // تحديث سجل SemMessage الموجود
        message.status = 'sent';
        message.sentAt = new Date();
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
        logger.debug('messageController', 'تم تحديث سجل الرسالة في SemMessage', { messageId });
      } else {
        // إنشاء سجل جديد في SemMessage
        const msgId = new mongoose.Types.ObjectId().toString();
        const newMessage = new SemMessage({
          clientId: client._id,
          recipients: [formattedPhone],
          content: msgContent,
          messageId: msgId,
          status: 'sent',
          sentAt: new Date(),
          externalMessageId: whatsappResult.externalMessageId,
          providerData: {
            provider: 'semysms_whatsapp',
            lastUpdate: new Date(),
            device: whatsappResult.rawResponse
              ? (whatsappResult.rawResponse.id_device || whatsappResult.rawResponse.device_id)
              : null,
            rawResponse: whatsappResult.rawResponse
          }
        });
        await newMessage.save();
        messageId = newMessage._id.toString() || msgId;
        logger.debug('messageController', 'تم إنشاء سجل جديد في SemMessage', { messageId });
      }
      return { success: true, messageId: messageId, externalMessageId: whatsappResult.externalMessageId };
    } else {
      logger.error(`فشل إرسال واتساب للعميل ${client.name}`, { error: whatsappResult.error });
      return { success: false, error: whatsappResult.error };
    }
  } catch (e) {
    logger.error(`خطأ في إرسال واتساب للعميل ${client.name}`, e);
    return { success: false, error: e.message };
  }
}

/**
 * إرسال رسالة واتساب ميتا الرسمي وتحديث السجل المناسب
 * @param {SemMessage|null} message - سجل الرسالة الحالي (إن وجد)
 * @param {Object} client - معلومات العميل
 * @param {string} formattedPhone - رقم الهاتف المنسق
 * @param {string} msgContent - محتوى الرسالة
 * @param {boolean} updateSemMessage - تحديث سجل SemMessage أم لا
 * @returns {Promise<Object>} نتيجة الإرسال
 */
async function sendMetaWhatsappAndUpdate(message, client, formattedPhone, msgContent, updateSemMessage = true) {
  try {
    logger.debug('messageController', 'إرسال رسالة عبر Meta واتساب', { formattedPhone });
    
    // استخدام إعدادات النموذج المخصصة للعميل أو الإعدادات الافتراضية
    const templateName = client.metaWhatsappTemplates?.name || 'siraj';
    const templateLanguage = client.metaWhatsappTemplates?.language || 'ar';
    
    // إعداد مكونات النموذج - نفترض أن النموذج يحتوي على متغير واحد لنص الرسالة
    const components = [
      {
        type: 'body',
        parameters: [
          {
            type: 'text',
            text: msgContent
          }
        ]
      }
    ];
    
    // استخدام واجهة إرسال النماذج بدلاً من الرسائل النصية العادية
    const result = await MetaWhatsappService.sendTemplateMessage(
      formattedPhone, 
      templateName, 
      templateLanguage, 
      components
    );
    
    // تخزين معرف الرسالة الخارجي من Meta
    const externalMessageId = result.messages?.[0]?.id || null;
    
    // إذا كان هناك كائن رسالة موجود وتم طلب تحديثه
    if (message && updateSemMessage) {
      message.status = 'sent';
      message.sentAt = new Date();
      message.externalMessageId = externalMessageId;
      message.providerData = {
        provider: 'metaWhatsapp',
        lastUpdate: new Date(),
        templateName,
        templateLanguage,
        rawResponse: result
      };
      await message.save();
      logger.debug('messageController', 'تم تحديث الرسالة في جدول SemMessage', { 
        messageId: message._id,
        externalMessageId: message.externalMessageId 
      });
    } 
    // إذا لم يكن هناك كائن رسالة، إنشاء سجل جديد في SemMessages
    else if (!message) {
      const newMessage = new SemMessage({
        clientId: client._id,
        recipients: [formattedPhone],
        content: msgContent,
        status: 'sent',
        sentAt: new Date(),
        messageId: new mongoose.Types.ObjectId().toString(),
        externalMessageId: externalMessageId,
        providerData: {
          provider: 'metaWhatsapp',
          lastUpdate: new Date(),
          templateName,
          templateLanguage,
          rawResponse: result
        }
      });
      await newMessage.save();
      logger.debug('messageController', 'تم حفظ رسالة جديدة في جدول SemMessage', { 
        messageId: newMessage._id,
        externalMessageId: newMessage.externalMessageId 
      });
    }
    
    return {
      success: true,
      messageId: message ? message._id : null,
      externalMessageId: externalMessageId
    };
  } catch (error) {
    logger.error('messageController', 'خطأ في إرسال رسالة Meta واتساب', {
      error: error.message,
      stack: error.stack
    });
    
    if (message && updateSemMessage) {
      message.status = 'failed';
      message.errorMessage = error.message;
      await message.save();
    }
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * عملية إرسال الرسالة بالقنوات المتعددة (Fallback)
 * إذا كان العميل يمتلك قناتين (SMS وواتساب وميتا واتساب) يتم المحاولة بالقناة المفضلة أولاً، ثم استخدام البديلة في حال فشل الإرسال.
 */
async function processChannelFallback(message, client, formattedPhone, msgContent, preferredChannel) {
  let smsSent = false;
  let whatsappSent = false;
  let metaWhatsappSent = false;
  
  try {
    // الحصول على إعدادات المزودين
    const smsConfig = (await SmsSettings.getActiveSettings()).getProviderConfig();
    const whatsappConfig = (await WhatsappSettings.getActiveSettings()).getProviderConfig();
    
    // تحديد ترتيب القنوات بناءً على تفضيل العميل
    let channels = [];
    const canSendSms = client.messagingChannels?.sms !== false;
    const canSendWhatsapp = client.messagingChannels?.whatsapp === true;
    const canSendMetaWhatsapp = client.messagingChannels?.metaWhatsapp === true;
    
    // إضافة القنوات المتاحة حسب الترتيب المفضل
    if (preferredChannel === 'sms' && canSendSms) {
      channels.push('sms');
    } else if (preferredChannel === 'whatsapp' && canSendWhatsapp) {
      channels.push('whatsapp');
    } else if (preferredChannel === 'metaWhatsapp' && canSendMetaWhatsapp) {
      channels.push('metaWhatsapp');
    }
    
    // إضافة القنوات المتبقية بترتيب: ميتا واتساب، واتساب غير رسمي، SMS
    if (canSendMetaWhatsapp && !channels.includes('metaWhatsapp')) {
      channels.push('metaWhatsapp');
    }
    if (canSendWhatsapp && !channels.includes('whatsapp')) {
      channels.push('whatsapp');
    }
    if (canSendSms && !channels.includes('sms')) {
      channels.push('sms');
    }
    
    // إذا لم يتم تحديد أي قناة، استخدام SMS كقناة افتراضية
    if (channels.length === 0) {
      logger.warn('processChannelFallback', 'لم يتم تحديد أي قناة، استخدام SMS كقناة افتراضية');
      if (canSendSms) {
        channels.push('sms');
      }
    }
    
    // محاولة الإرسال عبر القنوات المتاحة بالترتيب
    for (const channel of channels) {
      logger.info('processChannelFallback', `محاولة الإرسال عبر قناة ${channel}`);
      
      if (channel === 'sms') {
        // محاولة الإرسال عبر SMS
        const smsResult = await sendSmsAndUpdate(message, client, formattedPhone, msgContent, smsConfig);
        if (smsResult) {
          smsSent = true;
          logger.info('processChannelFallback', 'تم إرسال رسالة SMS بنجاح');
          break;
        }
      } else if (channel === 'whatsapp') {
        // محاولة الإرسال عبر واتساب غير رسمي
        const whatsappResult = await sendWhatsappAndUpdate(message, client, formattedPhone, msgContent, whatsappConfig, true);
        if (whatsappResult.success) {
          whatsappSent = true;
          logger.info('processChannelFallback', 'تم إرسال رسالة واتساب بنجاح');
          break;
        }
      } else if (channel === 'metaWhatsapp') {
        // محاولة الإرسال عبر واتساب ميتا الرسمي
        const metaWhatsappResult = await sendMetaWhatsappAndUpdate(message, client, formattedPhone, msgContent, true);
        if (metaWhatsappResult.success) {
          metaWhatsappSent = true;
          logger.info('processChannelFallback', 'تم إرسال رسالة واتساب ميتا الرسمي بنجاح');
          break;
        }
      }
    }
    
    // تحديث رصيد العميل حسب نتيجة الإرسال
    if (smsSent || whatsappSent || metaWhatsappSent) {
      await updateClientBalance(client, smsSent, whatsappSent || metaWhatsappSent, msgContent);
    }
    return { smsSent, whatsappSent, metaWhatsappSent };
  } catch (error) {
    logger.error('خطأ أثناء عملية تحويل القنوات (Fallback)', { error: error.message, stack: error.stack });
    try {
      message.status = 'failed';
      message.errorMessage = `خطأ أثناء عملية التحويل: ${error.message}`;
      await message.save();
    } catch (e) {
      logger.error('خطأ أثناء حفظ سجل الرسالة الفاشلة', e);
    }
    return { smsSent, whatsappSent, metaWhatsappSent, error };
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
      // للأرقام الطويلة التي لا تبدأ بـ 0 ولا + (غالبًا أرقام دولية بدون + أو 00)
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
    const canSendMetaWhatsapp = client.messagingChannels?.metaWhatsapp === true;
    if (!canSendSms && !canSendWhatsapp && !canSendMetaWhatsapp) {
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
    const metaWhatsappInitialized = canSendMetaWhatsapp ? await _initializeMetaWhatsappManager() : false;
    
    if (!smsInitialized && !whatsappInitialized && !metaWhatsappInitialized) {
      logger.error('sendMessage', 'فشل في تهيئة أي من خدمات الرسائل');
      return res.status(500).send("6");
    }
    
    /* استراتيجية الإرسال */
    // أولاً: تحديد ما إذا كان لدينا قنوات متعددة تتطلب استراتيجية fallback
    const hasMultipleChannels = [canSendSms, canSendWhatsapp, canSendMetaWhatsapp].filter(Boolean).length > 1;
    
    // إرسال استجابة سريعة للعميل قبل المعالجة
    res.status(200).send("1");
    
    setImmediate(async () => {
      try {
        const preferredChannel = client.preferredChannel || 'none';
        
        // إنشاء سجل رسالة جديد
        const semMessage = new SemMessage({
          clientId: client._id,
          recipients: [formattedPhone],
          originalRecipients: [phone],
          content: msg,
          status: 'pending',
          messageId: new mongoose.Types.ObjectId().toString()
        });
        await semMessage.save();
        
        // إذا كان لدينا قنوات متعددة، استخدم استراتيجية تحويل القنوات (fallback)
        if (hasMultipleChannels) {
          logger.info(`استخدام استراتيجية تحويل القنوات للعميل ${client.name} مع القناة المفضلة: ${preferredChannel}`);
          await processChannelFallback(semMessage, client, formattedPhone, msg, preferredChannel);
        } 
        // إذا كان لدينا قناة واحدة فقط
        else {
          if (canSendSms && smsInitialized) {
            const smsConfig = (await SmsSettings.getActiveSettings()).getProviderConfig();
            const smsSuccess = await sendSmsAndUpdate(semMessage, client, formattedPhone, msg, smsConfig);
            if (smsSuccess) {
              logger.info(`تم إرسال SMS بنجاح للعميل ${client.name}`);
              await updateClientBalance(client, true, false, msg);
            }
          } else if (canSendWhatsapp && whatsappInitialized) {
            const whatsappConfig = (await WhatsappSettings.getActiveSettings()).getProviderConfig();
            const whatsappResult = await sendWhatsappAndUpdate(semMessage, client, formattedPhone, msg, whatsappConfig, true);
            if (whatsappResult.success) {
              logger.info(`تم إرسال واتساب بنجاح للعميل ${client.name}`);
              await updateClientBalance(client, false, true, msg);
            }
          } else if (canSendMetaWhatsapp && metaWhatsappInitialized) {
            const metaResult = await sendMetaWhatsappAndUpdate(semMessage, client, formattedPhone, msg, true);
            if (metaResult.success) {
              logger.info(`تم إرسال واتساب ميتا الرسمي بنجاح للعميل ${client.name}`);
              await updateClientBalance(client, false, true, msg);
            }
          }
        }
      } catch (error) {
        logger.error('خطأ أثناء إرسال الرسالة', {
          error: error.message,
          stack: error.stack
        });
      }
    });
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
