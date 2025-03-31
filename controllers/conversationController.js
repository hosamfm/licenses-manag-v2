/**
 * متحكم المحادثات
 * هذا الملف مسؤول عن إدارة عرض وتحديث المحادثات
 */
const Conversation = require('../models/Conversation');
const Contact = require('../models/Contact');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const WhatsappChannel = require('../models/WhatsAppChannel');
const User = require('../models/User');
const logger = require('../services/loggerService');
const socketService = require('../services/socketService');

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
        // التحقق من وجود المستخدم
        if (!req.user || !req.user._id) {
            req.flash('error', 'يرجى تسجيل الدخول للوصول إلى المحادثات المسندة إليك');
            return res.redirect('/crm/conversations');
        }
        
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
 * إسناد محادثة إلى مستخدم
 */
const assignConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.body.assignedTo; // تعديل لقراءة الحقل الصحيح من النموذج
        
        // التحقق من وجود المحادثة
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            req.flash('error', 'المحادثة غير موجودة');
            return res.redirect('/crm/conversations');
        }

        // التحقق من وجود المستخدم المحدد
        if (userId) {
            const user = await User.findById(userId);
            if (!user) {
                req.flash('error', 'المستخدم غير موجود');
                return res.redirect(`/crm/conversations/${conversationId}`);
            }
        }

        // تحديث المحادثة بالمستخدم المعين
        conversation.assignedTo = userId || null;
        conversation.updatedAt = new Date();
        
        // تحديث الحالة استناداً إلى وجود مستخدم مُسند
        if (userId) {
            conversation.status = 'assigned';
        } else {
            conversation.status = 'open';
        }
        
        await conversation.save();

        // إرسال إشعار بتحديث المحادثة
        socketService.notifyConversationUpdate(conversationId, {
            type: 'assigned',
            assignedTo: userId,
            assignedBy: req.user ? req.user._id : null
        });

        req.flash('success', userId ? 'تم إسناد المحادثة بنجاح' : 'تم إلغاء إسناد المحادثة بنجاح');
        res.redirect(`/crm/conversations/${conversationId}`);
    } catch (error) {
        logger.error('conversationController', 'خطأ في إسناد المحادثة', error);
        req.flash('error', 'حدث خطأ أثناء إسناد المحادثة');
        res.redirect('/crm/conversations');
    }
};

/**
 * إضافة ملاحظة داخلية للمحادثة
 */
const addInternalNote = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { note } = req.body;

        // التحقق من وجود المحادثة
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            req.flash('error', 'المحادثة غير موجودة');
            return res.redirect('/crm/conversations');
        }

        // التحقق من وجود المحتوى للملاحظة
        if (!note || note.trim() === '') {
            req.flash('error', 'يجب إدخال نص الملاحظة');
            return res.redirect(`/crm/conversations/${conversationId}`);
        }

        // إنشاء رسالة داخلية جديدة (ملاحظة) من نوع خاص
        const internalMessage = new WhatsappMessage({
            conversationId,
            direction: 'internal',
            content: note,
            timestamp: new Date(),
            sender: req.user._id,
            isInternalNote: true
        });

        await internalMessage.save();

        // تحديث وقت آخر تحديث للمحادثة
        conversation.lastInternalNoteAt = new Date();
        await conversation.save();

        // إرسال إشعار بإضافة ملاحظة داخلية
        socketService.notifyConversationUpdate(conversationId, {
            type: 'note_added',
            noteId: internalMessage._id,
            addedBy: req.user._id
        });

        req.flash('success', 'تمت إضافة الملاحظة بنجاح');
        res.redirect(`/crm/conversations/${conversationId}`);
    } catch (error) {
        logger.error('conversationController', 'خطأ في إضافة ملاحظة داخلية', error);
        req.flash('error', 'حدث خطأ أثناء إضافة الملاحظة');
        res.redirect('/crm/conversations');
    }
};

/**
 * تغيير حالة المحادثة (فتح/إغلاق)
 */
const toggleConversationStatus = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { status } = req.body;

        // التحقق من صحة الحالة
        if (status !== 'open' && status !== 'closed') {
            req.flash('error', 'حالة غير صالحة');
            return res.redirect(`/crm/conversations/${conversationId}`);
        }

        // التحقق من وجود المحادثة
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            req.flash('error', 'المحادثة غير موجودة');
            return res.redirect('/crm/conversations');
        }

        // تحديث حالة المحادثة
        conversation.status = status;
        conversation.updatedAt = new Date();
        
        // إذا تم إغلاق المحادثة، قم بتسجيل وقت الإغلاق
        if (status === 'closed') {
            conversation.closedAt = new Date();
            conversation.closedBy = req.user._id;
        } else {
            // إذا تم إعادة فتح المحادثة، قم بإزالة معلومات الإغلاق
            conversation.closedAt = null;
            conversation.closedBy = null;
        }

        await conversation.save();

        // إرسال إشعار بتغيير حالة المحادثة
        socketService.notifyConversationUpdate(conversationId, {
            type: 'status_changed',
            status: status,
            changedBy: req.user._id
        });

        const statusMessage = status === 'open' ? 'تم فتح المحادثة بنجاح' : 'تم إغلاق المحادثة بنجاح';
        req.flash('success', statusMessage);
        res.redirect(`/crm/conversations/${conversationId}`);
    } catch (error) {
        logger.error('conversationController', 'خطأ في تغيير حالة المحادثة', error);
        req.flash('error', 'حدث خطأ أثناء تغيير حالة المحادثة');
        res.redirect('/crm/conversations');
    }
};

