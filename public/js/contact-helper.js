/**
 * ملف مساعد للتعامل مع أسماء جهات الاتصال والعملاء
 * يستخدم لتوحيد طريقة عرض الاسم في جميع أنحاء التطبيق
 */

/**
 * الحصول على اسم العميل المعروض من بيانات المحادثة
 * @param {Object} conversation - بيانات المحادثة
 * @param {Object} options - خيارات العرض
 * @returns {String} اسم العميل المعروض
 */
function getContactDisplayName(conversation, options = {}) {
    // القيم الافتراضية للخيارات
    const defaultOptions = {
        preferContact: true,           // تفضيل اسم جهة الاتصال على الاسم المخصص
        fallbackToNumber: true,        // استخدام الرقم كخيار احتياطي
        unknownLabel: 'رقم غير معروف', // النص المعروض عند عدم وجود اسم أو رقم
        includeNumber: false           // إضافة الرقم بجانب الاسم
    };
    
    // دمج الخيارات الافتراضية مع الخيارات المقدمة
    const opts = { ...defaultOptions, ...options };
    
    // التأكد من وجود محادثة صالحة
    if (!conversation) {
        return opts.unknownLabel;
    }
    
    let displayName = '';
    
    // محاولة استخدام بيانات جهة الاتصال
    if (opts.preferContact && conversation.contactId) {
        // إذا كان contactId كائنًا كاملًا
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
    
    // إضافة الرقم إلى جانب الاسم إذا طلب ذلك
    if (displayName && opts.includeNumber && conversation.phoneNumber) {
        displayName += ` (${conversation.phoneNumber})`;
    }
    
    // إذا لم يتم العثور على اسم، استخدم الرقم كخيار احتياطي
    if (!displayName && opts.fallbackToNumber && conversation.phoneNumber) {
        displayName = conversation.phoneNumber;
    }
    
    // إذا لم يتم العثور على اسم أو رقم، استخدم التسمية الاحتياطية
    return displayName || opts.unknownLabel;
}

/**
 * التحقق من وجود معلومات جهة الاتصال كاملة في المحادثة
 * @param {Object} conversation - بيانات المحادثة
 * @returns {Boolean} ما إذا كانت معلومات جهة الاتصال كاملة
 */
function hasCompleteContactInfo(conversation) {
    return (
        conversation && 
        conversation.contactId && 
        typeof conversation.contactId === 'object' && 
        conversation.contactId !== null &&
        conversation.contactId.name
    );
}

/**
 * جلب معلومات جهة الاتصال الكاملة للمحادثة إذا لم تكن موجودة
 * @param {String} conversationId - معرف المحادثة
 * @returns {Promise<Object>} وعد يحتوي على معلومات المحادثة المحدثة
 */
async function fetchCompleteContactInfo(conversationId) {
    if (!conversationId) {
        return null;
    }
    
    try {
        const response = await fetch(`/crm/conversations/${conversationId}/ajax?_=${new Date().getTime()}`, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        if (!response.ok) {
            throw new Error(`خطأ في الاستجابة: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && data.conversation) {
            return data.conversation;
        }
        
        return null;
    } catch (error) {
        console.error('خطأ في جلب معلومات جهة الاتصال:', error);
        return null;
    }
}

// تصدير الدوال للاستخدام في ملفات أخرى
window.ContactHelper = {
    getContactDisplayName,
    hasCompleteContactInfo,
    fetchCompleteContactInfo
}; 