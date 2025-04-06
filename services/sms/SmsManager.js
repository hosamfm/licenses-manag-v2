/**
 * مدير خدمة الرسائل القصيرة
 * يقوم بتحميل وإدارة مزودي خدمة الرسائل واختيار المزود المناسب بناءً على إعدادات النظام
 */
const logger = require('../loggerService');
const SemySmsProvider = require('./SemySmsProvider');

class SmsManager {
    /**
     * إنشاء مدير خدمة الرسائل
     */
    constructor() {
        this.providers = {};
        this.activeProvider = null;
        this.activeProviderName = null;
        this.initialized = false;

        // تسجيل مزودي الخدمة المتاحين
        this._registerProviders();
    }

    /**
     * تسجيل مزودي خدمة الرسائل المدعومين
     * @private
     */
    _registerProviders() {
        // تسجيل مزود SemySMS
        this.providers.semysms = new SemySmsProvider();

        // يمكن إضافة مزودين آخرين هنا في المستقبل
    }

    /**
     * تهيئة مدير الخدمة مع الإعدادات
     * @param {Object} settings إعدادات خدمة الرسائل
     * @returns {Promise<boolean>} حالة التهيئة
     */
    async initialize(settings = {}) {
        try {
            // التحقق من وجود مزود خدمة محدد
            if (!settings.provider) {
                throw new Error('لم يتم تحديد مزود خدمة الرسائل في الإعدادات');
            }

            // التحقق من دعم مزود الخدمة
            const providerName = settings.provider.toLowerCase();
            const provider = this.providers[providerName];
            
            if (!provider) {
                throw new Error(`مزود الخدمة "${settings.provider}" غير مدعوم`);
            }

            // تهيئة مزود الخدمة
            const initialized = await provider.initialize(settings.config || {});
            
            if (!initialized) {
                throw new Error(`فشل في تهيئة مزود الخدمة "${settings.provider}"`);
            }

            // تعيين مزود الخدمة النشط
            this.activeProvider = provider;
            this.activeProviderName = providerName;
            this.initialized = true;
            
            return true;
        } catch (error) {
            logger.error('SmsManager', 'فشل في تهيئة مدير خدمة الرسائل', error);
            this.initialized = false;
            return false;
        }
    }

    /**
     * إرسال رسالة SMS
     * @param {string} phoneNumber رقم الهاتف المستلم
     * @param {string} message محتوى الرسالة
     * @param {Object} options خيارات إضافية
     * @returns {Promise<Object>} نتيجة الإرسال
     */
    async sendSms(phoneNumber, message, options = {}) {
        if (!this.initialized || !this.activeProvider) {
            return { 
                success: false, 
                error: 'لم يتم تهيئة مدير خدمة الرسائل بعد' 
            };
        }

        try {
            return await this.activeProvider.sendSms(phoneNumber, message, options);
        } catch (error) {
            logger.error('SmsManager', 'خطأ في إرسال الرسالة', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    /**
     * التحقق من حالة رسالة
     * @param {string} messageId معرف الرسالة
     * @returns {Promise<Object>} حالة الرسالة
     */
    async checkMessageStatus(messageId) {
        if (!this.initialized || !this.activeProvider) {
            return { 
                success: false, 
                error: 'لم يتم تهيئة مدير خدمة الرسائل بعد' 
            };
        }

        try {
            logger.info('SmsManager', 'التحقق من حالة الرسالة', {
                provider: this.activeProviderName,
                messageId
            });

            return await this.activeProvider.checkMessageStatus(messageId);
        } catch (error) {
            logger.error('SmsManager', 'خطأ في التحقق من حالة الرسالة', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    /**
     * التحقق من رصيد الحساب
     * @returns {Promise<Object>} معلومات الرصيد
     */
    async checkAccountBalance() {
        if (!this.initialized || !this.activeProvider) {
            return { 
                success: false, 
                error: 'لم يتم تهيئة مدير خدمة الرسائل بعد' 
            };
        }

        try {
            logger.info('SmsManager', 'التحقق من رصيد الحساب', {
                provider: this.activeProviderName
            });

            return await this.activeProvider.checkAccountBalance();
        } catch (error) {
            logger.error('SmsManager', 'خطأ في التحقق من رصيد الحساب', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    /**
     * الحصول على قائمة الأجهزة (خاص بـ SemySMS)
     * @returns {Promise<Object>} قائمة الأجهزة
     */
    async getDevices() {
        if (!this.initialized || !this.activeProvider) {
            return { 
                success: false, 
                error: 'لم يتم تهيئة مدير خدمة الرسائل بعد' 
            };
        }

        if (this.activeProviderName !== 'semysms') {
            return { 
                success: false, 
                error: 'هذه الوظيفة متاحة فقط لمزود SemySMS' 
            };
        }

        try {
            logger.info('SmsManager', 'الحصول على قائمة الأجهزة من SemySMS');
            return await this.activeProvider.getDevices();
        } catch (error) {
            logger.error('SmsManager', 'خطأ في الحصول على قائمة الأجهزة', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }
}

// تصدير نسخة واحدة من الخدمة (Singleton)
module.exports = new SmsManager();
