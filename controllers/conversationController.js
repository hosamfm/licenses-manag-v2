/**
 * متحكم المحادثات
 * مسؤول عن إدارة عرض وتحديث المحادثات
 */
const Conversation = require('../models/Conversation');
const Contact = require('../models/Contact');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const WhatsappChannel = require('../models/WhatsAppChannel');
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
 * إسناد المحادثة إلى مستخدم آخر
 */
exports.assignConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { assignedTo } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      req.flash('error', 'المحادثة غير موجودة');
      return res.redirect('/crm/conversations');
    }

    // تحويل لقيمة null إذا كان الإسناد فارغ (إلغاء الإسناد)
    const assignedToId = assignedTo && assignedTo.trim() ? assignedTo : null;
    
    // التحقق من وجود المستخدم المسند إليه (إذا كان هناك)
    if (assignedToId) {
      const assignedUser = await User.findOne({ _id: assignedToId, can_access_conversations: true });
      if (!assignedUser) {
        req.flash('error', 'المستخدم المسند إليه غير صالح أو غير مصرح له بالوصول للمحادثات');
        return res.redirect(`/crm/conversations/${conversationId}`);
      }
    }

    // تحديث المحادثة
    const oldAssignee = conversation.assignedTo;
    conversation.assignedTo = assignedToId;
    conversation.assignedAt = assignedToId ? new Date() : null;
    conversation.assignedBy = assignedToId ? (req.user ? req.user._id : null) : null;
    await conversation.save();

    // إرسال إشعار بالتحديث عبر Socket.io
    socketService.notifyConversationUpdate(conversationId, {
      type: 'assigned',
      assignedTo: assignedToId,
      assignedBy: req.user ? req.user._id : null
    });

    // إذا كان هناك مستخدم مسند سابق مختلف عن المسند الجديد، نرسل له إشعار
    if (oldAssignee && oldAssignee.toString() !== (assignedToId || '')) {
      socketService.notifyUser(oldAssignee, 'conversation_unassigned', {
        conversationId,
        unassignedBy: req.user ? req.user.full_name || req.user.username : 'مستخدم النظام'
      });
    }

    // إذا كان هناك مستخدم مسند جديد، نرسل له إشعار
    if (assignedToId) {
      socketService.notifyUser(assignedToId, 'conversation_assigned', {
        conversationId,
        assignedBy: req.user ? req.user.full_name || req.user.username : 'مستخدم النظام',
        customerName: conversation.customerName,
        phoneNumber: conversation.phoneNumber
      });
    }

    req.flash('success', assignedToId 
      ? 'تم إسناد المحادثة بنجاح' 
      : 'تم إلغاء إسناد المحادثة بنجاح');
    res.redirect(`/crm/conversations/${conversationId}`);
  } catch (error) {
    logger.error('conversationController', 'خطأ في إسناد المحادثة', error);
    req.flash('error', 'حدث خطأ أثناء محاولة إسناد المحادثة');
    res.redirect(`/crm/conversations/${req.params.conversationId || ''}`);
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
    const { content, replyToMessageId } = req.body;

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

    // التحقق من وجود الرسالة التي يتم الرد عليها (إذا تم تحديدها)
    let replyContext = null;
    if (replyToMessageId) {
      const originalMessage = await WhatsappMessage.findOne({ 
        $or: [
          { externalMessageId: replyToMessageId },
          { _id: replyToMessageId }
        ]
      });
      if (originalMessage) {
        replyContext = {
          message_id: originalMessage.externalMessageId || replyToMessageId,
          from: originalMessage.metadata ? originalMessage.metadata.from : null
        };
      }
    }

    // إنشاء رسالة في قاعدة البيانات باستخدام الدالة الجديدة
    let msg;
    if (replyToMessageId) {
      // استخدام الدالة الجديدة لإنشاء رسالة رد
      msg = await WhatsappMessage.createReplyMessage(
        conversationId,
        content.trim(),
        req.user?._id || null,
        replyToMessageId
      );
    } else {
      // إنشاء رسالة عادية
      msg = new WhatsappMessage({
        conversationId,
        direction: 'outgoing',
        content: content.trim(),
        timestamp: new Date(),
        sentBy: req.user?._id || null,
        status: 'sent'
      });
      await msg.save();
    }

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
      
      let apiResponse;
      
      // إذا كان رد على رسالة سابقة
      if (replyToMessageId) {
        apiResponse = await metaWhatsappService.sendReplyTextMessage(
          conversation.phoneNumber,
          content,
          replyToMessageId,
          phoneNumberId
        );
      } else {
        // رسالة عادية
        apiResponse = await metaWhatsappService.sendTextMessage(
          conversation.phoneNumber,
          content,
          phoneNumberId
        );
      }
      
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

    // إشعار Socket.io - اعتماداً على ما إذا كانت رداً أو رسالة عادية
    if (replyToMessageId) {
      socketService.notifyMessageReply(conversationId, {
        _id: msg._id,
        conversationId,
        content,
        direction: 'outgoing',
        timestamp: msg.timestamp,
        status: msg.status,
        externalMessageId: externalId || null
      }, replyToMessageId);
    } else {
      socketService.notifyNewMessage(conversationId, {
        _id: msg._id,
        conversationId,
        content,
        direction: 'outgoing',
        timestamp: msg.timestamp,
        status: msg.status,
        externalMessageId: externalId || null
      });
    }

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
          externalMessageId: msg.externalMessageId || null,
          replyToMessageId: replyToMessageId || null
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

/**
 * إرسال تفاعل على رسالة
 */
exports.reactToMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messageId, emoji, externalMessageId } = req.body;

    if (!emoji || (!messageId && !externalMessageId)) {
      return res.json({ success: false, error: 'بيانات غير كافية، يجب تحديد معرف الرسالة والإيموجي' });
    }

    // التحقق من وجود المحادثة
    const conversation = await Conversation.findById(conversationId).populate('channelId');
    if (!conversation) {
      return res.json({ success: false, error: 'المحادثة غير موجودة' });
    }

    // البحث عن الرسالة للتفاعل معها (إما باستخدام المعرف الداخلي أو الخارجي)
    let message;
    
    if (externalMessageId) {
      // البحث باستخدام المعرف الخارجي أولًا إذا كان متوفرًا
      message = await WhatsappMessage.findOne({ externalMessageId: externalMessageId });
    }
    
    if (!message && messageId) {
      // إذا لم يتم العثور على الرسالة بالمعرف الخارجي أو لم يتم توفيره، نبحث عن الرسالة بالمعرف الداخلي
      message = await WhatsappMessage.findById(messageId);
    }
    
    if (!message) {
      // تسجيل المزيد من التفاصيل للتشخيص
      logger.error('conversationController', 'الرسالة غير موجودة في التفاعل', { 
        messageId, 
        externalMessageId, 
        conversationId 
      });
      return res.json({ success: false, error: 'الرسالة غير موجودة' });
    }

    try {
      // إرسال التفاعل عبر واتساب
      const metaWhatsappService = require('../services/whatsapp/MetaWhatsappService');
      if (!metaWhatsappService.initialized) {
        await metaWhatsappService.initialize();
      }

      const phoneNumberId = conversation.channelId?.config?.phoneNumberId || null;
      // استخدام المعرف الخارجي للرسالة المخزن في قاعدة البيانات
      const messageIdToUse = message.externalMessageId;
      
      if (!messageIdToUse) {
        logger.error('conversationController', 'المعرف الخارجي للرسالة غير موجود', { 
          internalId: message._id,
          externalId: message.externalMessageId
        });
        return res.json({ success: false, error: 'المعرف الخارجي للرسالة غير موجود' });
      }
      
      await metaWhatsappService.sendReaction(
        conversation.phoneNumber,
        messageIdToUse,
        emoji,
        phoneNumberId
      );

      // تحديث التفاعل في قاعدة البيانات
      const reactionData = {
        sender: req.user ? req.user._id.toString() : 'system',
        emoji,
        timestamp: new Date()
      };
      
      // استدعاء الدالة الجديدة لتحديث التفاعل
      await WhatsappMessage.updateReaction(messageIdToUse, reactionData);

      // إرسال إشعار عبر Socket
      socketService.notifyMessageReaction(
        conversationId,
        messageIdToUse,
        reactionData
      );

      return res.json({
        success: true,
        message: 'تم إرسال التفاعل بنجاح'
      });

    } catch (error) {
      logger.error('conversationController', 'خطأ في إرسال التفاعل', error);
      return res.json({ success: false, error: 'حدث خطأ أثناء إرسال التفاعل' });
    }
  } catch (error) {
    logger.error('conversationController', 'خطأ في معالجة طلب التفاعل', error);
    return res.status(500).json({ success: false, error: 'حدث خطأ في الخادم' });
  }
};

