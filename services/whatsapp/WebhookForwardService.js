/**
 * خدمة تمرير ويب هوك واتساب الرسمي إلى خدمات أخرى
 * 
 * تقوم هذه الخدمة بتمرير بيانات ويب هوك واتساب الرسمي من ميتا
 * إلى خدمات أخرى بنفس التنسيق تماماً دون أي تغيير
 */

const axios = require('axios');
const logger = require('../loggerService');

class WebhookForwardService {
    
    /**
     * تهيئة خدمة تمرير الويب هوك
     */
    constructor() {
        // عنوان الويب هوك المستهدف
        this.targetWebhookUrl = 'https://atcit.ras.yeastar.com/api/v1.0/webhook/whatsapp/44af2c41f09641bca18e5365bdf28955';
        
        // توكن التحقق
        this.verifyToken = '5ajhv733nohlw9ol';
        
        // زمن انتظار الطلب بالميلي ثانية
        this.timeout = 10000;
        
        // تهيئة العميل HTTP
        this.httpClient = axios.create({
            timeout: this.timeout
        });
    }
    
    /**
     * إعادة توجيه رسالة التحقق من الويب هوك
     * 
     * @param {Object} query - استعلام الطلب
     * @returns {Promise<Object>} - استجابة الخدمة المستهدفة
     */
    async forwardVerification(query) {
        try {
            logger.info('WebhookForwardService', 'تمرير طلب تحقق ويب هوك', { query });
            
            // إنشاء استعلام الطلب بنفس معلمات طلب ميتا
            const forwardUrl = `${this.targetWebhookUrl}?hub.mode=${query['hub.mode']}&hub.verify_token=${this.verifyToken}&hub.challenge=${query['hub.challenge']}`;
            
            // إرسال طلب التحقق إلى الخدمة المستهدفة
            const response = await this.httpClient.get(forwardUrl);
            
            logger.info('WebhookForwardService', 'تم تمرير طلب التحقق بنجاح', {
                statusCode: response.status,
            });
            
            return {
                success: true,
                status: response.status,
                data: response.data
            };
        } catch (error) {
            logger.error('WebhookForwardService', 'خطأ في تمرير طلب التحقق', error);
            
            return {
                success: false,
                error: error.message,
                details: error.response ? error.response.data : null
            };
        }
    }
    
    /**
     * إعادة توجيه ويب هوك واتساب الرسمي
     * 
     * @param {Object} body - محتوى الطلب
     * @param {Object} headers - ترويسات الطلب
     * @param {String} method - طريقة الطلب (POST, GET)
     * @param {String} requestId - معرف الطلب للتتبع
     * @returns {Promise<Object>} - استجابة الخدمة المستهدفة
     */
    async forwardWebhook(body, headers, method, requestId) {
        try {
            logger.info('WebhookForwardService', 'تمرير ويب هوك واتساب', { 
                requestId,
                method
            });
            
            // إنشاء مجموعة ترويسات محددة فقط للإرسال
            const forwardHeaders = {
                'Content-Type': headers['content-type'] || 'application/json',
                'User-Agent': headers['user-agent'] || 'WhatsApp-Proxy'
            };
            
            // إضافة ترويسة X-Hub-Signature إذا كانت موجودة
            if (headers['x-hub-signature'] || headers['x-hub-signature-256']) {
                forwardHeaders['X-Hub-Signature'] = headers['x-hub-signature'] || '';
                forwardHeaders['X-Hub-Signature-256'] = headers['x-hub-signature-256'] || '';
            }
            
            // إرسال الطلب إلى الخدمة المستهدفة بنفس المحتوى تماماً
            const response = await this.httpClient.post(
                this.targetWebhookUrl,
                body,
                { headers: forwardHeaders }
            );
            
            logger.info('WebhookForwardService', 'تم تمرير الويب هوك بنجاح', {
                requestId,
                statusCode: response.status
            });
            
            return {
                success: true,
                status: response.status,
                data: response.data
            };
        } catch (error) {
            logger.error('WebhookForwardService', 'خطأ في تمرير الويب هوك', {
                requestId,
                error: error.message,
                details: error.response ? error.response.data : null
            });
            
            return {
                success: false,
                error: error.message,
                details: error.response ? error.response.data : null
            };
        }
    }
}

// تصدير نسخة وحيدة من الخدمة
module.exports = new WebhookForwardService();
