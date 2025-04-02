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

        logger.info('MetaWhatsappService', 'جاري الحصول على رابط الوسائط', {
            phoneNumberId
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
            const axios = require('axios');
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
     * @param {string|Buffer} fileData - محتوى الملف (base64 أو بيانات الملف)
     * @param {string} mimeType - نوع MIME للملف
     * @param {object} options - خيارات إضافية (filename)
     * @param {string} phoneNumberId - معرف رقم الهاتف (اختياري)
     * @returns {Promise<object>} استجابة تحميل الوسائط تحتوي على معرف الوسائط
     */
    async uploadMedia(fileData, mimeType, options = {}, phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }
        
        try {
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

            let filename = '';
            if (options && typeof options === 'object') {
                if (options.filename) {
                    filename = options.filename;
                }
            }
            
            // معالجة اسم الملف للتأكد من صحة الترميز
            if (filename && !/^[\x00-\x7F]*$/.test(filename)) {
                // إذا كان الاسم يحتوي على أحرف غير ASCII (مثل العربية)، نحاول إصلاحه
                try {
                    const extension = filename.slice(filename.lastIndexOf('.') + 1);
                    const timestamp = new Date().getTime();
                    filename = `file_${timestamp}.${extension}`;
                    
                    logger.info('MetaWhatsappService', 'تم تعديل اسم الملف العربي للتوافق', {
                        newName: filename
                    });
                } catch (e) {
                    logger.warn('MetaWhatsappService', 'خطأ في معالجة اسم الملف', {
                        error: e.message
                    });
                }
            }
            
            logger.info('MetaWhatsappService', 'بدء تحميل وسائط إلى خوادم واتساب', {
                mimeType
            });
            
            // التحقق من دعم نوع الملف
            if (!this.isSupportedMimeType(mimeType, filename)) {
                throw new Error(`نوع الملف ${mimeType} غير مدعوم في واتساب. الأنواع المدعومة هي: JPEG, PNG, WEBP للصور، MP4 للفيديو، MP3/OGG للصوت، PDF/DOC/DOCX/XLS/XLSX للمستندات.`);
            }
            
            // استخراج بيانات الملف إذا كانت بتنسيق base64
            let fileBuffer;
            if (typeof fileData === 'string') {
                fileBuffer = Buffer.from(fileData, 'base64');
            } else if (Buffer.isBuffer(fileData)) {
                fileBuffer = fileData;
            } else {
                throw new Error('نوع بيانات الملف غير مدعوم. يجب أن تكون سلسلة base64 أو Buffer.');
            }
            
            // تحديد نوع الوسائط من نوع MIME
            const mediaType = this.getMediaTypeFromMimeType(mimeType);
            
            // بناء البيانات للطلب
            const formData = new FormData();
            formData.append('messaging_product', 'whatsapp');
            formData.append('type', mediaType);
            formData.append('file', fileBuffer, {
                filename: filename || `file.${this.getFileExtensionFromMimeType(mimeType)}`,
                contentType: mimeType
            });
            
            // استخدام axios مع FormData
            const headers = {
                'Authorization': `Bearer ${settingsToUse.config.accessToken}`,
                ...formData.getHeaders()
            };
            
            const response = await axios.post(
                `${this.baseUrl}/${targetPhoneId}/media`,
                formData,
                { headers }
            );
            
            return response.data;
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في تحميل الوسائط', {
                error: error.message || 'خطأ غير معروف',
                stack: error.stack,
                mimeType,
                responseData: error.response?.data
            });
            
            if (error.response && error.response.data && error.response.data.error) {
                throw new Error(`خطأ من واجهة برمجة تطبيقات واتساب: ${error.response.data.error.message || JSON.stringify(error.response.data.error)}`);
            }
            
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
     * @param {string} fileName - اسم الملف (اختياري - يستخدم للتحقق من الامتداد إذا كان نوع MIME غير محدد)
     * @returns {boolean} هل النوع مدعوم أم لا
     */
    isSupportedMimeType(mimeType, fileName = '') {
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
        
        // تسجيل معلومات النوع للتشخيص
        logger.info('MetaWhatsappService', 'التحقق من دعم نوع MIME', {
            mimeType,
            fileName,
            supportedDirectly: supportedTypes[mimeType] ? true : false
        });
        
        // التحقق من نوع MIME مباشرة
        if (supportedTypes[mimeType]) {
            return true;
        }
        
        // إذا كان النوع application/octet-stream أو غير معروف، نحاول تحديد النوع من امتداد الملف
        if ((mimeType === 'application/octet-stream' || !mimeType) && fileName) {
            // استخدام اسم بديل مع الاحتفاظ بالامتداد
            const extension = fileName.slice(fileName.lastIndexOf('.') + 1);
            const timestamp = new Date().getTime();
            const newFilename = `document_${timestamp}.${extension}`;
            
            logger.info('MetaWhatsappService', 'محاولة تحديد النوع من الامتداد', {
                fileName,
                newFilename
            });
            
            // تحديد نوع الملف بناءً على الامتداد
            switch (extension) {
                case 'pdf':
                    logger.info('MetaWhatsappService', 'تم تحديد نوع PDF من الامتداد', { fileName });
                    return true; // مستند PDF
                case 'doc':
                case 'docx':
                    return true; // مستند Word
                case 'xls':
                case 'xlsx':
                    return true; // مستند Excel
                case 'ppt':
                case 'pptx':
                    return true; // مستند PowerPoint
                case 'txt':
                    return true; // ملف نصي
                case 'jpg':
                case 'jpeg':
                case 'png':
                case 'webp':
                    return true; // صورة
                case 'mp4':
                case '3gp':
                    return true; // فيديو
                case 'mp3':
                case 'ogg':
                case 'aac':
                case 'amr':
                    return true; // صوت
                default:
                    logger.warn('MetaWhatsappService', 'امتداد غير مدعوم', { extension, fileName });
                    return false;
            }
        }
        
        return false;
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
     * إرسال صورة عبر واتساب
     * @param {string} to - رقم الهاتف المستلم
     * @param {string} imageUrl - رابط الصورة أو بيانات base64
     * @param {string} caption - نصوصفي للصورة (اختياري)
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

        try {
            // تحديد مصدر الصورة (رابط أو base64)
            if (imageUrl.startsWith('http')) {
                // استخدام رابط خارجي
                data.image.link = imageUrl;
            } else {
                // استخدام بيانات base64 - تحميل الصورة أولاً إلى خوادم واتساب
                let base64Data = imageUrl;
                let mimeType = 'image/jpeg'; // افتراضي
                
                // استخراج نوع MIME والبيانات إذا كان التنسيق كاملاً
                if (imageUrl.startsWith('data:')) {
                    const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (matches && matches.length === 3) {
                        mimeType = matches[1];
                        base64Data = matches[2];
                    } else {
                        base64Data = imageUrl.split('base64,')[1] || imageUrl;
                    }
                }
                
                // تحميل الصورة إلى خوادم واتساب
                logger.info('MetaWhatsappService', 'تحميل صورة إلى خوادم واتساب قبل الإرسال');
                const uploadResult = await this.uploadMedia(base64Data, mimeType, phoneNumberId);
                
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
     * @param {string} documentData - بيانات المستند (رابط أو base64)
     * @param {string} filename - اسم الملف
     * @param {string} caption - وصف المستند (اختياري)
     * @param {string} phoneNumberId - معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendDocument(to, documentData, filename, caption = '', phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
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

            logger.info('MetaWhatsappService', 'تحميل مستند إلى خوادم واتساب قبل الإرسال', {});
            
            // حل مشكلة أسماء الملفات العربية
            let sanitizedFilename = filename;
            try {
                // إذا كان الاسم يحتوي على أحرف غير ASCII (مثل العربية)، نحاول إصلاحه
                if (!/^[\x00-\x7F]*$/.test(filename)) {
                    // استخدام اسم بديل مع الاحتفاظ بالامتداد
                    const extension = filename.slice(filename.lastIndexOf('.') + 1);
                    const timestamp = new Date().getTime();
                    sanitizedFilename = `document_${timestamp}.${extension}`;
                    
                    logger.info('MetaWhatsappService', 'تم تعديل اسم الملف العربي للتوافق', {
                        originalName: filename,
                        newName: sanitizedFilename
                    });
                }
            } catch (e) {
                logger.warn('MetaWhatsappService', 'خطأ في معالجة اسم الملف، سيتم استخدام الاسم الأصلي', {
                    error: e.message,
                    filename
                });
            }

            let data = {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to,
                type: 'document',
                document: {}
            };

            // تحديد ما إذا كان البيانات هي رابط أم base64
            let uploadResult = null;
            if (!documentData || documentData === 'undefined') {
                throw new Error('لا توجد بيانات مستند');
            } else if (documentData.startsWith('http')) {
                data.document.link = documentData;
            } else if (documentData.startsWith(`data:${sanitizedFilename}`)) {
                const base64Data = documentData.split(',')[1];
                uploadResult = await this.uploadMedia(base64Data, 'application/pdf', { filename: sanitizedFilename }, phoneNumberId);
                data.document.id = uploadResult.id;
            } else {
                // افتراضي
                uploadResult = await this.uploadMedia(documentData, 'application/pdf', { filename: sanitizedFilename }, phoneNumberId);
                data.document.id = uploadResult.id;
            }

            // إضافة وصف إذا وجد
            if (caption && caption.trim()) {
                data.document.caption = caption.trim();
            }

            // إضافة اسم الملف
            if (sanitizedFilename) {
                data.document.filename = sanitizedFilename;
            }

            return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في إرسال مستند', {
                error: error.message || 'خطأ غير معروف',
                stack: error.stack
            });
            throw error;
        }
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

        try {
            // تحديد مصدر الفيديو (رابط أو base64)
            if (videoUrl.startsWith('http')) {
                // استخدام رابط خارجي
                data.video.link = videoUrl;
            } else {
                // استخدام بيانات base64 - تحميل الفيديو أولاً إلى خوادم واتساب
                let base64Data = videoUrl;
                let mimeType = 'video/mp4'; // افتراضي
                
                // استخراج نوع MIME والبيانات إذا كان التنسيق كاملاً
                if (videoUrl.startsWith('data:')) {
                    const matches = videoUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (matches && matches.length === 3) {
                        mimeType = matches[1];
                        base64Data = matches[2];
                    } else {
                        base64Data = videoUrl.split('base64,')[1] || videoUrl;
                    }
                }
                
                // تحميل الفيديو إلى خوادم واتساب
                logger.info('MetaWhatsappService', 'تحميل فيديو إلى خوادم واتساب قبل الإرسال');
                const uploadResult = await this.uploadMedia(base64Data, mimeType, phoneNumberId);
                
                // استخدام معرف الوسائط الناتج
                data.video.id = uploadResult.id;
                logger.info('MetaWhatsappService', 'تم تحميل الفيديو بنجاح', { mediaId: uploadResult.id });
            }

            // إضافة وصف الفيديو إذا كان موجوداً
            if (caption && caption.trim()) {
                data.video.caption = caption;
            }

            return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في إرسال فيديو', {
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
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

        try {
            // تحديد مصدر الملف الصوتي (رابط أو base64)
            if (audioUrl.startsWith('http')) {
                // استخدام رابط خارجي
                data.audio.link = audioUrl;
            } else {
                // استخدام بيانات base64 - تحميل الملف الصوتي أولاً إلى خوادم واتساب
                let base64Data = audioUrl;
                let mimeType = 'audio/mp3'; // افتراضي
                
                // استخراج نوع MIME والبيانات إذا كان التنسيق كاملاً
                if (audioUrl.startsWith('data:')) {
                    const matches = audioUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (matches && matches.length === 3) {
                        mimeType = matches[1];
                        base64Data = matches[2];
                    } else {
                        base64Data = audioUrl.split('base64,')[1] || audioUrl;
                    }
                }
                
                // تحميل الملف الصوتي إلى خوادم واتساب
                logger.info('MetaWhatsappService', 'تحميل ملف صوتي إلى خوادم واتساب قبل الإرسال');
                const uploadResult = await this.uploadMedia(base64Data, mimeType, phoneNumberId);
                
                // استخدام معرف الوسائط الناتج
                data.audio.id = uploadResult.id;
                logger.info('MetaWhatsappService', 'تم تحميل الملف الصوتي بنجاح', { mediaId: uploadResult.id });
            }

            return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في إرسال ملف صوتي', {
                error: error.message,
                response: error.response?.data
            });
            throw error;
        }
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
            // افتراضي
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
