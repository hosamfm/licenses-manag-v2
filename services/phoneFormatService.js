/**
 * خدمة تنسيق أرقام الهواتف المركزية
 * توفر وظائف موحدة لتنسيق أرقام الهواتف في جميع أنحاء التطبيق
 */
const libphonenumber = require('libphonenumber-js');
const logger = require('./loggerService');

/**
 * تنسيق رقم الهاتف إلى الصيغة الدولية
 * @param {string} phone رقم الهاتف المراد تنسيقه
 * @param {string} defaultCountry رمز الدولة الافتراضي إذا لم يحدد في الرقم
 * @returns {Object} نتيجة التنسيق: {isValid, phone, error}
 */
function formatPhoneNumber(phone, defaultCountry = 'LY') {
    try {
        if (!phone) {
            return { isValid: false, error: 'رقم الهاتف مطلوب' };
        }

        // تنظيف الرقم من الأحرف غير الرقمية باستثناء +
        let cleanPhone = phone.toString().replace(/[^\d+]/g, '');
        
        // إذا لم يبدأ الرقم بـ + ورمز الدولة، نضيف رمز الدولة الليبي
        if (!cleanPhone.startsWith('+') && !cleanPhone.startsWith('00')) {
            // إذا كان الرقم يبدأ بـ 0 نحذفه
            if (cleanPhone.startsWith('0')) {
                cleanPhone = cleanPhone.substring(1);
            }
            
            // إضافة رمز الدولة الليبي (218)
            cleanPhone = '218' + cleanPhone;
        } else if (cleanPhone.startsWith('00')) {
            // تحويل 00 إلى صيغة دولية
            cleanPhone = cleanPhone.substring(2);
        }
        
        // التأكد من إضافة علامة +
        if (!cleanPhone.startsWith('+')) {
            cleanPhone = '+' + cleanPhone;
        }
        
        // محاولة التحقق من صحة الرقم باستخدام مكتبة libphonenumber إذا كانت متوفرة
        try {
            const phoneNumberObject = libphonenumber.parsePhoneNumber(cleanPhone, defaultCountry);
            
            if (!phoneNumberObject || !phoneNumberObject.isValid()) {
                return { 
                    isValid: false, 
                    error: 'رقم هاتف غير صالح',
                    phone: cleanPhone 
                };
            }
            
            // الحصول على الرقم بالصيغة الدولية
            const formattedPhone = phoneNumberObject.number;
            
            logger.debug('PhoneFormatService', 'تنسيق رقم هاتف عام', {
                original: phone,
                formatted: formattedPhone
            });
            
            return { 
                isValid: true, 
                phone: formattedPhone,
                countryCode: phoneNumberObject.countryCallingCode
            };
        } catch (error) {
            // في حالة عدم توفر المكتبة، نستخدم منطق تنسيق بسيط
            logger.debug('PhoneFormatService', 'استخدام منطق تنسيق بسيط (فشل استخدام المكتبة)', {
                error: error.message
            });
            
            // التحقق البسيط من صحة الرقم (يجب أن يكون أكثر من 7 أرقام)
            if (cleanPhone.replace('+', '').length < 7) {
                return { 
                    isValid: false, 
                    error: 'رقم هاتف غير صالح، يجب أن يحتوي على 7 أرقام على الأقل',
                    phone: cleanPhone 
                };
            }
            
            return { 
                isValid: true, 
                phone: cleanPhone
            };
        }
    } catch (error) {
        logger.error('PhoneFormatService', 'خطأ في تنسيق رقم الهاتف', error);
        return { 
            isValid: false, 
            error: 'خطأ في تنسيق رقم الهاتف: ' + error.message,
            phone: phone 
        };
    }
}

/**
 * تجهيز رقم هاتف وإعدادات للـ SMS
 * @param {string} phoneNumber رقم الهاتف المراد تنسيقه
 * @returns {Object} معلومات الهاتف الجاهزة للإرسال: {phoneNumber, params}
 */
function prepareForSms(phoneNumber) {
    // تنسيق الرقم بالصيغة الدولية أولاً
    const result = formatPhoneNumber(phoneNumber);
    
    // التأكد من وجود علامة + في الرقم
    let formattedPhone = result.phone;
    
    // إزالة علامة + للإرسال إلى SemySMS API
    const phoneWithoutPlus = formattedPhone.startsWith('+') ? formattedPhone.substring(1) : formattedPhone;
    
    // تجهيز المعلمات الخاصة بالـ SMS
    const params = {
        phone: phoneWithoutPlus, // الرقم بدون +
        add_plus: 1  // إضافة + عند الإرسال
    };
    
    logger.debug('PhoneFormatService', 'تجهيز رقم هاتف للـ SMS', {
        original: phoneNumber,
        formatted: formattedPhone,
        apiPhone: phoneWithoutPlus,
        addPlus: 1
    });
    
    return {
        formattedPhone,      // الرقم مع +
        phoneForApi: phoneWithoutPlus, // الرقم بدون + (للإرسال)
        params: params,      // المعلمات الإضافية
        isValid: result.isValid
    };
}

/**
 * تجهيز رقم هاتف وإعدادات للواتساب
 * @param {string} phoneNumber رقم الهاتف المراد تنسيقه
 * @returns {Object} معلومات الهاتف الجاهزة للإرسال: {phoneNumber, params}
 */
function prepareForWhatsapp(phoneNumber) {
    // استخدام نفس منطق SMS لتوحيد التنسيق
    const result = prepareForSms(phoneNumber);
    
    // إضافة معلمة الواتساب
    result.params.whatsapp = 1;
    
    logger.debug('PhoneFormatService', 'تجهيز رقم هاتف للواتساب', {
        original: phoneNumber,
        formatted: result.formattedPhone,
        apiPhone: result.phoneForApi,
        addPlus: 1
    });
    
    return result;
}

module.exports = {
    formatPhoneNumber,
    prepareForSms,
    prepareForWhatsapp
};
