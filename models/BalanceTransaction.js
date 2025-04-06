const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;

const balanceTransactionSchema = new mongoose.Schema({
    clientId: {
        type: ObjectId,
        ref: 'SemClient',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['deposit', 'usage'],
        required: true
    },
    notes: {
        type: String,
        trim: true
    },
    performedBy: {
        type: ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// طريقة لجلب تاريخ العمليات لعميل محدد
balanceTransactionSchema.statics.getClientTransactions = async function(clientId) {
    return await this.find({ clientId })
        .sort({ createdAt: -1 })
        .populate('performedBy', 'username name')
        .exec();
};

// طريقة لعرض إحصائيات عمليات الشحن والاستخدام
balanceTransactionSchema.statics.getTransactionStats = async function() {
    return await this.aggregate([
        { $group: {
            _id: '$type',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
        }}
    ]);
};

const BalanceTransaction = mongoose.model('BalanceTransaction', balanceTransactionSchema);

module.exports = BalanceTransaction;
