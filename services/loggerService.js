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
        
        // تنسيق المعلومات بشكل أكثر وضوحاً
        const displayData = Object.keys(data).length > 0 ? JSON.stringify(data) : '';
        
        // تنسيق مستوى السجل بألوان مختلفة (للطرفية التي تدعم ANSI colors)
        let colorPrefix = '';
        let colorSuffix = '\x1b[0m'; // إعادة تعيين اللون
        
        switch (level) {
            case 'ERROR':
                colorPrefix = '\x1b[31m'; // أحمر
                break;
            case 'WARN':
                colorPrefix = '\x1b[33m'; // أصفر
                break;
            case 'INFO':
                colorPrefix = '\x1b[36m'; // سماوي
                break;
            case 'DEBUG':
                colorPrefix = '\x1b[90m'; // رمادي
                break;
            default:
                colorPrefix = '';
                colorSuffix = '';
        }
        
        // تنسيق السجل للعرض
        const formattedLog = `${colorPrefix}[${timestamp}] [${level}] [${module}] ${message} ${displayData}${colorSuffix}`;
        
        // تسجيل الرسالة وفقاً للمستوى
        if (level === 'ERROR') {
            console.error(formattedLog);
        } else if (level === 'WARN') {
            console.warn(formattedLog);
        } else {
            console.log(formattedLog);
        }
        
        // الاحتفاظ بنسخة JSON للسجل (يمكن استخدامها لمصادر أخرى مثل قاعدة البيانات)
        const logEntry = {
            timestamp,
            level,
            module,
            message,
            data
        };
        
        // يمكن هنا إضافة كود لتخزين السجلات في قاعدة البيانات أو ملف إذا رغبت
    }
}

// تصدير نسخة واحدة من الخدمة (Singleton)
module.exports = new LoggerService();
