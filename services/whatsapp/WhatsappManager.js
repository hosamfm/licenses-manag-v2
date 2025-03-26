/**
 * مدير خدمة رسائل الواتساب
 * يقوم بتحميل وإدارة مزودي خدمة الواتساب واختيار المزود المناسب بناءً على إعدادات النظام
 */
const logger = require('../loggerService');
const SemyWhatsappProvider = require('./SemyWhatsappProvider');
const WhatsappSettings = require('../../models/WhatsappSettings');
const WhatsappMessage = require('../../models/WhatsappMessage');

class WhatsappManager {
    /**
     * إنشاء مدير خدمة الواتساب
     */
    constructor() {
        this.providers = {};
        this.activeProvider = null;
        this.activeProviderName = null;
        this.initialized = false;

        // تسجيل مزودي الخدمة المتاحين
        this._registerProviders();
    }

    /**
     * تسجيل مزودي خدمة الواتساب المدعومين
     * @private
     */
    _registerProviders() {
        // تسجيل مزود SemySMS للواتساب
        this.providers.semysms = new SemyWhatsappProvider();

        // يمكن إضافة مزودين آخرين هنا في المستقبل
    }

    /**
     * تهيئة مدير الخدمة مع الإعدادات
     * @param {Object} settings إعدادات خدمة الواتساب
     * @returns {Promise<boolean>} حالة التهيئة
     */
    async initialize(settings = {}) {
        try {
            // التحقق من وجود مزود خدمة محدد
            if (!settings.provider) {
                throw new Error('لم يتم تحديد مزود خدمة الواتساب في الإعدادات');
            }

            // التحقق من دعم مزود الخدمة
            const providerName = settings.provider.toLowerCase();
            const provider = this.providers[providerName];
            
            if (!provider) {
                throw new Error(`مزود الخدمة "${settings.provider}" غير مدعوم`);
            }

            // تهيئة مزود الخدمة
            const initialized = await provider.initialize(settings.config || {});
            
            if (!initialized) {
                throw new Error(`فشل في تهيئة مزود الخدمة "${settings.provider}"`);
            }

            // تعيين مزود الخدمة النشط
            this.activeProvider = provider;
            this.activeProviderName = providerName;
            this.initialized = true;
            
            return true;
        } catch (error) {
            logger.error('WhatsappManager', 'فشل في تهيئة مدير خدمة الواتساب', error);
            this.initialized = false;
            return false;
        }
    }

