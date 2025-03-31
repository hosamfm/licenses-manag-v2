/**
 * متحكم المحادثات
 * هذا الملف مسؤول عن إدارة عرض وتحديث المحادثات
 */
const Conversation = require('../models/Conversation');
const WhatsappMessage = require('../models/WhatsappMessageModel');
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
                    const lastMessage = await WhatsappMessage.findOne({ 
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
        res.render('crm/conversations', {
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
            isConversationsPage: true,
            layout: 'crm/layout',
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
                    const lastMessage = await WhatsappMessage.findOne({ 
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
        res.render('crm/conversations', {
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
            layout: 'crm/layout',
            flashMessages: req.flash()
        });
    } catch (error) {
        logger.error('conversationController', 'خطأ في عرض محادثات المستخدم', error);
        req.flash('error', 'حدث خطأ أثناء تحميل المحادثات');
        res.redirect('/');
    }
};

/**
 * عرض محادثة محددة
 */
exports.showConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        // جلب المحادثة مع آخر 50 رسالة
        const conversation = await Conversation.findById(conversationId)
            .populate('channelId')
            .populate('assignedTo', 'username full_name')
            .lean();
        
        if (!conversation) {
            req.flash('error', 'المحادثة غير موجودة');
            return res.redirect('/crm/conversations');
        }

        // البحث عما إذا كان هناك جهة اتصال مرتبطة برقم الهاتف
        const Contact = require('../models/Contact');
        const contact = await Contact.findOne({ phoneNumber: conversation.phoneNumber }).lean();
        
        // جلب الرسائل للمحادثة
        const messages = await WhatsappMessage.find({ conversationId })
            .sort({ timestamp: -1 })
            .limit(50)
            .lean();
        
        // عكس ترتيب الرسائل لعرضها من الأقدم للأحدث
        const sortedMessages = messages.reverse();
        
        // عرض صفحة المحادثة
        res.render('crm/conversation', {
            title: `محادثة مع ${conversation.customerName || conversation.phoneNumber}`,
            conversation,
            messages: sortedMessages,
            contact,
            user: req.user,
            layout: 'crm/layout',
            flashMessages: req.flash()
        });
    } catch (error) {
        logger.error('conversationController', 'خطأ في عرض المحادثة', error);
        req.flash('error', 'حدث خطأ أثناء تحميل المحادثة');
        res.redirect('/crm/conversations');
    }
};

/**
 * إسناد محادثة إلى موظف
 */
exports.assignConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { assignedTo } = req.body;
        
        if (!assignedTo) {
            req.flash('error', 'يرجى اختيار موظف للإسناد');
            return res.redirect(`/crm/conversations/${conversationId}`);
        }
        
        // التحقق من وجود المحادثة
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            req.flash('error', 'المحادثة غير موجودة');
            return res.redirect('/crm/conversations');
        }
        
        // التحقق من وجود المستخدم
        const user = await User.findById(assignedTo);
        if (!user) {
            req.flash('error', 'المستخدم غير موجود');
            return res.redirect(`/crm/conversations/${conversationId}`);
        }
        
        // تحديث المحادثة
        conversation.assignedTo = assignedTo;
        conversation.status = 'assigned';
        
        // إذا كانت الملاحظات موجودة، أضف ملاحظة حول الإسناد
        let note = '';
        if (conversation.notes) {
            note = conversation.notes + '\n\n';
        }
        note += `تم إسناد المحادثة إلى ${user.full_name || user.username} في ${new Date().toLocaleString('ar-LY')} بواسطة ${req.user.full_name || req.user.username}`;
        conversation.notes = note;
        
        await conversation.save();
        
        req.flash('success', `تم إسناد المحادثة إلى ${user.full_name || user.username} بنجاح`);
        res.redirect(`/crm/conversations/${conversationId}`);
    } catch (error) {
        logger.error('conversationController', 'خطأ في إسناد المحادثة', error);
        req.flash('error', 'حدث خطأ أثناء إسناد المحادثة');
        res.redirect(`/crm/conversations/${req.params.conversationId}`);
    }
};

/**
 * إضافة ملاحظة داخلية للمحادثة
 */
exports.addNoteToConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { noteContent } = req.body;
        
        if (!noteContent || noteContent.trim() === '') {
            req.flash('error', 'يرجى إدخال نص الملاحظة');
            return res.redirect(`/crm/conversations/${conversationId}`);
        }
        
        // التحقق من وجود المحادثة
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            req.flash('error', 'المحادثة غير موجودة');
            return res.redirect('/crm/conversations');
        }
        
        // إضافة الملاحظة
        let note = '';
        if (conversation.notes) {
            note = conversation.notes + '\n\n';
        }
        note += `[${new Date().toLocaleString('ar-LY')} - ${req.user.full_name || req.user.username}]: ${noteContent}`;
        conversation.notes = note;
        
        await conversation.save();
        
        req.flash('success', 'تمت إضافة الملاحظة بنجاح');
        res.redirect(`/crm/conversations/${conversationId}`);
    } catch (error) {
        logger.error('conversationController', 'خطأ في إضافة ملاحظة', error);
        req.flash('error', 'حدث خطأ أثناء إضافة الملاحظة');
        res.redirect(`/crm/conversations/${req.params.conversationId}`);
    }
};

