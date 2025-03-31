const mongoose = require('mongoose');

/**
 * نموذج لتخزين سجلات webhook واتساب الرسمية من ميتا
 */
const metaWhatsappWebhookLogSchema = new mongoose.Schema({
    requestId: {
        type: String,
        required: true,
        index: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    method: {
        type: String,
        required: true
    },
    url: {
        type: String
    },
    headers: {
        type: Object
    },
    body: {
        type: Object
    },
    rawBody: {
        type: String
    },
    type: {
        type: String,
        enum: ['message', 'status', 'unknown'],
        default: 'unknown'
    }
}, {
    timestamps: true
});

// إضافة فهرس للبحث السريع
metaWhatsappWebhookLogSchema.index({ timestamp: -1 });

const MetaWhatsappWebhookLog = mongoose.model('MetaWhatsappWebhookLog', metaWhatsappWebhookLogSchema);

module.exports = MetaWhatsappWebhookLog;
