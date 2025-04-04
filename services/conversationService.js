/**
 * خدمة إدارة المحادثات - Conversation Service
 * 
 * تحتوي على المنطق المشترك والدوال المساعدة المتعلقة بالمحادثات
 * تم إنشاؤها لتوحيد الكود وتقليل التكرار في متحكم المحادثات
 */

const Conversation = require('../models/Conversation');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const logger = require('./loggerService');

/**
 * استرجاع قائمة المحادثات بمعايير تصفية معينة وإضافة البيانات المحسوبة
 * مثل عدد الرسائل غير المقروءة وآخر رسالة لكل محادثة
 * 
 * @param {Object} filterOptions - خيارات التصفية (الحالة، المستخدم، إلخ)
 * @param {Object} paginationOptions - خيارات التصفح (الصفحة، الحد)
 * @param {Boolean} includeLastMessage - هل يجب تضمين آخر رسالة
 * @param {Boolean} includeUnreadCount - هل يجب حساب عدد الرسائل غير المقروءة
 * @returns {Promise<Object>} - المحادثات والمعلومات الإضافية
 */
exports.getConversationsList = async (filterOptions = {}, paginationOptions = {}, includeLastMessage = true, includeUnreadCount = true) => {
    try {
        // بناء الاستعلام بناءً على خيارات التصفية
        const query = {};
        
        // إضافة حالة المحادثة للاستعلام إذا تم تحديدها وليست 'all'
        if (filterOptions.status && filterOptions.status !== 'all') {
            query.status = filterOptions.status;
        }
        
        // إضافة المستخدم المسند إليه المحادثة إذا تم تحديده
        if (filterOptions.assignedTo) {
            query.assignedTo = filterOptions.assignedTo;
        }
        
        // خيارات التصفح
        const page = paginationOptions.page || 1;
        const limit = paginationOptions.limit || 20;
        const skip = (page - 1) * limit;
        
        // حساب إجمالي المحادثات التي تطابق الاستعلام
        const total = await Conversation.countDocuments(query);
        
        // جلب المحادثات مع عمليات التجميع (populate)
        const conversations = await Conversation.find(query)
            .sort(paginationOptions.sort || { lastMessageAt: -1 })
            .skip(paginationOptions.skipPagination ? 0 : skip)
            .limit(paginationOptions.skipPagination ? (paginationOptions.limit || 50) : limit)
            .populate('channelId', 'name')
            .populate('assignedTo', 'username full_name')
            .lean();
        
        // إضافة المعلومات الإضافية لكل محادثة (آخر رسالة وعدد الرسائل غير المقروءة)
        const conversationsWithExtras = await Promise.all(
            conversations.map(async (conversation) => {
                // نسخة من المحادثة سنضيف إليها المعلومات الإضافية
                const conversationWithExtras = { ...conversation };
                
                // إضافة آخر رسالة إذا طلب ذلك
                if (includeLastMessage) {
                    try {
                        const lastMessage = await WhatsappMessage.findOne({ conversationId: conversation._id })
                            .sort({ timestamp: -1 })
                            .lean();
                        conversationWithExtras.lastMessage = lastMessage || null;
                    } catch (error) {
                        logger.error('conversationService', 'خطأ في جلب آخر رسالة', {
                            error,
                            conversationId: conversation._id
                        });
                        conversationWithExtras.lastMessage = null;
                    }
                }
                
                // إضافة عدد الرسائل غير المقروءة إذا طلب ذلك
                if (includeUnreadCount) {
                    try {
                        const unreadCount = await WhatsappMessage.countDocuments({
                            conversationId: conversation._id,
                            direction: 'incoming',
                            status: { $ne: 'read' }
                        });
                        conversationWithExtras.unreadCount = unreadCount;
                    } catch (error) {
                        logger.error('conversationService', 'خطأ في حساب الرسائل غير المقروءة', {
                            error,
                            conversationId: conversation._id
                        });
                        conversationWithExtras.unreadCount = 0;
                    }
                }
                
                return conversationWithExtras;
            })
        );
        
        // حساب معلومات التصفح
        const totalPages = Math.ceil(total / limit);
        const pagination = {
            currentPage: page,
            totalPages,
            totalItems: total,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
            nextPage: page < totalPages ? page + 1 : null,
            prevPage: page > 1 ? page - 1 : null
        };
        
        return {
            conversations: conversationsWithExtras,
            pagination
        };
    } catch (error) {
        logger.error('conversationService', 'خطأ في الحصول على قائمة المحادثات', error);
        throw error;
    }
};

/**
 * الحصول على إحصاءات المحادثات حسب الحالة
 * 
 * @returns {Promise<Object>} - إحصاءات المحادثات
 */
exports.getConversationStats = async () => {
    try {
        const stats = {
            total: await Conversation.countDocuments({}),
            open: await Conversation.countDocuments({ status: 'open' }),
            assigned: await Conversation.countDocuments({ status: 'assigned' }),
            closed: await Conversation.countDocuments({ status: 'closed' })
        };
        
        return stats;
    } catch (error) {
        logger.error('conversationService', 'خطأ في الحصول على إحصاءات المحادثات', error);
        throw error;
    }
};
