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
     * @param {string} phoneNumberIdParam معرف رقم الهاتف (اختياري)
     * @returns {Promise<object>} معلومات رقم الهاتف
     */
    async getPhoneNumberInfo(phoneNumberIdParam = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // تحديد الإعدادات المراد استخدامها
        let settingsToUse = this.settings;
        if (phoneNumberIdParam && phoneNumberIdParam !== this.settings?.config?.phoneNumberId) {
            settingsToUse = await this.getSettingsByPhoneNumberId(phoneNumberIdParam);
            if (!settingsToUse) {
                throw new Error(`لم يتم العثور على إعدادات لرقم الهاتف المحدد: ${phoneNumberIdParam}`);
            }
        } else if (!settingsToUse) {
             // إذا كانت الإعدادات الافتراضية غير موجودة
             throw new Error('لا توجد إعدادات واتساب نشطة متاحة.');
        }

        // الحصول على معرف رقم الهاتف الفعلي من الإعدادات المختارة
        const actualPhoneNumberId = settingsToUse.config?.phoneNumberId;

        // التحقق من وجود معرف رقم هاتف صالح
        if (!actualPhoneNumberId) {
             logger.error('MetaWhatsappService', 'معرف رقم الهاتف غير موجود في الإعدادات المختارة', { settingsName: settingsToUse.name });
             throw new Error('معرف رقم الهاتف غير موجود في الإعدادات المختارة.');
        }


        // تم تصحيح رسالة التسجيل واستخدام المعرف الفعلي
        logger.info('MetaWhatsappService', 'جاري الحصول على معلومات رقم الهاتف', { 
            phoneNumberId: actualPhoneNumberId 
        });

        try {
            // استخدام المعرف الفعلي من الإعدادات في بناء عنوان URL
            const url = `${this.baseUrl}/${actualPhoneNumberId}`;
            const headers = {
                'Authorization': `Bearer ${settingsToUse.config.accessToken}`
            };
            
            // استخدام axios للحصول على معلومات رقم الهاتف (تم تصحيح التعليق)
            const axios = require('axios');
            const response = await axios.get(url, { headers });
            
            // تم تصحيح رسالة التسجيل واستخدام المعرف الفعلي
            logger.info('MetaWhatsappService', 'تم الحصول على معلومات رقم الهاتف بنجاح', { 
                phoneNumberId: actualPhoneNumberId, 
                responseData: response.data
            });
            
            return response.data;
        } catch (error) {
            // تم تصحيح رسالة التسجيل واستخدام المعرف الفعلي
            logger.error('MetaWhatsappService', 'خطأ في الحصول على معلومات رقم الهاتف', { 
                error: error.message,
                phoneNumberId: actualPhoneNumberId, // <-- تم استخدام المعرف الفعلي هنا
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
     * إرسال رسالة قالب عبر واتساب
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

        logger.info('MetaWhatsappService', 'جاري الحصول على رابط الوسائط', {
            mediaId
        });

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
     * تحميل وسائط إلى خوادم واتساب
     * @param {string|Buffer} fileData - محتوى الملف (base64 أو بيانات الملف)
     * @param {string} mimeType - نوع MIME للملف
     * @param {string} phoneNumberId - معرف رقم الهاتف (اختياري)
     * @returns {Promise<object>} استجابة تحميل الوسائط تحتوي على معرف الوسائط
     */
    async uploadMedia(fileData, mimeType, phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        logger.info('MetaWhatsappService', 'بدء تحميل وسائط إلى خوادم واتساب', {
            mimeType
        });
        
        // التحقق من دعم نوع الملف
        if (!this.isSupportedMimeType(mimeType)) {
            throw new Error(`نوع الملف ${mimeType} غير مدعوم في واتساب. الأنواع المدعومة هي: JPEG, PNG, WEBP للصور، MP4 للفيديو، MP3/OGG للصوت، PDF/DOC/DOCX/XLS/XLSX للمستندات.`);
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

        try {
            // تحويل البيانات إلى FormData
            const FormData = require('form-data');
            const form = new FormData();
            
            // إضافة المنتج المطلوب حسب وثائق واتساب
            form.append('messaging_product', 'whatsapp');
            
            // إذا كانت البيانات بتنسيق base64، نحولها إلى buffer
            let fileBuffer;
            if (typeof fileData === 'string') {
                // إزالة prefix إذا كان موجوداً
                if (fileData.includes('base64,')) {
                    fileData = fileData.split('base64,')[1];
                }
                fileBuffer = Buffer.from(fileData, 'base64');
            } else {
                fileBuffer = fileData;
            }
            
            // التحقق من نوع الوسائط وحجمها حسب قيود واتساب
            const mediaType = this.getMediaTypeFromMimeType(mimeType);
            const maxSize = this.getMaxSizeForMediaType(mediaType);
            
            if (fileBuffer.length > maxSize) {
                throw new Error(`حجم الملف (${fileBuffer.length} بايت) يتجاوز الحد الأقصى المسموح به (${maxSize} بايت) لنوع الوسائط ${mediaType}`);
            }
            
            // إضافة الملف إلى النموذج
            form.append('file', fileBuffer, {
                filename: `media_file.${this.getFileExtensionFromMimeType(mimeType)}`,
                contentType: mimeType
            });
            
            // إرسال طلب تحميل الوسائط
            const url = `${this.baseUrl}/${targetPhoneId}/media`;
            const headers = {
                'Authorization': `Bearer ${settingsToUse.config.accessToken}`
            };
            
            // استخدام axios مع FormData
            const axios = require('axios');
            const response = await axios.post(url, form, {
                headers: {
                    ...headers,
                    ...form.getHeaders()
                }
            });
            
            logger.info('MetaWhatsappService', 'تم تحميل الوسائط بنجاح', {
                mediaId: response.data.id
            });
            
            return response.data;
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في تحميل الوسائط', {
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
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
    getMaxSizeForMediaType(mediaType) {
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
    getFileExtensionFromMimeType(mimeType) {
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

    /**
     * إرسال وسائط (صورة، فيديو، مستند، صوت) مع أو بدون رد على رسالة سابقة
     * 
     * دالة موحدة تتعامل مع جميع أنواع الوسائط وتدعم إرسال الوسائط كرد أو كرسالة جديدة
     * 
     * @param {string} to - رقم الهاتف المستلم
     * @param {string} mediaType - نوع الوسائط ('image', 'video', 'document', 'audio')
     * @param {string} fileData - بيانات الملف (base64)
     * @param {object} options - خيارات إضافية (caption, filename)
     * @param {string} replyMessageId - معرف الرسالة للرد عليها (اختياري)
     * @param {string} phoneNumberId - معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} استجابة واتساب API
     */
    async sendMediaMessage(to, mediaType, fileData, options = {}, replyMessageId = null, phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        // التحقق من صحة نوع الوسائط
        if (!['image', 'video', 'document', 'audio'].includes(mediaType)) {
            throw new Error(`نوع وسائط غير مدعوم: ${mediaType}`);
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
        
        // تحديد نوع MIME بناءً على نوع الوسائط
        let mimeType;
        switch (mediaType) {
            case 'image':
                mimeType = 'image/jpeg'; // أو 'image/png'
                break;
            case 'video':
                mimeType = 'video/mp4';
                break;
            case 'audio':
                mimeType = 'audio/mpeg'; // أو 'audio/ogg'
                break;
            case 'document':
                mimeType = 'application/pdf'; // أو أي نوع مستند آخر
                break;
        }
        
        // تسجيل بداية العملية
        logger.info('MetaWhatsappService', `بدء إرسال ${mediaType}`, {
            isReply: !!replyMessageId,
            to,
            mediaType
        });
        
        try {
            // تحميل الوسائط أولاً إلى خوادم واتساب للحصول على معرف الوسائط
            const uploadResponse = await this.uploadMedia(fileData, mimeType, phoneNumberId);
            const mediaId = uploadResponse.id;
            
            logger.info('MetaWhatsappService', `تم تحميل ${mediaType} بنجاح`, {
                mediaId,
                mediaType
            });
            
            // هيكل البيانات العام
            const data = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: mediaType
            };
            
            // إضافة سياق الرد إذا كان موجوداً
            if (replyMessageId) {
                data.context = {
                    message_id: replyMessageId
                };
            }
            
            // إضافة بيانات الوسائط حسب النوع
            const mediaData = {
                id: mediaId
            };
            
            // إضافة الخيارات الإضافية
            if (options.caption && ['image', 'video', 'document'].includes(mediaType)) {
                mediaData.caption = options.caption;
            }
            
            if (options.filename && mediaType === 'document') {
                mediaData.filename = options.filename;
            }
            
            // تعيين بيانات الوسائط في الطلب
            data[mediaType] = mediaData;
            
            // إرسال الطلب
            const response = await this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
            
            logger.info('MetaWhatsappService', `تم إرسال ${mediaType} بنجاح`, {
                mediaId,
                messageId: response.messages?.[0]?.id,
                isReply: !!replyMessageId
            });
            
            return response;
        } catch (error) {
            logger.error('MetaWhatsappService', `خطأ في إرسال ${mediaType}`, {
                error: error.message,
                mediaType,
                isReply: !!replyMessageId
            });
            throw error;
        }
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
        const options = {
            caption: caption || ''
        };
        
        return this.sendMediaMessage(to, 'image', imageUrl, options, null, phoneNumberId);
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
        const options = {
            caption: caption || '',
            filename: filename || 'document.pdf'
        };
        
        return this.sendMediaMessage(to, 'document', documentUrl, options, null, phoneNumberId);
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
        const options = {
            caption: caption || ''
        };
        
        return this.sendMediaMessage(to, 'video', videoUrl, options, null, phoneNumberId);
    }

    /**
     * إرسال ملف صوتي عبر واتساب
     * @param {string} to - رقم الهاتف المستلم
     * @param {string} audioUrl - رابط الملف الصوتي أو بيانات base64
     * @param {string} phoneNumberId - معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendAudio(to, audioUrl, phoneNumberId = null) {
        return this.sendMediaMessage(to, 'audio', audioUrl, {}, null, phoneNumberId);
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

        logger.info('MetaWhatsappService', 'بدء إرسال ملصق', {
            to,
            isUrl: stickerUrl.startsWith('http')
        });

        try {
            // هيكل البيانات للملصق
            const data = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'sticker',
                sticker: {}
            };

            // تحديد مصدر الملصق (رابط أو معرف)
            if (stickerUrl.startsWith('http')) {
                data.sticker.link = stickerUrl;
            } else {
                data.sticker.id = stickerUrl;
            }

            const response = await this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
            
            logger.info('MetaWhatsappService', 'تم إرسال الملصق بنجاح', {
                messageId: response.messages?.[0]?.id
            });
            
            return response;
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في إرسال ملصق', {
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
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
        // التحقق من صحة نوع الوسائط sticker
        if (mediaType === 'sticker') {
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

            // هيكل البيانات العام
            const data = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'sticker',
                context: {
                    message_id: replyMessageId
                },
                sticker: {}
            };

            // تحديد مصدر الملصق (رابط أو معرف)
            if (mediaUrl.startsWith('http')) {
                data.sticker.link = mediaUrl;
            } else {
                data.sticker.id = mediaUrl;
            }

            return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
        }

        // استخدام sendMediaMessage لإرسال الوسائط الأخرى (image, document, video, audio)
        return this.sendMediaMessage(to, mediaType, mediaUrl, options, replyMessageId, phoneNumberId);
    }
}

module.exports = new MetaWhatsappService();
