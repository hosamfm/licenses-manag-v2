/**
 * خدمة واتساب الرسمية من ميتا (الإصدار 22)
 */
const axios = require('axios');
const FormData = require('form-data');
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
        await this._loadSettings();
        this.initialized = true;
        return this.settings.isConfigured();
    }

    /**
     * تحديث الإعدادات عند تغييرها
     */
    async refreshSettings() {
        await this._loadSettings();
        return true;
    }

    /**
     * جلب الإعدادات
     */
    async _loadSettings() {
        this.allSettings = await MetaWhatsappSettings.getAllActiveSettings();
        this.settings = this.allSettings.length > 0 ? this.allSettings[0] : null;
        if (!this.settings) {
            throw new Error('لا توجد إعدادات نشطة');
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

        logger.info('MetaWhatsappService', 'جاري الحصول على رابط الوسائط', {
            phoneNumberId
        });

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
        }

        try {
            // إنشاء طلب للحصول على معلومات الوسائط
            const url = `${this.baseUrl}/${phoneNumberId}`;
            const headers = {
                'Authorization': `Bearer ${settingsToUse.config.accessToken}`
            };
            
            // استخدام axios للحصول على معلومات الوسائط
            const response = await axios.get(url, { headers });
            
            logger.info('MetaWhatsappService', 'تم الحصول على معلومات الوسائط بنجاح', {
                phoneNumberId,
                responseData: response.data
            });
            
            return response.data;
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في الحصول على معلومات الوسائط', {
                error: error.message,
                phoneNumberId,
                response: error.response?.data
            });
            throw error;
        }
    }

    /**
     * إرسال رسالة نصية عبر واتساب
     * @param {string} to رقم الهاتف المستلم
     * @param {string} text نص الرسالة
     * @param {string} phoneNumberId معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendTextMessage(to, text, phoneNumberId = null) {
        const { targetPhoneId, settingsToUse } = await this._resolveSettings(phoneNumberId);
        
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
     * إرسال رسالة قالب عبر واتساب
     * @param {string} to رقم الهاتف المستلم
     * @param {string} templateName اسم القالب
     * @param {string} language رمز اللغة
     * @param {Array} components مكونات القالب
     * @param {string} phoneNumberId معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendTemplateMessage(to, templateName, language = 'ar', components = [], phoneNumberId = null) {
        const { targetPhoneId, settingsToUse } = await this._resolveSettings(phoneNumberId);
        
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
        const { targetPhoneId, settingsToUse } = await this._resolveSettings(phoneNumberId);
        
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
        const { targetPhoneId, settingsToUse } = await this._resolveSettings(phoneNumberId);
        
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

        logger.info('MetaWhatsappService', 'جاري الحصول على رابط الوسائط', {
            mediaId
        });

        // استخدام معرف رقم الهاتف المحدد، أو استخدام الإعدادات الافتراضية
        let settingsToUse = this.settings;
        
        // إذا تم تحديد معرف رقم هاتف مختلف، نحصل على الإعدادات المناسبة
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات لرقم الهاتف المحدد');
            }
        }

        try {
            // إنشاء طلب للحصول على معلومات الوسائط
            const url = `${this.baseUrl}/${mediaId}`;
            const headers = {
                'Authorization': `Bearer ${settingsToUse.config.accessToken}`
            };
            
            // استخدام axios للحصول على معلومات الوسائط
            const response = await axios.get(url, { headers });
            
            logger.info('MetaWhatsappService', 'تم الحصول على معلومات الوسائط بنجاح', {
                mediaId,
                responseData: response.data
            });
            
            return response.data;
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في الحصول على معلومات الوسائط', {
                error: error.message,
                mediaId,
                response: error.response?.data
            });
            throw error;
        }
    }

    /**
     * تحميل وسائط إلى خوادم واتساب
     * @param {string} phoneNumberId - معرف رقم الهاتف
     * @param {Buffer} bufferData - بيانات الملف
     * @param {string} mimeType - نوع MIME للملف
     * @param {string} filename - اسم الملف
     * @returns {Promise<object>} استجابة تحميل الوسائط تحتوي على معرف الوسائط
     */
    _validateMedia(bufferData, mimeType) {
        // التحقق من دعم نوع الملف
        if (!this.isSupportedMimeType(mimeType)) {
            throw new Error(`نوع الملف ${mimeType} غير مدعوم في واتساب`);
        }
        
        // التحقق من حجم الملف
        const maxSize = this.getMaxFileSize(mimeType);
        if (bufferData.length > maxSize) {
            throw new Error(`حجم الملف ${bufferData.length} يتجاوز الحد المسموح ${maxSize} بايت`);
        }
    }

    _prepareMediaForm(bufferData, mimeType, filename) {
        const form = new FormData();
        form.append('file', bufferData, {
            filename: filename || `file.${this.getFileExtension(mimeType)}`,
            contentType: mimeType
        });
        form.append('type', mimeType);
        form.append('messaging_product', 'whatsapp');
        return form;
    }

    async uploadMedia(phoneNumberId, bufferData, mimeType, filename = '') {
        const { targetPhoneId, settingsToUse } = await this._resolveSettings(phoneNumberId);
        
        this._validateMedia(bufferData, mimeType);
        
        const url = `${this.baseUrl}/${targetPhoneId}/media`;
        const form = this._prepareMediaForm(bufferData, mimeType, filename);
        
        const headers = {
            'Authorization': `Bearer ${settingsToUse.config.accessToken}`,
            ...form.getHeaders()
        };
        
        const response = await axios.post(url, form, { headers });
        return response.data;
    }
    
    /**
     * الحصول على نوع الوسائط من نوع MIME
     * @param {string} mimeType - نوع MIME
     * @returns {string} نوع الوسائط (image, video, audio, document)
     */
    getMediaTypeFromMimeType(mimeType) {
        if (mimeType.startsWith('image/')) {
            return 'image';
        } else if (mimeType.startsWith('video/')) {
            return 'video';
        } else if (mimeType.startsWith('audio/')) {
            return 'audio';
        } else {
            return 'document';
        }
    }
    
    /**
     * التحقق من دعم نوع الملف في واتساب
     * @param {string} mimeType - نوع MIME للملف
     * @returns {boolean} هل النوع مدعوم أم لا
     */
    isSupportedMimeType(mimeType) {
        // قائمة أنواع MIME المدعومة في واتساب
        const supportedTypes = {
            // الصور المدعومة
            'image/jpeg': true,
            'image/png': true,
            'image/webp': true,
            
            // الفيديو المدعوم
            'video/mp4': true,
            'video/3gpp': true,
            
            // الصوت المدعوم
            'audio/aac': true,
            'audio/mp4': true,
            'audio/mpeg': true,
            'audio/amr': true,
            'audio/ogg': true,
            
            // المستندات المدعومة
            'application/pdf': true,
            'application/vnd.ms-powerpoint': true,
            'application/msword': true,
            'application/vnd.ms-excel': true,
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': true,
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': true,
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': true,
            'text/plain': true
        };
        
        return !!supportedTypes[mimeType];
    }
    
    /**
     * الحصول على الحد الأقصى لحجم الملف حسب نوع الوسائط
     * @param {string} mediaType - نوع الوسائط
     * @returns {number} الحد الأقصى لحجم الملف بالبايت
     */
    getMaxFileSize(mediaType) {
        // حدود الحجم حسب وثائق واتساب
        const MB = 1024 * 1024;
        switch (mediaType) {
            case 'image':
                return 5 * MB; // 5 ميجابايت للصور
            case 'video':
            case 'audio':
                return 16 * MB; // 16 ميجابايت للفيديو والصوت
            case 'document':
                return 100 * MB; // 100 ميجابايت للمستندات
            default:
                return 5 * MB; // افتراضي
        }
    }
    
    /**
     * الحصول على امتداد الملف من نوع MIME
     * @param {string} mimeType - نوع MIME
     * @returns {string} امتداد الملف
     */
    getFileExtension(mimeType) {
        const mimeToExt = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'video/mp4': 'mp4',
            'video/3gpp': '3gp',
            'audio/mp3': 'mp3',
            'audio/mpeg': 'mp3',
            'audio/ogg': 'ogg',
            'audio/amr': 'amr',
            'audio/aac': 'aac',
            'audio/mp4': 'm4a',
            'application/pdf': 'pdf',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
            'application/vnd.ms-excel': 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
            'application/vnd.ms-powerpoint': 'ppt',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
            'text/plain': 'txt'
        };
        
        return mimeToExt[mimeType] || 'bin';
    }

    _parseBase64(base64) {
        const base64Data = base64.split(';base64,').pop();
        const mimeType = base64.split(';')[0].split(':')[1];
        const bufferData = Buffer.from(base64Data, 'base64');
        return { mimeType, bufferData };
    }

    /**
     * إرسال صورة عبر واتساب
     * @param {string} to - رقم الهاتف المستلم
     * @param {string} imageUrl - رابط الصورة أو بيانات base64
     * @param {string} caption - نصوصفي للصورة (اختياري)
     * @param {string} phoneNumberId - معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendImage(to, imageUrl, caption = '', phoneNumberId = null) {
        const { targetPhoneId, settingsToUse } = await this._resolveSettings(phoneNumberId);
        
        // هيكل البيانات للصورة
        let data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'image',
            image: {}
        };

        try {
            // تحديد مصدر الصورة (رابط أو base64)
            if (imageUrl.startsWith('http')) {
                // استخدام رابط خارجي
                data.image.link = imageUrl;
            } else {
                // استخدام بيانات base64 - تحميل الصورة أولاً إلى خوادم واتساب
                const { mimeType, bufferData } = this._parseBase64(imageUrl);
                // التحقق من دعم نوع الملف
                if (!this.isSupportedMimeType(mimeType)) {
                    throw new Error(`نوع الملف ${mimeType} غير مدعوم في واتساب. الأنواع المدعومة للصور هي: JPEG, PNG, WEBP فقط.`);
                }
                // تحميل الصورة إلى خوادم واتساب
                logger.info('MetaWhatsappService', 'تحميل صورة إلى خوادم واتساب قبل الإرسال');
                const uploadResult = await this.uploadMedia(targetPhoneId, bufferData, mimeType);
                // استخدام معرف الوسائط الناتج
                data.image.id = uploadResult.id;
                logger.info('MetaWhatsappService', 'تم تحميل الصورة بنجاح', { mediaId: uploadResult.id });
            }

            // إضافة وصف الصورة إذا كان موجوداً
            if (caption && caption.trim()) {
                data.image.caption = caption;
            }

            return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في إرسال صورة', {
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
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
        const { targetPhoneId, settingsToUse } = await this._resolveSettings(phoneNumberId);
        
        let mediaId;
        if (!documentUrl.startsWith('http')) {
            const { mimeType, bufferData } = this._parseBase64(documentUrl);
            mediaId = await this.uploadMedia(targetPhoneId, bufferData, mimeType, filename);
        } else {
            mediaId = documentUrl;
        }
        
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'document',
            document: {
                id: mediaId,
                filename,
                caption
            }
        };
        
        return this._sendWhatsappMessage(payload, settingsToUse);
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
        const { targetPhoneId, settingsToUse } = await this._resolveSettings(phoneNumberId);
        
        let mediaId;
        if (!videoUrl.startsWith('http')) {
            const { mimeType, bufferData } = this._parseBase64(videoUrl);
            mediaId = await this.uploadMedia(targetPhoneId, bufferData, mimeType);
        } else {
            mediaId = videoUrl;
        }
        
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'video',
            video: {
                id: mediaId,
                caption
            }
        };
        
        return this._sendWhatsappMessage(payload, settingsToUse);
    }

    /**
     * إرسال ملف صوتي عبر واتساب
     * @param {string} to - رقم الهاتف المستلم
     * @param {string} audioUrl - رابط الملف الصوتي أو بيانات base64
     * @param {string} phoneNumberId - معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendAudio(to, audioUrl, phoneNumberId = null) {
        const { targetPhoneId, settingsToUse } = await this._resolveSettings(phoneNumberId);
        
        let mediaId;
        if (!audioUrl.startsWith('http')) {
            const { mimeType, bufferData } = this._parseBase64(audioUrl);
            mediaId = await this.uploadMedia(targetPhoneId, bufferData, mimeType);
        } else {
            mediaId = audioUrl;
        }
        
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'audio',
            audio: {
                id: mediaId
            }
        };
        
        return this._sendWhatsappMessage(payload, settingsToUse);
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
        const { targetPhoneId, settingsToUse } = await this._resolveSettings(phoneNumberId);
        
        const payload = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'sticker',
            sticker: {}
        };
        
        // تحديد مصدر الملصق (رابط أو معرف)
        if (stickerUrl.startsWith('http')) {
            // استخدام رابط خارجي
            payload.sticker.link = stickerUrl;
        } else {
            // افتراضي
            payload.sticker.id = stickerUrl;
        }
        
        return this._sendWhatsappMessage(payload, settingsToUse);
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
        const { targetPhoneId, settingsToUse } = await this._resolveSettings(phoneNumberId);
        
        // التحقق من صحة نوع الوسائط
        if (!['image', 'document', 'video', 'audio', 'sticker'].includes(mediaType)) {
            throw new Error(`نوع الوسائط غير مدعوم: ${mediaType}`);
        }
        
        // هيكل البيانات العام
        const payload = {
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
            const { bufferData, mimeType } = this._parseBase64(mediaUrl);
            const uploadResult = await this.uploadMedia(targetPhoneId, bufferData, mimeType);
            mediaData.id = uploadResult.id;
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
        payload[mediaType] = mediaData;
        
        return this._sendWhatsappMessage(payload, settingsToUse);
    }

    async _resolveSettings(phoneNumberId) {
        if (!this.initialized) await this.initialize();
        
        let targetPhoneId = phoneNumberId || this.settings.config.phoneNumberId;
        let settingsToUse = this.settings;
        
        if (phoneNumberId && phoneNumberId !== this.settings.config.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberId);
            if (!settingsToUse) {
                throw new Error('لم يتم العثور على إعدادات للرقم المحدد');
            }
            targetPhoneId = settingsToUse.config.phoneNumberId;
        }
        
        if (!targetPhoneId) {
            throw new Error('معرف رقم الهاتف غير محدد في الإعدادات');
        }
        
        return { targetPhoneId, settingsToUse };
    }

    async _sendWhatsappMessage(payload, settingsToUse) {
        const url = `${this.baseUrl}/${settingsToUse.config.phoneNumberId}/messages`;
        const headers = {
            'Authorization': `Bearer ${settingsToUse.config.accessToken}`,
            'Content-Type': 'application/json'
        };

        try {
            const response = await axios.post(url, payload, { headers });
            logger.info('MetaWhatsappService', 'تم إرسال الرسالة بنجاح', {
                type: payload.type,
                to: payload.to,
                messageId: response.data.id
            });
            return response.data;
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في إرسال الرسالة', {
                type: payload.type,
                to: payload.to,
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
    }
}

module.exports = new MetaWhatsappService();
