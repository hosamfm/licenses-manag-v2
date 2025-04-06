const mongoose = require('mongoose');

const semClientSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        required: true,
        trim: true
    },
    company: {
        type: String,
        required: false,
        trim: true
    },
    messagingChannels: {
        sms: {
            type: Boolean,
            default: true
        },
        whatsapp: {
            type: Boolean,
            default: false
        },
        metaWhatsapp: {
            type: Boolean,
            default: false
        }
    },
    // القناة المفضلة للإرسال
    preferredChannel: {
        type: String,
        enum: ['none', 'sms', 'whatsapp', 'metaWhatsapp', 'metawhatsapp'],
        default: 'none'
    },
    // إعدادات نماذج رسائل Meta WhatsApp
    metaWhatsappTemplates: {
        name: { type: String, default: 'siraj' },
        language: { type: String, default: 'ar' }
    },
    apiKey: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended'],
        default: 'active'
    },
    messagesSent: {
        type: Number,
        default: 0
    },
    dailyLimit: {
        type: Number,
        default: 100
    },
    monthlyLimit: {
        type: Number,
        default: 3000
    },
    balance: {
        type: Number,
        default: 0
    },
    // إعدادات كود الدولة الافتراضي
    defaultCountry: {
        code: {
            type: String,
            default: '218', // رمز ليبيا كافتراضي
            trim: true
        },
        alpha2: {
            type: String,
            default: 'LY', // رمز ليبيا بحرفين كافتراضي
            trim: true
        },
        name: {
            type: String,
            default: 'ليبيا', // اسم الدولة باللغة العربية
            trim: true
        }
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// طريقة لإنشاء مفتاح API
semClientSchema.statics.generateApiCredentials = function() {
    const crypto = require('crypto');
    const apiKey = crypto.randomBytes(16).toString('hex');
    return { apiKey };
};

// طريقة للتحقق من صحة المفتاح
semClientSchema.statics.validateApiCredentials = async function(apiKey) {
    return await this.findOne({ apiKey, status: 'active' });
};

// التحقق من حدود الرسائل اليومية
semClientSchema.methods.checkDailyLimit = async function() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const messagesSentToday = await mongoose.model('SemMessage').countDocuments({
        clientId: this._id,
        createdAt: { $gte: today }
    });
    
    return messagesSentToday < this.dailyLimit;
};

// التحقق من حدود الرسائل الشهرية
semClientSchema.methods.checkMonthlyLimit = async function() {
    const firstDayOfMonth = new Date();
    firstDayOfMonth.setDate(1);
    firstDayOfMonth.setHours(0, 0, 0, 0);
    
    const messagesSentThisMonth = await mongoose.model('SemMessage').countDocuments({
        clientId: this._id,
        createdAt: { $gte: firstDayOfMonth }
    });
    
    return messagesSentThisMonth < this.monthlyLimit;
};

// تنفيذ دالة الصفحات (paginate) البسيطة
semClientSchema.statics.paginate = async function(query = {}, options = {}) {
    const page = parseInt(options.page, 10) || 1;
    const limit = parseInt(options.limit, 10) || 10;
    const skip = (page - 1) * limit;
    const sort = options.sort || { createdAt: -1 };
    const populate = options.populate || '';
    
    // تنفيذ استعلام العد
    const countPromise = this.countDocuments(query).exec();
    
    // تنفيذ استعلام البيانات
    let docsPromise = this.find(query)
        .sort(sort)
        .skip(skip)
        .limit(limit);

    if (populate) {
        docsPromise = docsPromise.populate(populate);
    }
    
    docsPromise = docsPromise.exec();
    
    // الانتظار حتى اكتمال كلا الاستعلامات
    const [totalDocs, docs] = await Promise.all([countPromise, docsPromise]);
    
    const totalPages = Math.ceil(totalDocs / limit);
    
    // إعداد الاستجابة
    const result = {
        docs,
        totalDocs,
        limit,
        page,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        nextPage: page < totalPages ? page + 1 : null,
        prevPage: page > 1 ? page - 1 : null,
        pagingCounter: (page - 1) * limit + 1
    };
    
    return result;
};

const SemClient = mongoose.model('SemClient', semClientSchema);

module.exports = SemClient;
