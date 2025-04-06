/**
 * نموذج إعدادات خدمة الواتس أب القديم (SemySMS)
 * 
 * @deprecated هذا النموذج يستخدم للتوافق مع الأنظمة القديمة التي تعتمد على مزود SemySMS
 * سيتم استبداله تدريجياً بنموذج MetaWhatsappSettings الذي يدعم واجهة Meta الرسمية
 * تجنب استخدام هذا النموذج في الميزات الجديدة واستخدم MetaWhatsappSettings بدلاً منه
 */
const mongoose = require('mongoose');

/**
 * نموذج إعدادات خدمة الواتس أب
 */
const whatsappSettingsSchema = new mongoose.Schema({
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
whatsappSettingsSchema.statics.getActiveSettings = async function() {
    // الحصول على الإعدادات النشطة، أو إنشاء إعدادات افتراضية إذا لم تكن موجودة
    let settings = await this.findOne({ isActive: true });
    
    if (!settings) {
        settings = await this.create({
            provider: 'semysms',
            isActive: true,
            config: {
                semysms: {
                    token: '',
                    device: 'active',
                    webhookUrl: '',
                    enableSentWebhook: true,
                    enableDeliveredWebhook: true
                }
            }
        });
    }
    
    return settings;
};

// طريقة للحصول على إعدادات مزود معين
whatsappSettingsSchema.methods.getProviderConfig = function() {
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

const WhatsappSettings = mongoose.model('WhatsappSettings', whatsappSettingsSchema);

module.exports = WhatsappSettings;
