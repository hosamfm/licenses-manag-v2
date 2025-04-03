/**
 * خدمة واتساب الرسمية من ميتا (الإصدار 22)
 */
const axios = require('axios');
const MetaWhatsappSettings = require('../../models/MetaWhatsappSettings');
const logger = require('../loggerService');
const cacheService = require('../cacheService');

class MetaWhatsappService {
    /**
     * إنشاء نسخة من خدمة واتساب الرسمي
     */
    constructor() {
        this.settings = null;
        this.allSettings = [];
        this.baseUrl = 'https://graph.facebook.com/v22.0';
        this.initialized = false;
        this.mediaCache = new Map(); // إضافة تخزين مؤقت للوسائط
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

        // التحقق من صحة معرف الرسالة وتنسيقه
        const validatedWamid = this.validateWamid(replyMessageId);

        const data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'text',
            text: {
                body: text
            },
            context: {
                message_id: validatedWamid
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

        // التحقق من صحة معرف الرسالة وتنسيقه
        const validatedWamid = this.validateWamid(messageId);

        const data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: 'reaction',
            reaction: {
                message_id: validatedWamid,
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
     * @param {string} mediaType - نوع الوسائط (image, video, audio, document)
     * @param {object} settingsToUse - إعدادات الحساب المستخدمة
     * @returns {Promise<string>} معرف الوسائط
     */
    async uploadMedia(fileData, mediaType, settingsToUse) {
        if (!this.initialized) {
            await this.initialize();
        }

        // إنشاء البصمة الإلكترونية للوسائط
        const crypto = require('crypto');
        let mediaFingerprint;

        try {
            // إنشاء بصمة إلكترونية للوسائط بغض النظر عن نوع المدخلات
            if (typeof fileData === 'string') {
                // إزالة prefix إذا كان موجوداً
                const cleanFileData = fileData.includes('base64,') ? fileData.split('base64,')[1] : fileData;
                mediaFingerprint = crypto.createHash('md5').update(cleanFileData).digest('hex');
            } else if (Buffer.isBuffer(fileData)) {
                mediaFingerprint = crypto.createHash('md5').update(fileData).digest('hex');
            } else {
                throw new Error('بيانات الوسائط يجب أن تكون نص base64 أو Buffer');
            }

            // البحث في التخزين المؤقت عن معرف الوسائط
            const cachedMediaEntry = cacheService.getMediaIdCache(mediaFingerprint, mediaType);
            if (cachedMediaEntry) {
                logger.info('MetaWhatsappService', 'تم العثور على معرف الوسائط في التخزين المؤقت', {
                    mediaType,
                    mediaId: cachedMediaEntry.id,
                    hash: mediaFingerprint
                });
                return cachedMediaEntry.id;
            }

            logger.info('MetaWhatsappService', 'بدء تحميل وسائط إلى خوادم واتساب', {
                mediaType,
                hash: mediaFingerprint
            });

            // التحقق من نوع MIME
            const mimeType = this.getMimeTypeFromMediaType(mediaType, fileData);
            
            // التحقق من دعم نوع الملف
            if (!this.isSupportedMimeType(mimeType)) {
                throw new Error(`نوع الملف ${mimeType} غير مدعوم في واتساب. الأنواع المدعومة هي: JPEG, PNG, WEBP للصور، MP4 للفيديو، MP3/OGG للصوت، PDF/DOC/DOCX/XLS/XLSX للمستندات.`);
            }

            // إذا كانت البيانات بتنسيق base64، نحولها إلى buffer
            let fileBuffer;
            if (typeof fileData === 'string') {
                try {
                    // إزالة prefix إذا كان موجوداً
                    if (fileData.includes('base64,')) {
                        fileData = fileData.split('base64,')[1];
                    }
                    
                    // التحقق من صحة تنسيق base64
                    if (!/^[A-Za-z0-9+/=]+$/.test(fileData)) {
                        throw new Error('تنسيق Base64 غير صالح');
                    }
                    
                    fileBuffer = Buffer.from(fileData, 'base64');
                    
                    // التحقق من أن البيانات تم ترميزها بشكل صحيح
                    if (fileBuffer.length === 0) {
                        throw new Error('فشل تحويل بيانات Base64 إلى buffer');
                    }
                } catch (encodeError) {
                    logger.error('MetaWhatsappService', 'خطأ في تحويل بيانات الوسائط', {
                        error: encodeError.message
                    });
                    throw new Error(`فشل تحويل بيانات الوسائط: ${encodeError.message}`);
                }
            } else if (Buffer.isBuffer(fileData)) {
                fileBuffer = fileData;
            } else {
                throw new Error('بيانات الوسائط يجب أن تكون نص base64 أو Buffer');
            }
            
            // التحقق من نوع الوسائط وحجمها حسب قيود واتساب
            const maxSize = this.getMaxSizeForMediaType(mediaType);
            
            if (fileBuffer.length > maxSize) {
                throw new Error(`حجم الملف (${fileBuffer.length} بايت) يتجاوز الحد الأقصى المسموح به (${maxSize} بايت) لنوع الوسائط ${mediaType}`);
            }

            // محاولة تخزين محتوى الوسائط في التخزين المؤقت قبل التحميل
            // هذا سيسمح بإعادة استخدام المحتوى في حالة فشل التحميل وإعادة المحاولة
            cacheService.setMediaContentCache(mediaFingerprint, mediaType, fileBuffer, {
                mimeType,
                timestamp: new Date()
            });

            // تحميل الوسائط
            const response = await this.uploadMediaToWhatsapp(fileBuffer, mimeType, settingsToUse);
            
            logger.info('MetaWhatsappService', 'تم تحميل الوسائط بنجاح', {
                mediaId: response.id,
                hash: mediaFingerprint
            });
            
            // إضافة معرف الوسائط إلى التخزين المؤقت
            cacheService.setMediaIdCache(mediaFingerprint, mediaType, response.id, {
                mimeType,
                uploadedAt: new Date()
            });
            
            // حذف محتوى الوسائط من التخزين المؤقت بعد نجاح التحميل
            // هذا يوفر مساحة في الذاكرة حيث أصبح المعرف هو المطلوب فقط
            cacheService.deleteMediaContentCache(mediaFingerprint, mediaType);
            
            return response.id;
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في تحميل الوسائط', {
                error: error.message,
                mediaType,
                hash: mediaFingerprint
            });
            
            // إذا فشل التحميل، نحتفظ بمحتوى الوسائط في التخزين المؤقت لفترة أقصر
            // للمحاولة مرة أخرى لاحقاً دون الحاجة إلى إعادة معالجة البيانات
            
            throw error;
        }
    }

    /**
     * تحميل الوسائط إلى خوادم واتساب مباشرة
     * @private
     * @param {Buffer} fileBuffer - بيانات الملف
     * @param {string} mimeType - نوع MIME للملف
     * @param {object} settingsToUse - إعدادات الحساب المستخدمة
     * @returns {Promise<object>} استجابة تحميل الوسائط
     */
    async uploadMediaToWhatsapp(fileBuffer, mimeType, settingsToUse) {
        try {
            // تحويل البيانات إلى FormData
            const FormData = require('form-data');
            const form = new FormData();
            
            // إضافة المنتج المطلوب حسب وثائق واتساب
            form.append('messaging_product', 'whatsapp');
            
            // إضافة الملف إلى النموذج
            form.append('file', fileBuffer, {
                filename: `media_file.${this.getFileExtensionFromMimeType(mimeType)}`,
                contentType: mimeType
            });
            
            // إرسال طلب تحميل الوسائط
            const url = `${this.baseUrl}/${settingsToUse.config.phoneNumberId}/media`;
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
            
            return response.data;
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في تحميل الوسائط إلى خوادم واتساب', {
                error: error.message,
                response: error.response?.data
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
                
                // التحقق من دعم نوع الملف
                if (!this.isSupportedMimeType(mimeType)) {
                    throw new Error(`نوع الملف ${mimeType} غير مدعوم في واتساب. الأنواع المدعومة للصور هي: JPEG, PNG, WEBP فقط.`);
                }
                
                // تحميل الصورة إلى خوادم واتساب
                logger.info('MetaWhatsappService', 'تحميل صورة إلى خوادم واتساب قبل الإرسال');
                const uploadResult = await this.uploadMedia(base64Data, 'image', settingsToUse);
                
                // استخدام معرف الوسائط الناتج
                data.image.id = uploadResult;
                logger.info('MetaWhatsappService', 'تم تحميل الصورة بنجاح', { mediaId: uploadResult });
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

        try {
            // تحديد مصدر المستند (رابط أو base64)
            if (documentUrl.startsWith('http')) {
                // استخدام رابط خارجي
                data.document.link = documentUrl;
            } else {
                // استخدام بيانات base64 - تحميل المستند أولاً إلى خوادم واتساب
                let base64Data = documentUrl;
                let mimeType = 'application/octet-stream'; // افتراضي
                
                // استخراج نوع MIME والبيانات إذا كان التنسيق كاملاً
                if (documentUrl.startsWith('data:')) {
                    const matches = documentUrl.match(/^data:([^;]+);base64,(.+)$/);
                    if (matches && matches.length === 3) {
                        mimeType = matches[1];
                        base64Data = matches[2];
                    } else {
                        base64Data = documentUrl.split('base64,')[1] || documentUrl;
                    }
                }
                
                // تحسين استخراج MIME type لملفات PDF
                if (filename.endsWith('.pdf')) {
                    mimeType = 'application/pdf';
                    if (documentUrl.startsWith('data:')) {
                        const matches = documentUrl.match(/^data:([^\/]+\/[^;]+);base64,/);
                        if (matches && matches[1]) {
                            mimeType = matches[1];
                        }
                    }
                }
                
                // تحميل المستند إلى خوادم واتساب
                logger.info('MetaWhatsappService', 'تحميل مستند إلى خوادم واتساب قبل الإرسال');
                const uploadResult = await this.uploadMedia(base64Data, 'document', settingsToUse);
                
                // استخدام معرف الوسائط الناتج
                data.document.id = uploadResult;
                logger.info('MetaWhatsappService', 'تم تحميل المستند بنجاح', { mediaId: uploadResult });
            }

            // إضافة وصف المستند إذا كان موجوداً
            if (caption && caption.trim()) {
                data.document.caption = caption;
            }

            return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
        } catch (error) {
            logger.error('MetaWhatsappService', 'خطأ في إرسال مستند', {
                error: error.message,
                response: error.response?.data
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
                const uploadResult = await this.uploadMedia(base64Data, 'video', settingsToUse);
                
                // استخدام معرف الوسائط الناتج
                data.video.id = uploadResult;
                logger.info('MetaWhatsappService', 'تم تحميل الفيديو بنجاح', { mediaId: uploadResult });
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
                const uploadResult = await this.uploadMedia(base64Data, 'audio', settingsToUse);
                
                // استخدام معرف الوسائط الناتج
                data.audio.id = uploadResult;
                logger.info('MetaWhatsappService', 'تم تحميل الملف الصوتي بنجاح', { mediaId: uploadResult });
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
     * إرسال رد على رسالة مع وسائط عبر واتساب
     * @param {string} to رقم الهاتف المستلم
     * @param {string} mediaType نوع الوسائط (image, document, video, audio, sticker)
     * @param {string} mediaUrl رابط الوسائط أو بيانات base64
     * @param {string} replyMessageId معرف الرسالة التي يتم الرد عليها
     * @param {object} options خيارات إضافية (caption, filename)
     * @param {string} phoneNumberId معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendReplyWithMedia(to, mediaType, mediaUrl, replyMessageId, options = {}, phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // التحقق من نوع الوسائط
        if (!['image', 'document', 'video', 'audio', 'sticker'].includes(mediaType)) {
            throw new Error(`نوع الوسائط غير مدعوم: ${mediaType}`);
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

        // التحقق من صحة معرف الرسالة وتنسيقه
        const validatedWamid = this.validateWamid(replyMessageId);

        // تحميل الوسائط أولاً للحصول على معرف الوسائط
        const mediaId = await this.uploadMedia(mediaUrl, mediaType, settingsToUse);

        // إعداد كائن البيانات الأساسي
        const data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: mediaType,
            context: {
                message_id: validatedWamid
            }
        };

        // إضافة بيانات الوسائط حسب النوع
        switch (mediaType) {
            case 'image':
                data.image = {
                    id: mediaId,
                    caption: options.caption || ''
                };
                break;
            case 'video':
                data.video = {
                    id: mediaId,
                    caption: options.caption || ''
                };
                break;
            case 'document':
                data.document = {
                    id: mediaId,
                    caption: options.caption || '',
                    filename: options.filename || 'document'
                };
                break;
            case 'audio':
                data.audio = {
                    id: mediaId
                };
                break;
        }

        return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
    }

    /**
     * وظيفة موحدة لإرسال رد بوسائط مختلفة عبر واتساب
     * @param {string} to رقم الهاتف المستلم
     * @param {string} mediaData بيانات الوسائط بتنسيق base64 أو رابط URL
     * @param {string} mediaType نوع الوسائط ('image', 'video', 'document', 'audio')
     * @param {string} replyMessageId معرف الرسالة التي يتم الرد عليها
     * @param {Object} options خيارات إضافية مثل التسمية التوضيحية واسم الملف
     * @param {string} phoneNumberId معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendReplyMedia(to, mediaData, mediaType, replyMessageId, options = {}, phoneNumberId = null) {
        if (!this.initialized) {
            await this.initialize();
        }

        // التحقق من نوع الوسائط
        if (!['image', 'video', 'document', 'audio'].includes(mediaType)) {
            throw new Error(`نوع الوسائط غير مدعوم: ${mediaType}`);
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

        // التحقق من صحة معرف الرسالة وتنسيقه
        const validatedWamid = this.validateWamid(replyMessageId);

        // تحميل الوسائط أولاً للحصول على معرف الوسائط
        const mediaId = await this.uploadMedia(mediaData, mediaType, settingsToUse);

        // إعداد كائن البيانات الأساسي
        const data = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to,
            type: mediaType,
            context: {
                message_id: validatedWamid
            }
        };

        // إضافة بيانات الوسائط حسب النوع
        switch (mediaType) {
            case 'image':
                data.image = {
                    id: mediaId,
                    caption: options.caption || ''
                };
                break;
            case 'video':
                data.video = {
                    id: mediaId,
                    caption: options.caption || ''
                };
                break;
            case 'document':
                data.document = {
                    id: mediaId,
                    caption: options.caption || '',
                    filename: options.filename || 'document'
                };
                break;
            case 'audio':
                data.audio = {
                    id: mediaId
                };
                break;
        }

        return this.sendRequest(`/${targetPhoneId}/messages`, 'POST', data, settingsToUse);
    }

    /**
     * إرسال رد يحتوي على صورة عبر واتساب
     * @param {string} to رقم الهاتف المستلم
     * @param {string} imageData بيانات الصورة بتنسيق base64 أو رابط URL
     * @param {string} caption نص التسمية التوضيحية (اختياري)
     * @param {string} replyMessageId معرف الرسالة التي يتم الرد عليها
     * @param {string} phoneNumberId معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendReplyImage(to, imageData, caption = '', replyMessageId, phoneNumberId = null) {
        return this.sendReplyMedia(to, imageData, 'image', replyMessageId, { caption }, phoneNumberId);
    }

    /**
     * إرسال رد يحتوي على فيديو عبر واتساب
     * @param {string} to رقم الهاتف المستلم
     * @param {string} videoData بيانات الفيديو بتنسيق base64 أو رابط URL
     * @param {string} caption نص التسمية التوضيحية (اختياري)
     * @param {string} replyMessageId معرف الرسالة التي يتم الرد عليها
     * @param {string} phoneNumberId معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendReplyVideo(to, videoData, caption = '', replyMessageId, phoneNumberId = null) {
        return this.sendReplyMedia(to, videoData, 'video', replyMessageId, { caption }, phoneNumberId);
    }

    /**
     * إرسال رد يحتوي على مستند عبر واتساب
     * @param {string} to رقم الهاتف المستلم
     * @param {string} documentData بيانات المستند بتنسيق base64 أو رابط URL
     * @param {string} filename اسم الملف
     * @param {string} caption نص التسمية التوضيحية (اختياري)
     * @param {string} replyMessageId معرف الرسالة التي يتم الرد عليها
     * @param {string} phoneNumberId معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendReplyDocument(to, documentData, filename, caption = '', replyMessageId, phoneNumberId = null) {
        return this.sendReplyMedia(to, documentData, 'document', replyMessageId, { caption, filename }, phoneNumberId);
    }

    /**
     * إرسال رد يحتوي على ملف صوتي عبر واتساب
     * @param {string} to رقم الهاتف المستلم
     * @param {string} audioData بيانات الملف الصوتي بتنسيق base64 أو رابط URL
     * @param {string} replyMessageId معرف الرسالة التي يتم الرد عليها
     * @param {string} phoneNumberId معرف رقم الهاتف المرسل (اختياري)
     * @returns {Promise<object>} نتيجة الإرسال
     */
    async sendReplyAudio(to, audioData, replyMessageId, phoneNumberId = null) {
        return this.sendReplyMedia(to, audioData, 'audio', replyMessageId, {}, phoneNumberId);
    }

    /**
     * التحقق من صحة تنسيق معرف رسالة واتساب (WAMID)
     * @param {string} messageId معرف الرسالة للتحقق منه
     * @returns {string} معرف الرسالة المُعدل أو الأصلي
     */
    validateWamid(messageId) {
        if (!messageId) return '';
        
        // التحقق إذا كان المعرف يبدأ بتنسيق wamid الصحيح
        if (messageId.startsWith('wamid.')) {
            return messageId;
        }
        
        // إذا كان يبدو كمعرف واتساب لكن بدون البادئة wamid.
        if (/^[A-Za-z0-9+/=_-]+$/.test(messageId) && messageId.length > 20) {
            return `wamid.${messageId}`;
        }
        
        // إرجاع المعرف الأصلي إذا لم نتمكن من تحديد تنسيقه
        return messageId;
    }
}

/**
 * قائمة موحدة لأنواع MIME المدعومة في واتساب مع تفاصيلها
 * @private
 */
MetaWhatsappService.prototype._getSupportedMimeTypes = function() {
    // قائمة موحدة من أنواع MIME المدعومة مع تفاصيلها
    return {
        // الصور المدعومة
        'image/jpeg': { type: 'image', extension: 'jpg', supported: true },
        'image/png': { type: 'image', extension: 'png', supported: true },
        'image/webp': { type: 'image', extension: 'webp', supported: true },
        
        // الفيديو المدعوم
        'video/mp4': { type: 'video', extension: 'mp4', supported: true },
        'video/3gpp': { type: 'video', extension: '3gp', supported: true },
        
        // الصوت المدعوم
        'audio/mp3': { type: 'audio', extension: 'mp3', supported: true },
        'audio/mpeg': { type: 'audio', extension: 'mp3', supported: true },
        'audio/ogg': { type: 'audio', extension: 'ogg', supported: true },
        'audio/amr': { type: 'audio', extension: 'amr', supported: true },
        'audio/aac': { type: 'audio', extension: 'aac', supported: true },
        'audio/mp4': { type: 'audio', extension: 'm4a', supported: true },
        
        // المستندات المدعومة
        'application/pdf': { type: 'document', extension: 'pdf', supported: true },
        'application/msword': { type: 'document', extension: 'doc', supported: true },
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { type: 'document', extension: 'docx', supported: true },
        'application/vnd.ms-excel': { type: 'document', extension: 'xls', supported: true },
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { type: 'document', extension: 'xlsx', supported: true },
        'application/vnd.ms-powerpoint': { type: 'document', extension: 'ppt', supported: true },
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': { type: 'document', extension: 'pptx', supported: true },
        'text/plain': { type: 'document', extension: 'txt', supported: true }
    };
}

/**
 * التحقق من دعم نوع الملف في واتساب
 * @param {string} mimeType - نوع MIME للملف
 * @returns {boolean} هل النوع مدعوم أم لا
 */
MetaWhatsappService.prototype.isSupportedMimeType = function(mimeType) {
    const supportedMimeTypes = this._getSupportedMimeTypes();
    return supportedMimeTypes[mimeType]?.supported || false;
}

/**
 * الحصول على نوع الوسائط من نوع MIME
 * @param {string} mimeType - نوع MIME
 * @returns {string} نوع الوسائط (image, video, audio, document)
 */
MetaWhatsappService.prototype.getMediaTypeFromMimeType = function(mimeType) {
    const supportedMimeTypes = this._getSupportedMimeTypes();
    if (supportedMimeTypes[mimeType]) {
        return supportedMimeTypes[mimeType].type;
    }
    
    // الفحص البسيط إذا لم يكن النوع مدرجاً في القائمة
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
 * الحصول على امتداد الملف من نوع MIME
 * @param {string} mimeType - نوع MIME
 * @returns {string} امتداد الملف
 */
MetaWhatsappService.prototype.getFileExtensionFromMimeType = function(mimeType) {
    const supportedMimeTypes = this._getSupportedMimeTypes();
    return supportedMimeTypes[mimeType]?.extension || 'bin';
}

/**
 * الحصول على نوع MIME من نوع الوسائط
 * @param {string} mediaType - نوع الوسائط (image, video, audio, document)
 * @param {string|Buffer} fileData - بيانات الملف الاختيارية للفحص العميق
 * @returns {string} نوع MIME المناسب للوسائط
 */
MetaWhatsappService.prototype.getMimeTypeFromMediaType = function(mediaType, fileData = null) {
    const supportedMimeTypes = this._getSupportedMimeTypes();
    // تحديد نوع MIME الافتراضي لكل نوع وسائط
    const defaultMimeTypes = {
        'image': 'image/jpeg',
        'video': 'video/mp4',
        'audio': 'audio/mp3',
        'document': 'application/pdf'
    };

    // في حالة توفر بيانات الملف، يمكن محاولة تحديد نوع MIME بشكل أدق
    // هذه خاصية متقدمة يمكن تطويرها لاحقاً

    // إعادة نوع MIME الافتراضي حسب نوع الوسائط
    return defaultMimeTypes[mediaType] || 'application/octet-stream';
};

/**
 * الحصول على الحد الأقصى لحجم الملف حسب نوع الوسائط
 * @param {string} mediaType - نوع الوسائط
 * @returns {number} الحد الأقصى لحجم الملف بالبايت
 */
MetaWhatsappService.prototype.getMaxSizeForMediaType = function(mediaType) {
    // الحدود القصوى لحجم الملفات في واتساب للأعمال
    const maxSizes = {
        'image': 5 * 1024 * 1024,     // 5 ميجابايت للصور
        'video': 16 * 1024 * 1024,    // 16 ميجابايت للفيديو
        'audio': 16 * 1024 * 1024,    // 16 ميجابايت للصوت
        'document': 100 * 1024 * 1024 // 100 ميجابايت للمستندات
    };

    return maxSizes[mediaType] || 5 * 1024 * 1024; // القيمة الافتراضية 5 ميجابايت
};

module.exports = new MetaWhatsappService();
