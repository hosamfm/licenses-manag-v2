const express = require('express');
const router = express.Router();
const { isAuthenticated, checkRole } = require('../middleware/authMiddleware');
const Feature = require('../models/Feature');
const Supplier = require('../models/Supplier');
const SystemSettings = require('../models/SystemSettings');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const telegramService = require('../services/telegramService');
const smsSettingsController = require('../controllers/smsSettingsController');
const smsWebhookController = require('../controllers/smsWebhookController');
const whatsappSettingsController = require('../controllers/whatsappSettingsController');
const whatsappWebhookController = require('../controllers/whatsappWebhookController');
const AISettings = require('../models/ai-settings');

function handleError(req, res, error, message, redirectPath) {
  console.error(message, error.message, error.stack);
  req.flash('error', message);
  res.status(500).redirect(redirectPath);
}

router.get('/settings', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
  try {
    const features = await Feature.find();
    const suppliers = await Supplier.find().populate('users');
    const systemSettings = await SystemSettings.findOne();
    const users = await User.find({ user_role: 'supplier' });

    res.render('system_settings', {
      features,
      suppliers,
      crystalSupplier: systemSettings ? systemSettings.crystalSupplier : null,
      sirajSupplier: systemSettings ? systemSettings.sirajSupplier : null,
      systemSettings,
      users,
      flashMessages: req.flash()
    });
  } catch (error) {
    handleError(req, res, error, 'Error fetching settings data.', '/');
  }
});

router.post('/settings/suppliers/:id/edit', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
  try {
    const { id } = req.params;
    let { name, chatId, users } = req.body;

    // تحويل المصفوفة من JSON إلى Array
    users = JSON.parse(users);

    // التأكد من تحويل كل عنصر في المصفوفة إلى ObjectId باستخدام 'new'
    users = users.map(user => new mongoose.Types.ObjectId(user));

    await Supplier.findByIdAndUpdate(id, { name, chatId, users });

    req.flash('success', 'تم تحديث المورد بنجاح.');
    res.redirect('/settings');
  } catch (error) {
    handleError(req, res, error, 'فشل في تحديث المورد.', '/settings');
  }
});

router.post('/settings/suppliers/add', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
  try {
    let { new_name, new_chatId, new_userId } = req.body;

    // تحويل المصفوفة من JSON إلى Array
    new_userId = JSON.parse(new_userId);

    // التأكد من تحويل كل عنصر في المصفوفة إلى ObjectId باستخدام 'new'
    new_userId = new_userId.map(user => new mongoose.Types.ObjectId(user));

    await Supplier.create({ name: new_name, chatId: new_chatId, users: new_userId });

    req.flash('success', 'تم إضافة المورد بنجاح.');
    res.redirect('/settings');
  } catch (error) {
    handleError(req, res, error, 'فشل في إضافة المورد.', '/settings');
  }
});

// Delete supplier route
router.post('/settings/suppliers/:id/delete', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
  try {
    const { id } = req.params;
    await Supplier.findByIdAndDelete(id);
    req.flash('success', 'Supplier deleted successfully.');
    res.redirect('/settings');
  } catch (error) {
    handleError(req, res, error, 'Failed to delete supplier.', '/settings');
  }
});

// Save Crystal system supplier route
router.post('/settings/save-crystal-supplier', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
  try {
    const { crystal_supplier } = req.body;
    let systemSettings = await SystemSettings.findOne();
    if (!systemSettings) {
      systemSettings = new SystemSettings();
    }
    systemSettings.crystalSupplier = crystal_supplier;
    await systemSettings.save();
    req.flash('success', 'Crystal system supplier saved successfully.');
    res.redirect('/settings');
  } catch (error) {
    handleError(req, res, error, 'Failed to save Crystal system supplier.', '/settings');
  }
});

// Save Siraj system supplier route
router.post('/settings/save-siraj-supplier', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
  try {
    const { siraj_supplier } = req.body;
    let systemSettings = await SystemSettings.findOne();
    if (!systemSettings) {
      systemSettings = new SystemSettings();
    }
    systemSettings.sirajSupplier = siraj_supplier;
    await systemSettings.save();
    req.flash('success', 'Siraj system supplier saved successfully.');
    res.redirect('/settings');
  } catch (error) {
    handleError(req, res, error, 'Failed to save Siraj system supplier.', '/settings');
  }
});

