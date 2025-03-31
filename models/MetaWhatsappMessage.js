const mongoose = require('mongoose');

/**
 * نموذج رسائل واتساب ميتا الرسمي المرسلة
 */
const metaWhatsappMessageSchema = new mongoose.Schema({
    // المستخدم أو العميل الذي أرسل الرسالة
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SemClient',
        required: false
    },
    // رقم الهاتف المستلم
    phoneNumber: {
        type: String,
        required: true,
        trim: true
    },
    // نص الرسالة
    message: {
        type: String,
        required: true
    },
    // معرف الرسالة الفريد
    messageId: {
        type: String,
        default: null
    },
    // معرف الرسالة الخارجي (من Meta)
    externalMessageId: {
        type: String,
        default: null
    },
    // حالة الرسالة
    status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
        default: 'pending'
    },
    // قالب الرسالة المستخدم
    template: {
        name: String,
        language: String
    },
    // توقيت إرسال الرسالة
    sentAt: {
        type: Date,
        default: Date.now
    },
    // توقيت استلام الرسالة
    deliveredAt: {
        type: Date,
        default: null
    },
    // توقيت قراءة الرسالة
    readAt: {
        type: Date,
        default: null
    },
    // رسالة الخطأ في حالة الفشل
    errorMessage: {
        type: String,
        default: null
    },
    // بيانات إضافية من مزود الخدمة
    providerData: {
        type: Object,
        default: {}
    }
}, {
    timestamps: true
});

// دالة لإنشاء تقرير بحالة الرسائل
metaWhatsappMessageSchema.statics.getStatusReport = async function() {
    try {
        const report = await this.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const result = {
            pending: 0,
            sent: 0,
            delivered: 0,
            read: 0,
            failed: 0,
            total: 0
        };

        for (const item of report) {
            if (result.hasOwnProperty(item._id)) {
                result[item._id] = item.count;
                result.total += item.count;
            }
        }

        return result;
    } catch (error) {
        console.error('خطأ في الحصول على تقرير رسائل واتساب ميتا:', error);
        throw error;
    }
};

const MetaWhatsappMessage = mongoose.model('MetaWhatsappMessage', metaWhatsappMessageSchema);

module.exports = MetaWhatsappMessage;
