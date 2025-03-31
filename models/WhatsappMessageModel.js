/**
 * ملف استيراد لنموذج رسائل واتساب
 * يستخدم لمعالجة مشكلة اختلاف حالة الأحرف في أسماء الملفات بين أنظمة التشغيل
 */

// استيراد النموذج الأصلي وإعادة تصديره
const WhatsAppMessage = require('./WhatsappMessage');

module.exports = WhatsAppMessage;
