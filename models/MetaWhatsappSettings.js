const mongoose = require('mongoose');

/**
 * نموذج إعدادات خدمة الواتس أب الرسمية من ميتا (الإصدار 22)
 */
const metaWhatsappSettingsSchema = new mongoose.Schema({
    name: {
        type: String,
        default: 'إعدادات واتساب الرسمي'
    },
    isActive: {
        type: Boolean,
        default: false
    },
    config: {
        // إعدادات Meta WhatsApp Business API v22
        appId: {
            type: String,
            default: ''
        },
        appSecret: {
            type: String,
            default: ''
        },
        accessToken: {
            type: String,
            default: ''
        },
        phoneNumberId: {
            type: String,
            default: ''
        },
        businessAccountId: {
            type: String,
            default: ''
        },
        verifyToken: {
            type: String,
            default: ''
        },
        webhookUrl: {
            type: String,
            default: ''
        }
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// طريقة للحصول على الإعدادات النشطة
metaWhatsappSettingsSchema.statics.getActiveSettings = async function() {
    try {
        // للتوافق مع الكود القديم، نقوم بإرجاع الإعدادات النشطة الأولى
        const activeSettings = await this.findOne({ isActive: true }).sort({ updatedAt: -1 });
        
        // إذا وجدنا إعدادات نشطة، نرجعها
        if (activeSettings) {
            return activeSettings;
        }
        
        // البحث عن جميع الإعدادات الموجودة
        const allSettings = await this.find({}).sort({ updatedAt: -1 });
        
        // إذا كان هناك أي إعدادات، نرجع الأحدث
        if (allSettings.length > 0) {
            return allSettings[0];
        }
        return newSettings;
    } catch (error) {
        console.error('خطأ في الحصول على إعدادات واتساب:', error);
        // في حالة الخطأ، ننشئ كائناً جديداً دون حفظه في قاعدة البيانات
        return new this({
            name: 'إعدادات واتساب الرسمي الافتراضية',
            isActive: false,
            config: {
                appId: '',
                appSecret: '',
                accessToken: '',
                phoneNumberId: '',
                businessAccountId: '',
                verifyToken: '',
                webhookUrl: ''
            }
        });
    }
};

// طريقة جديدة للحصول على جميع الإعدادات النشطة
metaWhatsappSettingsSchema.statics.getAllActiveSettings = async function() {
    try {
        // البحث عن جميع الإعدادات النشطة
        const activeSettings = await this.find({ isActive: true }).sort({ updatedAt: -1 });
        
        if (activeSettings.length > 0) {
            return activeSettings;
        }
        
        // إذا لم تكن هناك إعدادات نشطة، نرجع الإعدادات الافتراضية
        const defaultSettings = await this.getActiveSettings();
        return [defaultSettings];
    } catch (error) {
        console.error('خطأ في الحصول على جميع إعدادات واتساب النشطة:', error);
        return [];
    }
};

// طريقة للبحث عن الإعدادات حسب معرف رقم الهاتف
metaWhatsappSettingsSchema.statics.getSettingsByPhoneNumberId = async function(phoneNumberId) {
    try {
        const settings = await this.findOne({
            'config.phoneNumberId': phoneNumberId
        });
        
        return settings;
    } catch (error) {
        console.error('خطأ في البحث عن إعدادات واتساب حسب معرف رقم الهاتف:', error);
        return null;
    }
};

// طريقة للتحقق من اكتمال الإعدادات
metaWhatsappSettingsSchema.methods.isConfigured = function() {
    return (
        this.config.accessToken && 
        this.config.accessToken.trim() !== '' &&
        this.config.phoneNumberId && 
        this.config.phoneNumberId.trim() !== '' &&
        this.config.businessAccountId && 
        this.config.businessAccountId.trim() !== ''
    );
};

const MetaWhatsappSettings = mongoose.model('MetaWhatsappSettings', metaWhatsappSettingsSchema);

module.exports = MetaWhatsappSettings;
