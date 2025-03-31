/**
 * متحكم المحادثات
 * مسؤول عن إدارة عرض وتحديث المحادثات
 */
const Conversation = require('../models/Conversation');
const Contact = require('../models/Contact');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const WhatsappChannel = require('../models/WhatsAppChannel');
const SemMessage = require('../models/SemMessage'); // إن احتجته
const User = require('../models/User');
const logger = require('../services/loggerService');
const socketService = require('../services/socketService');

/**
 * عرض جميع المحادثات
 */
exports.listConversations = async (req, res) => {
  try {
    const status = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status !== 'all') {
      filter.status = status;
    }

    const total = await Conversation.countDocuments(filter);

    const conversations = await Conversation.find(filter)
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('channelId', 'name')
      .populate('assignedTo', 'username full_name')
      .lean();

    // إحضار آخر رسالة لكل محادثة
    const convWithLast = await Promise.all(conversations.map(async (c) => {
      try {
        const lastMsg = await WhatsappMessage.findOne({ conversationId: c._id })
          .sort({ timestamp: -1 })
          .lean();
        return { ...c, lastMessage: lastMsg || null };
      } catch (err) {
        logger.error('conversationController', 'خطأ في آخر رسالة', { err, convId: c._id });
        return { ...c, lastMessage: null };
      }
    }));

    const totalPages = Math.ceil(total / limit);
    const pagination = {
      current: page,
      prev: page > 1 ? page - 1 : null,
      next: page < totalPages ? page + 1 : null,
      total: totalPages
    };

    res.render('crm/conversations', {
      title: 'المحادثات',
      conversations: convWithLast,
      pagination,
      filters: {
        status,
        availableStatuses: ['all', 'open', 'assigned', 'closed']
      },
      counts: {
        total,
        open: await Conversation.countDocuments({ status: 'open' }),
        assigned: await Conversation.countDocuments({ status: 'assigned' }),
        closed: await Conversation.countDocuments({ status: 'closed' })
      },
      user: req.user,
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
    if (!req.user || !req.user._id) {
      req.flash('error', 'يرجى تسجيل الدخول أولاً');
      return res.redirect('/crm/conversations');
    }
    const status = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = { assignedTo: req.user._id };
    if (status !== 'all') filter.status = status;

    const total = await Conversation.countDocuments(filter);

    const conversations = await Conversation.find(filter)
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('channelId', 'name')
      .populate('assignedTo', 'username full_name')
      .lean();

    const convWithLast = await Promise.all(conversations.map(async (c) => {
      try {
        const lastMsg = await WhatsappMessage.findOne({ conversationId: c._id })
          .sort({ timestamp: -1 })
          .lean();
        return { ...c, lastMessage: lastMsg || null };
      } catch (err) {
        logger.error('conversationController', 'خطأ في آخر رسالة', { err, convId: c._id });
        return { ...c, lastMessage: null };
      }
    }));

    const totalPages = Math.ceil(total / limit);
    const pagination = {
      current: page,
      prev: page > 1 ? page - 1 : null,
      next: page < totalPages ? page + 1 : null,
      total: totalPages
    };

    res.render('crm/conversations', {
      title: 'محادثاتي',
      conversations: convWithLast,
      pagination,
      filters: {
        status,
        availableStatuses: ['all', 'open', 'assigned', 'closed']
      },
      counts: {
        total,
        open: await Conversation.countDocuments({ status: 'open', assignedTo: req.user._id }),
        assigned: await Conversation.countDocuments({ status: 'assigned', assignedTo: req.user._id }),
        closed: await Conversation.countDocuments({ status: 'closed', assignedTo: req.user._id })
      },
      user: req.user,
      layout: 'crm/layout',
      isMyConversations: true,
      flashMessages: req.flash()
    });
  } catch (error) {
    logger.error('conversationController', 'خطأ في عرض محادثات المستخدم', error);
    req.flash('error', 'حدث خطأ أثناء تحميل المحادثات');
    res.redirect('/crm/conversations');
  }
};

/**
 * عرض محادثة محددة
 */
exports.showConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;

    const conversation = await Conversation.findById(conversationId)
      .populate('channelId')
      .populate('assignedTo', 'username full_name')
      .lean();

    if (!conversation) {
      req.flash('error', 'المحادثة غير موجودة');
      return res.redirect('/crm/conversations');
    }

    // جلب جهة الاتصال إن وجدت
    const contact = await Contact.findOne({ phoneNumber: conversation.phoneNumber }).lean();

    // جلب آخر 50 رسالة
    const msgs = await WhatsappMessage.find({ conversationId })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    const sorted = msgs.reverse(); // الأقدم فالأحدث

    res.render('crm/conversation', {
      title: `محادثة مع ${conversation.customerName || conversation.phoneNumber}`,
      conversation,
      messages: sorted,
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
exports.assignConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.body.assignedTo; // قراءة حقل إسناد الموظف

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      req.flash('error', 'المحادثة غير موجودة');
      return res.redirect('/crm/conversations');
    }

    // إذا تم اختيار مستخدم معين
    if (userId) {
      const user = await User.findById(userId);
      if (!user) {
        req.flash('error', 'المستخدم غير موجود');
        return res.redirect(`/crm/conversations/${conversationId}`);
      }
      conversation.assignedTo = userId;
      conversation.status = 'assigned';
    } else {
      // إلغاء الإسناد
      conversation.assignedTo = null;
      conversation.status = 'open';
    }

    conversation.updatedAt = new Date();
    await conversation.save();

    socketService.notifyConversationUpdate(conversationId, {
      type: 'assigned',
      assignedTo: userId || null,
      changedBy: req.user?._id || null
    });

    req.flash('success', userId ? 'تم إسناد المحادثة' : 'تم إلغاء إسناد المحادثة');
    res.redirect(`/crm/conversations/${conversationId}`);
  } catch (error) {
    logger.error('conversationController', 'خطأ في إسناد المحادثة', error);
    req.flash('error', 'حدث خطأ أثناء إسناد المحادثة');
    res.redirect('/crm/conversations');
  }
};

