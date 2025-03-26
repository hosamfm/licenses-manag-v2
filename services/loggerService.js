/**
 * خدمة تسجيل الأحداث البسيطة
 * Simple Logging Service
 */

class LoggerService {
    /**
     * تسجيل معلومات
     * @param {string} module اسم الوحدة
     * @param {string} message رسالة السجل
     * @param {Object} data بيانات إضافية (اختياري)
     */
    info(module, message, data = {}) {
        // تم تعطيل تسجيل المعلومات لمنع تسرب البيانات الحساسة
        // تم الاحتفاظ بالدالة للتوافق مع الكود الحالي
    }

    /**
     * تسجيل تحذير
     * @param {string} module اسم الوحدة
     * @param {string} message رسالة السجل
     * @param {Object} data بيانات إضافية (اختياري)
     */
    warn(module, message, data = {}) {
        // تم تعطيل تسجيل التحذيرات لمنع تسرب البيانات الحساسة
        // تم الاحتفاظ بالدالة للتوافق مع الكود الحالي
    }

    /**
     * تسجيل خطأ
     * @param {string} module اسم الوحدة
     * @param {string} message رسالة السجل
     * @param {Error|Object} error كائن الخطأ أو بيانات إضافية
     */
    error(module, message, error = {}) {
        let logData = {};
        
        if (error instanceof Error) {
            logData = {
                message: error.message,
                stack: error.stack
            };
        } else {
            // إزالة البيانات الحساسة المحتملة مثل أرقام الهواتف والرسائل
            if (error.cleanPhone) {
                // إخفاء جزء من رقم الهاتف للحفاظ على الخصوصية
                const phoneLength = error.cleanPhone.length;
                if (phoneLength > 4) {
                    error.cleanPhone = '****' + error.cleanPhone.substr(phoneLength - 4);
                } else {
                    error.cleanPhone = '****';
                }
            }
            
            if (error.phone) {
                // إخفاء جزء من رقم الهاتف للحفاظ على الخصوصية
                const phoneLength = error.phone.length;
                if (phoneLength > 4) {
                    error.phone = '****' + error.phone.substr(phoneLength - 4);
                } else {
                    error.phone = '****';
                }
            }
            
            if (error.message) {
                // إخفاء محتوى الرسالة لمنع تسرب البيانات الحساسة
                error.message = '[محتوى الرسالة محجوب]';
            }
            
            if (error.msg) {
                // إخفاء محتوى الرسالة لمنع تسرب البيانات الحساسة
                error.msg = '[محتوى الرسالة محجوب]';
            }
            
            logData = error;
        }
        
        this.log('ERROR', module, message, logData);
    }

    /**
     * تسجيل تصحيح
     * @param {string} module اسم الوحدة
     * @param {string} message رسالة السجل
     * @param {Object} data بيانات إضافية (اختياري)
     */
    debug(module, message, data = {}) {
        // تم تعطيل تسجيل رسائل التصحيح لمنع تسرب البيانات الحساسة
        // تم الاحتفاظ بالدالة للتوافق مع الكود الحالي
    }

    /**
     * تسجيل الأحداث
     * @private
     * @param {string} level مستوى السجل
     * @param {string} module اسم الوحدة
     * @param {string} message رسالة السجل
     * @param {Object} data بيانات إضافية
     */
    log(level, module, message, data = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            module,
            message
        };

        // إضافة البيانات فقط في حالة الخطأ
        if (level === 'ERROR') {
            logEntry.data = data;
            console.error(JSON.stringify(logEntry, null, 0));
        }
    }
}

// تصدير نسخة واحدة من الخدمة (Singleton)
module.exports = new LoggerService();
