/**
 * خدمة تسجيل الأحداث البسيطة
 * Simple Logging Service
 */

class LoggerService {
    constructor() {
        // تشغيل جميع مستويات التسجيل بدون إخفاء البيانات
        this.ENABLE_ALL_LOGS = true;
    }
    
    /**
     * تسجيل معلومات
     * @param {string} module اسم الوحدة
     * @param {string} message رسالة السجل
     * @param {Object} data بيانات إضافية (اختياري)
     */
    info(module, message, data = {}) {
        this.log('INFO', module, message, data);
    }

    /**
     * تسجيل تحذير
     * @param {string} module اسم الوحدة
     * @param {string} message رسالة السجل
     * @param {Object} data بيانات إضافية (اختياري)
     */
    warn(module, message, data = {}) {
        this.log('WARN', module, message, data);
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
            // تسجيل البيانات كما هي بدون إخفاء
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
        this.log('DEBUG', module, message, data);
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
            message,
            data
        };
        
        // تسجيل جميع الرسائل إلى وحدة التحكم
        if (level === 'ERROR') {
            console.error(JSON.stringify(logEntry, null, 0));
        } else if (level === 'WARN') {
            console.warn(JSON.stringify(logEntry, null, 0));
        } else {
            console.log(JSON.stringify(logEntry, null, 0));
        }
    }
}

// تصدير نسخة واحدة من الخدمة (Singleton)
module.exports = new LoggerService();
