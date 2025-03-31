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
    // الحصول على الإعدادات النشطة، أو إنشاء إعدادات افتراضية إذا لم تكن موجودة
    let settings = await this.findOne({ isActive: true });
    
    if (!settings) {
        settings = await this.create({
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
    
    return settings;
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
