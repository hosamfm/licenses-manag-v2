const mongoose = require('mongoose');

/**
 * نموذج رسائل الواتس أب المستلمة
 */
const whatsappIncomingMessageSchema = new mongoose.Schema({
    // معرف الرسالة من مزود الخدمة
    id: {
        type: String,
        required: true,
        index: true
    },
    // رقم الهاتف المرسل
    phone: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    // نص الرسالة
    msg: {
        type: String,
        required: true
    },
    // تاريخ استلام الرسالة كما ورد من مزود الخدمة
    date: {
        type: String,
        required: false
    },
    // نوع الرسالة (0 للرسائل القصيرة، 1 للواتس أب)
    type: {
        type: Number,
        enum: [0, 1],
        default: 1,
        required: true
    },
    // معرف الجهاز المستقبل
    id_device: {
        type: String,
        required: false
    },
    // اتجاه الرسالة (إذا كان متوفرًا)
    dir: {
        type: String,
        required: false
    },
    // حالة معالجة الرسالة
    processed: {
        type: Boolean,
        default: false
    },
    // توقيت معالجة الرسالة
    processedAt: {
        type: Date,
        default: null
    },
    // العميل المرتبط (إذا تم تحديده)
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SemClient',
        required: false
    },
    // نتيجة المعالجة أو أي معلومات إضافية
    processingResult: {
        type: Object,
        default: {}
    },
    // البيانات الخام المستلمة من مزود الخدمة
    rawData: {
        type: Object,
        default: {}
    }
}, {
    timestamps: true
});

// إضافة مؤشر فهرسة مركب للبحث السريع
whatsappIncomingMessageSchema.index({ id: 1, phone: 1 }, { unique: true });

// دالة لإنشاء تقرير بالرسائل المستلمة
whatsappIncomingMessageSchema.statics.getReport = async function(options = {}) {
    try {
        const query = {};
        if (options.startDate && options.endDate) {
            query.createdAt = { 
                $gte: new Date(options.startDate), 
                $lte: new Date(options.endDate)
            };
        }
        
        if (options.processed !== undefined) {
            query.processed = options.processed;
        }

        const report = await this.aggregate([
            { $match: query },
            {
                $group: {
                    _id: { 
                        processed: '$processed',
                        date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.date': 1 } }
        ]);

        return report;
    } catch (error) {
        console.error('خطأ في الحصول على تقرير الرسائل المستلمة:', error);
        throw error;
    }
};

const WhatsappIncomingMessage = mongoose.model('WhatsappIncomingMessage', whatsappIncomingMessageSchema);

module.exports = WhatsappIncomingMessage;
