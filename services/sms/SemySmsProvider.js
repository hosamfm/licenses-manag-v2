/**
 * مزود خدمة الرسائل القصيرة SemySMS
 */
const ISmsProvider = require('./ISmsProvider');
const logger = require('../loggerService');
// استيراد خدمة تنسيق أرقام الهواتف - تصحيح المسار
const phoneFormatService = require('../phoneFormatService');

class SemySmsProvider extends ISmsProvider {
    /**
     * إنشاء مزود خدمة SemySMS
     */
    constructor() {
        super();
        this.baseUrl = 'https://semysms.net/api/3';
        this.config = {
            token: '',
            device: 'active',
            addPlusPrefix: true // تغيير القيمة الافتراضية لإضافة علامة + قبل الرقم
        };
        this.initialized = false;
    }

    /**
     * تهيئة مزود الخدمة
     * @param {Object} config إعدادات المزود
     * @returns {Promise<boolean>} وعد يحتوي على حالة التهيئة
     */
    async initialize(config) {
        try {
            this.config = {
                ...this.config,
                ...config
            };

            // التحقق من وجود التوكن
            if (!this.config.token) {
                throw new Error('توكن API مطلوب');
            }
            
            // التأكد من أن خيار إضافة علامة + مضبوط، إذا لم يتم تحديده في الإعدادات
            if (this.config.addPlusPrefix === undefined) {
                this.config.addPlusPrefix = true;
            }

            this.initialized = true;
            
            return true;
        } catch (error) {
            logger.error('SemySmsProvider', 'فشل في تهيئة مزود خدمة SemySMS', error);
            this.initialized = false;
            return false;
        }
    }

