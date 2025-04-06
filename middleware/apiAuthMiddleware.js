/**
 * وسيط المصادقة عبر API
 * يستخدم للتحقق من مفتاح API في طلبات واجهة برمجة التطبيقات الخارجية
 */

const User = require('../models/User');
const logger = require('../services/loggerService');

/**
 * التحقق من مفتاح API العام
 * يستخدم مع نقاط النهاية المخصصة للأنظمة الخارجية
 */
const verifySystemApiKey = async (req, res, next) => {
    try {
        // استخراج مفتاح API من رأس الطلب أو من معلمات الطلب
        const apiKey = req.headers['x-api-key'] || req.query.apiKey;
        
        if (!apiKey) {
            return res.status(401).json({ 
                success: false, 
                message: 'مفتاح API مطلوب للوصول إلى هذه الخدمة' 
            });
        }
        
        // التحقق من مفتاح API من إعدادات التطبيق
        // في هذا المثال، نستخدم مفتاح API محدد مسبقًا، يمكن تحديثه لاستخدام قاعدة بيانات
        const systemApiKey = process.env.SYSTEM_API_KEY || 'sem_system_api_key_2025';
        
        if (apiKey !== systemApiKey) {
            logger.warn('apiAuthMiddleware', `محاولة وصول غير مصرح بها باستخدام مفتاح API غير صالح: ${apiKey}`);
            return res.status(403).json({ 
                success: false, 
                message: 'مفتاح API غير صالح' 
            });
        }
        
        // إضافة معلومات النظام إلى الطلب
        req.system = {
            isSystemRequest: true,
            apiKeyUsed: apiKey
        };
        
        // متابعة مع الطلب
        next();
    } catch (error) {
        logger.error('apiAuthMiddleware', 'خطأ في التحقق من مفتاح API', error);
        return res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ أثناء التحقق من مفتاح API' 
        });
    }
};

module.exports = {
    verifySystemApiKey
};
