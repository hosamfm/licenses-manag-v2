/**
 * خدمة واتساب الرسمية من ميتا (الإصدار 22)
 */
const axios = require('axios');
const MetaWhatsappSettings = require('../../models/MetaWhatsappSettings');
const logger = require('../loggerService');

class MetaWhatsappService {
    /**
     * إنشاء نسخة من خدمة واتساب الرسمي
     */
    constructor() {
        this.settings = null;
        this.baseUrl = 'https://graph.facebook.com/v22.0';
    }

    /**
     * تهيئة الخدمة بإعدادات واتساب الرسمي
     */
    async initialize() {
        try {
            this.settings = await MetaWhatsappSettings.getActiveSettings();
            return this.settings.isConfigured();
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في تهيئة خدمة واتساب الرسمي', error);
            return false;
        }
    }

    /**
     * إرسال طلب لواجهة برمجة تطبيقات واتساب الرسمي
     * @param {string} endpoint نقطة النهاية للطلب
     * @param {string} method طريقة الطلب (GET, POST, etc.)
     * @param {object} data البيانات المرسلة مع الطلب
     * @returns {Promise<object>} استجابة من واجهة برمجة تطبيقات واتساب
     */
    async sendRequest(endpoint, method = 'GET', data = null) {
        if (!this.settings) {
            await this.initialize();
        }

        if (!this.settings.isConfigured()) {
            throw new Error('خدمة واتساب الرسمي غير مكتملة الإعداد');
        }

        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Authorization': `Bearer ${this.settings.config.accessToken}`,
            'Content-Type': 'application/json'
        };

        try {
            const response = await axios({
                method,
                url,
                headers,
                data
            });

            return response.data;
        } catch (error) {
            logger.error('MetaWhatsappService', `خطأ في إرسال طلب لواتساب الرسمي: ${endpoint}`, {
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }

    /**
     * الحصول على معلومات رقم هاتف واتساب
     * @returns {Promise<object>} معلومات رقم الهاتف
     */
    async getPhoneNumberInfo() {
        if (!this.settings) {
            await this.initialize();
        }

        if (!this.settings.config.phoneNumberId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }

        return this.sendRequest(`/${this.settings.config.phoneNumberId}`);
    }

    /**
     * إرسال رسالة نصية عبر واتساب الرسمي
     * @param {string} to رقم الهاتف المستلم
     * @param {string} text نص الرسالة
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendTextMessage(to, text) {
        if (!this.settings) {
            await this.initialize();
        }

        if (!this.settings.config.phoneNumberId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }

        const data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: {
                body: text
            }
        };

        return this.sendRequest(`/${this.settings.config.phoneNumberId}/messages`, 'POST', data);
    }

    /**
     * إرسال رسالة قالب عبر واتساب الرسمي
     * @param {string} to رقم الهاتف المستلم
     * @param {string} templateName اسم القالب
     * @param {string} language رمز اللغة
     * @param {Array} components مكونات القالب
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendTemplateMessage(to, templateName, language = 'ar', components = []) {
        if (!this.settings) {
            await this.initialize();
        }

        if (!this.settings.config.phoneNumberId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }

        const data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'template',
            template: {
                name: templateName,
                language: {
                    code: language
                },
                components
            }
        };

        return this.sendRequest(`/${this.settings.config.phoneNumberId}/messages`, 'POST', data);
    }

    /**
     * الحصول على قوالب الرسائل المتاحة
     * @returns {Promise<Array>} قائمة بقوالب الرسائل المتاحة
     */
    async getMessageTemplates() {
        if (!this.settings) {
            await this.initialize();
        }

        if (!this.settings.config.businessAccountId) {
            throw new Error('معرف حساب الأعمال غير محدد في الإعدادات');
        }

        return this.sendRequest(`/${this.settings.config.businessAccountId}/message_templates`);
    }
}

module.exports = new MetaWhatsappService();