    /**
     * إرسال رسالة واتساب
     * @param {string} phoneNumber رقم الهاتف المستلم
     * @param {string} message محتوى الرسالة
     * @param {Object} options خيارات إضافية
     * @returns {Promise<Object>} نتيجة الإرسال
     */
    async sendWhatsapp(phoneNumber, message, options = {}) {
        if (!this.initialized || !this.activeProvider) {
            return { 
                success: false, 
                error: 'لم يتم تهيئة مدير خدمة الواتساب بعد' 
            };
        }

        try {
            // إنشاء سجل للرسالة في قاعدة البيانات
            const messageRecord = new WhatsappMessage({
                clientId: options.clientId || null,
                phoneNumber,
                message,
                status: 'pending'
            });
            
            await messageRecord.save();

            // إرسال الرسالة عبر المزود
            const result = await this.activeProvider.sendWhatsapp(phoneNumber, message, options);
            
            // تحديث سجل الرسالة بنتيجة الإرسال
            if (result.success) {
                // حفظ معرف الرسالة الداخلي والخارجي
                messageRecord.messageId = messageRecord._id.toString(); // استخدام معرف MongoDB كمعرف داخلي
                messageRecord.externalMessageId = result.messageId; // حفظ معرف SemySMS كمعرف خارجي
                messageRecord.status = 'sent';
                messageRecord.providerData = {
                    ...messageRecord.providerData,
                    provider: this.activeProviderName,
                    lastUpdate: new Date(),
                    rawResponse: result
                };
                await messageRecord.save();
            } else {
                messageRecord.status = 'failed';
                messageRecord.errorMessage = result.error;
                await messageRecord.save();
            }

            // إضافة معرف الرسالة في قاعدة البيانات إلى النتيجة
            result.messageRecordId = messageRecord._id;
            
            return result;
        } catch (error) {
            logger.error('WhatsappManager', 'خطأ في إرسال رسالة الواتساب', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    /**
     * التحقق من حالة رسالة
     * @param {string} messageId معرف الرسالة
     * @returns {Promise<Object>} حالة الرسالة
     */
    async checkMessageStatus(messageId) {
        if (!this.initialized || !this.activeProvider) {
            return { 
                success: false, 
                error: 'لم يتم تهيئة مدير خدمة الواتساب بعد' 
            };
        }

        try {
            logger.info('WhatsappManager', 'التحقق من حالة رسالة الواتساب', {
                provider: this.activeProviderName,
                messageId
            });

            // البحث عن الرسالة في قاعدة البيانات - نبحث بأي من المعرفين
            let messageRecord = await WhatsappMessage.findOne({ 
                $or: [
                    { messageId: messageId },
                    { externalMessageId: messageId }
                ]
            });
            
            if (!messageRecord) {
                return {
                    success: false,
                    error: 'الرسالة غير موجودة في قاعدة البيانات'
                };
            }
            
            // نستخدم المعرف الخارجي للاستعلام من المزود
            const externalId = messageRecord.externalMessageId || messageRecord.messageId;
            
            // استعلام عن حالة الرسالة من المزود
            const result = await this.activeProvider.checkMessageStatus(externalId);
            
            // تحديث حالة الرسالة في قاعدة البيانات
            if (result.success) {
                messageRecord.status = result.status;
                
                if (result.is_delivered) {
                    messageRecord.deliveredAt = result.delivered_date || new Date();
                }
                
                if (result.is_sent && !messageRecord.sentAt) {
                    messageRecord.sentAt = result.sent_date || new Date();
                }
                
                if (result.is_failed) {
                    messageRecord.errorMessage = result.error || 'فشل في إيصال الرسالة';
                }
                
                // حفظ المعرف الخارجي إذا لم يكن موجوداً
                if (!messageRecord.externalMessageId && externalId !== messageRecord.messageId) {
                    messageRecord.externalMessageId = externalId;
                }
                
                messageRecord.providerData = {
                    ...messageRecord.providerData,
                    lastStatusCheck: new Date(),
                    statusResponse: result
                };
                
                await messageRecord.save();
            }
            
            return result;
        } catch (error) {
            logger.error('WhatsappManager', 'خطأ في التحقق من حالة الرسالة', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    /**
     * التحقق من رصيد الحساب
     * @returns {Promise<Object>} معلومات الرصيد
     */
    async checkAccountBalance() {
        if (!this.initialized || !this.activeProvider) {
            return { 
                success: false, 
                error: 'لم يتم تهيئة مدير خدمة الواتساب بعد' 
            };
        }

        try {
            logger.info('WhatsappManager', 'التحقق من رصيد الحساب', {
                provider: this.activeProviderName
            });

            return await this.activeProvider.checkAccountBalance();
        } catch (error) {
            logger.error('WhatsappManager', 'خطأ في التحقق من رصيد الحساب', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    /**
     * تحديث حالة الرسائل المعلقة
     * @returns {Promise<Object>} نتيجة التحديث
     */
    async updatePendingMessagesStatus() {
        if (!this.initialized || !this.activeProvider) {
            return { 
                success: false, 
                error: 'لم يتم تهيئة مدير خدمة الواتساب بعد' 
            };
        }

        try {
            // البحث عن الرسائل المعلقة أو المرسلة (غير المستلمة أو الفاشلة)
            const pendingMessages = await WhatsappMessage.find({
                status: { $in: ['pending', 'sent', 'processing'] },
                messageId: { $ne: null }
            });
            
            logger.info('WhatsappManager', 'تحديث حالة الرسائل المعلقة', {
                count: pendingMessages.length
            });
            
            const results = {
                total: pendingMessages.length,
                updated: 0,
                delivered: 0,
                failed: 0,
                unchanged: 0,
                errors: 0
            };
            
            // تحديث حالة كل رسالة
            for (const message of pendingMessages) {
                try {
                    const result = await this.checkMessageStatus(message.messageId);
                    
                    if (result.success) {
                        results.updated++;
                        
                        if (result.status === 'delivered') {
                            results.delivered++;
                        } else if (result.status === 'failed') {
                            results.failed++;
                        } else {
                            results.unchanged++;
                        }
                    } else {
                        results.errors++;
                    }
                } catch (error) {
                    logger.error('WhatsappManager', 'خطأ في تحديث حالة الرسالة', {
                        messageId: message.messageId,
                        error: error.message
                    });
                    results.errors++;
                }
            }
            
            return {
                success: true,
                results
            };
        } catch (error) {
            logger.error('WhatsappManager', 'خطأ في تحديث حالة الرسائل المعلقة', error);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    /**
     * تهيئة المدير باستخدام الإعدادات النشطة من قاعدة البيانات
     * @returns {Promise<boolean>} حالة التهيئة
     */
    async initializeWithActiveSettings() {
        try {
            // الحصول على الإعدادات النشطة
            const settings = await WhatsappSettings.getActiveSettings();
            
            if (!settings) {
                logger.warn('WhatsappManager', 'لم يتم العثور على إعدادات نشطة للواتساب');
                return false;
            }
            
            // الحصول على إعدادات المزود
            const providerSettings = settings.getProviderConfig();
            
            if (!providerSettings) {
                logger.warn('WhatsappManager', 'لم يتم العثور على إعدادات مزود خدمة الواتساب');
                return false;
            }
            
            // تهيئة المدير مع إعدادات المزود
            return await this.initialize(providerSettings);
        } catch (error) {
            logger.error('WhatsappManager', 'فشل في تهيئة مدير خدمة الواتساب مع الإعدادات النشطة', error);
            return false;
        }
    }
}

// تصدير نسخة واحدة من الخدمة (Singleton)
module.exports = new WhatsappManager();
