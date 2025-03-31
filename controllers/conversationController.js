/**
 * متحكم المحادثات
 * هذا الملف مسؤول عن إدارة عرض وتحديث المحادثات
 */
const Conversation = require('../models/Conversation');
const WhatsAppMessage = require('../models/WhatsappMessageModel');
const WhatsAppChannel = require('../models/WhatsAppChannel');
const User = require('../models/User');
const logger = require('../services/loggerService');

/**
 * عرض قائمة المحادثات
 * يعرض جميع المحادثات المتوفرة مع إمكانية الفلترة حسب الحالة
 */
exports.listConversations = async (req, res) => {
    try {
        // الحصول على معلمات الفلترة من الاستعلام
        const status = req.query.status || 'all';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        // بناء مرشح البحث
        const filter = {};
        if (status !== 'all') {
            filter.status = status;
        }
        
        // الحصول على إجمالي عدد المحادثات
        const totalConversations = await Conversation.countDocuments(filter);
        
        // الحصول على المحادثات مع تاريخ آخر رسالة
        const conversations = await Conversation.find(filter)
            .sort({ lastMessageAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('channelId', 'name')
            .populate('assignedTo', 'username full_name')
            .lean();
        
        // الحصول على آخر رسالة لكل محادثة
        const conversationsWithLastMessage = await Promise.all(
            conversations.map(async (conversation) => {
                try {
                    // الحصول على آخر رسالة في المحادثة
                    const lastMessage = await WhatsAppMessage.findOne({ 
                        conversationId: conversation._id 
                    })
                    .sort({ timestamp: -1 })
                    .limit(1)
                    .lean();
                    
                    return {
                        ...conversation,
                        lastMessage: lastMessage || null
                    };
                } catch (error) {
                    logger.error('conversationController', 'خطأ في الحصول على آخر رسالة', { 
                        conversationId: conversation._id,
                        error: error.message
                    });
                    return {
                        ...conversation,
                        lastMessage: null
                    };
                }
            })
        );
        
        // حساب معلومات الصفحات
        const totalPages = Math.ceil(totalConversations / limit);
        const pagination = {
            current: page,
            prev: page > 1 ? page - 1 : null,
            next: page < totalPages ? page + 1 : null,
            total: totalPages
        };
        
        // عرض صفحة المحادثات
        res.render('conversations', {
            title: 'المحادثات',
            conversations: conversationsWithLastMessage,
            pagination,
            filters: {
                status,
                availableStatuses: ['all', 'open', 'assigned', 'closed']
            },
            counts: {
                total: totalConversations,
                open: await Conversation.countDocuments({ status: 'open' }),
                assigned: await Conversation.countDocuments({ status: 'assigned' }),
                closed: await Conversation.countDocuments({ status: 'closed' })
            },
            user: req.user,
            flashMessages: req.flash()
        });
    } catch (error) {
        logger.error('conversationController', 'خطأ في عرض المحادثات', error);
        req.flash('error', 'حدث خطأ أثناء تحميل المحادثات');
        res.redirect('/');
    }
};

/**
 * عرض المحادثات المسندة للمستخدم الحالي
 */
exports.listMyConversations = async (req, res) => {
    try {
        // الحصول على معلمات الفلترة من الاستعلام
        const status = req.query.status || 'all';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        // بناء مرشح البحث
        const filter = { assignedTo: req.user._id };
        if (status !== 'all') {
            filter.status = status;
        }
        
        // الحصول على إجمالي عدد المحادثات
        const totalConversations = await Conversation.countDocuments(filter);
        
        // الحصول على المحادثات مع تاريخ آخر رسالة
        const conversations = await Conversation.find(filter)
            .sort({ lastMessageAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('channelId', 'name')
            .populate('assignedTo', 'username full_name')
            .lean();
        
        // الحصول على آخر رسالة لكل محادثة
        const conversationsWithLastMessage = await Promise.all(
            conversations.map(async (conversation) => {
                try {
                    // الحصول على آخر رسالة في المحادثة
                    const lastMessage = await WhatsAppMessage.findOne({ 
                        conversationId: conversation._id 
                    })
                    .sort({ timestamp: -1 })
                    .limit(1)
                    .lean();
                    
                    return {
                        ...conversation,
                        lastMessage: lastMessage || null
                    };
                } catch (error) {
                    logger.error('conversationController', 'خطأ في الحصول على آخر رسالة', { 
                        conversationId: conversation._id,
                        error: error.message
                    });
                    return {
                        ...conversation,
                        lastMessage: null
                    };
                }
            })
        );
        
        // حساب معلومات الصفحات
        const totalPages = Math.ceil(totalConversations / limit);
        const pagination = {
            current: page,
            prev: page > 1 ? page - 1 : null,
            next: page < totalPages ? page + 1 : null,
            total: totalPages
        };
        
        // عرض صفحة المحادثات
        res.render('conversations', {
            title: 'محادثاتي',
            conversations: conversationsWithLastMessage,
            pagination,
            filters: {
                status,
                availableStatuses: ['all', 'open', 'assigned', 'closed']
            },
            counts: {
                total: totalConversations,
                open: await Conversation.countDocuments({ status: 'open', assignedTo: req.user._id }),
                assigned: await Conversation.countDocuments({ status: 'assigned', assignedTo: req.user._id }),
                closed: await Conversation.countDocuments({ status: 'closed', assignedTo: req.user._id })
            },
            isMyConversations: true,
            user: req.user,
            flashMessages: req.flash()
        });
    } catch (error) {
        logger.error('conversationController', 'خطأ في عرض محادثات المستخدم', error);
        req.flash('error', 'حدث خطأ أثناء تحميل المحادثات');
        res.redirect('/');
    }
};
