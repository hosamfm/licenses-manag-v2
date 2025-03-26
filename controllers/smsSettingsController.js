const SmsSettings = require('../models/SmsSettings');
const SmsManager = require('../services/sms/SmsManager');
const SmsStatusService = require('../services/sms/SmsStatusService');
const logger = require('../services/loggerService');

/**
 * عرض صفحة إعدادات SMS
 */
exports.showSmsSettings = async (req, res) => {
    try {
        // الحصول على إعدادات SMS الحالية
        const settings = await SmsSettings.getActiveSettings();
        
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
        const pendingMessagesCount = await require('../models/SemMessage').countDocuments({ status: 'pending' });
        const sentMessagesCount = await require('../models/SemMessage').countDocuments({ status: 'sent' });
        const failedMessagesCount = await require('../models/SemMessage').countDocuments({ status: 'failed' });
        
        // إنشاء عنوان webhook
        const webhookUrl = `${req.protocol}://${req.get('host')}/api/sms/webhook/status-update`;
        
        res.render('sms_settings', {
            settings,
            devicesList,
            accountBalance,
            messageStats: {
                pending: pendingMessagesCount,
                sent: sentMessagesCount,
                failed: failedMessagesCount,
                total: pendingMessagesCount + sentMessagesCount + failedMessagesCount
            },
            webhookUrl,
            flashMessages: req.flash()
        });
    } catch (error) {
        logger.error('smsSettingsController', 'خطأ في عرض إعدادات SMS', error);
        req.flash('error', 'حدث خطأ أثناء تحميل إعدادات SMS');
        res.redirect('/settings');
    }
};

/**
 * حفظ إعدادات SMS
 */
exports.saveSmsSettings = async (req, res) => {
    try {
        const { 
            provider, 
            semysms_token, 
            semysms_device,
            semysms_sent_webhook,
            semysms_delivered_webhook,
            semysms_add_plus
        } = req.body;
        
        // تسجيل القيم قبل المعالجة
        logger.debug('smsSettingsController', 'قيم الإعدادات المستلمة', {
            provider,
            semysms_device,
            currentDeviceInSettings: (await SmsSettings.getActiveSettings()).config.semysms.device
        });
        
        // الحصول على الإعدادات الحالية
        let settings = await SmsSettings.getActiveSettings();
        
        // تحديث الإعدادات
        settings.provider = provider || 'semysms';
        settings.config.semysms.token = semysms_token || '';
        
        // تأكد من حفظ معرف الجهاز كسلسلة نصية
        settings.config.semysms.device = semysms_device ? String(semysms_device) : 'active';
        
        // تعيين إعدادات WebHook
        settings.config.semysms.enableSentWebhook = semysms_sent_webhook === 'on';
        settings.config.semysms.enableDeliveredWebhook = semysms_delivered_webhook === 'on';
        
        // تعيين إعدادات إضافة علامة + قبل الأرقام
        settings.config.semysms.addPlusPrefix = semysms_add_plus === 'on';
        
        // حفظ رابط Webhook
        const webhookUrl = `${req.protocol}://${req.get('host')}/api/sms/webhook/status-update`;
        settings.config.semysms.webhookUrl = webhookUrl;
        
        settings.updatedBy = req.session.userId;
        
        // حفظ الإعدادات
        await settings.save();
        
        // تسجيل القيم بعد الحفظ للتأكد من تطبيق التغييرات
        logger.info('smsSettingsController', 'تم حفظ إعدادات SMS', {
            provider: settings.provider,
            deviceId: settings.config.semysms.device,
            updatedBy: req.session.userId
        });
        
        // التأكد من أن الإعدادات حُفظت بالفعل في قاعدة البيانات
        const updatedSettings = await SmsSettings.findById(settings._id);
        logger.debug('smsSettingsController', 'الإعدادات بعد الحفظ من قاعدة البيانات', {
            deviceIdAfterSave: updatedSettings.config.semysms.device
        });
        
        req.flash('success', 'تم حفظ إعدادات SMS بنجاح');
        res.redirect('/admin/sms-settings');
    } catch (error) {
        logger.error('smsSettingsController', 'خطأ في حفظ إعدادات SMS', error);
        req.flash('error', 'حدث خطأ أثناء حفظ إعدادات SMS');
        res.redirect('/admin/sms-settings');
    }
};

/**
 * تحديث حالة الرسائل المعلقة من صفحة الإعدادات
 */
exports.updatePendingMessages = async (req, res) => {
    try {
        // تهيئة مدير خدمة الرسائل
        const settings = await SmsSettings.getActiveSettings();
        const config = settings.getProviderConfig();
        await SmsManager.initialize(config);
        
        // تحديث حالة الرسائل المعلقة
        const result = await SmsStatusService.updatePendingMessagesStatus();
        
        if (result.success) {
            req.flash('success', `تم تحديث ${result.updated} رسالة من أصل ${result.total} رسالة معلقة`);
        } else {
            req.flash('error', `فشل في تحديث حالة الرسائل: ${result.error}`);
        }
        
        res.redirect('/admin/sms-settings');
    } catch (error) {
        logger.error('smsSettingsController', 'خطأ في تحديث حالة الرسائل المعلقة', error);
        req.flash('error', 'حدث خطأ أثناء تحديث حالة الرسائل المعلقة');
        res.redirect('/admin/sms-settings');
    }
};

/**
 * عرض صفحة مراقبة الرسائل
 */
exports.showSmsMonitor = async (req, res) => {
    try {
        // الحصول على إحصائيات الرسائل
        const pendingCount = await require('../models/SemMessage').countDocuments({ status: 'pending' });
        const sentCount = await require('../models/SemMessage').countDocuments({ status: 'sent' });
        const failedCount = await require('../models/SemMessage').countDocuments({ status: 'failed' });
        const totalCount = pendingCount + sentCount + failedCount;
        
        // الحصول على آخر 10 رسائل
        const recentMessages = await require('../models/SemMessage')
            .find()
            .sort({ createdAt: -1 })
            .limit(10)
            .populate('clientId', 'name email');
        
        // تهيئة مدير خدمة الرسائل
        const settings = await SmsSettings.getActiveSettings();
        const config = settings.getProviderConfig();
        await SmsManager.initialize(config);
        
        // الحصول على رصيد الحساب
        const accountBalance = await SmsManager.checkAccountBalance();
        
        res.render('sms_monitor', {
            messageStats: {
                pending: pendingCount,
                sent: sentCount,
                failed: failedCount,
                total: totalCount
            },
            recentMessages,
            accountBalance,
            settings,
            flashMessages: req.flash()
        });
    } catch (error) {
        logger.error('smsSettingsController', 'خطأ في عرض صفحة مراقبة الرسائل', error);
        req.flash('error', 'حدث خطأ أثناء تحميل صفحة مراقبة الرسائل');
        res.redirect('/');
    }
};
