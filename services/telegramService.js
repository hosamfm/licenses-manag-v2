const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');
const License = require('../models/License');
const LicenseRequest = require('../models/LicenseRequest');
const User = require('../models/User');
const Supplier = require('../models/Supplier');
const SystemSettings = require('../models/SystemSettings');
const TelegramMessage = require('../models/TelegramMessage'); // استيراد الموديل الجديد
const fs = require('fs');
const path = require('path');

dotenv.config();

let bot;

const createMessageString = (licenseRequest) => {
  const {
    licenseeName,
    registrationCode,
    featuresCode,
    expirationDate,
    reason,
    requestType,
    oldFeaturesCode,
    newRegistrationCode,
    oldRegistrationCode,
    baseRegistrationCode
  } = licenseRequest;

  const regCode = registrationCode || newRegistrationCode;

  if (!regCode) {
    throw new Error('registrationCode غير محدد');
  }

  const product = regCode.startsWith('X') ? 'نظام الكريستال' : 'نظام سراج';

  let baseInfo = `نوع الطلب: ${requestType}\nالمنتج: ${product}\n------------------\nمرخص لـ: ${licenseeName}\nرمز التسجيل: ${regCode}\nرمز الميزات: ${featuresCode}\n`;

  // تنسيق التاريخ بالأرقام الإنجليزية
  const formatExpirationDate = (date) => {
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0'); // January is 0
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const formattedExpirationDate = expirationDate ? formatExpirationDate(expirationDate) : 'N/A';

  let additionalInfo = '';
  switch (requestType) {
    case 'New License':
      additionalInfo = '';
      break;
    case 'Additional License':
      additionalInfo = `رمز التسجيل الأساسي: ${baseRegistrationCode || 'N/A'}\n`;
      break;
    case 'Free License':
      additionalInfo = `السبب: ${reason}\n`;
      break;
    case 'Temporary License':
      additionalInfo = `تاريخ الانتهاء: ${formattedExpirationDate}\nالسبب: ${reason}\n`;
      break;
    case 'Additional Feature Request':
      additionalInfo = `رمز الميزات القديم: ${oldFeaturesCode || 'N/A'}\n`;
      break;
    case 'Re-License':
      additionalInfo = `رمز التسجيل القديم: ${oldRegistrationCode || 'N/A'}\nالسبب: ${reason}\n`;
      break;
    default:
      additionalInfo = '';
  }

  return `${baseInfo}------------------\n${additionalInfo}------------------`;
};

const logMessage = async (msg, direction = 'received') => {
  try {
    if (!msg.text) {
      console.log('الرسالة المستلمة لا تحتوي على نص.');
      return; // تجاهل الرسائل التي لا تحتوي على نص
    }

    const newMessage = new TelegramMessage({
      chatId: msg.chat.id,
      username: msg.from.username,
      firstName: msg.from.first_name,
      lastName: msg.from.last_name,
      message: msg.text,
      direction: direction // تعيين اتجاه الرسالة
    });
    await newMessage.save();
    console.log('تم تسجيل الرسالة في قاعدة البيانات بنجاح.');
  } catch (error) {
    console.error('خطأ في تسجيل الرسالة في قاعدة البيانات:', error.message, error.stack);
  }
};

const sendMessage = async (chatId, message) => {
  try {
    await bot.sendMessage(chatId, message);
    // تسجيل الرسالة المرسلة في قاعدة البيانات
    await logMessage({ chat: { id: chatId }, text: message, from: {} }, 'sent');
  } catch (error) {
    console.error('خطأ في إرسال الرسالة إلى تليجرام:', error.message, error.stack);
  }
};

const getSupplierByRegistrationCode = async (registrationCode) => {
  const systemSettings = await SystemSettings.findOne();
  if (!systemSettings) {
    throw new Error('لم يتم العثور على إعدادات النظام');
  }

  const supplierId = registrationCode.startsWith('X') ? systemSettings.crystalSupplier : systemSettings.sirajSupplier;
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) {
    throw new Error('لم يتم العثور على مورد للرمز المحدد');
  }

  return supplier;
};

const isSupplier = async (chatId) => {
  const supplier = await Supplier.findOne({ chatId });
  return supplier !== null;
};

