/**
 * متحكم المحادثات
 * مسؤول عن إدارة عرض وتحديث المحادثات
 * 
 * ملاحظات حول نظام المراسلة:
 * 1. دوال إرسال الرسائل (replyToConversation وغيرها) تستخدم HTTP لإرسال البيانات.
 * 2. دوال الإشعارات تستخدم Socket.io للإعلام عن التحديثات الفورية.
 * 3. النظام يستخدم SemySMS وواجهة ميتا الرسمية للواتس أب.
 * 4. وظائف تحميل الوسائط (الصور، الملفات، الفيديو، الصوت) تستخدم API واتساب الرسمي.
 */
const Conversation = require('../models/Conversation');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const WhatsappChannel = require('../models/WhatsAppChannel');
const User = require('../models/User');
const WhatsappMedia = require('../models/WhatsappMedia');
const logger = require('../services/loggerService');
const socketService = require('../services/socketService');
const mediaService = require('../services/mediaService');
const cacheService = require('../services/cacheService');
const conversationService = require('../services/conversationService');

/**
 * دالة مساعدة لتوحيد منطق جلب المحادثات
 * تستخدم في عرض جميع المحادثات وعرض محادثات المستخدم الحالي
 * @param {Object} options - خيارات جلب المحادثات
 * @param {Object} req - كائن الطلب
 * @param {Object} res - كائن الاستجابة
 * @param {String} viewName - اسم القالب للعرض
 * @param {String} pageTitle - عنوان الصفحة
 * @returns {Promise} 
 */
async function renderConversationsList(options, req, res, viewName, pageTitle) {
  try {
    const status = req.query.status || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    // بناء معايير التصفية والتصفح
    const filterOptions = {
      status: status,
      ...options.filters
    };
    
    const paginationOptions = {
      page: page,
      limit: limit,
      sort: { lastMessageAt: -1 }
    };
    
    // استخدام خدمة المحادثات للحصول على قائمة المحادثات
    const result = await conversationService.getConversationsList(
      filterOptions,
      paginationOptions,
      true,
      true
    );
    
    // الحصول على إحصاءات المحادثات
    const counts = options.getStats 
      ? await options.getStats(req.user)
      : await conversationService.getConversationStats();
    
    // إعداد بيانات التصفح للقالب
    const pagination = {
      current: result.pagination.currentPage,
      prev: result.pagination.prevPage,
      next: result.pagination.nextPage,
      total: result.pagination.totalPages
    };
    
    res.render(viewName, {
      title: pageTitle,
      conversations: result.conversations,
      pagination,
      filters: {
        status,
        availableStatuses: ['all', 'open', 'assigned', 'closed']
      },
      counts,
      user: req.user,
      layout: 'crm/layout',
      flashMessages: req.flash()
    });
  } catch (error) {
    logger.error('conversationController', `خطأ في عرض ${pageTitle}`, error);
    req.flash('error', 'حدث خطأ أثناء تحميل المحادثات');
    res.redirect('/');
  }
}

/**
 * عرض جميع المحادثات
 */
exports.listConversations = async (req, res) => {
  await renderConversationsList(
    {
      filters: {}, // لا توجد فلاتر إضافية لجميع المحادثات
      getStats: null // استخدام الإحصاءات العامة
    },
    req,
    res,
    'crm/conversations',
    'المحادثات'
  );
};

/**
 * عرض المحادثات المسندة للمستخدم الحالي
 */
