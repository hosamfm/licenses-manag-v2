const mongoose = require('mongoose');

/**
 * نموذج إعدادات خدمة الواتس أب الرسمية من ميتا (الإصدار 22)
 */
const metaWhatsappSettingsSchema = new mongoose.Schema({
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
        // البحث عن جميع الإعدادات الموجودة
        const allSettings = await this.find({}).sort({ updatedAt: -1 });
        
        // إذا كان هناك أكثر من سجل، نقوم بتنظيف قاعدة البيانات والاحتفاظ بالسجل الأحدث
        if (allSettings.length > 1) {
            console.log(`تم العثور على ${allSettings.length} سجل، سيتم الاحتفاظ بأحدث سجل والتنظيف`);
            
            // البحث عن السجلات التي تحتوي على بيانات (غير فارغة)
            const settingsWithData = allSettings.filter(setting => 
                setting.config && 
                ((setting.config.appId && setting.config.appId.trim() !== '') || 
                (setting.config.accessToken && setting.config.accessToken.trim() !== '') || 
                (setting.config.phoneNumberId && setting.config.phoneNumberId.trim() !== ''))
            );
            
            // اختيار السجل الذي سنحتفظ به
            let settingToKeep;
            if (settingsWithData.length > 0) {
                // نحتفظ بأحدث سجل يحتوي على بيانات
                settingToKeep = settingsWithData[0];  // الأول هو الأحدث (مرتبة تنازلياً)
                console.log('سيتم الاحتفاظ بأحدث سجل يحتوي على بيانات');
            } else {
                // إذا لم تكن هناك سجلات تحتوي على بيانات، نحتفظ بأحدث سجل
                settingToKeep = allSettings[0];  // الأول هو الأحدث (مرتبة تنازلياً)
                console.log('لا توجد سجلات بها بيانات، سيتم الاحتفاظ بأحدث سجل');
            }
            
            // حذف جميع السجلات الأخرى
            await this.deleteMany({ _id: { $ne: settingToKeep._id } });
            console.log('تم تنظيف السجلات الزائدة');
            
            return settingToKeep;
        }
        
        // إذا كان هناك سجل واحد، نستخدمه
        if (allSettings.length === 1) {
            console.log('تم العثور على سجل واحد موجود');
            return allSettings[0];
        }
        
        // إذا لم تكن هناك سجلات، ننشئ سجلاً جديداً
        console.log('لم يتم العثور على سجلات، سيتم إنشاء سجل جديد');
        const newSettings = await this.create({
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
        
        return newSettings;
    } catch (error) {
        console.error('خطأ في الحصول على إعدادات واتساب:', error);
        // في حالة الخطأ، ننشئ كائناً جديداً دون حفظه في قاعدة البيانات
        return new this({
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