const sendLicenseRequest = async (licenseRequest) => {
  try {
    const regCode = licenseRequest.registrationCode || licenseRequest.newRegistrationCode;
    if (!regCode) {
      throw new Error('registrationCode غير محدد في طلب الترخيص');
    }
    licenseRequest.registrationCode = regCode; // Ensure registrationCode is always present

    const message = createMessageString(licenseRequest);
    if (!message) {
      throw new Error('الرسالة التي تم إنشاؤها فارغة');
    }

    const supplier = await getSupplierByRegistrationCode(regCode);
    await sendMessage(supplier.chatId, message);

    console.log(`Trying to update license request with ID: ${licenseRequest._id} to include supplier ID: ${supplier._id}`);

    // تحديث طلب الترخيص مع معرف المورد
    const updatedRequest = await LicenseRequest.findByIdAndUpdate(
      licenseRequest._id,
      { supplierId: supplier._id },
      { new: true }
    );

    if (!updatedRequest) {
      throw new Error('لم يتم العثور على طلب الترخيص لتحديثه.');
    }

    console.log(`License request updated successfully with supplier ID: ${supplier._id}`);
    console.log('تم إرسال طلب الترخيص إلى تليجرام بنجاح وتم تحديث معرف المورد.');

    // جلب معلومات المستخدم
    const user = await User.findById(licenseRequest.userId);
    const fullName = user ? user.full_name : 'غير معروف';

    // إخطار المستخدم admin
    const admin = await User.findOne({ username: 'admin' });
    if (admin && admin.telegram_chat_id) {
      const adminMessage = `تم إرسال طلب الترخيص بواسطة ${fullName} لرمز التسجيل ${regCode} مع كود الميزات ${licenseRequest.featuresCode} إلى المورد ${supplier.name}.`;
      await sendMessage(admin.telegram_chat_id, adminMessage);
    }
  } catch (error) {
    console.error('خطأ في إرسال الرسالة إلى تليجرام:', error.message, error.stack);
  }
};

const processLicenseData = async (licenseeName, serialNumber, registrationCode, activationCode, featuresCode, expirationDate, chatId) => {
  try {
    const supplier = await getSupplierByRegistrationCode(registrationCode);

    const latestRequest = await LicenseRequest.findOne({ registrationCode }).sort({ createdAt: -1 }).populate('userId');
    if (!latestRequest) {
      throw new Error('لم يتم العثور على طلب ترخيص مطابق.');
    }

    const license = new License({
      licenseeName,
      serialNumber,
      registrationCode,
      activationCode,
      featuresCode,
      expirationDate,
      supplierName: supplier.name,
      supplierId: supplier._id // إضافة معرف المورد
    });
    await license.save();

    // Ensure latestRequest is updated with the finalLicense ID
    latestRequest.finalLicense = license._id;
    latestRequest.status = 'Approved';
    latestRequest.licenseDataCreatedAt = new Date();
    latestRequest.expirationDate = expirationDate;
    await latestRequest.save();

    const user = await User.findById(latestRequest.userId);
    if (!user) {
      throw new Error('لم يتم العثور على مستخدم مطابق لطلب الترخيص هذا.');
    }

    const userMessage = `تمت الموافقة على طلب الترخيص الخاص بك.\n\nاسم المرخص له: ${licenseeName}\nالرقم التسلسلي: ${serialNumber}\nرمز التسجيل: ${registrationCode}\nرمز التفعيل: ${activationCode}\nرمز الميزات: ${featuresCode}\nتاريخ الانتهاء: ${expirationDate || 'N/A'}`;
    await sendMessage(user.telegram_chat_id, userMessage);

    const supplierMessage = `تمت معالجة بيانات الترخيص للرمز ${registrationCode} وتم إرسالها إلى المستخدم.`;
    await sendMessage(supplier.chatId, supplierMessage);

    console.log('تمت معالجة بيانات الترخيص وإرسال الرسائل بنجاح.');

    // إخطار المستخدم admin
    const admin = await User.findOne({ username: 'admin' });
    if (admin && admin.telegram_chat_id) {
      const adminMessage = `قام المورد ${supplier.name} بإرسال رد على طلب الترخيص لرمز التسجيل ${registrationCode}.`;
      await sendMessage(admin.telegram_chat_id, adminMessage);
    }
  } catch (error) {
    console.error('Error processing license data:', error.message, error.stack);
    await sendMessage(chatId, `لم نتمكن من معالجة طلب الترخيص بسبب: ${error.message}. يرجى التحقق من البيانات والمحاولة مرة أخرى.`);
  }
};

const notifyUserOfDeletion = async (userId, registrationCode) => {
  const message = `تم حذف طلب الترخيص لكود التسجيل التالي:\n${registrationCode}`;
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('لم يتم العثور على المستخدم.');
    }
    if (!user.telegram_chat_id) {
      throw new Error('لا يوجد معرف دردشة تليجرام للمستخدم.');
    }
    await sendMessage(user.telegram_chat_id, message);
  } catch (error) {
    console.error('خطأ في إرسال رسالة الحذف إلى تليجرام:', error.message, error.stack);
  }
};

const notifySupplierOfDeletion = async (registrationCode) => {
  const message = `تم حذف طلب الترخيص لكود التسجيل التالي:\n${registrationCode}`;
  try {
    const supplier = await getSupplierByRegistrationCode(registrationCode);
    if (!supplier) {
      throw new Error('لم يتم العثور على المورد.');
    }
    await sendMessage(supplier.chatId, message);
  } catch (error) {
    console.error('خطأ في إرسال رسالة الحذف إلى المورد:', error.message, error.stack);
  }
};

