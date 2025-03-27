/**
 * وحدة تحكم للتعامل مع Webhook الخاص برسائل الواتس أب
 */
const WhatsappMessage = require('../models/WhatsappMessage');
const SemMessage = require('../models/SemMessage');
const WhatsappIncomingMessage = require('../models/WhatsappIncomingMessage');
const logger = require('../services/loggerService');
const path = require('path');
const fs = require('fs');
const SemClient = require('../models/SemClient');
const URLSearchParams = require('url').URLSearchParams;
const { v4: uuidv4 } = require('uuid');

/**
 * وحدة تحكم لإدارة webhook الواتس أب
 */
module.exports = {
    /**
     * معالجة التحديثات الواردة من SemySMS Webhook لرسائل الواتس أب
     * @param {Object} req كائن الطلب
     * @param {Object} res كائن الاستجابة
     * @returns {Promise<Object>} الاستجابة
     */
    async handleStatusUpdate(req, res) {
        try {
            // استخراج البيانات من طلب الويب هوك
            let body;
            
            if (typeof req.body === 'object') {
                body = req.body;
            } else {
                try {
                    body = JSON.parse(req.body);
                } catch (e) {
                    // في حالة فشل التحليل، استخدم البيانات كما هي
                    body = req.body;
                }
            }
            
            // التحقق من وجود رقم id في الطلب
            const id = body.id || body.message_id || null;
            
            if (!id) {
                return res.status(200).json({
                    success: false,
                    error: 'معرف الرسالة غير متوفر'
                });
            }
            
            // البحث عن الرسالة في قاعدة البيانات
            const message = await WhatsappMessage.findOne({ message_id: id });
            
            if (!message) {
                // لم يتم العثور على الرسالة، قد تكون هذه رسالة غير مسجلة في النظام
                return res.status(200).json({
                    success: false,
                    error: 'لم يتم العثور على الرسالة'
                });
            }
            
            // تحديث حالة الرسالة
            let statusCode = body.status || body.stat;
            let statusDesc = '';
            
            switch (statusCode) {
                case 1:
                    statusDesc = 'تم الإرسال';
                    break;
                case 2:
                    statusDesc = 'استلمت من قبل الخادم';
                    break;
                case 3:
                    statusDesc = 'تم التسليم';
                    break;
                case 4:
                    statusDesc = 'فشل التسليم';
                    break;
                default:
                    statusDesc = 'حالة غير معروفة';
            }
            
            message.status = statusCode;
            message.status_description = statusDesc;
            message.updated_at = new Date();
            
            await message.save();
            
            // إذا كانت هناك رسالة SEM مرتبطة، قم بتحديثها أيضًا
            if (message.sem_message_id) {
                const semMessage = await SemMessage.findById(message.sem_message_id);
                
                if (semMessage) {
                    semMessage.status = statusCode;
                    semMessage.status_description = statusDesc;
                    semMessage.updated_at = new Date();
                    
                    await semMessage.save();
                }
            }
            
            logger.info('whatsappWebhookController', `تم تحديث حالة رسالة الواتس أب بنجاح - معرف: ${id}, الحالة: ${statusDesc}`);
            
            return res.status(200).json({
                success: true,
                message: 'تم تحديث حالة الرسالة بنجاح',
                status: statusDesc
            });
            
        } catch (error) {
            logger.error('whatsappWebhookController', 'خطأ أثناء معالجة تحديث حالة رسالة الواتس أب', error);
            
            return res.status(200).json({
                success: false,
                error: 'خطأ في معالجة تحديث الحالة',
                message: error.message
            });
        }
    },
    
    /**
     * معالجة الرسائل الواردة من SemySMS Webhook لرسائل الواتس أب
     * @param {Object} req كائن الطلب
     * @param {Object} res كائن الاستجابة
     * @returns {Promise<Object>} الاستجابة
     */
    async handleIncomingMessage(req, res) {
        try {
            // استخراج البيانات الأساسية للرسالة
            let data = req.body;
            
            // استخراج البيانات الأساسية للرسالة
            let id = data.id || data.message_id || data.messageId || data.msg_id || null;
            let date = data.date || data.timestamp || data.time || null;
            let phone = data.phone || data.from || data.sender || data.number || null;
            let msg = data.msg || data.message || data.text || data.content || null;
            let type = data.type !== undefined ? data.type : 1;
            let deviceId = data.id_device || data.device_id || data.device || null;
            let dir = data.dir || data.direction || null;
            
            // لأغراض التشخيص، إذا لم يكن هناك معرف رسالة، نقوم بإنشاء واحد
            if (!id && (phone || msg)) {
                id = 'temp_' + Date.now();
            }
            
            // التنظيف والتحقق من الصحة
            if (phone) {
                phone = phone.replace(/[^\d+]/g, '');
            }
            
            // التحقق من وجود المعلومات الأساسية للرسالة
            if (!id || !phone || !msg) {
                return res.status(200).json({
                    success: false,
                    error: 'معلومات الرسالة غير مكتملة',
                    message: 'يجب توفير معرف الرسالة ورقم الهاتف ومحتوى الرسالة'
                });
            }
            
            // التحقق من وجود رسالة مستلمة بنفس المعرف لتجنب التكرار
            let existingMessage = await WhatsappIncomingMessage.findOne({ id: id });
            
            if (existingMessage) {
                return res.status(200).json({
                    success: true,
                    message: 'تم استلام هذه الرسالة مسبقًا',
                    duplicate: true
                });
            }
            
            // البحث عن العميل المرتبط برقم الهاتف
            let client = null;
            try {
                client = await SemClient.findOne({ phone: phone });
            } catch (clientError) {
                logger.error('whatsappWebhookController', 'خطأ أثناء البحث عن العميل', clientError);
            }
            
            // حفظ الرسالة الواردة في قاعدة البيانات
            const incomingMessage = new WhatsappIncomingMessage({
                id,
                phone,
                msg,
                date,
                type,
                id_device: deviceId,
                dir,
                clientId: client ? client._id : null,
                rawData: { headers: req.headers, body: req.body }
            });
            
            await incomingMessage.save();
            logger.info('whatsappWebhookController', `تم حفظ رسالة واتس أب واردة - معرف: ${id}, من: ${phone}`);
            
            // إرجاع استجابة نجاح
            return res.status(200).json({
                success: true,
                message: 'تم استلام الرسالة بنجاح',
                savedMessage: {
                    id: incomingMessage.id,
                    phone: incomingMessage.phone,
                    date: incomingMessage.date
                }
            });
            
        } catch (error) {
            logger.error('whatsappWebhookController', 'خطأ أثناء معالجة رسالة واتس أب واردة', error);
            
            // إرجاع استجابة خطأ
            return res.status(200).json({
                success: false,
                error: 'خطأ في معالجة الرسالة الواردة',
                message: error.message
            });
        }
    }
};
