const mongoose = require('mongoose');

/**
 * نموذج إعدادات خدمة الرسائل القصيرة
 */
const smsSettingsSchema = new mongoose.Schema({
    provider: {
        type: String,
        enum: ['semysms', 'other'], // يمكن إضافة مزودين آخرين هنا
        default: 'semysms',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    config: {
        // إعدادات SemySMS
        semysms: {
            token: {
                type: String,
                default: ''
            },
            device: {
                type: String,
                default: 'active'
            },
            webhookUrl: {
                type: String,
                default: ''
            },
            enableSentWebhook: {
                type: Boolean,
                default: true
            },
            enableDeliveredWebhook: {
                type: Boolean,
                default: true
            },
            addPlusPrefix: {
                type: Boolean,
                default: false
            }
        },
        // يمكن إضافة مكونات لمزودين آخرين هنا
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
smsSettingsSchema.statics.getActiveSettings = async function() {
    // الحصول على الإعدادات النشطة، أو إنشاء إعدادات افتراضية إذا لم تكن موجودة
    let settings = await this.findOne({ isActive: true });
    
    if (!settings) {
        settings = await this.create({
            provider: 'semysms',
            isActive: true,
            config: {
                semysms: {
                    token: 'f372dcf103146b3e3cbbac95514b9cf1', // القيمة الافتراضية
                    device: 'active',
                    webhookUrl: '',
                    enableSentWebhook: true,
                    enableDeliveredWebhook: true,
                    addPlusPrefix: false
                }
            }
        });
    }
    
    return settings;
};

// طريقة للحصول على إعدادات مزود معين
smsSettingsSchema.methods.getProviderConfig = function() {
    const provider = this.provider.toLowerCase();
    
    if (provider === 'semysms') {
        return {
            provider: 'semysms',
            config: this.config.semysms
        };
    }
    
    // يمكن إضافة حالات لمزودين آخرين هنا
    
    return null;
};

const SmsSettings = mongoose.model('SmsSettings', smsSettingsSchema);

module.exports = SmsSettings;
