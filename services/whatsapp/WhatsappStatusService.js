/**
 * خدمة تحديث حالة رسائل الواتس أب
 */
const WhatsappMessage = require('../../models/WhatsappMessage');
const SmsManager = require('../sms/SmsManager');
const logger = require('../loggerService');

/**
 * تحديث حالة الرسائل المعلقة
 */
exports.updatePendingMessagesStatus = async () => {
    try {
        // البحث عن الرسائل المعلقة
        const pendingMessages = await WhatsappMessage.find({ status: 'pending' });
        
        if (pendingMessages.length === 0) {
            return {
                success: true,
                total: 0,
                updated: 0,
                message: 'لا توجد رسائل معلقة للتحديث'
            };
        }
        
        let updatedCount = 0;
        
        // تحديث حالة كل رسالة
        for (const message of pendingMessages) {
            if (!message.messageId) {
                logger.warn('WhatsappStatusService', `رسالة بلا معرف: ${message._id}`);
                continue;
            }
            
            // استعلام عن حالة الرسالة
            const statusResult = await SmsManager.checkMessageStatus(message.messageId);
            
            if (statusResult.success) {
                let statusChanged = false;
                let newStatus = message.status;
                
                // تحديث حالة التسليم إذا توفرت
                if (statusResult.is_delivered) {
                    newStatus = 'delivered';
                    message.deliveredAt = statusResult.delivered_date ? new Date(statusResult.delivered_date) : new Date();
                    statusChanged = true;
                }
                // تحديث حالة الإرسال إذا توفرت ولم تكن مسلمة بالفعل
                else if (statusResult.is_sent && message.status !== 'delivered') {
                    newStatus = 'sent';
                    message.sentAt = statusResult.sent_date ? new Date(statusResult.sent_date) : new Date();
                    statusChanged = true;
                }
                // تحديث حالة الفشل
                else if (statusResult.is_failed) {
                    newStatus = 'failed';
                    message.errorMessage = statusResult.error || 'فشل في الإرسال';
                    statusChanged = true;
                }
                
                if (statusChanged) {
                    message.status = newStatus;
                    message.providerData = {
                        ...message.providerData,
                        lastStatusUpdate: new Date(),
                        statusData: statusResult
                    };
                    
                    await message.save();
                    updatedCount++;
                    
                    logger.info('WhatsappStatusService', `تم تحديث حالة الرسالة ${message.messageId} إلى ${newStatus}`);
                }
            } else {
                logger.warn('WhatsappStatusService', `فشل في تحديث حالة الرسالة ${message.messageId}: ${statusResult.error}`);
            }
        }
        
        return {
            success: true,
            total: pendingMessages.length,
            updated: updatedCount,
            message: `تم تحديث ${updatedCount} رسالة من أصل ${pendingMessages.length}`
        };
    } catch (error) {
        logger.error('WhatsappStatusService', 'خطأ في تحديث حالة الرسائل المعلقة', error);
        return {
            success: false,
            error: error.message,
            message: 'حدث خطأ أثناء تحديث حالة الرسائل'
        };
    }
};