/**
 * إضافة ملاحظة داخلية
 */
exports.addInternalNote = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const noteContent = req.body.noteContent || '';

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      req.flash('error', 'المحادثة غير موجودة');
      return res.redirect('/crm/conversations');
    }

    if (!noteContent.trim()) {
      req.flash('error', 'لا يمكن إضافة ملاحظة فارغة');
      return res.redirect(`/crm/conversations/${conversationId}`);
    }

    // تنشئ رسالة خاصة بالإدخال الداخلي (يمكنك إضافة حقل isInternalNote=true في النموذج)
    const noteMsg = new WhatsappMessage({
      conversationId,
      direction: 'internal', 
      content: noteContent,
      timestamp: new Date(),
      status: 'note'
    });
    await noteMsg.save();

    // يمكنك أيضًا حفظ noteContent في conversation.notes إذا أردت دمجه
    // أو استخدام آلية أخرى لتخزين الملاحظات

    req.flash('success', 'تمت إضافة الملاحظة بنجاح');
    res.redirect(`/crm/conversations/${conversationId}`);
  } catch (error) {
    logger.error('conversationController', 'خطأ في إضافة ملاحظة', error);
    req.flash('error', 'حدث خطأ أثناء إضافة الملاحظة');
    res.redirect('/crm/conversations');
  }
};

/**
 * إغلاق/فتح المحادثة
 */
exports.toggleConversationStatus = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const newStatus = req.url.endsWith('/close') ? 'closed' : 'open';

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      req.flash('error', 'المحادثة غير موجودة');
      return res.redirect('/crm/conversations');
    }

    conversation.status = newStatus;
    conversation.updatedAt = new Date();
    if (newStatus === 'closed') {
      conversation.closedAt = new Date();
      conversation.closedBy = req.user?._id || null;
    } else {
      conversation.closedAt = null;
      conversation.closedBy = null;
    }
    await conversation.save();

    socketService.notifyConversationUpdate(conversationId, {
      type: 'status_changed',
      status: newStatus,
      changedBy: req.user?._id || null
    });

    req.flash('success', newStatus === 'closed' ? 'تم إغلاق المحادثة' : 'تم فتح المحادثة');
    res.redirect(`/crm/conversations/${conversationId}`);
  } catch (error) {
    logger.error('conversationController', 'خطأ في تغيير حالة المحادثة', error);
    req.flash('error', 'حدث خطأ أثناء تغيير حالة المحادثة');
    res.redirect('/crm/conversations');
  }
};

