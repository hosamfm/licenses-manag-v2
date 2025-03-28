/**
 * مسارات API الخارجية للعملاء
 * هذا الملف يحتوي على نقاط النهاية المخصصة للاستخدام من أنظمة خارجية
 */

const express = require('express');
const router = express.Router();
const semClientController = require('../controllers/semClientController');
const { verifySystemApiKey } = require('../middleware/apiAuthMiddleware');
const User = require('../models/User');
const SemClient = require('../models/SemClient');
const logger = require('../services/loggerService');
const BalanceTransaction = require('../models/BalanceTransaction');

/**
 * نقطة API لإنشاء عميل جديد من نظام خارجي
 * تتطلب مفتاح API للنظام للمصادقة
 * POST /external-api/clients
 */
router.post('/external-api/clients', verifySystemApiKey, async (req, res) => {
    try {
        const { 
            name, 
            email, 
            phone, 
            company, 
            dailyLimit, 
            monthlyLimit, 
            messagingChannels, 
            defaultCountry,
            creatorUsername 
        } = req.body;
        
        // التحقق من توفر البيانات الإلزامية
        if (!name || !email || !phone) {
            return res.status(400).json({
                success: false,
                message: 'البيانات الإلزامية غير مكتملة: الاسم، البريد الإلكتروني، ورقم الهاتف مطلوبة'
            });
        }
        
        // التحقق من البريد الإلكتروني
        const existingClient = await SemClient.findOne({ email });
        if (existingClient) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني مستخدم بالفعل'
            });
        }
        
        // البحث عن المستخدم المنشئ
        let userId;
        
        if (creatorUsername) {
            // معالجة حالة خاصة - تحويل website_registration إلى website-registration
            const normalizedUsername = creatorUsername === 'website_registration' 
                ? 'website-registration' 
                : creatorUsername;
            
            // إذا تم تحديد اسم مستخدم، ابحث عنه
            const user = await User.findOne({ username: normalizedUsername });
            if (!user) {
                // محاولة البحث عن مستخدم website-registration إذا كان website_registration غير موجود
                if (creatorUsername === 'website_registration') {
                    const alternativeUser = await User.findOne({ username: 'website-registration' });
                    if (alternativeUser) {
                        userId = alternativeUser._id;
                    } else {
                        return res.status(400).json({
                            success: false,
                            message: `المستخدم website-registration غير موجود. تأكد من تشغيل الخادم مرة واحدة على الأقل لإنشاء المستخدم.`
                        });
                    }
                } else {
                    return res.status(400).json({
                        success: false,
                        message: `المستخدم ${creatorUsername} غير موجود`
                    });
                }
            } else {
                userId = user._id;
            }
        } else {
            // استخدام أول مدير موجود كمنشئ افتراضي
            const adminUser = await User.findOne({ user_role: 'admin' });
            if (!adminUser) {
                return res.status(500).json({
                    success: false,
                    message: 'لم يتم العثور على مستخدم افتراضي لإنشاء العميل'
                });
            }
            userId = adminUser._id;
        }
        
        // إنشاء مفتاح API
        const { apiKey } = SemClient.generateApiCredentials();
        
        // إنشاء العميل الجديد
        const newClient = new SemClient({
            name,
            email,
            phone,
            company,
            apiKey,
            userId,
            dailyLimit: dailyLimit || 100,
            monthlyLimit: monthlyLimit || 3000,
            messagingChannels: {
                sms: messagingChannels?.sms ?? true,
                whatsapp: messagingChannels?.whatsapp ?? false
            }
        });
        
        // إضافة إعدادات كود الدولة الافتراضي إذا وجدت
        if (defaultCountry) {
            newClient.defaultCountry = {
                code: defaultCountry.code || '218',
                alpha2: defaultCountry.alpha2 || 'LY',
                name: defaultCountry.name || 'ليبيا'
            };
        }
        
        await newClient.save();
        
        // إضافة رصيد أولي بقيمة 100 نقطة للعميل الجديد
        try {
            // إنشاء عملية إضافة رصيد
            const transaction = new BalanceTransaction({
                clientId: newClient._id,
                amount: 100, // إضافة 100 نقطة
                type: 'deposit',
                notes: 'رصيد ترحيبي للعميل الجديد',
                performedBy: userId
            });
            
            // حفظ عملية إضافة الرصيد
            await transaction.save();
            
            // تحديث رصيد العميل
            newClient.balance += 100;
            await newClient.save();
            
            logger.info('externalApiRoutes', `تم إضافة رصيد ترحيبي بقيمة 100 نقطة للعميل الجديد: ${newClient.name}`);
        } catch (balanceError) {
            // تسجيل الخطأ ولكن الاستمرار في العملية حتى لا تتأثر عملية إنشاء العميل
            logger.error('externalApiRoutes', 'خطأ في إضافة الرصيد الترحيبي للعميل الجديد', balanceError);
        }
        
        // تسجيل العملية
        logger.info('externalApiRoutes', `تم إنشاء عميل جديد من نظام خارجي: ${name} (${email})`);
        
        return res.status(201).json({
            success: true,
            message: 'تم إنشاء العميل بنجاح',
            client: {
                _id: newClient._id,
                name: newClient.name,
                email: newClient.email,
                phone: newClient.phone,
                company: newClient.company,
                apiKey: newClient.apiKey,
                dailyLimit: newClient.dailyLimit,
                monthlyLimit: newClient.monthlyLimit,
                messagingChannels: newClient.messagingChannels,
                defaultCountry: newClient.defaultCountry
            }
        });
    } catch (error) {
        logger.error('externalApiRoutes', 'خطأ في إنشاء عميل من نظام خارجي', error);
        return res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ أثناء إنشاء العميل', 
            error: error.message 
        });
    }
});

/**
 * نقطة API للتحقق من وجود عميل بناءً على البريد الإلكتروني
 * GET /external-api/clients/check
 */
router.get('/external-api/clients/check', verifySystemApiKey, async (req, res) => {
    try {
        const { email } = req.query;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'البريد الإلكتروني مطلوب للتحقق'
            });
        }
        
        const client = await SemClient.findOne({ email }).select('-apiKey');
        
        return res.status(200).json({
            success: true,
            exists: !!client,
            client: client ? {
                _id: client._id,
                name: client.name,
                email: client.email,
                status: client.status
            } : null
        });
    } catch (error) {
        logger.error('externalApiRoutes', 'خطأ في التحقق من وجود عميل', error);
        return res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ أثناء التحقق من وجود العميل', 
            error: error.message 
        });
    }
});

module.exports = router;
