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
    // تاريخ المعالجة
    processedAt: {
        type: Date,
        default: null
    },
    // معرف العميل (إذا تم ربط الرسالة بعميل)
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SemClient',
        required: false
    },
    // نتيجة معالجة الرسالة
    processingResult: {
        type: Object,
        default: {}
    },
    // البيانات الخام كما وردت في الطلب
    rawData: {
        type: Object,
        default: {}
    }
}, {
    timestamps: true
});

/**
 * دالة للبحث عن رسائل حسب رقم الهاتف
 * @param {String} phone رقم الهاتف للبحث
 * @param {Object} options خيارات إضافية للبحث
 * @returns {Promise<Array>} وعد برسائل واتس أب مطابقة
 */
whatsappIncomingMessageSchema.statics.findByPhone = async function(phone, options = {}) {
    const query = { phone: { $regex: phone.replace(/[^\d+]/g, '') } };
    
    // إضافة شروط البحث الإضافية
    if (options.processed !== undefined) {
        query.processed = options.processed;
    }
    
    // إضافة حدود زمنية إذا تم تحديدها
    if (options.startDate) {
        query.createdAt = { $gte: new Date(options.startDate) };
    }
    if (options.endDate) {
        if (query.createdAt) {
            query.createdAt.$lte = new Date(options.endDate);
        } else {
            query.createdAt = { $lte: new Date(options.endDate) };
        }
    }
    
    // تنفيذ البحث
    return this.find(query)
        .sort({ createdAt: options.sort || -1 })
        .limit(options.limit || 100);
};

const WhatsappIncomingMessage = mongoose.model('WhatsappIncomingMessage', whatsappIncomingMessageSchema);

module.exports = WhatsappIncomingMessage;