/**
 * إرسال رد على المحادثة (نص عادي)
 */
exports.replyToConversation = async (req, res) => {
  const isAjax = req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest';
  try {
    const { conversationId } = req.params;
    const { content } = req.body;

    const conversation = await Conversation.findById(conversationId).populate('channelId');
    if (!conversation) {
      if (isAjax) return res.json({ success: false, error: 'المحادثة غير موجودة' });
      req.flash('error', 'المحادثة غير موجودة');
      return res.redirect('/crm/conversations');
    }

    if (!content || !content.trim()) {
      if (isAjax) return res.json({ success: false, error: 'لا يمكن إرسال رسالة فارغة' });
      req.flash('error', 'لا يمكن إرسال رسالة فارغة');
      return res.redirect(`/crm/conversations/${conversationId}`);
    }

    // إنشاء رسالة في DB
    const msg = new WhatsappMessage({
      conversationId,
      direction: 'outgoing',
      content: content.trim(),
      timestamp: new Date(),
      sender: req.user?._id || null,
      status: 'sent'
    });
    await msg.save();

    // تحديث آخر رسالة
    conversation.lastMessageAt = new Date();
    conversation.lastMessage = content;
    // إذا كانت المحادثة مغلقة، نفتحها تلقائياً
    if (conversation.status === 'closed') {
      conversation.status = 'open';
      conversation.closedAt = null;
      conversation.closedBy = null;
    }
    await conversation.save();

    // إرسال فعلي للرسالة عبر واجهة WhatsApp (لو كانت متصلة)
    let externalId = null;
    let finalStatus = 'sent';
    try {
      const metaWhatsappService = require('../services/whatsapp/MetaWhatsappService');
      if (!metaWhatsappService.initialized) {
        await metaWhatsappService.initialize();
      }
      const phoneNumberId = conversation.channelId?.config?.phoneNumberId || null;
      const apiResponse = await metaWhatsappService.sendTextMessage(
        conversation.phoneNumber,
        content,
        phoneNumberId
      );
      if (apiResponse?.messages?.length > 0) {
        externalId = apiResponse.messages[0].id;
      }
      // نعتبر الحالة sent حالياً
    } catch (err) {
      logger.error('conversationController', 'فشل إرسال عبر WhatsApp API', err);
      finalStatus = 'failed';
    }

    msg.externalMessageId = externalId;
    msg.status = finalStatus;
    await msg.save();

    // إشعار Socket.io
    socketService.notifyNewMessage(conversationId, {
      _id: msg._id,
      conversationId,
      content,
      direction: 'outgoing',
      timestamp: msg.timestamp,
      status: msg.status,
      externalMessageId: externalId || null
    });

    // إذا كان هناك مستخدم مسند غير المرسل
    if (conversation.assignedTo && req.user && conversation.assignedTo.toString() !== req.user._id.toString()) {
      socketService.notifyUser(conversation.assignedTo, 'new_message', {
        conversationId,
        messageCount: 1,
        preview: content.substring(0, 80),
      });
    }

    if (isAjax) {
      return res.json({
        success: true,
        message: {
          _id: msg._id,
          conversationId,
          content,
          direction: 'outgoing',
          timestamp: msg.timestamp,
          status: msg.status,
          externalMessageId: msg.externalMessageId || null
        }
      });
    } else {
      req.flash('success', 'تم إرسال الرسالة');
      return res.redirect(`/crm/conversations/${conversationId}`);
    }
  } catch (error) {
    logger.error('conversationController', 'خطأ في إرسال رد', error);
    if (isAjax) {
      return res.json({ success: false, error: 'حدث خطأ أثناء الإرسال' });
    }
    req.flash('error', 'حدث خطأ أثناء الإرسال');
    res.redirect(`/crm/conversations/${req.params.conversationId || ''}`);
  }
};
