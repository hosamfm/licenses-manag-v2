/**
 * خدمة تسجيل الأحداث البسيطة
 * Simple Logging Service
 */

class LoggerService {
    constructor() {
        // وضع تشخيصي مؤقت - يمكن تعطيله بعد حل المشكلة
        this.TEMP_DEBUG_MODE = true;
    }
    
    /**
     * تسجيل معلومات
     * @param {string} module اسم الوحدة
     * @param {string} message رسالة السجل
     * @param {Object} data بيانات إضافية (اختياري)
     */
    info(module, message, data = {}) {
        if (this.TEMP_DEBUG_MODE) {
            // نسخة آمنة من البيانات لمنع تسرب المعلومات الحساسة
            const sanitizedData = this.sanitizeData(data);
            this.log('INFO', module, message, sanitizedData);
        }
    }

    /**
     * تسجيل تحذير
     * @param {string} module اسم الوحدة
     * @param {string} message رسالة السجل
     * @param {Object} data بيانات إضافية (اختياري)
     */
    warn(module, message, data = {}) {
        if (this.TEMP_DEBUG_MODE) {
            // نسخة آمنة من البيانات لمنع تسرب المعلومات الحساسة
            const sanitizedData = this.sanitizeData(data);
            this.log('WARN', module, message, sanitizedData);
        }
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
            logData = this.sanitizeData(error);
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
        if (this.TEMP_DEBUG_MODE) {
            // نسخة آمنة من البيانات لمنع تسرب المعلومات الحساسة
            const sanitizedData = this.sanitizeData(data);
            this.log('DEBUG', module, message, sanitizedData);
        }
    }

    /**
     * إنشاء نسخة آمنة من البيانات بإزالة المعلومات الحساسة
     * @private
     * @param {Object} data البيانات المراد تنظيفها
     * @returns {Object} نسخة آمنة من البيانات
     */
    sanitizeData(data) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        
        const sanitized = { ...data };
        
        // إخفاء أرقام الهواتف
        if (sanitized.cleanPhone) {
            const phoneLength = sanitized.cleanPhone.length;
            if (phoneLength > 4) {
                sanitized.cleanPhone = '****' + sanitized.cleanPhone.substr(phoneLength - 4);
            } else {
                sanitized.cleanPhone = '****';
            }
        }
        
        if (sanitized.phone) {
            const phoneLength = sanitized.phone.length;
            if (phoneLength > 4) {
                sanitized.phone = '****' + sanitized.phone.substr(phoneLength - 4);
            } else {
                sanitized.phone = '****';
            }
        }
        
        // إخفاء محتوى الرسائل
        if (sanitized.message && typeof sanitized.message === 'string') {
            sanitized.message = '[محتوى الرسالة محجوب]';
        }
        
        if (sanitized.msg && typeof sanitized.msg === 'string') {
            sanitized.msg = '[محتوى الرسالة محجوب]';
        }
        
        // إخفاء بيانات الجسم الخام
        if (sanitized.body) {
            sanitized.body = '[بيانات الجسم محجوبة]';
        }
        
        if (sanitized.rawBody) {
            sanitized.rawBody = '[بيانات الجسم الخام محجوبة]';
        }
        
        // إبقاء مسار الطلب وطريقته وعناوين IP للتشخيص
        // sanitized.path, sanitized.method, sanitized.ip تبقى كما هي
        
        return sanitized;
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

        // إضافة البيانات للسجل (مع جميع المستويات في وضع التشخيص)
        if (level === 'ERROR' || this.TEMP_DEBUG_MODE) {
            logEntry.data = data;
            
            if (level === 'ERROR') {
                console.error(JSON.stringify(logEntry, null, 0));
            } else if (level === 'WARN') {
                console.warn(JSON.stringify(logEntry, null, 0));
            } else {
                console.log(JSON.stringify(logEntry, null, 0));
            }
        }
    }
}

// تصدير نسخة واحدة من الخدمة (Singleton)
module.exports = new LoggerService();
