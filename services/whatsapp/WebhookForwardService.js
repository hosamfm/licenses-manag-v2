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
        this.timeout = 30000; // زيادة زمن الانتظار إلى 30 ثانية
        
        // إعداد محاولات إعادة الإرسال
        this.maxRetries = 3;
        
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
            
            // سجل عنوان الطلب للتشخيص
            logger.debug('WebhookForwardService', 'عنوان طلب التحقق', { url: forwardUrl });
            
            // إرسال طلب التحقق إلى الخدمة المستهدفة
            const response = await this.httpClient.get(forwardUrl);
            
            logger.info('WebhookForwardService', 'تم تمرير طلب التحقق بنجاح', {
                statusCode: response.status,
                response: response.data
            });
            
            return {
                success: true,
                status: response.status,
                data: response.data
            };
        } catch (error) {
            logger.error('WebhookForwardService', 'خطأ في تمرير طلب التحقق', {
                error: error.message,
                stack: error.stack,
                details: error.response ? {
                    status: error.response.status,
                    data: error.response.data
                } : null
            });
            
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
                method,
                targetUrl: this.targetWebhookUrl
            });
            
            // سجل كامل محتوى الطلب والترويسات للتشخيص
            logger.debug('WebhookForwardService', 'محتوى الطلب المراد تمريره', {
                body: JSON.stringify(body, null, 2),
                headers: JSON.stringify(headers, null, 2)
            });
            
            // تمرير جميع الترويسات المهمة
            const forwardHeaders = {
                'Content-Type': headers['content-type'] || 'application/json',
                'User-Agent': headers['user-agent'] || 'WhatsApp-Proxy-Forwarder',
            };
            
            // إضافة توقيعات الويب هوك
            if (headers['x-hub-signature']) {
                forwardHeaders['X-Hub-Signature'] = headers['x-hub-signature'];
            }
            
            if (headers['x-hub-signature-256']) {
                forwardHeaders['X-Hub-Signature-256'] = headers['x-hub-signature-256'];
            }
            
            // إضافة ترويسات أخرى مهمة قد يتوقعها الخادم المستهدف
            if (headers['accept']) forwardHeaders['Accept'] = headers['accept'];
            if (headers['accept-encoding']) forwardHeaders['Accept-Encoding'] = headers['accept-encoding'];
            if (headers['accept-language']) forwardHeaders['Accept-Language'] = headers['accept-language'];
            if (headers['origin']) forwardHeaders['Origin'] = headers['origin'];
            if (headers['referer']) forwardHeaders['Referer'] = headers['referer'];
            
            // إضافة ترويسات خاصة بواتساب
            for (const key in headers) {
                if (key.toLowerCase().startsWith('x-fb') || key.toLowerCase().startsWith('x-whatsapp')) {
                    forwardHeaders[key] = headers[key];
                }
            }
            
            // إضافة معرف الطلب في الترويسات
            forwardHeaders['X-Request-ID'] = requestId;
            
            // محاولة إرسال الطلب مع إعادة المحاولة عند الفشل
            let retryCount = 0;
            let lastError = null;
            
            while (retryCount <= this.maxRetries) {
                try {
                    // إرسال الطلب إلى الخدمة المستهدفة بنفس المحتوى تماماً
                    const response = await this.httpClient.post(
                        this.targetWebhookUrl,
                        body,
                        { headers: forwardHeaders }
                    );
                    
                    logger.info('WebhookForwardService', 'تم تمرير الويب هوك بنجاح', {
                        requestId,
                        statusCode: response.status,
                        retryCount,
                        response: response.data
                    });
                    
                    return {
                        success: true,
                        status: response.status,
                        data: response.data
                    };
                } catch (error) {
                    lastError = error;
                    retryCount++;
                    
                    if (retryCount <= this.maxRetries) {
                        // انتظار قبل إعادة المحاولة (زيادة تدريجية للوقت)
                        const delayMs = 1000 * retryCount;
                        logger.warn('WebhookForwardService', `فشل التمرير، إعادة المحاولة ${retryCount}/${this.maxRetries} بعد ${delayMs}ms`, {
                            requestId,
                            error: error.message
                        });
                        
                        await new Promise(resolve => setTimeout(resolve, delayMs));
                    }
                }
            }
            
            // إذا وصلنا إلى هنا، فقد فشلت جميع المحاولات
            throw lastError;
        } catch (error) {
            logger.error('WebhookForwardService', 'فشل تمرير الويب هوك بعد عدة محاولات', {
                requestId,
                error: error.message,
                stack: error.stack,
                details: error.response ? {
                    status: error.response.status,
                    statusText: error.response.statusText,
                    data: error.response.data
                } : null
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