/* -------------------------------------------
 *            الدوال الجديدة بالأسفل
 * ------------------------------------------- */

/**
 * 3) عرض صفحة المحادثات بـ AJAX (فيها عمودين)
 */
exports.listConversationsAjax = async (req, res) => {
  try {
    // يمكنك تنفيذ نفس منطق الفلترة كما في listConversations
    const status = req.query.status || 'all';
    const filter = {};
    if (status !== 'all') filter.status = status;

    // أحضر المحادثات مثلاً بحد أقصى 50
    const conversations = await Conversation.find(filter)
      .sort({ lastMessageAt: -1 })
      .limit(50)
      .populate('assignedTo', 'username full_name')
      .lean();

    // جلب آخر رسالة
    const convWithLast = await Promise.all(
      conversations.map(async (c) => {
        const lastMsg = await WhatsappMessage.findOne({ conversationId: c._id })
          .sort({ timestamp: -1 })
          .lean();
        return { ...c, lastMessage: lastMsg || null };
      })
    );

    // عرض صفحة جديدة: views/crm/conversations_split_ajax.ejs
    res.render('crm/conversations_split_ajax', {
      title: 'المحادثات AJAX',
      conversations: convWithLast,
      user: req.user,
      flashMessages: req.flash()
    });
  } catch (err) {
    logger.error('conversationController', 'خطأ في listConversationsAjax', err);
    req.flash('error', 'حدث خطأ أثناء تحميل المحادثات (AJAX)');
    res.redirect('/'); 
  }
};


