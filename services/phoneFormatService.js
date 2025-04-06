/**
 * خدمة تنسيق أرقام الهواتف المركزية
 * توفر وظائف موحدة لتنسيق أرقام الهواتف في جميع أنحاء التطبيق
 */
const libphonenumber = require('libphonenumber-js');
const logger = require('./loggerService');

// رمز الدولة الافتراضي (يمكن أن يتم تحديثه من إعدادات العميل)
let defaultCountryCode = '218';
let defaultCountryAlpha2 = 'LY';

/**
 * تعيين إعدادات الدولة الافتراضية
 * @param {Object} settings إعدادات الدولة
 * @param {string} settings.countryCode رمز الدولة الرقمي (مثل 218 لليبيا، 46 للسويد)
 * @param {string} settings.countryAlpha2 رمز الدولة بحرفين (مثل LY لليبيا، SE للسويد)
 */
function setDefaultCountry(settings) {
    if (settings && settings.countryCode) {
        defaultCountryCode = settings.countryCode;
        
        // التأكد من عدم وجود علامة + في رمز الدولة المخزن
        if (defaultCountryCode.startsWith('+')) {
            defaultCountryCode = defaultCountryCode.substring(1);
        }
        
        logger.info('PhoneFormatService', 'تم تحديث رمز الدولة الافتراضي', { 
            countryCode: defaultCountryCode 
        });
    }
    
    if (settings && settings.countryAlpha2) {
        defaultCountryAlpha2 = settings.countryAlpha2.toUpperCase();
        logger.info('PhoneFormatService', 'تم تحديث رمز الدولة الافتراضي بحرفين', { 
            countryAlpha2: defaultCountryAlpha2 
        });
    }
}

/**
 * تنسيق رقم الهاتف إلى الصيغة الدولية
 * @param {string} phone رقم الهاتف المراد تنسيقه
 * @param {string} countryAlpha2 رمز الدولة بحرفين (اختياري)
 * @returns {Object} نتيجة التنسيق: {isValid, phone, error}
 */
