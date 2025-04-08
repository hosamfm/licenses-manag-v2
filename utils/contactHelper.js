/**
 * ملف مساعد للتعامل مع أسماء جهات الاتصال والعملاء على جانب الخادم
 */

/**
 * الحصول على اسم العميل المعروض
 * @param {Object} conversation - بيانات المحادثة
 * @param {Object} options - خيارات العرض
 * @returns {String} اسم العميل المعروض
 */
function getServerDisplayName(conversation, options = {}) {
    if (!conversation) return 'عميل غير معروف';
    
    // القيم الافتراضية للخيارات
    const opts = {
        useContact: true,           // استخدام بيانات جهة الاتصال
        fallbackToNumber: true,     // استخدام الرقم كخيار احتياطي
        unknownLabel: 'عميل غير معروف' // النص المعروض عند عدم وجود اسم أو رقم
    };
    
    // دمج الخيارات المقدمة
    if (options) {
        Object.assign(opts, options);
    }
    
    let displayName = '';
    
    // البحث عن الاسم من جهة الاتصال
    if (opts.useContact && conversation.contactId) {
        if (typeof conversation.contactId === 'object' && conversation.contactId !== null) {
            if (conversation.contactId.name) {
                displayName = conversation.contactId.name;
            }
        }
    }
    
    // إذا لم يتم العثور على اسم من جهة الاتصال، استخدم customerName
    if (!displayName && conversation.customerName) {
        displayName = conversation.customerName;
    }
    
    // إذا لم يتم العثور على اسم، استخدم رقم الهاتف
    if (!displayName && opts.fallbackToNumber && conversation.phoneNumber) {
        displayName = conversation.phoneNumber;
    }
    
    // إذا لم يتم العثور على اسم أو رقم، استخدم النص الافتراضي
    if (!displayName) {
        displayName = opts.unknownLabel;
    }
    
    return displayName;
}

module.exports = {
    getServerDisplayName
}; 