const SemClient = require('../models/SemClient');
const BalanceTransaction = require('../models/BalanceTransaction');
const User = require('../models/User');
const logger = require('../services/loggerService');

/**
 * إضافة رصيد لعميل محدد
 */
exports.addBalance = async (req, res) => {
    try {
        const { clientId, amount, notes } = req.body;
        const userId = req.session.userId;

        // التحقق من البيانات
        if (!clientId || !amount) {
            return res.status(400).json({
                success: false,
                message: 'يرجى توفير معرف العميل وقيمة الرصيد'
            });
        }
        
        // التحقق من أن المبلغ رقم موجب
        if (isNaN(amount) || Number(amount) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'يجب أن يكون المبلغ رقمًا موجبًا'
            });
        }

        // البحث عن العميل
        const client = await SemClient.findById(clientId);
        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'العميل غير موجود'
            });
        }

        // إنشاء عملية إضافة رصيد
        const transaction = new BalanceTransaction({
            clientId,
            amount: Number(amount),
            type: 'deposit',
            notes: notes || 'إضافة رصيد',
            performedBy: userId
        });

        // حفظ العملية
        await transaction.save();

        // تحديث رصيد العميل
        client.balance += Number(amount);
        await client.save();

        logger.info(`تم إضافة رصيد ${amount} للعميل ${client.name} بواسطة المستخدم ${userId}`);

        return res.status(200).json({
            success: true,
            message: 'تم إضافة الرصيد بنجاح',
            newBalance: client.balance
        });

    } catch (error) {
        logger.error('خطأ في إضافة الرصيد:', error);
        return res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء إضافة الرصيد',
            error: error.message
        });
    }
};

/**
 * الحصول على سجل عمليات الرصيد لعميل محدد
 */
exports.getClientTransactions = async (req, res) => {
    try {
        const { clientId } = req.params;

        // البحث عن العميل
        const client = await SemClient.findById(clientId);
        if (!client) {
            return res.status(404).json({
                success: false,
                message: 'العميل غير موجود'
            });
        }

        // جلب سجل العمليات
        const transactions = await BalanceTransaction.getClientTransactions(clientId);

        return res.status(200).json({
            success: true,
            transactions,
            balance: client.balance
        });

    } catch (error) {
        logger.error('خطأ في استرجاع سجل عمليات الرصيد:', error);
        return res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء استرجاع سجل عمليات الرصيد',
            error: error.message
        });
    }
};

/**
 * الحصول على جميع عمليات الرصيد (للمدير فقط)
 */
exports.getAllTransactions = async (req, res) => {
    try {
        // التحقق من عدد العمليات المطلوبة وصفحة البداية
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        // جلب إجمالي عدد العمليات
        const totalTransactions = await BalanceTransaction.countDocuments();
        
        // حساب عدد الصفحات
        const totalPages = Math.ceil(totalTransactions / limit);
        
        // جلب العمليات مع المعلومات المرتبطة (العملاء والمستخدمين)
        const transactions = await BalanceTransaction.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('clientId', 'name email')
            .populate('performedBy', 'username name')
            .exec();
        
        return res.status(200).json({
            success: true,
            page,
            totalPages,
            totalTransactions,
            limit,
            transactions
        });
        
    } catch (error) {
        logger.error('خطأ في استرجاع عمليات الرصيد:', error);
        return res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء استرجاع عمليات الرصيد',
            error: error.message
        });
    }
};

/**
 * الحصول على قائمة العملاء حسب المستخدم
 */
exports.getClientsForBalance = async (req, res) => {
    try {
        const userId = req.session.userId;
        const userRole = req.session.userRole;
        
        let query = {};
        
        // إذا كان المستخدم ليس مدير أو مشرف، عرض فقط العملاء الذين أنشأهم
        if (!['admin', 'supervisor'].includes(userRole)) {
            query.createdBy = userId;
        }
        
        // جلب العملاء مع حقولهم الأساسية
        const clients = await SemClient.find(query)
            .select('name email balance createdBy')
            .sort({ name: 1 });
        
        return res.status(200).json({
            success: true,
            clients
        });
    } catch (error) {
        logger.error('Error getting clients for balance', error);
        return res.status(500).json({
            success: false,
            message: 'حدث خطأ أثناء جلب بيانات العملاء',
            error: error.message
        });
    }
};