exports.listMyConversations = async (req, res) => {
  if (!req.user || !req.user._id) {
    req.flash('error', 'يرجى تسجيل الدخول أولاً');
    return res.redirect('/crm/conversations');
  }
  
  await renderConversationsList(
    {
      filters: {
        assignedTo: req.user._id // محادثات المستخدم الحالي فقط
      },
      getStats: async (user) => {
        // إحصاءات خاصة بمحادثات المستخدم الحالي
        return {
          total: await Conversation.countDocuments({ assignedTo: user._id }),
          open: await Conversation.countDocuments({ assignedTo: user._id, status: 'open' }),
          assigned: await Conversation.countDocuments({ assignedTo: user._id, status: 'assigned' }),
          closed: await Conversation.countDocuments({ assignedTo: user._id, status: 'closed' })
        };
      }
    },
    req,
    res,
    'crm/my_conversations',
    'محادثاتي'
  );
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
      assignedBy: req.user?._id || null
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
    const { content, replyToMessageId, mediaId, mediaType } = req.body;

    const conversation = await Conversation.findById(conversationId).populate('channelId');
    if (!conversation) {
      if (isAjax) return res.json({ success: false, error: 'المحادثة غير موجودة' });
      req.flash('error', 'المحادثة غير موجودة');
      return res.redirect('/crm/conversations');
    }

    // التحقق من وجود محتوى أو وسائط على الأقل
    if ((!content || !content.trim()) && !mediaId) {
      if (isAjax) return res.json({ success: false, error: 'لا يمكن إرسال رسالة فارغة' });
      req.flash('error', 'لا يمكن إرسال رسالة فارغة');
      return res.redirect(`/crm/conversations/${conversationId}`);
    }

    // التحقق من وجود سياق رد على رسالة
    let replyContext = null;
    let originalMessage = null;
    let externalReplyId = null;

    if (replyToMessageId) {
      // البحث عن الرسالة الأصلية التي يتم الرد عليها - بمعرفها الخارجي أو الداخلي
      originalMessage = await WhatsappMessage.findOne({
        $or: [
          { externalMessageId: replyToMessageId },
          { _id: replyToMessageId }
        ]
      });
      
      if (originalMessage) {
        // استخدام المعرف الخارجي للرسالة الأصلية للرد
        externalReplyId = originalMessage.externalMessageId;
        
        // تسجيل معلومات تشخيصية مفصلة
        logger.info('conversationController', 'معلومات الرسالة الأصلية للرد', { 
          originalMessageId: originalMessage._id.toString(),
          externalMessageId: originalMessage.externalMessageId,
          from: originalMessage.metadata?.from,
          direction: originalMessage.direction
        });
        
        replyContext = {
          message_id: originalMessage.externalMessageId || replyToMessageId,
          from: originalMessage.metadata ? originalMessage.metadata.from : null
        };
      } else {
        logger.warn('conversationController', 'لم يتم العثور على الرسالة الأصلية للرد', { replyToMessageId });
      }
    }

    // استخدام دالة createReplyMessage مباشرة إذا كان رداً على رسالة، وإلا createOutgoingMessage
    let msg;
    if (replyToMessageId) {
      msg = await WhatsappMessage.createReplyMessage(
        conversationId,
        content ? content.trim() : '',
        req.user?._id || null,
        replyToMessageId
      );
    } else {
      msg = new WhatsappMessage({
        conversationId,
        direction: 'outgoing',
        content: content ? content.trim() : '',
        timestamp: new Date(),
        sentBy: req.user?._id || null,
        status: 'sent'
      });
      await msg.save();
    }

    // تحديث آخر رسالة
    conversation.lastMessageAt = new Date();
    conversation.lastMessage = content || 'مرفق وسائط';
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
      
      // التحقق من وجود وسائط
      if (mediaId && mediaType) {
        // جلب معلومات الوسائط
        const whatsappMediaController = require('./whatsappMediaController');
        const media = await WhatsappMedia.findById(mediaId);
        
        if (!media) {
          throw new Error('الوسائط غير موجودة');
        }
        
        logger.info('conversationController', 'إرسال رسالة مع وسائط', {
          mediaId,
          mediaType,
          conversationId
        });
        
        // تحديث معرف الرسالة في سجل الوسائط
        await whatsappMediaController.updateMessageIdForMedia(mediaId, msg._id);
        
        // استخدام الدالة الموحدة لإرسال الوسائط (مع أو بدون رد)
        const options = {
          caption: media.caption || '',
          filename: mediaType === 'document' ? (media.fileName || 'document') : undefined
        };
        
        // استخدام معرف الرد الخارجي إذا كان موجوداً، وإلا null للإرسال كرسالة عادية
        apiResponse = await metaWhatsappService.sendMediaMessage(
          conversation.phoneNumber,
          mediaType,
          media.fileData,
          options,
          externalReplyId, // null إذا لم يكن هناك رد
          phoneNumberId
        );
      } else {
        // إرسال رسالة نصية عادية
        // إذا كان رد على رسالة سابقة
        if (replyToMessageId) {
          // استخدام المعرف الخارجي للرسالة الأصلية عند إرسال الرد
          if (externalReplyId) {
            apiResponse = await metaWhatsappService.sendReplyTextMessage(
              conversation.phoneNumber,
              content,
              externalReplyId, // استخدام المعرف الخارجي بدلاً من replyToMessageId
              phoneNumberId
            );
            
            logger.info('conversationController', 'إرسال رد على رسالة', { 
              originalMessageId: replyToMessageId,
              externalReplyId,
              phoneNumber: conversation.phoneNumber
            });
          } else {
            // في حالة عدم وجود معرف خارجي، نرسل رسالة عادية
            apiResponse = await metaWhatsappService.sendTextMessage(
              conversation.phoneNumber,
              content,
              phoneNumberId
            );
            logger.warn('conversationController', 'تم تحويل الرد إلى رسالة عادية (المعرف الخارجي غير موجود)', {
              originalMessageId: replyToMessageId
            });
          }
        } else {
          // رسالة عادية
          apiResponse = await metaWhatsappService.sendTextMessage(
            conversation.phoneNumber,
            content,
            phoneNumberId
          );
        }
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

    // مسح التخزين المؤقت للمحادثة لضمان عرض البيانات المحدثة
    cacheService.clearConversationCache(conversationId);

    // إشعار Socket.io - اعتماداً على ما إذا كانت رداً أو رسالة عادية
    if (replyToMessageId) {
      socketService.notifyMessageReply(conversationId, {
        _id: msg._id,
        conversationId,
        content: msg.content,
        direction: 'outgoing',
        timestamp: msg.timestamp,
        status: msg.status,
        externalMessageId: externalId || null,
        mediaType: mediaType || null,
        fileName: mediaType === 'document' ? (await WhatsappMedia.findById(mediaId))?.fileName : null,
        fileSize: mediaType ? (await WhatsappMedia.findById(mediaId))?.fileSize : null
      }, externalReplyId || replyToMessageId); // استخدام المعرف الخارجي في الإشعارات أيضاً
    } else {
      socketService.notifyNewMessage(conversationId, {
        _id: msg._id,
        conversationId,
        content: msg.content,
        direction: 'outgoing',
        timestamp: msg.timestamp,
        status: msg.status,
        externalMessageId: externalId || null,
        mediaType: mediaType || null,
        fileName: mediaType === 'document' ? (await WhatsappMedia.findById(mediaId))?.fileName : null,
        fileSize: mediaType ? (await WhatsappMedia.findById(mediaId))?.fileSize : null
      });
    }

    // إذا كان هناك مستخدم مسند غير المرسل
    if (conversation.assignedTo && req.user && conversation.assignedTo.toString() !== req.user._id.toString()) {
      socketService.notifyUser(conversation.assignedTo, 'new_message', {
        conversationId,
        messageCount: 1,
        preview: content ? content.substring(0, 80) : 'مرفق وسائط',
      });
    }

    if (isAjax) {
      return res.json({
        success: true,
        message: {
          _id: msg._id,
          conversationId,
          content: msg.content,
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
      const metaWhatsappService = require('../services/whatsapp/MetaWhatsappService');
      if (!metaWhatsappService.initialized) {
        await metaWhatsappService.initialize();
      }
      const phoneNumberId = conversation.channelId?.config?.phoneNumberId || null;
      
      let apiResponse;
      
      // التحقق من وجود وسائط
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
        sender: req.user ? req.user.username || req.user._id.toString() : 'system',
        emoji,
        timestamp: new Date()
      };
      
      // تحديث التفاعل في قاعدة البيانات
      const updatedMessage = await WhatsappMessage.updateReaction(messageIdToUse, reactionData);
      
      if (!updatedMessage) {
        logger.warn('conversationController', 'فشل تحديث التفاعل في قاعدة البيانات', {
          messageId: messageIdToUse,
          reaction: reactionData
        });
      } else {
        logger.info('conversationController', 'تم تحديث التفاعل في قاعدة البيانات بنجاح', {
          messageId: messageIdToUse,
          reactionCount: updatedMessage.reactions.length
        });
      }

      // إرسال إشعار عبر Socket
      socketService.notifyMessageReaction(
        conversationId,
        messageIdToUse,
        {
          sender: req.user ? req.user._id.toString() : 'system',
          emoji,
          timestamp: new Date()
        }
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
    // إضافة دعم للصفحات
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // عدد الرسائل في الصفحة الواحدة
    const skip = (page - 1) * limit;
    const skipCache = req.query.skipCache === 'true'; // معامل لتخطي التخزين المؤقت عند الحاجة
    
    if (!conversationId) {
      return res.status(400).send('<div class="alert alert-danger">معرف المحادثة مطلوب</div>');
    }
    
    let conversation;
    let totalMessages;
    let messages = [];
    
    // 1. جلب بيانات المحادثة من التخزين المؤقت أولاً إذا كان متاحاً
    if (!skipCache) {
      conversation = cacheService.getCachedConversation(conversationId);
    }
    
    // إذا لم توجد بيانات المحادثة في التخزين المؤقت، نجلبها من قاعدة البيانات
    if (!conversation) {
      conversation = await Conversation.findById(conversationId)
        .populate('channelId', 'name')
        .populate('assignedTo', 'username full_name')
        .lean();
        
      // تخزين البيانات في التخزين المؤقت للاستخدام المستقبلي
      if (conversation) {
        cacheService.setCachedConversation(conversationId, conversation);
      }
    }
    
    if (!conversation) {
      return res.status(404).send('<div class="alert alert-danger">المحادثة غير موجودة</div>');
    }
    
    // 2. جلب الرسائل من التخزين المؤقت أولاً إذا كانت متاحة
    let messagesWithMedia = [];
    
    if (!skipCache) {
      messagesWithMedia = cacheService.getCachedMessages(conversationId, page, limit);
      totalMessages = conversation.totalMessages || 0; // استخدام إجمالي الرسائل المخزن في كائن المحادثة
    }
    
    // إذا لم توجد الرسائل في التخزين المؤقت، نجلبها من قاعدة البيانات
    if (!messagesWithMedia || messagesWithMedia.length === 0) {
      // جلب إجمالي عدد الرسائل للمحادثة (للصفحات)
      totalMessages = await WhatsappMessage.countDocuments({ conversationId });
      
      // حفظ إجمالي عدد الرسائل في بيانات المحادثة المخزنة مؤقتاً
      if (conversation && !conversation.totalMessages) {
        conversation.totalMessages = totalMessages;
        cacheService.setCachedConversation(conversationId, conversation);
      }
      
      // جلب الرسائل المرتبطة بالمحادثة مع تطبيق الصفحات
      messages = await WhatsappMessage.find({ conversationId })
        .sort({ timestamp: -1 }) // ترتيب من الأحدث للأقدم
        .skip(skip)
        .limit(limit)
        .lean();
      
      // قلب الترتيب مرة أخرى ليعود إلى الأقدم للأحدث للعرض
      messages = messages.reverse();
      
      if (messages && messages.length > 0) {
        // تحديث حالة الرسائل الواردة إلى "مقروءة"
        if (page === 1) { // فقط نعلم بأن الرسائل مقروءة عند تحميل الصفحة الأولى
          await WhatsappMessage.updateMany(
            { conversationId, direction: 'incoming', status: { $ne: 'read' } },
            { $set: { status: 'read' } }
          );
        }
        
        // استخدام خدمة الوسائط لإضافة معلومات الوسائط لجميع الرسائل
        messagesWithMedia = await mediaService.processMessagesWithMedia(messages);
        
        // تخزين الرسائل مع معلومات الوسائط في التخزين المؤقت
        cacheService.setCachedMessages(conversationId, messagesWithMedia, page, limit);
      }
    }
    
    // في حالة عدم وجود رسائل
    if (!messagesWithMedia || messagesWithMedia.length === 0) {
      return res.render('crm/partials/_conversation_details_ajax', {
        layout: false,
        conversation,
        messages: [],
        user: req.user,
        triggerMessagesLoaded: true,
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalMessages: 0,
        }
      });
    }
    
    // حساب إجمالي عدد الصفحات
    const totalPages = Math.ceil(totalMessages / limit);

    // نعيد الـ Partial فقط (layout: false)
    return res.render('crm/partials/_conversation_details_ajax', {
      layout: false,
      conversation,
      messages: messagesWithMedia,
      user: req.user,
      triggerMessagesLoaded: true,
      pagination: {
        currentPage: page,
        totalPages,
        totalMessages,
      }
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
    // بناء معايير التصفية
    const filterOptions = {
      status: req.query.status || 'all'
    };
    
    // إضافة فلتر المستخدم المسند إليه إذا كان المستخدم ليس مشرفًا أو مديرًا
    if (req.user && req.user.user_role !== 'admin' && req.user.user_role !== 'supervisor') {
      filterOptions.assignedTo = req.user._id;
    }
    
    // خيارات التصفح
    const paginationOptions = {
      limit: 50,
      skipPagination: true,
      sort: { updatedAt: -1 }
    };
    
    // استخدام خدمة المحادثات للحصول على قائمة المحادثات
    const result = await conversationService.getConversationsList(
      filterOptions,
      paginationOptions,
      true,  // تضمين آخر رسالة
      true   // تضمين عدد الرسائل غير المقروءة
    );
    
    // إرجاع البيانات بصيغة JSON
    return res.json({
      success: true,
      conversations: result.conversations
    });
  } catch (err) {
    logger.error('conversationController', 'خطأ في listConversationsAjaxList', err);
    return res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ أثناء تحميل المحادثات' 
    });
  }
};
