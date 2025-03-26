/**
 * واجهة مزود خدمة الواتساب
 * هذه الواجهة تحدد الطرق التي يجب أن توفرها أي فئة مزود خدمة واتساب
 */
class IWhatsappProvider {
    /**
     * إرسال رسالة واتساب
     * @param {string} phoneNumber رقم الهاتف المستلم (بالتنسيق الدولي)
     * @param {string} message محتوى الرسالة
     * @param {Object} options خيارات إضافية (اختياري)
     * @returns {Promise<Object>} وعد يحتوي على نتيجة الإرسال
     */
    async sendWhatsapp(phoneNumber, message, options = {}) {
        throw new Error('يجب تنفيذ طريقة sendWhatsapp في الفئة الفرعية');
    }

    /**
     * التحقق من حالة رسالة
     * @param {string} messageId معرف الرسالة
     * @returns {Promise<Object>} وعد يحتوي على حالة الرسالة
     */
    async checkMessageStatus(messageId) {
        throw new Error('يجب تنفيذ طريقة checkMessageStatus في الفئة الفرعية');
    }

    /**
     * التحقق من رصيد الحساب
     * @returns {Promise<Object>} وعد يحتوي على معلومات الرصيد
     */
    async checkAccountBalance() {
        throw new Error('يجب تنفيذ طريقة checkAccountBalance في الفئة الفرعية');
    }

    /**
     * تهيئة مزود الخدمة
     * @param {Object} config إعدادات المزود
     * @returns {Promise<boolean>} وعد يحتوي على حالة التهيئة
     */
    async initialize(config) {
        throw new Error('يجب تنفيذ طريقة initialize في الفئة الفرعية');
    }
}

module.exports = IWhatsappProvider;