// Save TELEGRAM_BOT_TOKEN route
router.post('/settings/save-telegram-bot-token', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
  try {
    const { new_telegram_bot_token } = req.body;
    if (!new_telegram_bot_token) {
      req.flash('error', 'TELEGRAM_BOT_TOKEN cannot be empty.');
      return res.redirect('/settings');
    }

    // Add a simple validation for TELEGRAM_BOT_TOKEN
    if (!/^(\d{9,10}:.*)$/.test(new_telegram_bot_token)) {
      req.flash('error', 'Invalid TELEGRAM_BOT_TOKEN format.');
      return res.redirect('/settings');
    }

    const envPath = path.resolve(__dirname, '../.env');
    const envConfig = fs.readFileSync(envPath, 'utf8').split('\n');
    const updatedEnvConfig = envConfig.map(line => {
      if (line.startsWith('TELEGRAM_BOT_TOKEN=')) {
        return `TELEGRAM_BOT_TOKEN=${new_telegram_bot_token}`;
      }
      return line;
    }).join('\n');
    fs.writeFileSync(envPath, updatedEnvConfig, 'utf8');

    // Reload environment variables
    require('dotenv').config({ path: envPath });

    // Reinitialize the Telegram bot with the new token
    if (global.bot) {
      global.bot.stopPolling()
        .then(() => {
          console.log('Stopped existing bot polling instances.');
          global.bot = new TelegramBot(new_telegram_bot_token, { polling: true });
          telegramService.setupResponseListener(global.bot);
          console.log('Telegram bot polling started successfully with new token.');
        })
        .catch((error) => {
          console.error('Error stopping existing bot polling instances:', error.message, error.stack);
        });
    } else {
      global.bot = new TelegramBot(new_telegram_bot_token, { polling: true });
      telegramService.setupResponseListener(global.bot);
      console.log('Telegram bot polling started successfully with new token.');
    }

    req.flash('success', 'TELEGRAM_BOT_TOKEN saved and bot reinitialized successfully.');
    res.redirect('/settings');
  } catch (error) {
    handleError(req, res, error, 'Failed to save TELEGRAM_BOT_TOKEN.', '/settings');
  }
});

// مسارات خدمة الرسائل القصيرة SMS
router.get('/admin/sms-settings', [isAuthenticated, checkRole(['admin'])], smsSettingsController.showSmsSettings);
router.post('/admin/sms-settings/save', [isAuthenticated, checkRole(['admin'])], smsSettingsController.saveSmsSettings);
router.post('/admin/sms-settings/update-pending', [isAuthenticated, checkRole(['admin'])], smsSettingsController.updatePendingMessages);
router.get('/admin/sms-monitor', [isAuthenticated, checkRole(['admin'])], smsSettingsController.showSmsMonitor);

// مسار webhook لاستقبال تحديثات حالة الرسائل من مزود الخدمة - لا يتطلب مصادقة
router.post('/api/sms/webhook/status-update', smsWebhookController.handleStatusUpdate);

// مسارات خدمة الواتس أب
router.get('/admin/whatsapp-settings', [isAuthenticated, checkRole(['admin'])], whatsappSettingsController.showWhatsappSettings);
router.post('/admin/whatsapp-settings/save', [isAuthenticated, checkRole(['admin'])], whatsappSettingsController.saveWhatsappSettings);
router.post('/admin/whatsapp-settings/update-pending', [isAuthenticated, checkRole(['admin'])], whatsappSettingsController.updatePendingMessages);
router.get('/admin/whatsapp-monitor', [isAuthenticated, checkRole(['admin'])], whatsappSettingsController.showWhatsappMonitor);

// مسار webhook لاستقبال تحديثات حالة رسائل الواتس أب من مزود الخدمة - لا يتطلب مصادقة
router.post('/api/whatsapp/webhook/status-update', whatsappWebhookController.handleStatusUpdate);

// مسار webhook لاستقبال الرسائل الواردة من الواتس أب - لا يتطلب مصادقة
router.post('/api/whatsapp/webhook/incoming-message', whatsappWebhookController.handleIncomingMessage);

// مسار حفظ إعدادات مساعد الذكاء الاصطناعي
router.post('/settings/ai-assistant-settings', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
  try {
    const { aiAssistantEnabled, autoAssignAI } = req.body;
    
    // الحصول على إعدادات النظام أو إنشاء كائن جديد إذا لم تكن موجودة
    let systemSettings = await SystemSettings.findOne();
    if (!systemSettings) {
      systemSettings = new SystemSettings();
    }
    
    // تحديث إعدادات الذكاء الاصطناعي
    systemSettings.aiAssistantEnabled = !!aiAssistantEnabled; // تحويل القيمة إلى boolean
    systemSettings.autoAssignAI = !!autoAssignAI; // تحويل القيمة إلى boolean
    await systemSettings.save();
    
    req.flash('success', 'تم حفظ إعدادات مساعد الذكاء الاصطناعي بنجاح');
    res.redirect('/settings');
  } catch (error) {
    handleError(req, res, error, 'حدث خطأ أثناء حفظ إعدادات مساعد الذكاء الاصطناعي.', '/settings');
  }
});

// مسار صفحة إعدادات الذكاء الاصطناعي المفصلة
router.get('/settings/ai-settings', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
  try {
    // الحصول على إعدادات الذكاء الاصطناعي
    const aiSettings = await AISettings.getSettings();
    
    res.render('ai_settings', {
      aiSettings,
      session: req.session,
      flashMessages: req.flash()
    });
  } catch (error) {
    handleError(req, res, error, 'حدث خطأ أثناء تحميل إعدادات الذكاء الاصطناعي.', '/settings');
  }
});

