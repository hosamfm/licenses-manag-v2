/**
 * متحكم إعدادات واتساب الرسمي من ميتا (الإصدار 22)
 */
const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
const logger = require('../services/loggerService');
const MetaWhatsappService = require('../services/whatsapp/MetaWhatsappService');
const crypto = require('crypto');

/**
 * عرض إعدادات واتساب الرسمي
 */
exports.showMetaWhatsappSettings = async (req, res) => {
    try {
        // الحصول على إعدادات واتساب الرسمي
        const settings = await MetaWhatsappSettings.getActiveSettings();
        
        // تهيئة خدمة واتساب الرسمي
        await MetaWhatsappService.initialize();
        
        // الحصول على حالة الاتصال والمعلومات
        let connectionStatus = {
            success: false,
            error: null,
            phoneNumber: null
        };
        
        // محاولة الاتصال بواتساب الرسمي للتحقق من الإعدادات
        if (settings.isConfigured()) {
            try {
                const phoneInfo = await MetaWhatsappService.getPhoneNumberInfo();
                connectionStatus.success = true;
                connectionStatus.phoneNumber = phoneInfo.display_phone_number || phoneInfo.id;
            } catch (error) {
                connectionStatus.error = error.message;
                logger.error('metaWhatsappSettingsController', 'خطأ في الاتصال بواتساب الرسمي', error);
            }
        }
        
        // توليد عنوان Webhook
        // الحصول على الدومين من عنوان URL الحالي
        const protocol = req.protocol;
        const host = req.get('host');
        const webhookUrl = `${protocol}://${host}/api/meta-whatsapp/webhook`;
        
        // عرض قالب إعدادات واتساب الرسمي
        res.render('meta_whatsapp_settings', {
            settings,
            connectionStatus,
            webhookUrl, // تمرير عنوان webhook الذي تم توليده
            templates: [], // يمكن إضافة قوالب الرسائل هنا في المستقبل
            flashMessages: req.flash()
        });
    } catch (error) {
        logger.error('metaWhatsappSettingsController', 'خطأ في عرض إعدادات واتساب الرسمي', error);
        req.flash('error', 'حدث خطأ أثناء تحميل إعدادات واتساب الرسمي');
        res.redirect('/settings');
    }
};

/**
 * حفظ إعدادات واتساب الرسمي
 */
exports.saveMetaWhatsappSettings = async (req, res) => {
    try {
        // الحصول على البيانات من النموذج
        const {
            app_id,
            app_secret,
            access_token,
            phone_number_id,
            business_account_id,
            verify_token,
            webhook_url,
            is_active
        } = req.body;
        
        // الحصول على إعدادات واتساب الرسمي الحالية
        const settings = await MetaWhatsappSettings.getActiveSettings();
        
        // تحديث الإعدادات
        settings.isActive = is_active === 'on';
        settings.config.appId = app_id || '';
        settings.config.appSecret = app_secret || '';
        settings.config.accessToken = access_token || '';
        settings.config.phoneNumberId = phone_number_id || '';
        settings.config.businessAccountId = business_account_id || '';
        
        // إذا كان توكن التحقق غير موجود، إنشاء توكن جديد
        if (!verify_token || verify_token.trim() === '') {
            settings.config.verifyToken = crypto.randomBytes(16).toString('hex');
        } else {
            settings.config.verifyToken = verify_token;
        }
        
        settings.config.webhookUrl = webhook_url || '';
        
        // حفظ الإعدادات المحدثة
        settings.updatedBy = req.user ? req.user._id : null;
        await settings.save();
        
        logger.info('metaWhatsappSettingsController', 'تم حفظ إعدادات واتساب الرسمي', {
            userId: req.user ? req.user._id : null
        });
        
        req.flash('success', 'تم حفظ إعدادات واتساب الرسمي بنجاح');
        res.redirect('/admin/meta-whatsapp-settings');
    } catch (error) {
        logger.error('metaWhatsappSettingsController', 'خطأ في حفظ إعدادات واتساب الرسمي', error);
        req.flash('error', 'حدث خطأ أثناء حفظ إعدادات واتساب الرسمي');
        res.redirect('/admin/meta-whatsapp-settings');
    }
};

/**
 * توليد توكن تحقق جديد
 */
exports.generateNewVerifyToken = async (req, res) => {
    try {
        // الحصول على إعدادات واتساب الرسمي
        const settings = await MetaWhatsappSettings.getActiveSettings();
        
        // توليد توكن جديد
        const newToken = crypto.randomBytes(16).toString('hex');
        settings.config.verifyToken = newToken;
        
        // حفظ الإعدادات المحدثة
        settings.updatedBy = req.user ? req.user._id : null;
        await settings.save();
        
        logger.info('metaWhatsappSettingsController', 'تم توليد توكن تحقق جديد لواتساب الرسمي', {
            userId: req.user ? req.user._id : null
        });
        
        // إرجاع التوكن الجديد
        res.json({ token: newToken });
    } catch (error) {
        logger.error('metaWhatsappSettingsController', 'خطأ في توليد توكن تحقق جديد', error);
        res.status(500).json({ error: 'حدث خطأ أثناء توليد توكن تحقق جديد' });
    }
};
