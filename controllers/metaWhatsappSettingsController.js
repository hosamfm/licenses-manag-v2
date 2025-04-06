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
        // الحصول على جميع إعدادات واتساب الرسمي
        const allSettings = await MetaWhatsappSettings.find().sort({ isActive: -1, updatedAt: -1 });
        
        // الحصول على الإعدادات النشطة لعرض حالة الاتصال
        const settings = await MetaWhatsappSettings.getActiveSettings();
        
        // الحصول على حالة الاتصال والمعلومات
        let connectionStatus = {
            success: false,
            error: null,
            phoneNumber: null
        };
        
        // محاولة الاتصال بواتساب الرسمي للتحقق من الإعدادات
        if (settings && settings.isConfigured()) {
            try {
                // تهيئة خدمة واتساب الرسمي
                await MetaWhatsappService.initialize();
                const phoneInfo = await MetaWhatsappService.getPhoneNumberInfo();
                connectionStatus.success = true;
                connectionStatus.phoneNumber = phoneInfo.display_phone_number || phoneInfo.id;
            } catch (error) {
                connectionStatus.error = error.message;
                // إذا كان الخطأ 401، نضيف رسالة أكثر وضوحًا
                if (error.response && error.response.status === 401) {
                    connectionStatus.error = 'توكن الوصول غير صالح أو منتهي الصلاحية. الرجاء التحقق من إعدادات واتساب الرسمي.';
                }
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
            allSettings, // تمرير جميع الإعدادات للعرض في الجدول
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
        
        // تسجيل البيانات المستلمة للتشخيص
        logger.debug('metaWhatsappSettingsController', 'البيانات المستلمة لحفظ الإعدادات', {
            app_id: app_id || 'غير موجود',
            app_secret: app_secret ? '(موجود)' : 'غير موجود',
            access_token: access_token ? '(موجود)' : 'غير موجود',
            phone_number_id: phone_number_id || 'غير موجود',
            business_account_id: business_account_id || 'غير موجود',
            verify_token: verify_token ? '(موجود)' : 'غير موجود',
            is_active: is_active || 'غير موجود'
        });
        
        // الحصول على إعدادات واتساب الرسمي الحالية
        const settings = await MetaWhatsappSettings.getActiveSettings();
        
        // تحديث الإعدادات (التحقق من وجود القيم قبل التحديث)
        settings.isActive = is_active === 'on';
        
        // تحديث الحقول فقط إذا تم توفيرها وليست فارغة
        if (app_id !== undefined) settings.config.appId = app_id;
        if (app_secret !== undefined) settings.config.appSecret = app_secret;
        if (access_token !== undefined) settings.config.accessToken = access_token;
        if (phone_number_id !== undefined) settings.config.phoneNumberId = phone_number_id;
        if (business_account_id !== undefined) settings.config.businessAccountId = business_account_id;
        
        // إذا كان توكن التحقق غير موجود، إنشاء توكن جديد
        if (!verify_token || verify_token.trim() === '') {
            settings.config.verifyToken = crypto.randomBytes(16).toString('hex');
        } else {
            settings.config.verifyToken = verify_token;
        }
        
        if (webhook_url !== undefined) settings.config.webhookUrl = webhook_url;
        
        // تسجيل البيانات قبل الحفظ للتشخيص
        logger.debug('metaWhatsappSettingsController', 'البيانات قبل الحفظ', {
            appId: settings.config.appId || 'غير موجود',
            appSecret: settings.config.appSecret ? '(موجود)' : 'غير موجود',
            accessToken: settings.config.accessToken ? '(موجود)' : 'غير موجود',
            phoneNumberId: settings.config.phoneNumberId || 'غير موجود',
            businessAccountId: settings.config.businessAccountId || 'غير موجود',
            verifyToken: settings.config.verifyToken ? '(موجود)' : 'غير موجود',
            isActive: settings.isActive
        });
        
        // حفظ الإعدادات المحدثة
        settings.updatedBy = req.session && req.session.userId ? req.session.userId : null;
        await settings.save();
        
        logger.info('metaWhatsappSettingsController', 'تم حفظ إعدادات واتساب الرسمي', {
            userId: req.session && req.session.userId ? req.session.userId : null,
            isActive: settings.isActive,
            hasAppId: !!settings.config.appId,
            hasAccessToken: !!settings.config.accessToken,
            hasPhoneNumberId: !!settings.config.phoneNumberId
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
 * إضافة إعداد واتساب جديد
 */
exports.addMetaWhatsappSettings = async (req, res) => {
    try {
        const {
            name,
            app_id,
            app_secret,
            phone_number_id,
            business_account_id,
            access_token,
            verify_token,
            is_active
        } = req.body;

        // التحقق من عدم وجود إعداد بنفس رقم الهاتف
        const existingSettings = await MetaWhatsappSettings.findOne({
            'config.phoneNumberId': phone_number_id
        });

        if (existingSettings) {
            req.flash('error', 'يوجد إعداد آخر يستخدم نفس معرف رقم الهاتف بالفعل');
            return res.redirect('/admin/meta-whatsapp-settings');
        }

        // إنشاء إعداد جديد
        const newSettings = new MetaWhatsappSettings({
            name: name || `إعداد واتساب ${phone_number_id}`,
            isActive: is_active === 'on',
            config: {
                appId: app_id,
                appSecret: app_secret,
                phoneNumberId: phone_number_id,
                businessAccountId: business_account_id,
                accessToken: access_token,
                verifyToken: verify_token || crypto.randomBytes(16).toString('hex')
            },
            createdBy: req.session && req.session.userId ? req.session.userId : null,
            updatedBy: req.session && req.session.userId ? req.session.userId : null
        });

        await newSettings.save();

        logger.info('metaWhatsappSettingsController', 'تم إضافة إعداد واتساب جديد', {
            userId: req.session && req.session.userId ? req.session.userId : null,
            settingsId: newSettings._id,
            phoneNumberId: phone_number_id,
            isActive: newSettings.isActive
        });

        req.flash('success', 'تم إضافة إعداد واتساب جديد بنجاح');
        res.redirect('/admin/meta-whatsapp-settings');
    } catch (error) {
        logger.error('metaWhatsappSettingsController', 'خطأ في إضافة إعداد واتساب جديد', error);
        req.flash('error', 'حدث خطأ أثناء إضافة إعداد واتساب جديد');
        res.redirect('/admin/meta-whatsapp-settings');
    }
};

/**
 * الحصول على إعداد واتساب محدد
 */
exports.getMetaWhatsappSettings = async (req, res) => {
    try {
        const settingsId = req.params.id;
        const settings = await MetaWhatsappSettings.findById(settingsId);

        if (!settings) {
            return res.status(404).json({
                success: false,
                message: 'لم يتم العثور على الإعداد المطلوب'
            });
        }

        res.json({
            success: true,
            setting: {
                _id: settings._id,
                name: settings.name,
                isActive: settings.isActive,
                config: {
                    appId: settings.config.appId,
                    phoneNumberId: settings.config.phoneNumberId,
                    businessAccountId: settings.config.businessAccountId,
                    verifyToken: settings.config.verifyToken
                    // لا نقم بإرجاع بيانات حساسة مثل access_token و app_secret
                }
            }
        });
    } catch (error) {
        logger.error('metaWhatsappSettingsController', 'خطأ في الحصول على إعداد واتساب', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء معالجة الطلب'
        });
    }
};

/**
 * تحديث إعداد واتساب محدد
 */
exports.updateMetaWhatsappSettings = async (req, res) => {
    try {
        const {
            id,
            name,
            app_id,
            app_secret,
            phone_number_id,
            business_account_id,
            access_token,
            verify_token,
            is_active
        } = req.body;

        // البحث عن الإعداد
        const settings = await MetaWhatsappSettings.findById(id);

        if (!settings) {
            req.flash('error', 'لم يتم العثور على الإعداد المطلوب');
            return res.redirect('/admin/meta-whatsapp-settings');
        }

        // التحقق من عدم وجود إعداد آخر بنفس رقم الهاتف
        if (phone_number_id && phone_number_id !== settings.config.phoneNumberId) {
            const existingSettings = await MetaWhatsappSettings.findOne({
                _id: { $ne: id },
                'config.phoneNumberId': phone_number_id
            });

            if (existingSettings) {
                req.flash('error', 'يوجد إعداد آخر يستخدم نفس معرف رقم الهاتف بالفعل');
                return res.redirect('/admin/meta-whatsapp-settings');
            }
        }

        // تحديث الإعدادات
        settings.name = name || settings.name;
        settings.isActive = is_active === 'on';
        
        // تحديث الحقول فقط إذا تم توفيرها وليست فارغة
        if (app_id) settings.config.appId = app_id;
        if (app_secret && app_secret.trim() !== '') settings.config.appSecret = app_secret;
        if (phone_number_id) settings.config.phoneNumberId = phone_number_id;
        if (business_account_id) settings.config.businessAccountId = business_account_id;
        if (access_token && access_token.trim() !== '') settings.config.accessToken = access_token;
        
        // تحديث توكن التحقق إذا تم توفيره
        if (verify_token && verify_token.trim() !== '') {
            settings.config.verifyToken = verify_token;
        }

        settings.updatedBy = req.session && req.session.userId ? req.session.userId : null;
        await settings.save();

        logger.info('metaWhatsappSettingsController', 'تم تحديث إعداد واتساب', {
            userId: req.session && req.session.userId ? req.session.userId : null,
            settingsId: settings._id,
            phoneNumberId: settings.config.phoneNumberId,
            isActive: settings.isActive
        });

        req.flash('success', 'تم تحديث إعداد واتساب بنجاح');
        res.redirect('/admin/meta-whatsapp-settings');
    } catch (error) {
        logger.error('metaWhatsappSettingsController', 'خطأ في تحديث إعداد واتساب', error);
        req.flash('error', 'حدث خطأ أثناء تحديث إعداد واتساب');
        res.redirect('/admin/meta-whatsapp-settings');
    }
};

/**
 * حذف إعداد واتساب محدد
 */
exports.deleteMetaWhatsappSettings = async (req, res) => {
    try {
        const { id } = req.body;

        // البحث عن الإعداد
        const settings = await MetaWhatsappSettings.findById(id);

        if (!settings) {
            req.flash('error', 'لم يتم العثور على الإعداد المطلوب');
            return res.redirect('/admin/meta-whatsapp-settings');
        }

        // التحقق من عدم وجود قنوات مرتبطة بهذا الإعداد
        // يمكن إضافة هذا التحقق لاحقًا إذا لزم الأمر

        // حذف الإعداد
        await MetaWhatsappSettings.findByIdAndDelete(id);

        logger.info('metaWhatsappSettingsController', 'تم حذف إعداد واتساب', {
            userId: req.session && req.session.userId ? req.session.userId : null,
            deletedSettingsId: id
        });

        req.flash('success', 'تم حذف إعداد واتساب بنجاح');
        res.redirect('/admin/meta-whatsapp-settings');
    } catch (error) {
        logger.error('metaWhatsappSettingsController', 'خطأ في حذف إعداد واتساب', error);
        req.flash('error', 'حدث خطأ أثناء حذف إعداد واتساب');
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

/**
 * فحص حالة اتصال إعداد واتساب معين
 */
exports.checkSettingConnection = async (req, res) => {
    try {
        const id = req.params.id;
        
        // التحقق من وجود الإعداد
        const setting = await MetaWhatsappSettings.findById(id);
        if (!setting) {
            return res.status(404).json({
                success: false,
                message: 'لم يتم العثور على الإعداد'
            });
        }
        
        // محاولة الاتصال بواتساب الرسمي للتحقق من الإعدادات
        let connectionStatus = {
            success: false,
            error: null,
            phoneNumber: null,
            settingName: setting.name
        };
        
        if (setting.isConfigured()) {
            try {
                // استخدام نسخة الخدمة الموجودة بدلاً من إنشاء نسخة جديدة
                const tempService = MetaWhatsappService;
                tempService.settings = setting;
                await tempService.initialize();
                
                // تمرير معرف رقم الهاتف الخاص بالإعداد الحالي للدالة
                const phoneInfo = await tempService.getPhoneNumberInfo(setting.config.phoneNumberId);
                connectionStatus.success = true;
                connectionStatus.phoneNumber = phoneInfo.display_phone_number || phoneInfo.id;
                
                // إضافة بيانات الاستجابة من واتساب لعرضها في واجهة المستخدم
                return res.json({
                    success: true,
                    connectionStatus: connectionStatus,
                    responseData: phoneInfo // إضافة بيانات الاستجابة كاملة
                });
            } catch (error) {
                connectionStatus.error = error.message;
                // إذا كان الخطأ 401، نضيف رسالة أكثر وضوحًا
                if (error.response && error.response.status === 401) {
                    connectionStatus.error = 'توكن الوصول غير صالح أو منتهي الصلاحية. الرجاء التحقق من إعدادات واتساب الرسمي.';
                }
                // استخدام سلسلة نصية عادية لتجنب مشاكل القالب الحرفي
                logger.error('metaWhatsappSettingsController', 'خطأ في الاتصال بواتساب الرسمي للإعداد ' + setting.name, error);
                
                // إرجاع استجابة الخطأ
                return res.json({
                    success: true,
                    connectionStatus: connectionStatus
                });
            }
        } else {
            connectionStatus.error = 'الإعداد غير مكتمل أو غير موجود';
            
            return res.json({
                success: true,
                connectionStatus: connectionStatus
            });
        }
    } catch (error) {
        logger.error('metaWhatsappSettingsController', 'خطأ في فحص حالة اتصال إعداد واتساب', error);
        res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء معالجة الطلب'
        });
    }
};
