const WhatsappSettings = require('../models/WhatsappSettings');
const SmsManager = require('../services/sms/SmsManager');
const WhatsappStatusService = require('../services/whatsapp/WhatsappStatusService');
const logger = require('../services/loggerService');
const WhatsappMessage = require('../models/WhatsappMessage');

/**
 * عرض صفحة إعدادات الواتس أب
 */
exports.showWhatsappSettings = async (req, res) => {
    try {
        // الحصول على إعدادات الواتس أب الحالية
        const settings = await WhatsappSettings.getActiveSettings();
        
        let devicesList = [];
        let accountBalance = { success: false };
        
        // محاولة تهيئة مدير خدمة الرسائل
        const config = settings.getProviderConfig();
        await SmsManager.initialize(config);
        
        // الحصول على قائمة الأجهزة من مزود الخدمة
        if (settings.provider === 'semysms') {
            const devicesResult = await SmsManager.getDevices();
            if (devicesResult.success) {
                devicesList = devicesResult.devices || [];
            }
            
            // الحصول على رصيد الحساب
            accountBalance = await SmsManager.checkAccountBalance();
        }
        
        // تحميل إحصائيات الرسائل
        const pendingMessagesCount = await WhatsappMessage.countDocuments({ status: 'pending' });
        const sentMessagesCount = await WhatsappMessage.countDocuments({ status: 'sent' });
        const deliveredMessagesCount = await WhatsappMessage.countDocuments({ status: 'delivered' });
        const failedMessagesCount = await WhatsappMessage.countDocuments({ status: 'failed' });
        
        // إنشاء عنوان webhook
        const webhookUrl = `${req.protocol}://${req.get('host')}/api/whatsapp/webhook/status-update`;
        
        res.render('whatsapp_settings', {
            settings,
            devicesList,
            accountBalance,
            messageStats: {
                pending: pendingMessagesCount,
                sent: sentMessagesCount,
                delivered: deliveredMessagesCount,
                failed: failedMessagesCount,
                total: pendingMessagesCount + sentMessagesCount + deliveredMessagesCount + failedMessagesCount
            },
            webhookUrl,
            flashMessages: req.flash()
        });
    } catch (error) {
        logger.error('whatsappSettingsController', 'خطأ في عرض إعدادات الواتس أب', error);
        req.flash('error', 'حدث خطأ أثناء تحميل إعدادات الواتس أب');
        res.redirect('/settings');
    }
};

/**
 * حفظ إعدادات الواتس أب
 */
exports.saveWhatsappSettings = async (req, res) => {
    try {
        const { 
            provider, 
            semysms_token, 
            semysms_device,
            semysms_sent_webhook,
            semysms_delivered_webhook
        } = req.body;
        
        // تسجيل القيم قبل المعالجة
        logger.debug('whatsappSettingsController', 'قيم الإعدادات المستلمة', {
            provider,
            semysms_device,
            currentDeviceInSettings: (await WhatsappSettings.getActiveSettings()).config.semysms.device
        });
        
        // الحصول على الإعدادات الحالية
        let settings = await WhatsappSettings.getActiveSettings();
        
        // تحديث الإعدادات
        settings.provider = provider || 'semysms';
        settings.config.semysms.token = semysms_token || '';
        
        // تأكد من حفظ معرف الجهاز كسلسلة نصية
        settings.config.semysms.device = semysms_device ? String(semysms_device) : 'active';
        
        // تعيين إعدادات WebHook
        settings.config.semysms.enableSentWebhook = semysms_sent_webhook === 'on';
        settings.config.semysms.enableDeliveredWebhook = semysms_delivered_webhook === 'on';
        
        // حفظ رابط Webhook
        const webhookUrl = `${req.protocol}://${req.get('host')}/api/whatsapp/webhook/status-update`;
        settings.config.semysms.webhookUrl = webhookUrl;
        
        settings.updatedBy = req.session.userId;
        
        // حفظ الإعدادات
        await settings.save();
        
        // تسجيل القيم بعد الحفظ للتأكد من تطبيق التغييرات
        logger.info('whatsappSettingsController', 'تم حفظ إعدادات الواتس أب', {
            provider: settings.provider,
            deviceId: settings.config.semysms.device,
            updatedBy: req.session.userId
        });
        
        // التأكد من أن الإعدادات حُفظت بالفعل في قاعدة البيانات
        const updatedSettings = await WhatsappSettings.findById(settings._id);
        logger.debug('whatsappSettingsController', 'الإعدادات بعد الحفظ من قاعدة البيانات', {
            deviceIdAfterSave: updatedSettings.config.semysms.device
        });
        
        req.flash('success', 'تم حفظ إعدادات الواتس أب بنجاح');
        res.redirect('/admin/whatsapp-settings');
    } catch (error) {
        logger.error('whatsappSettingsController', 'خطأ في حفظ إعدادات الواتس أب', error);
        req.flash('error', 'حدث خطأ أثناء حفظ إعدادات الواتس أب');
        res.redirect('/admin/whatsapp-settings');
    }
};