    /**
     * إرسال طلب HTTP إلى SemySMS API
     * @param {string} endpoint نقطة النهاية
     * @param {Object} params المعلمات
     * @param {string} method طريقة الطلب (GET، POST)
     * @returns {Promise<Object>} استجابة API
     * @private
     */
    async _makeRequest(endpoint, params = {}, method = 'GET') {
        if (!this.initialized) {
            throw new Error('يجب تهيئة مزود الخدمة أولاً');
        }

        try {
            const url = `${this.baseUrl}/${endpoint}`;
            const queryParams = new URLSearchParams({
                token: this.config.token,
                ...params
            }).toString();
            
            const requestUrl = method === 'GET' ? `${url}?${queryParams}` : url;
            
            logger.debug('SemySmsProvider', `إرسال طلب ${method} إلى ${endpoint}`, { params });
            
            const response = await fetch(requestUrl, {
                method,
                headers: {
                    'Content-Type': method === 'POST' ? 'application/x-www-form-urlencoded' : 'application/json',
                },
                body: method === 'POST' ? queryParams : null
            });
            
            if (!response.ok) {
                throw new Error(`فشل في الطلب: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            logger.debug('SemySmsProvider', `استجابة من ${endpoint}`, data);
            
            return data;
        } catch (error) {
            logger.error('SemySmsProvider', `خطأ أثناء الاتصال بـ ${endpoint}`, error);
            throw error;
        }
    }

    /**
     * إرسال رسالة نصية قصيرة
     * @param {string} phoneNumber رقم الهاتف المستلم
     * @param {string} message محتوى الرسالة
     * @param {Object} options خيارات إضافية (اختياري)
     * @returns {Promise<Object>} وعد يحتوي على نتيجة الإرسال
     */
    async sendSms(phoneNumber, message, options = {}) {
        try {
            // استخدام خدمة التنسيق المركزية للحصول على الرقم والمعلمات
            const phoneData = phoneFormatService.prepareForSms(phoneNumber);
            
            if (!phoneData.isValid) {
                return {
                    success: false,
                    error: 'رقم هاتف غير صالح'
                };
            }
            
            // تسجيل معلومات الإرسال
            logger.debug('SemySmsProvider', 'إرسال رسالة SMS', { 
                originalPhone: phoneNumber, 
                formattedPhone: phoneData.formattedPhone,
                apiPhone: phoneData.phoneForApi
            });
            
            // إنشاء معلمات الطلب بدمج معلمات الجهاز مع معلمات الرقم
            const params = {
                device: this.config.device,
                msg: message,
                ...phoneData.params  // إضافة معلمات الرقم من خدمة التنسيق
            };
            
            // إضافة المعلمات الاختيارية
            if (options.priority) {
                params.priority = options.priority;
            }
            
            // إرسال الطلب إلى SemySMS API
            const response = await this._makeRequest('sms.php', params);
            
            if (response.status === 'error') {
                throw new Error(response.message || 'خطأ غير معروف من SemySMS API');
            }
            
            // إضافة معلومات إضافية للاستجابة
            const result = {
                success: true,
                messageId: options.messageRecordId || null, // استخدام معرف السجل المحلي كمعرف داخلي
                externalMessageId: response.id || response.msgId, // استخدام المعرف الصحيح من API
                status: response.result || 'sent',
                rawResponse: response
            };
            
            // تسجيل نجاح الإرسال مع المعرفات
            logger.info('SemySmsProvider', 'تم إرسال رسالة SMS بنجاح', { 
                messageId: result.messageId,
                externalMessageId: result.externalMessageId,
                phone: phoneNumber 
            });
            
            return result;
        } catch (error) {
            logger.error('SemySmsProvider', 'فشل في إرسال رسالة SMS', { 
                error: error.message, 
                phone: phoneNumber
            });
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * التحقق من حالة رسالة
     * @param {string} messageId معرف الرسالة
     * @returns {Promise<Object>} وعد يحتوي على حالة الرسالة
     */
    async checkMessageStatus(messageId) {
        try {
            const params = {
                device: this.config.device,
                list_id: messageId
            };
            
            const response = await this._makeRequest('outbox_sms.php', params);
            
            if (response.count > 0) {
                const message = response.data[0];
                
                // تحديد حالة الرسالة استنادًا إلى بيانات SemySMS
                let status = 'unknown';
                if (message.is_error === 1 || message.is_error_send === 1) {
                    status = 'failed';
                } else if (message.is_delivered === 1) {
                    status = 'delivered';
                } else if (message.is_send === 1) {
                    status = 'sent';
                } else if (message.is_send_to_phone === 1) {
                    status = 'processing';
                } else if (message.is_cancel === 1) {
                    status = 'cancelled';
                } else {
                    status = 'pending';
                }
                
                return {
                    success: true,
                    messageId,
                    externalMessageId: message.id, // إضافة معرف SemySMS الخارجي
                    status,
                    is_delivered: message.is_delivered === 1,
                    is_sent: message.is_send === 1,
                    is_error: message.is_error === 1 || message.is_error_send === 1,
                    is_failed: message.is_error === 1 || message.is_error_send === 1,
                    is_cancelled: message.is_cancel === 1,
                    delivered_date: message.is_delivered === 1 ? new Date(message.delivered_time * 1000) : null,
                    sent_date: message.is_send === 1 ? new Date(message.send_time * 1000) : null,
                    error: message.is_error === 1 ? message.error_text : null,
                    rawResponse: message
                };
            }
            
            // الرسالة غير موجودة في النظام
            return {
                success: false,
                messageId,
                status: 'unknown',
                error: 'الرسالة غير موجودة في نظام SemySMS'
            };
        } catch (error) {
            logger.error('SemySmsProvider', 'فشل في التحقق من حالة الرسالة', {
                error: error.message,
                messageId
            });
            
            return {
                success: false,
                messageId,
                status: 'unknown',
                error: error.message
            };
        }
    }

    /**
     * التحقق من رصيد الحساب
     * @returns {Promise<Object>} وعد يحتوي على معلومات الرصيد
     */
    async checkAccountBalance() {
        try {
            const response = await this._makeRequest('user.php');
            
            return {
                success: true,
                accountId: response.id_user,
                isPremium: response.is_pay === 1,
                premiumType: response.type_premium,
                premiumEndDate: response.date_end_premium,
                balance: response.messages_premium || 0, // إضافة حقل رصيد الحساب
                messagesPremium: response.messages_premium,
                rawResponse: response
            };
        } catch (error) {
            logger.error('SemySmsProvider', 'فشل في التحقق من رصيد الحساب', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * الحصول على قائمة الأجهزة المتاحة
     * @returns {Promise<Object>} وعد يحتوي على قائمة الأجهزة
     */
    async getDevices() {
        try {
            const params = {
                is_arhive: 0 // فقط الأجهزة غير المؤرشفة
            };
            
            const response = await this._makeRequest('devices.php', params);
            
            if (response.code === 0) {
                return {
                    success: true,
                    devices: response.data,
                    count: response.count,
                    rawResponse: response
                };
            } else {
                return {
                    success: false,
                    error: `فشل في الحصول على قائمة الأجهزة، كود الخطأ: ${response.code}`
                };
            }
        } catch (error) {
            logger.error('SemySmsProvider', 'فشل في الحصول على قائمة الأجهزة', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = SemySmsProvider;
