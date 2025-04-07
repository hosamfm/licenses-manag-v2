const mongoose = require('mongoose');

const quickReplySchema = new mongoose.Schema({
    shortcut: {
        type: String,
        required: [true, 'الاختصار مطلوب'],
        trim: true,
        unique: true, // قد تحتاج إلى فهرس مركب مع userId إذا كانت الاختصارات فريدة لكل مستخدم
        lowercase: true // تخزين الاختصارات بأحرف صغيرة لسهولة البحث
    },
    text: {
        type: String,
        required: [true, 'نص الرد مطلوب'],
        trim: true
    },
    userId: { // لربط الرد بمستخدم معين (اختياري)
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        index: true, // فهرس لتسريع الاستعلامات الخاصة بالمستخدم
        default: null // الافتراضي يعني رد عام متاح للجميع
    },
    // يمكنك إضافة حقول أخرى مثل 'category' أو 'tags' لتنظيم الردود
    // category: { type: String, trim: true }
}, {
    timestamps: true // إضافة createdAt و updatedAt تلقائيًا
});

// إضافة فهرس مركب إذا أردت أن يكون الاختصار فريدًا لكل مستخدم
// quickReplySchema.index({ userId: 1, shortcut: 1 }, { unique: true });
// إذا كنت تريد أن يكون الاختصار فريدًا بشكل عام، اترك الفهرس على shortcut فقط.

const QuickReply = mongoose.model('QuickReply', quickReplySchema);

module.exports = QuickReply; 