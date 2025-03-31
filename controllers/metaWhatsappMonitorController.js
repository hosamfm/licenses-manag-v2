/**
 * متحكم مراقبة واتساب الرسمي من ميتا
 */
const MetaWhatsappWebhookLog = require('../models/MetaWhatsappWebhookLog');
const logger = require('../services/loggerService');

/**
 * عرض صفحة مراقبة webhook واتساب ميتا
 */
exports.showMonitor = async (req, res) => {
    try {
        // الحصول على عدد السجلات الإجمالي
        const totalLogs = await MetaWhatsappWebhookLog.countDocuments();
        
        // الحصول على إحصائيات لأنواع السجلات
        const messageCount = await MetaWhatsappWebhookLog.countDocuments({ type: 'message' });
        const statusCount = await MetaWhatsappWebhookLog.countDocuments({ type: 'status' });
        const unknownCount = await MetaWhatsappWebhookLog.countDocuments({ type: 'unknown' });
        
        // الحصول على أحدث السجلات (أحدث 50 سجل)
        const latestLogs = await MetaWhatsappWebhookLog.find()
            .sort({ timestamp: -1 })
            .limit(50);
        
        // تقديم الصفحة
        res.render('meta_whatsapp_monitor', {
            totalLogs,
            messageCount,
            statusCount,
            unknownCount,
            latestLogs,
            flashMessages: req.flash()
        });
    } catch (error) {
        logger.error('metaWhatsappMonitorController', 'خطأ في عرض صفحة المراقبة', error);
        req.flash('error', 'حدث خطأ أثناء تحميل بيانات المراقبة');
        res.redirect('/admin/meta-whatsapp-settings');
    }
};

/**
 * عرض تفاصيل سجل webhook محدد
 */
exports.showLogDetails = async (req, res) => {
    try {
        const logId = req.params.id;
        
        // الحصول على السجل المطلوب
        const log = await MetaWhatsappWebhookLog.findById(logId);
        
        if (!log) {
            req.flash('error', 'السجل غير موجود');
            return res.redirect('/admin/meta-whatsapp-monitor');
        }
        
        // تقديم صفحة التفاصيل
        res.render('meta_whatsapp_log_details', {
            log,
            flashMessages: req.flash()
        });
    } catch (error) {
        logger.error('metaWhatsappMonitorController', 'خطأ في عرض تفاصيل السجل', error);
        req.flash('error', 'حدث خطأ أثناء تحميل تفاصيل السجل');
        res.redirect('/admin/meta-whatsapp-monitor');
    }
};

/**
 * الحصول على أحدث السجلات (API)
 */
exports.getLatestLogs = async (req, res) => {
    try {
        // تحديد عدد السجلات المطلوبة
        const limit = parseInt(req.query.limit) || 20;
        
        // الحصول على أحدث السجلات
        const latestLogs = await MetaWhatsappWebhookLog.find()
            .sort({ timestamp: -1 })
            .limit(limit);
        
        // إرجاع النتائج كـ JSON
        res.json({
            success: true,
            logs: latestLogs
        });
    } catch (error) {
        logger.error('metaWhatsappMonitorController', 'خطأ في الحصول على أحدث السجلات', error);
        res.status(500).json({
            success: false,
            error: 'حدث خطأ أثناء الحصول على أحدث السجلات'
        });
    }
};

/**
 * حذف سجلات webhook القديمة
 */
exports.clearOldLogs = async (req, res) => {
    try {
        // حساب تاريخ قبل 30 يومًا
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // حذف السجلات القديمة
        const result = await MetaWhatsappWebhookLog.deleteMany({
            timestamp: { $lt: thirtyDaysAgo }
        });
        
        logger.info('metaWhatsappMonitorController', 'تم حذف السجلات القديمة', {
            count: result.deletedCount
        });
        
        req.flash('success', `تم حذف ${result.deletedCount} سجل قديم بنجاح`);
        res.redirect('/admin/meta-whatsapp-monitor');
    } catch (error) {
        logger.error('metaWhatsappMonitorController', 'خطأ في حذف السجلات القديمة', error);
        req.flash('error', 'حدث خطأ أثناء حذف السجلات القديمة');
        res.redirect('/admin/meta-whatsapp-monitor');
    }
};
