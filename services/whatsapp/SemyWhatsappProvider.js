/**
 * مزود خدمة الواتساب SemySMS
 */
const IWhatsappProvider = require('./IWhatsappProvider');
const logger = require('../loggerService');
// استيراد خدمة تنسيق أرقام الهواتف - تصحيح المسار
const phoneFormatService = require('../phoneFormatService');

class SemyWhatsappProvider extends IWhatsappProvider {
    /**
     * إنشاء مزود خدمة واتساب SemySMS
     */
    constructor() {
        super();
        this.baseUrl = 'https://semysms.net/api/3';
        this.config = {
            token: '',
            device: 'active',
            addPlusPrefix: true // تغيير للإعداد الافتراضي لإضافة علامة + قبل الرقم
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
            logger.error('SemyWhatsappProvider', 'فشل في تهيئة مزود خدمة واتساب SemySMS', error);
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
            
            logger.debug('SemyWhatsappProvider', `إرسال طلب ${method} إلى ${endpoint}`, { params });
            
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
            logger.debug('SemyWhatsappProvider', `استجابة من ${endpoint}`, data);
            
            return data;
        } catch (error) {
            logger.error('SemyWhatsappProvider', `خطأ أثناء الاتصال بـ ${endpoint}`, error);
            throw error;
        }
    }

    /**
     * إرسال رسالة واتساب
     * @param {string} phoneNumber رقم الهاتف المستلم
     * @param {string} message محتوى الرسالة
     * @param {Object} options خيارات إضافية (اختياري)
     * @returns {Promise<Object>} وعد يحتوي على نتيجة الإرسال
     */
    async sendWhatsapp(phoneNumber, message, options = {}) {
        try {
            // تحميل إعدادات العميل لكود الدولة إذا كان هناك معرف عميل
            if (options.clientId) {
                await this._loadClientCountrySettings(options.clientId);
            }
            
            // استخدام خدمة التنسيق المركزية للحصول على الرقم والمعلمات
            const phoneData = phoneFormatService.prepareForWhatsapp(phoneNumber);
            
            if (!phoneData.isValid) {
                return {
                    success: false,
                    error: 'رقم هاتف غير صالح'
                };
            }
            
            // تسجيل معلومات الإرسال
            logger.debug('SemyWhatsappProvider', 'إرسال رسالة واتساب', { 
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
            
            // إضافة المعلمات الاختيارية من الخيارات
            if (options.clientId) {
                params.clientId = options.clientId;
            }
            
            // إرسال الطلب إلى SemySMS API
            const response = await this._makeRequest('sms.php', params);
            
            if (response.status === 'error') {
                throw new Error(response.message || 'خطأ غير معروف من SemySMS API');
            }
            
            // إضافة معلومات إضافية للاستجابة
            // وفقاً لتوثيق API، معرف الرسالة يكون في حقل id وليس msgId
            const result = {
                success: true,
                messageId: options.messageRecordId || null, // استخدام معرف السجل المحلي كمعرف داخلي
                externalMessageId: response.id || response.msgId, // استخدام المعرف الصحيح من API
                status: response.result || 'sent',
                rawResponse: response
            };
            

            
            return result;
        } catch (error) {
            logger.error('SemyWhatsappProvider', 'فشل في إرسال رسالة واتساب', { 
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
                let is_delivered = false;
                let is_sent = false;
                let is_failed = false;
                
                if (message.is_error === 1 || message.is_error_send === 1) {
                    status = 'failed';
                    is_failed = true;
                } else if (message.is_delivered === 1) {
                    status = 'delivered';
                    is_delivered = true;
                } else if (message.is_send === 1) {
                    status = 'sent';
                    is_sent = true;
                } else if (message.is_send_to_phone === 1) {
                    status = 'processing';
                } else if (message.is_cancel === 1) {
                    status = 'cancelled';
                } else {
                    status = 'pending';
                }
                
                // إنشاء كائن النتيجة
                return {
                    success: true,
                    messageId,
                    externalMessageId: message.id, // إضافة معرف SemySMS الخارجي
                    status,
                    is_delivered,
                    is_sent,
                    is_failed,
                    is_cancelled: message.is_cancel === 1,
                    delivered_date: is_delivered ? new Date(message.delivered_time * 1000) : null,
                    sent_date: is_sent ? new Date(message.send_time * 1000) : null,
                    error: is_failed ? message.error_text : null,
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
            logger.error('SemyWhatsappProvider', 'فشل في التحقق من حالة الرسالة', {
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
            const response = await this._makeRequest('user_balance.php');
            
            if (response.code === '0') {
                return {
                    success: true,
                    balance: response.balance,
                    currency: response.currency,
                    balance_real: response.balance_real,
                    rawResponse: response
                };
            } else {
                throw new Error(`فشل في الحصول على رصيد الحساب، كود الخطأ: ${response.code}`);
            }
        } catch (error) {
            logger.error('SemyWhatsappProvider', 'فشل في التحقق من رصيد الحساب', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * الحصول على قائمة الأجهزة
     * @returns {Promise<Object>} وعد يحتوي على قائمة الأجهزة
     */
    async getDevices() {
        try {
            const response = await this._makeRequest('devices.php');
            
            if (response.code === '0') {
                return {
                    success: true,
                    devices: response.data || [],
                    rawResponse: response
                };
            } else {
                throw new Error(`فشل في الحصول على قائمة الأجهزة، كود الخطأ: ${response.code}`);
            }
        } catch (error) {
            logger.error('SemyWhatsappProvider', 'فشل في الحصول على قائمة الأجهزة', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * تحميل إعدادات كود الدولة من العميل
     * @param {string} clientId معرف العميل
     * @private
     */
    async _loadClientCountrySettings(clientId) {
        try {
            // تحميل نموذج العميل باستخدام require ديناميكي
            // هذا يتجنب مشكلة الاعتماد الدائري (circular dependency)
            const SemClient = require('../../models/SemClient');
            
            // البحث عن العميل وإعدادات كود الدولة الخاصة به
            const client = await SemClient.findById(clientId);
            
            if (client && client.defaultCountry) {
                // تحديث إعدادات كود الدولة الافتراضي في خدمة تنسيق الأرقام
                const phoneFormatService = require('../phoneFormatService');
                
                phoneFormatService.setDefaultCountry({
                    countryCode: client.defaultCountry.code,
                    countryAlpha2: client.defaultCountry.alpha2
                });
                
                logger.debug('SemyWhatsappProvider', 'تم تحديث كود الدولة الافتراضي من إعدادات العميل', {
                    clientId,
                    countryCode: client.defaultCountry.code,
                    countryAlpha2: client.defaultCountry.alpha2
                });
            }
        } catch (error) {
            logger.error('SemyWhatsappProvider', 'فشل في تحميل إعدادات العميل لكود الدولة', {
                clientId,
                error: error.message
            });
            // لا نقوم برمي الخطأ هنا، بل نستمر باستخدام الإعدادات الافتراضية
        }
    }
}

module.exports = SemyWhatsappProvider;