/**
 * إغلاق محادثة
 */
exports.closeConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { closeReason, closeNote } = req.body;
        
        // التحقق من وجود المحادثة
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            req.flash('error', 'المحادثة غير موجودة');
            return res.redirect('/crm/conversations');
        }
        
        // تغيير حالة المحادثة إلى مغلقة
        conversation.status = 'closed';
        conversation.closedAt = new Date();
        conversation.closedBy = req.user._id;
        conversation.closeReason = closeReason || 'other';
        
        // إضافة ملاحظة عن الإغلاق إذا وجدت
        let note = '';
        if (conversation.notes) {
            note = conversation.notes + '\n\n';
        }
        note += `تم إغلاق المحادثة في ${new Date().toLocaleString('ar-LY')} بواسطة ${req.user.full_name || req.user.username}`;
        if (closeNote && closeNote.trim() !== '') {
            note += `\nسبب الإغلاق: ${closeNote}`;
        }
        conversation.notes = note;
        
        await conversation.save();
        
        req.flash('success', 'تم إغلاق المحادثة بنجاح');
        res.redirect(`/crm/conversations/${conversationId}`);
    } catch (error) {
        logger.error('conversationController', 'خطأ في إغلاق المحادثة', error);
        req.flash('error', 'حدث خطأ أثناء إغلاق المحادثة');
        res.redirect(`/crm/conversations/${req.params.conversationId}`);
    }
};

/**
 * إعادة فتح محادثة مغلقة
 */
exports.reopenConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { reopenNote } = req.body;
        
        // التحقق من وجود المحادثة
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            req.flash('error', 'المحادثة غير موجودة');
            return res.redirect('/crm/conversations');
        }
        
        // التحقق من أن المحادثة مغلقة
        if (conversation.status !== 'closed') {
            req.flash('error', 'المحادثة ليست مغلقة');
            return res.redirect(`/crm/conversations/${conversationId}`);
        }
        
        // تغيير حالة المحادثة إلى مفتوحة
        conversation.status = 'open';
        
        // إضافة ملاحظة عن إعادة الفتح إذا وجدت
        let note = '';
        if (conversation.notes) {
            note = conversation.notes + '\n\n';
        }
        note += `تم إعادة فتح المحادثة في ${new Date().toLocaleString('ar-LY')} بواسطة ${req.user.full_name || req.user.username}`;
        if (reopenNote && reopenNote.trim() !== '') {
            note += `\nملاحظة: ${reopenNote}`;
        }
        conversation.notes = note;
        
        await conversation.save();
        
        req.flash('success', 'تم إعادة فتح المحادثة بنجاح');
        res.redirect(`/crm/conversations/${conversationId}`);
    } catch (error) {
        logger.error('conversationController', 'خطأ في إعادة فتح المحادثة', error);
        req.flash('error', 'حدث خطأ أثناء إعادة فتح المحادثة');
        res.redirect(`/crm/conversations/${req.params.conversationId}`);
    }
};

/**
 * إرسال رد في المحادثة
 */
exports.replyToConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { content } = req.body;
        
        if (!content || content.trim() === '') {
            req.flash('error', 'يرجى إدخال نص الرسالة');
            return res.redirect(`/crm/conversations/${conversationId}`);
        }
        
        // التحقق من وجود المحادثة
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            req.flash('error', 'المحادثة غير موجودة');
            return res.redirect('/crm/conversations');
        }
        
        // التحقق من أن المحادثة ليست مغلقة
        if (conversation.status === 'closed') {
            req.flash('error', 'لا يمكن الرد على محادثة مغلقة');
            return res.redirect(`/crm/conversations/${conversationId}`);
        }
        
        // إنشاء رسالة جديدة
        const newMessage = new WhatsappMessage({
            conversationId,
            direction: 'outbound',
            content,
            sender: req.user._id,
            timestamp: new Date()
        });
        
        await newMessage.save();
        
        // تحديث تاريخ آخر رسالة في المحادثة
        conversation.lastMessageAt = new Date();
        
        // إذا كانت المحادثة مفتوحة ولم تكن مسندة بعد، قم بإسنادها للمستخدم الحالي
        if (conversation.status === 'open' && !conversation.assignedTo) {
            conversation.assignedTo = req.user._id;
            conversation.status = 'assigned';
            
            // إضافة ملاحظة حول الإسناد التلقائي
            let note = '';
            if (conversation.notes) {
                note = conversation.notes + '\n\n';
            }
            note += `تم إسناد المحادثة تلقائياً إلى ${req.user.full_name || req.user.username} في ${new Date().toLocaleString('ar-LY')} بعد الرد عليها`;
            conversation.notes = note;
        }
        
        await conversation.save();
        
        // [هنا ستضيف رمز لإرسال الرسالة الفعلية عبر WhatsApp API إذا كان متوفراً]
        
        req.flash('success', 'تم إرسال الرد بنجاح');
        res.redirect(`/crm/conversations/${conversationId}`);
    } catch (error) {
        logger.error('conversationController', 'خطأ في إرسال رد', error);
        req.flash('error', 'حدث خطأ أثناء إرسال الرد');
        res.redirect(`/crm/conversations/${req.params.conversationId}`);
    }
};

module.exports = exports;
