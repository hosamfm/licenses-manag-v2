const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

const semMessageSchema = new mongoose.Schema({
    clientId: {
        type: ObjectId,
        ref: 'SemClient',
        required: true
    },
    recipients: {
        type: [String],
        required: true,
        validate: [
            function(val) {
                return val.length > 0;
            },
            'يجب تحديد مستلم واحد على الأقل'
        ]
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
        default: 'pending'
    },
    sentAt: {
        type: Date
    },
    errorMessage: {
        type: String
    },
    messageId: {
        type: String
    },
    // معرف الرسالة الخارجي من مزود الخدمة (SemySMS)
    externalMessageId: {
        type: String
    },
    // بيانات إضافية من مزود الخدمة
    providerData: {
        type: Object,
        default: {}
    }
}, {
    timestamps: true
});

// إحصائيات الرسائل حسب العميل
semMessageSchema.statics.getClientStats = async function(clientId) {
    return await this.aggregate([
        { $match: { clientId: new ObjectId(clientId) } },
        { $group: {
            _id: '$status',
            count: { $sum: 1 }
        }}
    ]);
};

// إحصائيات الرسائل اليومية
semMessageSchema.statics.getDailyStats = async function(clientId, days = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    return await this.aggregate([
        { 
            $match: { 
                clientId: new ObjectId(clientId),
                createdAt: { $gte: startDate }
            } 
        },
        { 
            $group: {
                _id: { 
                    date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    status: "$status"
                },
                count: { $sum: 1 }
            }
        },
        { 
            $sort: { "_id.date": 1 } 
        }
    ]);
};

const SemMessage = mongoose.model('SemMessage', semMessageSchema);

module.exports = SemMessage;
