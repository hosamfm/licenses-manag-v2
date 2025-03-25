/**
 * مزود خدمة الرسائل القصيرة SemySMS
 */
const ISmsProvider = require('./ISmsProvider');
const logger = require('../loggerService');

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
            addPlusPrefix: false // إضافة خيار للتحكم في إضافة علامة + قبل الرقم
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

            this.initialized = true;
            logger.info('SemySmsProvider', 'تم تهيئة مزود خدمة SemySMS بنجاح');
            
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
     * @param {string} phoneNumber رقم الهاتف المستلم (بالتنسيق الدولي)
     * @param {string} message محتوى الرسالة
     * @param {Object} options خيارات إضافية (اختياري)
     * @returns {Promise<Object>} وعد يحتوي على نتيجة الإرسال
     */
    async sendSms(phoneNumber, message, options = {}) {
        try {
            // التأكد من تنسيق رقم الهاتف
            const formattedPhone = this._formatPhoneNumber(phoneNumber);
            
            // إعداد معلمات الطلب
            const params = {
                device: this.config.device,
                phone: formattedPhone,
                msg: message
            };
            
            // إضافة المعلمات الاختيارية
            if (options.priority) {
                params.priority = options.priority;
            }
            
            if (options.add_plus) {
                params.add_plus = options.add_plus;
            } else {
                // إعداد لإزالة علامة + إذا كانت الإعدادات تتطلب ذلك
                params.add_plus = this.config.addPlusPrefix ? 1 : 0;
            }
            
            // إرسال الطلب إلى SemySMS API
            const response = await this._makeRequest('sms.php', params);
            
            // التحقق من نجاح العملية
            if (response.code === '0') {
                return {
                    success: true,
                    messageId: response.id,
                    rawResponse: response
                };
            } else {
                throw new Error(`فشل في إرسال الرسالة، كود الخطأ: ${response.code}`);
            }
        } catch (error) {
            logger.error('SemySmsProvider', 'فشل في إرسال الرسالة', error);
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
                    status,
                    details: {
                        phone: message.phone,
                        sentAt: message.send,
                        deliveredAt: message.delivered,
                        content: message.msg
                    },
                    rawResponse: message
                };
            } else {
                return {
                    success: false,
                    error: 'الرسالة غير موجودة'
                };
            }
        } catch (error) {
            logger.error('SemySmsProvider', 'فشل في التحقق من حالة الرسالة', error);
            return {
                success: false,
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

    /**
     * تنسيق رقم الهاتف للتوافق مع SemySMS
     * @param {string} phoneNumber رقم الهاتف
     * @returns {string} رقم الهاتف المنسق
     * @private
     */
    _formatPhoneNumber(phoneNumber) {
        // إزالة أي مسافات أو رموز خاصة
        let formatted = phoneNumber.replace(/\s+/g, '');
        
        // إزالة علامة + إذا كانت موجودة
        if (formatted.startsWith('+')) {
            formatted = formatted.substring(1);
        }
        
        // إضافة علامة + فقط إذا كانت الإعدادات تتطلب ذلك
        if (this.config.addPlusPrefix) {
            formatted = '+' + formatted;
        }
        
        return formatted;
    }
}

module.exports = SemySmsProvider;
