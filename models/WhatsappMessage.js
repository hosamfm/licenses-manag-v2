const mongoose = require('mongoose');

/**
 * نموذج رسائل الواتس أب المرسلة
 */
const whatsappMessageSchema = new mongoose.Schema({
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
    // معرف الرسالة الفريد من مزود الخدمة
    messageId: {
        type: String,
        default: null
    },
    // حالة الرسالة
    status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'failed'],
        default: 'pending'
    },
    // توقيت إرسال الرسالة
    sentAt: {
        type: Date,
        default: null
    },
    // توقيت استلام الرسالة
    deliveredAt: {
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
whatsappMessageSchema.statics.getStatusReport = async function() {
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
        console.error('خطأ في الحصول على تقرير الرسائل:', error);
        throw error;
    }
};

const WhatsappMessage = mongoose.model('WhatsappMessage', whatsappMessageSchema);

module.exports = WhatsappMessage;