/**
 * إرسال رد على المحادثة
 */
const replyToConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { content } = req.body;

        // التحقق من وجود المحادثة
        const conversation = await Conversation.findById(conversationId)
            .populate('channelId');
        
        if (!conversation) {
            req.flash('error', 'المحادثة غير موجودة');
            return res.redirect('/crm/conversations');
        }

        // التحقق من وجود محتوى للرد
        if (!content || content.trim() === '') {
            req.flash('error', 'يجب إدخال نص الرسالة');
            return res.redirect(`/crm/conversations/${conversationId}`);
        }

        // إنشاء رسالة جديدة كرد
        const message = new WhatsappMessage({
            conversationId,
            direction: 'outbound',
            content,
            timestamp: new Date(),
            sender: req.user._id
        });

        await message.save();

        // تحديث المحادثة
        conversation.lastMessageAt = new Date();
        conversation.lastMessage = content;
        
        // إذا كانت المحادثة مغلقة، قم بإعادة فتحها عند الرد
        if (conversation.status === 'closed') {
            conversation.status = 'open';
            conversation.closedAt = null;
            conversation.closedBy = null;
        }
        
        await conversation.save();

        // إرسال إشعار برسالة جديدة
        socketService.notifyNewMessage(conversationId, {
            messageId: message._id,
            conversationId,
            content,
            direction: 'outbound',
            timestamp: message.timestamp,
            sender: {
                _id: req.user._id,
                username: req.user.username
            }
        });

        // أيضًا قم بإرسال إشعار إلى المستخدم المسند إليه المحادثة إذا كان موجودًا ومختلفًا عن المستخدم الحالي
        if (conversation.assignedTo && conversation.assignedTo.toString() !== req.user._id.toString()) {
            socketService.notifyUser(conversation.assignedTo, 'new_message', {
                conversationId,
                messageCount: 1,
                contactName: conversation.contactName || 'عميل',
                preview: content.substring(0, 50) + (content.length > 50 ? '...' : '')
            });
        }

        req.flash('success', 'تم إرسال الرد بنجاح');
        res.redirect(`/crm/conversations/${conversationId}`);
    } catch (error) {
        logger.error('conversationController', 'خطأ في إرسال رد على المحادثة', error);
        req.flash('error', 'حدث خطأ أثناء إرسال الرد');
        res.redirect('/crm/conversations');
    }
};

/**
 * إلغاء إسناد محادثة
 * يزيل المستخدم المسند من المحادثة ويعيدها إلى الحالة المفتوحة
 */
exports.unassignConversation = async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        // التحقق من وجود المحادثة
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            req.flash('error', 'المحادثة غير موجودة');
            return res.redirect('/crm/conversations');
        }
        
        // التحقق من أن المحادثة مسندة بالفعل
        if (!conversation.assignedTo) {
            req.flash('error', 'المحادثة غير مسندة حاليًا');
            return res.redirect(`/crm/conversations/${conversationId}`);
        }
        
        // حفظ معرف المستخدم السابق للإشعارات
        const previousAssignedUser = conversation.assignedTo;
        
        // إلغاء الإسناد وتغيير الحالة إلى مفتوحة
        conversation.assignedTo = null;
        conversation.status = 'open';
        await conversation.save();
        
        // تسجيل المعلومات
        logger.info('conversationController', 'تم إلغاء إسناد المحادثة', {
            conversationId,
            previousAssignedUser,
            by: req.user._id
        });
        
        // إرسال إشعار للمستخدمين عبر Socket.io
        socketService.emitToAll('conversation_updated', {
            conversationId: conversation._id,
            status: conversation.status,
            assignedTo: null
        });
        
        req.flash('success', 'تم إلغاء إسناد المحادثة بنجاح');
        
        // إعادة التوجيه حسب مصدر الطلب
        const referer = req.get('Referer');
        if (referer && referer.includes('/conversations/my')) {
            return res.redirect('/crm/conversations/my');
        }
        return res.redirect('/crm/conversations');
        
    } catch (error) {
        logger.error('conversationController', 'خطأ في إلغاء إسناد المحادثة', error);
        req.flash('error', 'حدث خطأ أثناء إلغاء إسناد المحادثة');
        return res.redirect('/crm/conversations');
    }
};

exports.assignConversation = assignConversation;
exports.addInternalNote = addInternalNote;
exports.toggleConversationStatus = toggleConversationStatus;
exports.replyToConversation = replyToConversation;

module.exports = exports;