// مسار حفظ إعدادات الذكاء الاصطناعي المفصلة
router.post('/settings/ai-detailed-settings', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
  try {
    // استخراج البيانات من النموذج
    const {
      apiKey,
      apiEndpoint,
      model,
      enableVisionSupport,
      enableAudioSupport,
      audioToTextModel,
      textToSpeechModel,
      temperature,
      maxTokens,
      topP,
      presencePenalty,
      frequencyPenalty,
      conversationHistoryLimit,
      previousConversationsLimit,
      transferKeywords,
      systemInstructions,
      seed,
      responseFormat,
      userIdentifier,
      stream
    } = req.body;
    
    // الحصول على إعدادات الذكاء الاصطناعي أو إنشاء كائن جديد إذا لم تكن موجودة
    let aiSettings = await AISettings.findOne();
    if (!aiSettings) {
      aiSettings = new AISettings();
    }
    
    // تحديث إعدادات API
    aiSettings.apiKey = apiKey;
    aiSettings.apiEndpoint = apiEndpoint;
    aiSettings.model = model;
    
    // تحديث إعدادات الوسائط المتعددة
    aiSettings.enableVisionSupport = !!enableVisionSupport; // تحويل إلى boolean
    aiSettings.enableAudioSupport = !!enableAudioSupport; // تحويل إلى boolean
    aiSettings.audioToTextModel = audioToTextModel;
    aiSettings.textToSpeechModel = textToSpeechModel;
    
    // تحديث إعدادات الجودة
    aiSettings.temperature = Math.min(Math.max(parseFloat(temperature), 0), 2);
    aiSettings.maxTokens = Math.min(Math.max(parseInt(maxTokens), 100), 4000);
    aiSettings.topP = Math.min(Math.max(parseFloat(topP), 0), 1);
    aiSettings.presencePenalty = Math.min(Math.max(parseFloat(presencePenalty), -2), 2);
    aiSettings.frequencyPenalty = Math.min(Math.max(parseFloat(frequencyPenalty), -2), 2);
    
    // تحديث إعدادات السياق والتاريخ
    aiSettings.conversationHistoryLimit = Math.min(Math.max(parseInt(conversationHistoryLimit), 5), 50);
    aiSettings.previousConversationsLimit = Math.min(Math.max(parseInt(previousConversationsLimit), 0), 10);
    
    // تحديث كلمات التحويل (تقسيم النص إلى مصفوفة بالأسطر)
    aiSettings.transferKeywords = transferKeywords
      .split('\n')
      .map(keyword => keyword.trim())
      .filter(keyword => keyword.length > 0);
    
    // تحديث تعليمات النظام
    aiSettings.systemInstructions = systemInstructions;
    
    // تحديث الإعدادات الجديدة
    // تحديث بذرة العشوائية
    aiSettings.seed = seed && seed.trim() !== '' ? parseInt(seed) : null;
    
    // تحديث تنسيق الاستجابة
    aiSettings.responseFormat = responseFormat && responseFormat !== '' ? responseFormat : null;
    
    // تحديث معرّف المستخدم
    aiSettings.userIdentifier = userIdentifier && userIdentifier.trim() !== '' ? userIdentifier : null;
    
    // تحديث خيار التدفق
    aiSettings.stream = !!stream; // تحويل إلى boolean
    
    // تحديث مستخدم التحديث
    aiSettings.updatedBy = req.session.userId;
    
    // حفظ الإعدادات
    await aiSettings.save();
    
    // إعادة تهيئة خدمة الذكاء الاصطناعي
    // هذا يتطلب استدعاء خدمة الذكاء الاصطناعي وإعادة تحميل إعداداتها
    const chatGptService = require('../services/chatGptService');
    await chatGptService.loadSettings();
    
    req.flash('success', 'تم حفظ إعدادات الذكاء الاصطناعي المفصلة بنجاح');
    res.redirect('/settings/ai-settings');
  } catch (error) {
    handleError(req, res, error, 'حدث خطأ أثناء حفظ إعدادات الذكاء الاصطناعي المفصلة.', '/settings/ai-settings');
  }
});

// مسار إعادة تعيين إعدادات الذكاء الاصطناعي إلى القيم الافتراضية
router.get('/settings/ai-settings-reset', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
  try {
    // حذف الإعدادات الحالية
    await AISettings.deleteOne({});
    
    // ستقوم الدالة getSettings() بإنشاء إعدادات جديدة بالقيم الافتراضية
    await AISettings.getSettings();
    
    // إعادة تهيئة خدمة الذكاء الاصطناعي
    const chatGptService = require('../services/chatGptService');
    await chatGptService.loadSettings();
    
    req.flash('success', 'تم إعادة تعيين إعدادات الذكاء الاصطناعي إلى القيم الافتراضية بنجاح');
    res.redirect('/settings/ai-settings');
  } catch (error) {
    handleError(req, res, error, 'حدث خطأ أثناء إعادة تعيين إعدادات الذكاء الاصطناعي.', '/settings/ai-settings');
  }
});

module.exports = router;
