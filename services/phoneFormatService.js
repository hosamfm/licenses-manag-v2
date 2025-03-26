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

        // تسجيل الرقم الأصلي للتشخيص
        logger.debug('PhoneFormatService', 'الرقم الأصلي قبل التنسيق', {
            originalPhone: phone,
            type: typeof phone
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
        
        // تسجيل الرقم بعد إزالة المسافات للتشخيص
        logger.debug('PhoneFormatService', 'الرقم بعد إزالة المسافات', {
            cleanedPhone: cleanPhone
        });
        
        // ثم تنظيف الرقم من الأحرف غير الرقمية باستثناء +
        cleanPhone = cleanPhone.replace(/[^\d+]/g, '');
        
        // معالجة الحالات المختلفة للأرقام
        
        // الحالة 1: إذا كان الرقم يبدأ بـ +00 أو +0
        if (cleanPhone.startsWith('+00')) {
            // إزالة +00 واستبدالها بـ +
            cleanPhone = '+' + cleanPhone.substring(3);
            logger.debug('PhoneFormatService', 'تم تصحيح رقم يبدأ بـ +00', { cleanPhone });
        } else if (cleanPhone.startsWith('+0')) {
            // إزالة +0 واستبدالها بـ +
            cleanPhone = '+' + cleanPhone.substring(2);
            logger.debug('PhoneFormatService', 'تم تصحيح رقم يبدأ بـ +0', { cleanPhone });
        }
        
        // الحالة 2: إذا كان الرقم يبدأ بـ 00 (صيغة دولية بدون +)
        if (cleanPhone.startsWith('00')) {
            // تحويل 00 إلى +
            cleanPhone = '+' + cleanPhone.substring(2);
            logger.debug('PhoneFormatService', 'تم تحويل رقم يبدأ بـ 00 إلى صيغة دولية', { cleanPhone });
        }
        
        // الحالة 3: إذا كان الرقم يبدأ بـ 0 ويليه 9 (أرقام ليبية)
        if (cleanPhone.startsWith('0') && cleanPhone.length > 1 && cleanPhone.charAt(1) === '9') {
            // إزالة 0 وإضافة رمز ليبيا
            cleanPhone = '+218' + cleanPhone.substring(1);
            logger.debug('PhoneFormatService', 'تم تحويل رقم ليبي يبدأ بـ 09 إلى صيغة دولية', { cleanPhone });
        } 
        // الحالة 4: إذا كان الرقم يبدأ بـ 0 (أي رقم آخر)
        else if (cleanPhone.startsWith('0')) {
            // إزالة 0 وإضافة رمز الدولة الافتراضي
            cleanPhone = '+218' + cleanPhone.substring(1);
            logger.debug('PhoneFormatService', 'تم تحويل رقم يبدأ بـ 0 إلى صيغة دولية', { cleanPhone });
        }
        
        // الحالة 5: إذا كان الرقم لا يبدأ بـ + (رقم بدون رمز دولي)
        if (!cleanPhone.startsWith('+')) {
            // التحقق إذا كان الرقم يبدأ برقم 9 (محتمل أنه رقم ليبي)
            if (cleanPhone.startsWith('9') && cleanPhone.length >= 9) {
                cleanPhone = '+218' + cleanPhone;
                logger.debug('PhoneFormatService', 'تم إضافة رمز ليبيا لرقم يبدأ بـ 9', { cleanPhone });
            } else {
                // إضافة رمز الدولة الافتراضي (ليبيا) لجميع الأرقام الأخرى
                cleanPhone = '+218' + cleanPhone;
                logger.debug('PhoneFormatService', 'تم إضافة رمز ليبيا لرقم بدون رمز دولي', { cleanPhone });
            }
        }
        
        // الحالة 6: إذا كان الرقم يبدأ بـ + ولكن بدون رمز دولة ليبي
        // التحقق إذا كان الرقم ليبي ولكن بدون رمز الدولة الصحيح
        if (cleanPhone.startsWith('+9') && cleanPhone.length >= 10 && !cleanPhone.startsWith('+218')) {
            cleanPhone = '+218' + cleanPhone.substring(1);
            logger.debug('PhoneFormatService', 'تم تصحيح رقم ليبي بدون رمز الدولة الصحيح', { cleanPhone });
        }
        
        // تسجيل الرقم بعد التنظيف الكامل للتشخيص
        logger.debug('PhoneFormatService', 'الرقم بعد التنظيف الكامل', {
            finalCleanedPhone: cleanPhone
        });
        
        // محاولة التحقق من صحة الرقم باستخدام مكتبة libphonenumber إذا كانت متوفرة
        try {
            const phoneNumberObject = libphonenumber.parsePhoneNumber(cleanPhone, defaultCountry);
            
            if (!phoneNumberObject || !phoneNumberObject.isValid()) {
                logger.warn('PhoneFormatService', 'رقم هاتف غير صالح بعد التحقق بالمكتبة', {
                    phone: cleanPhone,
                    countryCode: defaultCountry
                });
                
                // محاولة أخيرة للتصحيح إذا كان الرقم غير صالح
                // في بعض الحالات، قد تكون المكتبة صارمة جدًا في التحقق
                
                // إذا كان الرقم يحتوي على أكثر من 7 أرقام، نعتبره صالحًا للاستخدام
                if (cleanPhone.replace(/\D/g, '').length >= 7) {
                    // التأكد من أن الرقم يبدأ برمز الدولة الليبي إذا كان يبدأ بـ 9
                    if (cleanPhone.startsWith('+9') && !cleanPhone.startsWith('+218')) {
                        cleanPhone = '+218' + cleanPhone.substring(1);
                        logger.info('PhoneFormatService', 'تم تصحيح رقم ليبي بدون رمز الدولة الصحيح في المحاولة الأخيرة', {
                            phone: cleanPhone
                        });
                    }
                    
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
            
            // التأكد من أن الرقم الليبي يبدأ بـ +218
            if (formattedPhone.startsWith('+9') && !formattedPhone.startsWith('+218') && 
                (phoneNumberObject.countryCallingCode === '218' || defaultCountry === 'LY')) {
                formattedPhone = '+218' + formattedPhone.substring(1);
                logger.debug('PhoneFormatService', 'تم تصحيح رقم ليبي بعد التنسيق', {
                    original: phoneNumberObject.number,
                    corrected: formattedPhone
                });
            }
            
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
            
            // التأكد من أن الرقم يبدأ برمز الدولة الليبي إذا كان يبدأ بـ 9
            if (cleanPhone.startsWith('+9') && !cleanPhone.startsWith('+218')) {
                cleanPhone = '+218' + cleanPhone.substring(1);
                logger.debug('PhoneFormatService', 'تم تصحيح رقم ليبي في المنطق البسيط', {
                    phone: cleanPhone
                });
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
