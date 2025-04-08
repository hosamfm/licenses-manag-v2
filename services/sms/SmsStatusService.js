/**
 * خدمة لاستعلام وتحديث حالة الرسائل
 */
const SemMessage = require('../../models/SemMessage');
const SmsManager = require('./SmsManager');
const logger = require('../loggerService');

class SmsStatusService {
    /**
     * تحديث حالة الرسائل المعلقة
     * @returns {Promise<Object>} إحصائيات التحديث
     */
    async updatePendingMessagesStatus() {
        try {
            
            // الحصول على قائمة الرسائل المعلقة
            const pendingMessages = await SemMessage.find({
                status: 'pending',
                messageId: { $exists: true, $ne: null }
            }).sort({ createdAt: -1 }).limit(100);
            
            if (pendingMessages.length === 0) {
                return { success: true, updated: 0, total: 0 };
            }
            
            
            const stats = {
                total: pendingMessages.length,
                updated: 0,
                delivered: 0,
                failed: 0,
                errors: 0
            };
            
            // تحديث حالة كل رسالة
            for (const message of pendingMessages) {
                try {
                    const result = await SmsManager.checkMessageStatus(message.messageId);
                    
                    if (result.success) {
                        // تحويل حالة مزود الخدمة إلى حالة نظامنا
                        let systemStatus = 'pending';
                        
                        switch (result.status) {
                            case 'delivered':
                                systemStatus = 'sent';
                                stats.delivered++;
                                break;
                            case 'sent':
                                systemStatus = 'sent';
                                stats.delivered++;
                                break;
                            case 'failed':
                                systemStatus = 'failed';
                                stats.failed++;
                                break;
                            case 'cancelled':
                                systemStatus = 'failed';
                                stats.failed++;
                                break;
                            case 'processing':
                                systemStatus = 'pending';
                                break;
                            default:
                                systemStatus = 'pending';
                        }
                        
                        // تحديث حالة الرسالة في قاعدة البيانات
                        if (systemStatus !== message.status) {
                            message.status = systemStatus;
                            
                            if (systemStatus === 'sent') {
                                message.sentAt = new Date();
                            } else if (systemStatus === 'failed') {
                                message.errorMessage = 'فشل في إرسال الرسالة من مزود الخدمة';
                            }
                            
                            await message.save();
                            stats.updated++;
                        }
                    } else {
                        logger.warn('SmsStatusService', `فشل في التحقق من حالة الرسالة ${message._id}`, {
                            error: result.error,
                            messageId: message.messageId
                        });
                    }
                } catch (error) {
                    logger.error('SmsStatusService', `خطأ في تحديث حالة الرسالة ${message._id}`, error);
                    stats.errors++;
                }
            }
            
            
            return {
                success: true,
                ...stats
            };
        } catch (error) {
            logger.error('SmsStatusService', 'خطأ في تحديث حالة الرسائل المعلقة', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * تحديث حالة رسالة معينة
     * @param {string} messageId معرف الرسالة في نظامنا (MongoDB ID)
     * @returns {Promise<Object>} نتيجة التحديث
     */
    async updateMessageStatus(messageId) {
        try {
            // الحصول على الرسالة من قاعدة البيانات
            const message = await SemMessage.findById(messageId);
            
            if (!message) {
                return { success: false, error: 'الرسالة غير موجودة' };
            }
            
            if (!message.messageId) {
                return { success: false, error: 'الرسالة ليس لها معرف في نظام مزود الخدمة' };
            }
            
            // التحقق من حالة الرسالة لدى مزود الخدمة
            const result = await SmsManager.checkMessageStatus(message.messageId);
            
            if (!result.success) {
                return {
                    success: false,
                    error: `فشل في التحقق من حالة الرسالة: ${result.error}`
                };
            }
            
            // تحويل حالة مزود الخدمة إلى حالة نظامنا
            let systemStatus = 'pending';
            
            switch (result.status) {
                case 'delivered':
                    systemStatus = 'sent';
                    break;
                case 'sent':
                    systemStatus = 'sent';
                    break;
                case 'failed':
                    systemStatus = 'failed';
                    break;
                case 'cancelled':
                    systemStatus = 'failed';
                    break;
                case 'processing':
                    systemStatus = 'pending';
                    break;
                default:
                    systemStatus = 'pending';
            }
            
            // تحديث حالة الرسالة في قاعدة البيانات
            if (systemStatus !== message.status) {
                message.status = systemStatus;
                
                if (systemStatus === 'sent') {
                    message.sentAt = new Date();
                } else if (systemStatus === 'failed') {
                    message.errorMessage = 'فشل في إرسال الرسالة من مزود الخدمة';
                }
                
                await message.save();
                
                return {
                    success: true,
                    updated: true,
                    message: 'تم تحديث حالة الرسالة',
                    oldStatus: message.status,
                    newStatus: systemStatus
                };
            }
            
            return {
                success: true,
                updated: false,
                message: 'لم يتم تحديث حالة الرسالة (نفس الحالة)',
                status: message.status
            };
        } catch (error) {
            logger.error('SmsStatusService', `خطأ في تحديث حالة الرسالة ${messageId}`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// تصدير نسخة واحدة من الخدمة (Singleton)
module.exports = new SmsStatusService();
