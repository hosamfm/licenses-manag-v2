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
        this.allSettings = [];
        this.baseUrl = 'https://graph.facebook.com/v22.0';
        this.initialized = false;
    }

    /**
     * تهيئة الخدمة بإعدادات واتساب الرسمي
     */
    async initialize() {
        try {
            // الحصول على جميع الإعدادات النشطة
            this.allSettings = await MetaWhatsappSettings.getAllActiveSettings();
            
            // استخدام الإعدادات الأولى للتوافق مع النظام القديم
            this.settings = this.allSettings.length > 0 ? this.allSettings[0] : await MetaWhatsappSettings.getActiveSettings();
            
            // تسجيل عدد الإعدادات النشطة
            logger.info('MetaWhatsappService', 'تم تهيئة خدمة واتساب الرسمي', {
                activeSettingsCount: this.allSettings.length,
                hasActiveSettings: !!this.settings
            });
            
            this.initialized = true;
            return this.settings.isConfigured();
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في تهيئة خدمة واتساب الرسمي', error);
            return false;
        }
    }

    /**
     * تحديث الإعدادات عند تغييرها
     */
    async refreshSettings() {
        try {
            this.allSettings = await MetaWhatsappSettings.getAllActiveSettings();
            this.settings = this.allSettings.length > 0 ? this.allSettings[0] : await MetaWhatsappSettings.getActiveSettings();
            return true;
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في تحديث إعدادات واتساب الرسمي', error);
            return false;
        }
    }

    /**
     * الحصول على الإعدادات حسب معرف رقم الهاتف
     * @param {string} phoneNumberId معرف رقم الهاتف
     * @returns {object} إعدادات واتساب لرقم الهاتف المحدد
     */
    async getSettingsByPhoneNumberId(phoneNumberId) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        // البحث في الإعدادات المخزنة أولاً
        let settings = this.allSettings.find(s => s.config.phoneNumberId === phoneNumberId);
        
        // إذا لم نجد، نقوم بالبحث في قاعدة البيانات مباشرة
        if (!settings) {
            settings = await MetaWhatsappSettings.getSettingsByPhoneNumberId(phoneNumberId);
            
            // إذا وجدناها، نضيفها إلى القائمة لتحسين الأداء لاحقاً
            if (settings && !this.allSettings.some(s => s._id.toString() === settings._id.toString())) {
                this.allSettings.push(settings);
            }
        }
        
        return settings;
    }

    /**
     * إرسال طلب لواجهة برمجة تطبيقات واتساب الرسمي
     * @param {string} endpoint نقطة النهاية للطلب
     * @param {string} method طريقة الطلب (GET, POST, etc.)
     * @param {object} data البيانات المرسلة مع الطلب
     * @param {object} customSettings إعدادات مخصصة للطلب
     * @returns {Promise<object>} استجابة من واجهة برمجة تطبيقات واتساب
     */
    async sendRequest(endpoint, method = 'GET', data = null, customSettings = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام الإعدادات المخصصة إذا تم توفيرها، وإلا استخدام الإعدادات الافتراضية
        const settingsToUse = customSettings || this.settings;

        if (!settingsToUse || !settingsToUse.isConfigured()) {
            throw new Error('خدمة واتساب الرسمي غير مكتملة الإعداد');
        }

        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Authorization': `Bearer ${settingsToUse.config.accessToken}`,
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
     * @param {string} phoneNumberId معرف رقم الهاتف (اختياري)
     * @returns {Promise<object>} معلومات رقم الهاتف
     */
    async getPhoneNumberInfo(phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let targetPhoneId = phoneNumberId;
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
            targetPhoneId = settingsToUse.config.phoneNumberId;
        } else {
            targetPhoneId = this.settings.config.phoneNumberId;
        }

        if (!targetPhoneId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }

        return this.sendRequest(`/${targetPhoneId}`, 'GET', null, settingsToUse);
    }

    /**
     * إرسال رسالة نصية عبر واتساب الرسمي
     * @param {string} to رقم الهاتف المستلم
     * @param {string} text نص الرسالة
     * @param {string} phoneNumberId معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendTextMessage(to, text, phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let targetPhoneId = phoneNumberId;
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
            targetPhoneId = settingsToUse.config.phoneNumberId;
        } else {
            targetPhoneId = this.settings.config.phoneNumberId;
        }

        if (!targetPhoneId) {
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

        return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
    }

    /**
     * إرسال رسالة قالب عبر واتساب الرسمي
     * @param {string} to رقم الهاتف المستلم
     * @param {string} templateName اسم القالب
     * @param {string} language رمز اللغة
     * @param {Array} components مكونات القالب
     * @param {string} phoneNumberId معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendTemplateMessage(to, templateName, language = 'ar', components = [], phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let targetPhoneId = phoneNumberId;
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
            targetPhoneId = settingsToUse.config.phoneNumberId;
        } else {
            targetPhoneId = this.settings.config.phoneNumberId;
        }

        if (!targetPhoneId) {
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

        return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
    }

    /**
     * الحصول على قوالب الرسائل المتاحة
     * @param {string} phoneNumberId معرف رقم الهاتف (اختياري)
     * @returns {Promise<Array>} قائمة بقوالب الرسائل المتاحة
     */
    async getMessageTemplates(phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
        }

        if (!settingsToUse.config.businessAccountId) {
            throw new Error('معرف حساب الأعمال غير محدد في الإعدادات');
        }

        return this.sendRequest(`/${settingsToUse.config.businessAccountId}/message_templates`, 'GET', null, settingsToUse);
    }

    /**
     * إرسال رد على رسالة محددة عبر واتساب
     * @param {string} to رقم الهاتف المستلم
     * @param {string} text نص الرسالة
     * @param {string} replyMessageId معرف الرسالة التي يتم الرد عليها
     * @param {string} phoneNumberId معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendReplyTextMessage(to, text, replyMessageId, phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let targetPhoneId = phoneNumberId;
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
            targetPhoneId = settingsToUse.config.phoneNumberId;
        } else {
            targetPhoneId = this.settings.config.phoneNumberId;
        }

        if (!targetPhoneId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }

        const data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: {
                body: text
            },
            context: {
                message_id: replyMessageId
            }
        };

        return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
    }

    /**
     * إرسال تفاعل (إيموجي) على رسالة
     * @param {string} to رقم الهاتف المستلم
     * @param {string} messageId معرف الرسالة للتفاعل معها
     * @param {string} emoji رمز الإيموجي للتفاعل
     * @param {string} phoneNumberId معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendReaction(to, messageId, emoji, phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let targetPhoneId = phoneNumberId;
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
            targetPhoneId = settingsToUse.config.phoneNumberId;
        } else {
            targetPhoneId = this.settings.config.phoneNumberId;
        }

        if (!targetPhoneId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }

        const data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'reaction',
            reaction: {
                message_id: messageId,
                emoji: emoji
            }
        };

        return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
    }

    /**
     * الحصول على رابط تنزيل وسائط
     * @param {string} mediaId - معرف الوسائط
     * @param {string} phoneNumberId - معرف رقم الهاتف (اختياري)
     * @returns {Promise<object>} رابط ومعلومات الوسائط
     */
    async getMediaUrl(mediaId, phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
        }

        return this.sendRequest(`/${mediaId}`, 'GET', null, settingsToUse);
    }

    /**
     * إرسال صورة عبر واتساب
     * @param {string} to - رقم الهاتف المستلم
     * @param {string} imageUrl - رابط الصورة أو بيانات base64
     * @param {string} caption - نص وصفي للصورة (اختياري)
     * @param {string} phoneNumberId - معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendImage(to, imageUrl, caption = '', phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let targetPhoneId = phoneNumberId;
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
            targetPhoneId = settingsToUse.config.phoneNumberId;
        } else {
            targetPhoneId = this.settings.config.phoneNumberId;
        }

        if (!targetPhoneId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }

        // هيكل البيانات للصورة
        let data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'image',
            image: {}
        };

        // تحديد مصدر الصورة (رابط أو base64)
        if (imageUrl.startsWith('http')) {
            // استخدام رابط خارجي
            data.image = {
                link: imageUrl
            };
        } else if (imageUrl.startsWith('data:image')) {
            // استخدام بيانات base64
            const base64Data = imageUrl.split(',')[1];
            data.image = {
                id: base64Data
            };
        } else {
            // افتراض أنها بيانات base64 بدون prefix
            data.image = {
                id: imageUrl
            };
        }

        // إضافة وصف الصورة إذا كان موجوداً
        if (caption && caption.trim()) {
            data.image.caption = caption;
        }

        return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
    }

    /**
     * إرسال مستند عبر واتساب
     * @param {string} to - رقم الهاتف المستلم
     * @param {string} documentUrl - رابط المستند أو بيانات base64
     * @param {string} filename - اسم الملف
     * @param {string} caption - نصوصفي للمستند (اختياري)
     * @param {string} phoneNumberId - معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendDocument(to, documentUrl, filename, caption = '', phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let targetPhoneId = phoneNumberId;
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
            targetPhoneId = settingsToUse.config.phoneNumberId;
        } else {
            targetPhoneId = this.settings.config.phoneNumberId;
        }

        if (!targetPhoneId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }

        // هيكل البيانات للمستند
        let data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'document',
            document: {
                filename: filename
            }
        };

        // تحديد مصدر المستند (رابط أو base64)
        if (documentUrl.startsWith('http')) {
            // استخدام رابط خارجي
            data.document.link = documentUrl;
        } else if (documentUrl.startsWith('data:')) {
            // استخدام بيانات base64
            const base64Data = documentUrl.split(',')[1];
            data.document.id = base64Data;
        } else {
            // افتراض أنها بيانات base64 بدون prefix
            data.document.id = documentUrl;
        }

        // إضافة وصف المستند إذا كان موجوداً
        if (caption && caption.trim()) {
            data.document.caption = caption;
        }

        return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
    }

    /**
     * إرسال فيديو عبر واتساب
     * @param {string} to - رقم الهاتف المستلم
     * @param {string} videoUrl - رابط الفيديو أو بيانات base64
     * @param {string} caption - نصوصفي للفيديو (اختياري)
     * @param {string} phoneNumberId - معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendVideo(to, videoUrl, caption = '', phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let targetPhoneId = phoneNumberId;
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
            targetPhoneId = settingsToUse.config.phoneNumberId;
        } else {
            targetPhoneId = this.settings.config.phoneNumberId;
        }

        if (!targetPhoneId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }

        // هيكل البيانات للفيديو
        let data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'video',
            video: {}
        };

        // تحديد مصدر الفيديو (رابط أو base64)
        if (videoUrl.startsWith('http')) {
            // استخدام رابط خارجي
            data.video.link = videoUrl;
        } else if (videoUrl.startsWith('data:video')) {
            // استخدام بيانات base64
            const base64Data = videoUrl.split(',')[1];
            data.video.id = base64Data;
        } else {
            // افتراض أنها بيانات base64 بدون prefix
            data.video.id = videoUrl;
        }

        // إضافة وصف الفيديو إذا كان موجوداً
        if (caption && caption.trim()) {
            data.video.caption = caption;
        }

        return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
    }

    /**
     * إرسال ملف صوتي عبر واتساب
     * @param {string} to - رقم الهاتف المستلم
     * @param {string} audioUrl - رابط الملف الصوتي أو بيانات base64
     * @param {string} phoneNumberId - معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendAudio(to, audioUrl, phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let targetPhoneId = phoneNumberId;
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
            targetPhoneId = settingsToUse.config.phoneNumberId;
        } else {
            targetPhoneId = this.settings.config.phoneNumberId;
        }

        if (!targetPhoneId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }

        // هيكل البيانات للملف الصوتي
        let data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'audio',
            audio: {}
        };

        // تحديد مصدر الملف الصوتي (رابط أو base64)
        if (audioUrl.startsWith('http')) {
            // استخدام رابط خارجي
            data.audio.link = audioUrl;
        } else if (audioUrl.startsWith('data:audio')) {
            // استخدام بيانات base64
            const base64Data = audioUrl.split(',')[1];
            data.audio.id = base64Data;
        } else {
            // افتراض أنها بيانات base64 بدون prefix
            data.audio.id = audioUrl;
        }

        return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
    }

    /**
     * إرسال موقع عبر واتساب
     * @param {string} to - رقم الهاتف المستلم
     * @param {number} latitude - خط العرض
     * @param {number} longitude - خط الطول
     * @param {string} name - اسم الموقع (اختياري)
     * @param {string} phoneNumberId - معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendLocation(to, latitude, longitude, name = '', phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let targetPhoneId = phoneNumberId;
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
            targetPhoneId = settingsToUse.config.phoneNumberId;
        } else {
            targetPhoneId = this.settings.config.phoneNumberId;
        }

        if (!targetPhoneId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }

        // هيكل البيانات للموقع
        const data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'location',
            location: {
                latitude,
                longitude
            }
        };

        // إضافة اسم الموقع إذا كان موجوداً
        if (name && name.trim()) {
            data.location.name = name;
        }

        return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
    }

    /**
     * إرسال ملصق عبر واتساب
     * @param {string} to - رقم الهاتف المستلم
     * @param {string} stickerUrl - رابط الملصق أو معرف الملصق
     * @param {string} phoneNumberId - معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendSticker(to, stickerUrl, phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let targetPhoneId = phoneNumberId;
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
            targetPhoneId = settingsToUse.config.phoneNumberId;
        } else {
            targetPhoneId = this.settings.config.phoneNumberId;
        }

        if (!targetPhoneId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }

        // هيكل البيانات للملصق
        let data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'sticker',
            sticker: {}
        };

        // تحديد مصدر الملصق (رابط أو معرف)
        if (stickerUrl.startsWith('http')) {
            // استخدام رابط خارجي
            data.sticker.link = stickerUrl;
        } else {
            // افتراض أنها معرف ملصق
            data.sticker.id = stickerUrl;
        }

        return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
    }

    /**
     * إرسال رد على رسالة مع وسائط
     * @param {string} to - رقم الهاتف المستلم
     * @param {string} mediaType - نوع الوسائط (image, document, video, audio, sticker)
     * @param {string} mediaUrl - رابط الوسائط أو بيانات base64
     * @param {string} replyMessageId - معرف الرسالة التي يتم الرد عليها
     * @param {object} options - خيارات إضافية (caption, filename)
     * @param {string} phoneNumberId - معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendReplyWithMedia(to, mediaType, mediaUrl, replyMessageId, options = {}, phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let targetPhoneId = phoneNumberId;
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
            targetPhoneId = settingsToUse.config.phoneNumberId;
        } else {
            targetPhoneId = this.settings.config.phoneNumberId;
        }

        if (!targetPhoneId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }

        // التحقق من صحة نوع الوسائط
        if (!['image', 'document', 'video', 'audio', 'sticker'].includes(mediaType)) {
            throw new Error(`نوع الوسائط غير مدعوم: ${mediaType}`);
        }

        // هيكل البيانات العام
        const data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: mediaType,
            context: {
                message_id: replyMessageId
            }
        };

        // إضافة بيانات الوسائط حسب النوع
        let mediaData = {};

        // تحديد مصدر الوسائط (رابط أو base64)
        if (mediaUrl.startsWith('http')) {
            mediaData.link = mediaUrl;
        } else if (mediaUrl.startsWith(`data:${mediaType}`)) {
            const base64Data = mediaUrl.split(',')[1];
            mediaData.id = base64Data;
        } else {
            mediaData.id = mediaUrl;
        }

        // إضافة الخيارات الإضافية
        if (options.caption && ['image', 'video', 'document'].includes(mediaType)) {
            mediaData.caption = options.caption;
        }

        if (options.filename && mediaType === 'document') {
            mediaData.filename = options.filename;
        }

        // تعيين بيانات الوسائط في الطلب
        data[mediaType] = mediaData;

        return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
    }
}

module.exports = new MetaWhatsappService();