/**
 * 4) إرجاع تفاصيل محادثة جزئيًا لاستخدامه مع AJAX
 */
exports.getConversationDetailsAjax = async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation) {
      return res.status(404).send('<div class="alert alert-danger">المحادثة غير موجودة</div>');
    }

    // جلب 50 رسالة مثلاً
    const msgs = await WhatsappMessage.find({ conversationId })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();
    const sorted = msgs.reverse();

    // نعيد الـ Partial فقط (layout: false)
    return res.render('crm/partials/_conversation_details_ajax', {
      layout: false,
      conversation,
      messages: sorted,
      user: req.user // إضافة معلومات المستخدم المطلوبة في القالب
    });
  } catch (err) {
    logger.error('conversationController', 'خطأ في getConversationDetailsAjax', err);
    return res.status(500).send('<div class="alert alert-danger">خطأ في الخادم</div>');
  }
};

/**
 * 5) إرجاع قائمة المحادثات لتحديثها بواسطة AJAX
 */
exports.listConversationsAjaxList = async (req, res) => {
  try {
    // إرجاع البيانات بصيغة JSON
    // تحديد الاستعلام بناءً على صلاحيات المستخدم
    let query = {};
    
    // التحقق من وجود حالة محددة في الاستعلام
    const status = req.query.status || 'all';
    if (status !== 'all') {
      query.status = status;
    }
    
    // إضافة فلتر إذا كان المستخدم ليس مشرفاً أو مديراً
    if (req.user && req.user.role !== 'admin' && req.user.role !== 'supervisor') {
      query.assignedTo = req.user._id;
    }
    
    const conversations = await Conversation.find(query)
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    // احسب عدد الرسائل غير المقروءة لكل محادثة
    const convWithUnread = await Promise.all(
      conversations.map(async (conv) => {
        // حساب عدد الرسائل غير المقروءة
        const unreadCount = await WhatsappMessage.countDocuments({
          conversationId: conv._id,
          direction: 'incoming',
          status: { $ne: 'read' }
        });
        
        // جلب آخر رسالة
        const lastMsg = await WhatsappMessage.findOne({ conversationId: conv._id })
          .sort({ timestamp: -1 })
          .lean();
          
        // إرجاع المحادثة مع البيانات الإضافية
        return { 
          ...conv, 
          unreadCount, 
          lastMessage: lastMsg || null 
        };
      })
    );

    // إرجاع البيانات بصيغة JSON
    return res.json({
      success: true,
      conversations: convWithUnread
    });
  } catch (err) {
    logger.error('conversationController', 'خطأ في listConversationsAjaxList', err);
    return res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ أثناء تحميل المحادثات' 
    });
  }
};