/**
 * تحديث حالة الرسائل المعلقة من صفحة الإعدادات
 */
exports.updatePendingMessages = async (req, res) => {
    try {
        // تهيئة مدير خدمة الرسائل
        const settings = await WhatsappSettings.getActiveSettings();
        const config = settings.getProviderConfig();
        await SmsManager.initialize(config);
        
        // تحديث حالة الرسائل المعلقة
        const result = await WhatsappStatusService.updatePendingMessagesStatus();
        
        if (result.success) {
            req.flash('success', `تم تحديث ${result.updated} رسالة من أصل ${result.total} رسالة معلقة`);
        } else {
            req.flash('error', `فشل في تحديث حالة الرسائل: ${result.error}`);
        }
        
        res.redirect('/admin/whatsapp-settings');
    } catch (error) {
        logger.error('whatsappSettingsController', 'خطأ في تحديث حالة الرسائل المعلقة', error);
        req.flash('error', 'حدث خطأ أثناء تحديث حالة الرسائل المعلقة');
        res.redirect('/admin/whatsapp-settings');
    }
};

/**
 * عرض صفحة مراقبة رسائل الواتس أب
 */
exports.showWhatsappMonitor = async (req, res) => {
    try {
        // الحصول على إحصائيات الرسائل
        const pendingCount = await WhatsappMessage.countDocuments({ status: 'pending' });
        const sentCount = await WhatsappMessage.countDocuments({ status: 'sent' });
        const deliveredCount = await WhatsappMessage.countDocuments({ status: 'delivered' });
        const failedCount = await WhatsappMessage.countDocuments({ status: 'failed' });
        const totalCount = pendingCount + sentCount + deliveredCount + failedCount;
        
        // الحصول على آخر 10 رسائل
        const recentMessages = await WhatsappMessage
            .find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('clientId', 'name email');
        
        // تهيئة مدير خدمة الرسائل
        const settings = await WhatsappSettings.getActiveSettings();
        const config = settings.getProviderConfig();
        await SmsManager.initialize(config);
        
        // الحصول على رصيد الحساب
        const accountBalance = await SmsManager.checkAccountBalance();
        
        res.render('whatsapp_monitor', {
            messageStats: {
                pending: pendingCount,
                sent: sentCount,
                delivered: deliveredCount,
                failed: failedCount,
                total: totalCount
            },
            recentMessages,
            accountBalance,
            settings,
            flashMessages: req.flash()
        });
    } catch (error) {
        logger.error('whatsappSettingsController', 'خطأ في عرض صفحة مراقبة رسائل الواتس أب', error);
        req.flash('error', 'حدث خطأ أثناء تحميل صفحة مراقبة رسائل الواتس أب');
        res.redirect('/');
    }
};