const handleUserVerification = async (tempCode, chatId) => {
  try {
    const user = await User.findOne({ temp_code: tempCode });
    if (user) {
      user.account_status = 'active';
      user.temp_code = undefined;
      user.telegram_chat_id = chatId;
      await user.save();
      await sendMessage(chatId, 'تم التحقق من حسابك بنجاح.');
    } else {
      await sendMessage(chatId, 'رمز غير صالح. حاول مرة أخرى.');
    }
  } catch (error) {
    console.error('Error verifying account:', error.message, error.stack);
  }
};

const parseLicenseMessage = (lines) => {
  const [licenseeName, serialNumber, registrationCode, activationCode, featuresCode, expirationDate] = lines.map(line => line.trim());
  return { licenseeName, serialNumber, registrationCode, activationCode, featuresCode, expirationDate: lines.length === 6 ? expirationDate : null };
};

const setupResponseListener = () => {
  try {
    bot.on('message', async (msg) => {
      if (!msg.text) {
        console.log('تم استلام رسالة بدون نص.');
        return; // تجاهل الرسائل التي لا تحتوي على نص
      }

      await logMessage(msg); // تخزين الرسالة المستلمة في قاعدة البيانات

      console.log(`تم استلام رسالة من معرف الدردشة ${msg.chat.id}: ${msg.text}`);
      const lines = msg.text.trim().split('\n');

      if (msg.text.trim() === '/start') {
        await sendMessage(
          msg.chat.id,
          'مرحبًا بنظام إصدار التراخيص. إذا كنت قد سجلت حسابك لدينا من فضلك اكتب كود التفعيل لنقوم بتفعيل حسابك. وإذا كنت بحاجة إلى المساعدة لا تتردد في الاتصال بفريق الدعم الفني.'
        );
        return;
      }

      if (lines.length === 1 && /^\d{4}$/.test(lines[0])) {
        await handleUserVerification(lines[0], msg.chat.id);
        return;
      }

      const supplier = await isSupplier(msg.chat.id);
      
      if (!supplier) {
        await sendMessage(msg.chat.id, 'لا يمكننا معالجة رسالتك. يرجى التواصل مع شركة التراسل لتكنولوجيا المعلومات على الرقم +218914567777 أو +218924567777، أو مراسلتنا عبر واتساب على الرابط التالي: https://wa.me/+218914567777');
        console.log(`تم استلام رسالة من مرسل غير معروف من معرف الدردشة ${msg.chat.id}: ${msg.text}`);
        return;
      }

      if ((lines.length === 5 || lines.length === 6)) {
        try {
          const { licenseeName, serialNumber, registrationCode, activationCode, featuresCode, expirationDate } = parseLicenseMessage(lines);
          await processLicenseData(licenseeName, serialNumber, registrationCode, activationCode, featuresCode, expirationDate, msg.chat.id);
        } catch (error) {
          await sendMessage(msg.chat.id, 'خطأ في معالجة بيانات الترخيص. يرجى التأكد من صحة البيانات والمحاولة مرة أخرى.');
          console.error(`Error processing license data for message: ${msg.text}`, error.message, error.stack);
        }
      } else {
        await sendMessage(msg.chat.id, 'صيغة الرسالة غير معروفة. يرجى التأكد من أن رسالتك تتبع الصيغة الصحيحة:\n\nاسم المرخص له\nالرقم التسلسلي\nرمز التسجيل\nرمز التفعيل\nرمز الميزات\nتاريخ الانتهاء (اختياري)\n\nإذا كنت بحاجة إلى المساعدة، يرجى الاتصال بالدعم.');
        console.log(`تم استلام رسالة بصيغة غير معروفة من معرف الدردشة ${msg.chat.id}: ${msg.text}`);
      }
    });
  } catch (error) {
    console.error('خطأ في إعداد مستمع بوت تليجرام:', error.message, error.stack);
  }
};

const startTelegramBot = () => {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('متغير البيئة TELEGRAM_BOT_TOKEN غير محدد.');
  }

  bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
  setupResponseListener();
  console.log('تم بدء بوت تليجرام بنجاح.');
};

const sendPhoto = async (chatId, photoPath) => {
  try {
      await bot.sendPhoto(chatId, photoPath);
      console.log('تم إرسال صورة الباركود إلى تليجرام بنجاح.');
  } catch (error) {
      console.error('خطأ في إرسال صورة الباركود إلى تليجرام:', error.message, error.stack);
  }
};

module.exports = {
  startTelegramBot,
  sendLicenseRequest,
  sendMessage,  // إرسال الرسائل النصية
  sendPhoto,    // إرسال الصور
  notifyUserOfDeletion,
  notifySupplierOfDeletion
};