function formatPhoneNumber(phone, countryAlpha2 = null) {
    try {
        if (!phone) {
            return { isValid: false, error: 'رقم الهاتف مطلوب' };
        }

        // استخدام رمز الدولة المقدم أو الافتراضي
        const useCountryAlpha2 = countryAlpha2 || defaultCountryAlpha2;

        // تسجيل الرقم الأصلي للتشخيص
        logger.debug('PhoneFormatService', 'الرقم الأصلي قبل التنسيق', {
            originalPhone: phone,
            type: typeof phone,
            countryAlpha2: useCountryAlpha2
        });

        // تحويل الرقم إلى نص إذا لم يكن كذلك
        let phoneStr = String(phone);
        
        // إزالة المسافات من بداية ونهاية الرقم
        phoneStr = phoneStr.trim();
        
        // معالجة خاصة للأرقام التي تحتوي على "+ " (علامة + متبوعة بمسافة)
        if (phoneStr.includes('+ ')) {
            phoneStr = phoneStr.replace(/\+\s+/g, '+');
        }
        
        // تنظيف الرقم من المسافات الداخلية
        let cleanPhone = phoneStr.replace(/\s+/g, '');
        
        // تنظيف الرقم من الرموز غير الضرورية (مثل - و () و /)
        cleanPhone = cleanPhone.replace(/[-()\/\\]/g, '');
        
        // تسجيل الرقم بعد إزالة المسافات والرموز للتشخيص
        logger.debug('PhoneFormatService', 'الرقم بعد إزالة المسافات والرموز', {
            cleanedPhone: cleanPhone
        });
        
        // تنظيف الرقم من الأحرف غير الرقمية باستثناء +
        cleanPhone = cleanPhone.replace(/[^\d+]/g, '');
        
        // الحالة 1: إذا كان الرقم يبدأ بـ +00 أو +0
        if (cleanPhone.startsWith('+00')) {
            // إزالة +00 واستبدالها بـ +
            cleanPhone = '+' + cleanPhone.substring(3);
            logger.debug('PhoneFormatService', 'تم تصحيح رقم يبدأ بـ +00', { cleanPhone });
        } else if (cleanPhone.startsWith('+0')) {
            // إزالة +0 واستبدالها بـ + ورمز الدولة
            cleanPhone = '+' + defaultCountryCode + cleanPhone.substring(2);
            logger.debug('PhoneFormatService', 'تم تصحيح رقم يبدأ بـ +0', { 
                cleanPhone,
                countryCode: defaultCountryCode
            });
        }
        
        // الحالة 2: إذا كان الرقم يبدأ بـ 00 (صيغة دولية بدون +)
        if (cleanPhone.startsWith('00')) {
            // تحويل 00 إلى +
            cleanPhone = '+' + cleanPhone.substring(2);
            logger.debug('PhoneFormatService', 'تم تحويل رقم يبدأ بـ 00 إلى صيغة دولية', { cleanPhone });
        }
        
        // التحقق إذا كان الرقم يبدأ بـ + (رقم دولي)
        // إذا كان يبدأ بـ +، نفترض أنه رقم دولي صحيح ولا نعدله
        if (cleanPhone.startsWith('+')) {
            logger.debug('PhoneFormatService', 'تم اكتشاف رقم بصيغة دولية، لا يحتاج تعديل', { cleanPhone });
        } 
        // الأرقام المحلية بدون رمز دولي
        else {
            // الحالة 3: إذا كان الرقم يبدأ بـ 0 (رقم محلي)
            if (cleanPhone.startsWith('0')) {
                // إزالة 0 وإضافة رمز الدولة الافتراضي
                cleanPhone = '+' + defaultCountryCode + cleanPhone.substring(1);
                logger.debug('PhoneFormatService', 'تم تحويل رقم يبدأ بـ 0 إلى صيغة دولية', { 
                    cleanPhone,
                    countryCode: defaultCountryCode 
                });
            } 
            // الحالة 4: إذا كان الرقم لا يبدأ بـ 0 ولا + (رقم محلي بدون رمز دولي)
            else {
                // إضافة رمز الدولة الافتراضي
                cleanPhone = '+' + defaultCountryCode + cleanPhone;
                logger.debug('PhoneFormatService', 'تم إضافة رمز الدولة الافتراضي لرقم بدون رمز دولي', { 
                    cleanPhone,
                    countryCode: defaultCountryCode 
                });
            }
        }
        
        // تسجيل الرقم بعد التنظيف الكامل للتشخيص
        logger.debug('PhoneFormatService', 'الرقم بعد التنظيف الكامل', {
            finalCleanedPhone: cleanPhone
        });
        
        // محاولة التحقق من صحة الرقم باستخدام مكتبة libphonenumber إذا كانت متوفرة
        try {
            const phoneNumberObject = libphonenumber.parsePhoneNumber(cleanPhone, useCountryAlpha2);
            
            if (!phoneNumberObject || !phoneNumberObject.isValid()) {
                logger.warn('PhoneFormatService', 'رقم هاتف غير صالح بعد التحقق بالمكتبة', {
                    phone: cleanPhone,
                    countryCode: useCountryAlpha2
                });
                
                // محاولة أخيرة للتصحيح إذا كان الرقم غير صالح
                // إذا كان الرقم يحتوي على أكثر من 7 أرقام، نعتبره صالحًا للاستخدام
                if (cleanPhone.replace(/\D/g, '').length >= 7) {
                    logger.info('PhoneFormatService', 'تم قبول الرقم رغم فشل التحقق بالمكتبة (يحتوي على أكثر من 7 أرقام)', {
                        phone: cleanPhone
                    });
                    
                    return { 
                        isValid: true, 
                        phone: cleanPhone
                    };
                }
                
                return { 
                    isValid: false, 
                    error: 'رقم هاتف غير صالح',
                    phone: cleanPhone 
                };
            }
            
            // الحصول على الرقم بالصيغة الدولية
            let formattedPhone = phoneNumberObject.number;
            
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
                error: error.message,
                cleanPhone: cleanPhone
            });
            
            // التحقق البسيط من صحة الرقم (يجب أن يكون أكثر من 7 أرقام)
            if (cleanPhone.replace(/\D/g, '').length < 7) {
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
    prepareForWhatsapp,
    setDefaultCountry
};
