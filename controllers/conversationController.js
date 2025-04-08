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
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const User = require('../models/User');
const WhatsappMedia = require('../models/WhatsappMedia');
const logger = require('../services/loggerService');
const socketService = require('../services/socketService');
const mediaService = require('../services/mediaService');
const conversationService = require('../services/conversationService');
const notificationSocketService = require('../services/notificationSocketService');
const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
const metaWhatsappService = require('../services/whatsapp/MetaWhatsappService');
const whatsappMediaController = require('./whatsappMediaController');
const ContactHelper = require('../utils/contactHelper');

/**
 * استخراج المنشنات من محتوى النص
 * @param {string} content محتوى النص
 * @returns {Array} قائمة بالمنشنات المستخرجة
 */
async function extractMentions(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  const mentions = [];
  const mentionRegex = /@(\w+)/g;
  let mentionMatch;
  
  // استخراج جميع المنشنات من النص
  while ((mentionMatch = mentionRegex.exec(content)) !== null) {
    const username = mentionMatch[1];
    
    // البحث عن المستخدم بواسطة اسم المستخدم
    const mentionedUser = await User.findOne({ 
      username: username,
      can_access_conversations: true,
      account_status: 'active'
    });
    
    if (mentionedUser) {
      mentions.push({
        user: mentionedUser._id,
        username: mentionedUser.username
      });
    }
  }
  
  return mentions;
}

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

    conversation.assignedTo = assignedTo && assignedTo.trim() ? assignedTo : null;
    conversation.assignedAt = assignedTo ? new Date() : null;
    conversation.assignedBy = assignedTo ? (req.user ? req.user._id : null) : null;
    await conversation.save();

    socketService.notifyConversationUpdate(conversationId, {
      type: 'assigned',
      assignedTo: assignedTo ? assignedTo : null,
      assignedBy: req.user?._id || null
    });

    // إرسال إشعارات لتغيير حالة المحادثة
    await notificationSocketService.updateConversationNotifications(conversationId, conversation);

    if (conversation.assignedTo && conversation.assignedTo.toString() !== (assignedTo || '')) {
      socketService.notifyUser(conversation.assignedTo, 'conversation_unassigned', {
        conversationId,
        unassignedBy: req.user ? req.user.full_name || req.user.username : 'مستخدم النظام'
      });
    }

    if (assignedTo) {
      socketService.notifyUser(assignedTo, 'conversation_assigned', {
        conversationId,
        assignedBy: req.user ? req.user.full_name || req.user.username : 'مستخدم النظام',
        customerName: conversation.customerName,
        phoneNumber: conversation.phoneNumber
      });
    }

    req.flash('success', assignedTo 
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
    const { noteContent, userId, username } = req.body;
    
    const mentions = await extractMentions(noteContent);

    // التأكد من وجود المحادثة
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'المحادثة غير موجودة' });
    }

    // عالج معلومات المُرسل
    let senderInfo = null;
    
    // 1. محاولة استخدام userId المرسل من العميل (إذا كان موجوداً وصحيحاً)
    if (userId) {
      // حالة خاصة: مستخدم النظام
      if (userId === 'system') {
        // حالة خاصة: مستخدم النظام، نتركه فارغاً ونضيف معلومات خاصة لاحقاً
        senderInfo = { username: username || 'مستخدم النظام' };
      } 
      else if (mongoose.Types.ObjectId.isValid(userId)) {
        // البحث عن المستخدم في قاعدة البيانات
        const user = await User.findById(userId);
        if (user) {
          senderInfo = {
            _id: user._id,
            username: user.username,
            full_name: user.full_name || user.username
          };
        }
      }
    }
    
    // 2. استخدام معلومات المستخدم الحالي من الجلسة كخيار ثاني
    if (!senderInfo && req.user) {
      senderInfo = {
        _id: req.user._id,
        username: req.user.username,
        full_name: req.user.full_name || req.user.username
      };
    }
    // 3. إنشاء وحفظ الملاحظة الداخلية
    const noteMsg = new WhatsappMessage({
      conversationId,
      direction: 'internal', 
      content: noteContent,
      timestamp: new Date(),
      status: 'note',
      mentions: mentions,
      // تخزين معرف المستخدم فقط في حقل sentBy (يجب أن يكون ObjectId)
      sentBy: (senderInfo && senderInfo._id && mongoose.Types.ObjectId.isValid(senderInfo._id)) ? senderInfo._id : null
    });
    
    // تخزين معلومات المرسل الكاملة في الحقل الوصفي metadata
    noteMsg.metadata = noteMsg.metadata || {};
    noteMsg.metadata.senderInfo = senderInfo;
    
    // 4. حفظ الملاحظة في قاعدة البيانات
    await noteMsg.save();
    
    // 5. تحديث وقت آخر رسالة للمحادثة
    conversation.lastMessageAt = new Date();
    await conversation.save();
    
    // 6. إنشاء نسخة كاملة من الملاحظة لإرسالها عبر Socket.io
    const noteWithSender = noteMsg.toObject();
    if (senderInfo) {
      noteWithSender.sentBy = senderInfo;
    }
    
    // 7. إرسال إشعار للمستخدمين الآخرين في غرفة المحادثة
    socketService.emitToRoom(`conversation-${conversationId}`, 'internal-note', noteWithSender);
    // 8. إرسال استجابة ناجحة
    res.json({
      success: true,
      message: 'تمت إضافة الملاحظة بنجاح',
      note: noteWithSender
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'خطأ في إضافة الملاحظة', message: error.message });
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

    // إرسال إشعارات لتغيير حالة المحادثة
    await notificationSocketService.updateConversationNotifications(conversationId, conversation);

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
    const { content, replyToMessageId, mediaId, mediaType, userId, username } = req.body;

       // التحقق من معلومات المستخدم المرسلة من العميل
    let senderInfo = null;
    if (userId) {
      // حالة خاصة: مستخدم النظام
      if (userId === 'system') {
        senderInfo = { username: username || 'مستخدم النظام' };
      } 
      else if (mongoose.Types.ObjectId.isValid(userId)) {
        try {
          // البحث عن المستخدم في قاعدة البيانات
          const user = await User.findById(userId);
          if (user) {
            senderInfo = {
              _id: user._id,
              username: user.username,
              full_name: user.full_name || user.username
            };
          } else {
            // لم يتم العثور على المستخدم - سجل تشخيصي
            // logger.warn('conversationController', 'تم إرسال معرف مستخدم صالح ولكن لم يتم العثور عليه', { userId });
          }
        } catch (err) {
          logger.error('conversationController', 'خطأ أثناء البحث عن المستخدم', { userId, error: err.message });
        }
      } else {
        // تم إرسال معرف غير صالح
        // logger.warn('conversationController', 'تم إرسال معرف مستخدم غير صالح', { userId });
      }
    }
    
    // استخدام معلومات المستخدم الحالي من الجلسة كخيار ثاني
    if (!senderInfo && req.user) {
      senderInfo = {
        _id: req.user._id,
        username: req.user.username,
        full_name: req.user.full_name || req.user.username
      };
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
        replyContext = {
          message_id: originalMessage.externalMessageId || replyToMessageId,
          from: originalMessage.metadata ? originalMessage.metadata.from : null
        };
      } else {
        // logger.warn('conversationController', 'لم يتم العثور على الرسالة الأصلية للرد', { replyToMessageId });
      }
    }

    const conversation = await Conversation.findById(conversationId).populate('channelId');
    if (!conversation) {
      if (isAjax) return res.json({ success: false, error: 'المحادثة غير موجودة' });
      req.flash('error', 'المحادثة غير موجودة');
      return res.redirect('/crm/conversations');
    }

    // === بداية: إضافة منطق التعيين التلقائي ===
    // التحقق مما إذا كانت المحادثة غير معينة والمستخدم لديه الصلاحية
    if (senderInfo && senderInfo._id && 
        (conversation.status !== 'assigned' || !conversation.assignedTo) && 
        req.user && req.user.can_access_conversations) {
      
      // لا نقوم بالتعيين التلقائي إذا كانت المحادثة مغلقة
      if (conversation.status !== 'closed') {
        // تعيين المحادثة للمستخدم الحالي
        conversation.assignedTo = req.user._id;
        conversation.status = 'assigned';
        // إرسال إشعار بالتعيين
        socketService.notifyConversationUpdate(conversationId, {
          type: 'assigned',
          status: 'assigned',
          assignedTo: req.user._id,
          assignedBy: req.user._id,
          autoAssigned: true
        });
      }
    }
    // === نهاية: إضافة منطق التعيين التلقائي ===

    // استخدام دالة createReplyMessage مباشرة إذا كان رداً على رسالة، وإلا createOutgoingMessage
    let msg;
    if (replyToMessageId) {
      msg = await WhatsappMessage.createReplyMessage(
        conversationId,
        content ? content.trim() : '',
        // التأكد من أن sentBy هو ObjectId صالح فقط
        senderInfo && senderInfo._id && mongoose.Types.ObjectId.isValid(senderInfo._id) ? senderInfo._id : null,
        replyToMessageId
      );
    } else {
      msg = new WhatsappMessage({
        conversationId,
        direction: 'outgoing',
        content: content ? content.trim() : '',
        timestamp: new Date(),
        // التأكد من أن sentBy هو ObjectId صالح فقط
        sentBy: senderInfo && senderInfo._id && mongoose.Types.ObjectId.isValid(senderInfo._id) ? senderInfo._id : null,
        status: 'sent',
        metadata: {
          senderInfo: senderInfo
        }
      });
      await msg.save();
    }

    // تحديث آخر رسالة
    conversation.lastMessageAt = new Date();
    conversation.lastMessage = content || (mediaId ? 'مرفق وسائط' : 'رسالة رد'); // تحديث النص ليعكس وجود وسائط
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
      if (!metaWhatsappService.initialized) {
        await metaWhatsappService.initialize();
      }

      // --- بداية: جلب phoneNumberId الصحيح --- 
      let phoneNumberId = null;
      if (conversation.channelId && conversation.channelId.settingsId) {
          const settings = await MetaWhatsappSettings.findById(conversation.channelId.settingsId).lean(); // استخدام lean لتحسين الأداء
          if (settings && settings.config && settings.config.phoneNumberId) {
              phoneNumberId = settings.config.phoneNumberId;
          } else {
               logger.warn('conversationController', 'لم يتم العثور على إعدادات أو phoneNumberId للقناة المرتبطة بالمحادثة', { 
                  conversationId: conversation._id, 
                  channelId: conversation.channelId._id,
                  settingsId: conversation.channelId.settingsId
               });
          }
      } else {
          logger.warn('conversationController', 'لم يتم العثور على channelId أو settingsId في المحادثة لجلب phoneNumberId', { conversationId: conversation._id });
      }

      // التحقق النهائي قبل الإرسال - مهم لمنع الإرسال عبر قناة خاطئة
      if (!phoneNumberId) {
          finalStatus = 'failed'; // تغيير الحالة إلى فشل
          const errorMsg = 'فشل في تحديد رقم هاتف الإرسال الصحيح للقناة المرتبطة بالمحادثة.';
          logger.error('conversationController', errorMsg, { conversationId: conversation._id });
          
          // تحديث حالة الرسالة في قاعدة البيانات
          msg.status = finalStatus;
          msg.metadata = { ...(msg.metadata || {}), failureReason: errorMsg };
          await msg.save();

          // إرسال خطأ للعميل
          if (isAjax) return res.json({ success: false, error: errorMsg });
          req.flash('error', errorMsg);
          return res.redirect(`/crm/conversations/${conversationId}`);
          // أو يمكنك رمي خطأ لإيقاف التنفيذ تماماً إذا كان هذا مناسباً أكثر
          // throw new Error(errorMsg); 
      }
      // --- نهاية: جلب phoneNumberId الصحيح ---
      
      let apiResponse;
      
      // التحقق من وجود وسائط
      if (mediaId && mediaType) {
        // جلب معلومات الوسائط
        // --- إزالة تعريف مكرر ---
        // const whatsappMediaController = require('./whatsappMediaController');
        // --- نهاية الإزالة ---
        
        const media = await WhatsappMedia.findById(mediaId);
        
        if (!media) {
          throw new Error('الوسائط غير موجودة');
        }
        // تحديث معرف الرسالة في سجل الوسائط
        await whatsappMediaController.updateMessageIdForMedia(mediaId, msg._id);
        
        // استخدام الدالة الموحدة لإرسال الوسائط (مع أو بدون رد)
        const options = {
          caption: content && content.trim() ? content.trim() : undefined, // إرسال caption فقط إذا كان هناك محتوى غير فارغ
          filename: mediaType === 'document' ? media.fileName : undefined
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
            
          } else {
            // في حالة عدم وجود معرف خارجي، نرسل رسالة عادية
            apiResponse = await metaWhatsappService.sendTextMessage(
              conversation.phoneNumber,
              content,
              phoneNumberId
            );
            // logger.warn('conversationController', 'تم تحويل الرد إلى رسالة عادية (المعرف الخارجي غير موجود)', {
            //   originalMessageId: replyToMessageId
            // });
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

    // --- تحضير كائن الرسالة الكامل للإشعار ---
    let messageForNotification = {
      _id: msg._id,
      conversationId,
      content: msg.content,
      direction: 'outgoing',
      timestamp: msg.timestamp,
      status: msg.status,
      externalMessageId: externalId || null,
      mediaType: mediaType || null,
      fileName: null, // سيتم تحميله أدناه إذا كان مستندًا
      fileSize: null, // سيتم تحميله أدناه إذا كان هناك وسائط
      sentBy: msg.sentBy ? msg.sentBy.toString() : null, // <-- إضافة sentBy
      metadata: msg.metadata || { senderInfo: {} } // <-- إضافة metadata (بما في ذلك senderInfo)
    };

    // تحميل معلومات الملف إذا كانت الرسالة وسائط
    if (mediaType) {
        const mediaInfo = await WhatsappMedia.findById(mediaId);
        if (mediaInfo) {
            messageForNotification.fileName = mediaType === 'document' ? mediaInfo.fileName : null;
            messageForNotification.fileSize = mediaInfo.fileSize;
        }
    }
    
    // --- نهاية تحضير كائن الرسالة ---

    // إشعار Socket.io - اعتماداً على ما إذا كانت رداً أو رسالة عادية
    if (replyToMessageId) {
      // --- تعديل: تمرير الكائن الكامل للردود أيضًا ---
      messageForNotification.replyToMessageId = externalReplyId || replyToMessageId; // إضافة معرف الرد
      socketService.notifyMessageReply(conversationId, messageForNotification, externalReplyId || replyToMessageId);
    } else {
      // --- تعديل: تمرير الكائن الكامل للرسائل الجديدة ---
      socketService.notifyNewMessage(conversationId, messageForNotification);
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

      } else {

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
    return res.status(500).json({ success: false, error: 'حدث خطأ أثناء إرسال التفاعل' });
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    let conversation;
    let totalMessages;
    let messages = [];

    conversation = await Conversation.findById(conversationId)
      .populate('channelId', 'name')
      .populate('assignedTo', 'username full_name')
      .populate('contactId', 'name phoneNumber')
      .lean();

    if (!conversation) {
      // استخدام logger للتحذير بدلاً من الاعتماد فقط على الاستجابة
      // logger.warn('conversationController', 'المحادثة غير موجودة في getConversationDetailsAjax', { conversationId });
      return res.status(404).send('<div class="alert alert-warning">المحادثة المطلوبة غير موجودة.</div>');
    }

    totalMessages = await WhatsappMessage.countDocuments({ conversationId });

    messages = await WhatsappMessage.find({ conversationId })
      .sort({ timestamp: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    messages = messages.reverse();

    // معالجة الوسائط مع التحقق من وجود الخدمة
    if (messages && messages.length > 0) {
      // التحقق من تعريف mediaService ووجود الدالة المطلوبة
      if (typeof mediaService !== 'undefined' && typeof mediaService.processMessagesWithMedia === 'function') {
        try {
          messages = await mediaService.processMessagesWithMedia(messages);
        } catch (mediaError) {
          // تسجيل خطأ معالجة الوسائط ولكن الاستمرار لعرض الرسائل النصية على الأقل
          logger.error('conversationController', 'خطأ أثناء معالجة الوسائط في getConversationDetailsAjax', {
            error: mediaError.message,
            stack: mediaError.stack,
            conversationId,
            page
          });
          // يمكنك هنا اختيار إرجاع خطأ 500 إذا كانت معالجة الوسائط ضرورية
          // return res.status(500).send('<div class="alert alert-danger">خطأ في معالجة مرفقات الرسائل.</div>');
        }
      } else {
        // تسجيل تحذير إذا كانت الخدمة غير معرفة
        // logger.warn('conversationController', 'mediaService أو processMessagesWithMedia غير معرفة في getConversationDetailsAjax');
      }
    }

    // التعامل مع حالة عدم وجود رسائل (خصوصًا للصفحات اللاحقة)
    if (!messages || messages.length === 0) {
      // إذا كانت الصفحة الأولى ولا توجد رسائل، أرجع القالب الفارغ
      if (page === 1) {
        return res.render('crm/partials/_conversation_details_ajax', {
          layout: false,
          conversation,
          messages: [],
          user: req.user,
          // triggerMessagesLoaded: true, // يمكن إزالته إذا لم يعد مستخدماً
          pagination: {
            currentPage: page,
            totalPages: 0,
            totalMessages: 0,
          }
        });
      } else {
        // إذا لم تكن الصفحة الأولى ولا توجد رسائل (نهاية المحادثة)، أرجع استجابة فارغة 200
        // هذا يمنع استبدال المحتوى الحالي بقالب فارغ عند الوصول لنهاية التمرير
        return res.status(200).send('');
      }
    }

    const totalPages = Math.ceil(totalMessages / limit);

    return res.render('crm/partials/_conversation_details_ajax', {
      layout: false,
      conversation,
      messages,
      user: req.user,
      // triggerMessagesLoaded: true, // يمكن إزالته إذا لم يعد مستخدماً
      pagination: {
        currentPage: page,
        totalPages,
        totalMessages,
      }
    });
  } catch (err) {
    // تحسين تسجيل الخطأ العام
    logger.error('conversationController', 'خطأ فادح في getConversationDetailsAjax', {
      error: err.message,
      stack: err.stack, // تضمين stack trace مهم للتشخيص
      conversationId: req.params.conversationId,
      page: req.query.page || 1,
      user: req.user ? req.user._id : 'N/A'
    });
    // إرجاع رسالة خطأ أوضح قليلاً للعميل
    return res.status(500).send('<div class="alert alert-danger">حدث خطأ غير متوقع أثناء تحميل تفاصيل المحادثة. يرجى المحاولة مرة أخرى.</div>');
  }
};

/**
 * 5) إرجاع قائمة المحادثات لتحديثها بواسطة AJAX
 */
exports.listConversationsAjaxList = async (req, res) => {
  try {
    const { status, assignment, search } = req.query;
    
    // بناء معايير التصفية
    const filterOptions = {};

    // 1. معالجة فلتر الحالة (مفتوحة/مغلقة)
    if (status && status !== 'all') {
      if (status === 'open') {
        // تشمل الحالات التي تعتبر مفتوحة
        filterOptions.status = { $nin: ['closed'] }; // استبعاد الحالات المغلقة
      } else if (status === 'closed') {
        filterOptions.status = 'closed';
      } else {
        // حالات محددة أخرى
        filterOptions.status = status;
      }
    }
    // لم نعد نضيف فلتر افتراضي للحالة، الآن سنعرض كل المحادثات عند عدم وجود فلتر محدد
    
    // 2. معالجة فلتر التعيين (الكل/محادثاتي/غير مسندة)
    if (assignment) {
      if (assignment === 'mine' && req.user && req.user._id) {
        // محادثاتي - المسندة للمستخدم الحالي
        filterOptions.assignedTo = req.user._id;
      } else if (assignment === 'unassigned') {
        // المحادثات غير المسندة
        filterOptions.assignedTo = null;
      }
      // 'all' - لا تضيف شرط فلترة
    }
    
    // 3. معالجة البحث النصي
    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      const regex = new RegExp(searchTerm, 'i'); // بحث غير حساس لحالة الأحرف

      filterOptions.$or = [
        { customerName: regex },
        { phoneNumber: regex }
        // يمكن إضافة حقول أخرى للبحث عند الحاجة
      ];
    }
    
    // إعداد خيارات التصفح
    const paginationOptions = {
      limit: 50,
      skipPagination: true,
      sort: { lastMessageAt: -1 } // الترتيب حسب آخر رسالة
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
    logger.error('conversationController', 'خطأ في تحميل المحادثات المفلترة', err);
    return res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ أثناء تحميل المحادثات' 
    });
  }
};

/**
 * إغلاق محادثة يدوياً بواسطة مستخدم
 */
exports.closeConversation = async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    const userId = req.user?._id; // افتراض أن middleware المصادقة يضع معلومات المستخدم في req.user
    const { reason, note } = req.body;

    if (!userId) {
      // logger.warn('conversationController', 'محاولة إغلاق محادثة بدون مصادقة', { conversationId });
      return res.status(401).json({ success: false, error: 'المصادقة مطلوبة' });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      // logger.warn('conversationController', 'المحادثة غير موجودة عند محاولة الإغلاق', { conversationId });
      return res.status(404).json({ success: false, error: 'المحادثة غير موجودة' });
    }

    // --- نقطة للتحقق من الصلاحيات --- 
    // هنا يمكنك إضافة منطق للتحقق مما إذا كان المستخدم الحالي (userId)
    // يمتلك الصلاحية لإغلاق هذه المحادثة (مثلاً، هل هو مشرف أو معين لهذه المحادثة؟)
    // if (!userHasPermissionToClose(userId, conversation)) {
    //   return res.status(403).json({ success: false, error: 'غير مصرح لك بإغلاق هذه المحادثة' });
    // }
    // -------

    const updatedConversation = await conversation.close(userId, reason, note);

    // إرسال إشعار بتحديث حالة المحادثة عبر Socket.io
    socketService.notifyConversationUpdate(conversationId, {
      _id: updatedConversation._id,
      status: updatedConversation.status,
      assignedTo: updatedConversation.assignedTo, // قد يكون null الآن
      // أضف أي حقول أخرى تحتاجها الواجهة الأمامية
    });

    // إرسال إشعارات لتغيير حالة المحادثة
    await notificationSocketService.updateConversationNotifications(conversationId, conversation);

    res.status(200).json({ success: true, conversation: updatedConversation });

  } catch (error) {
    logger.error('conversationController', 'خطأ في إغلاق المحادثة', { error, params: req.params, body: req.body });
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء إغلاق المحادثة' });
  }
};

/**
 * إعادة فتح محادثة يدوياً بواسطة مستخدم
 */
exports.reopenConversation = async (req, res) => {
  try {
    const conversationId = req.params.conversationId;
    const userId = req.user?._id; // افتراض أن middleware المصادقة يضع معلومات المستخدم في req.user

    if (!userId) {
      // logger.warn('conversationController', 'محاولة إعادة فتح محادثة بدون مصادقة', { conversationId });
      return res.status(401).json({ success: false, error: 'المصادقة مطلوبة' });
    }

    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      // logger.warn('conversationController', 'المحادثة غير موجودة عند محاولة إعادة الفتح', { conversationId });
      return res.status(404).json({ success: false, error: 'المحادثة غير موجودة' });
    }

    // --- نقطة للتحقق من الصلاحيات --- 
    // هنا يمكنك إضافة منطق للتحقق مما إذا كان المستخدم الحالي (userId)
    // يمتلك الصلاحية لإعادة فتح هذه المحادثة
    // if (!userHasPermissionToReopen(userId, conversation)) {
    //   return res.status(403).json({ success: false, error: 'غير مصرح لك بإعادة فتح هذه المحادثة' });
    // }
    // -------

    const updatedConversation = await conversation.reopen(userId);

    // إرسال إشعار بتحديث حالة المحادثة عبر Socket.io
    socketService.notifyConversationUpdate(conversationId, {
      _id: updatedConversation._id,
      status: updatedConversation.status,
      lastOpenedAt: updatedConversation.lastOpenedAt, // إرسال وقت الفتح الجديد
      // أضف أي حقول أخرى تحتاجها الواجهة الأمامية
    });

    // إرسال إشعارات لتغيير حالة المحادثة
    await notificationSocketService.updateConversationNotifications(conversationId, conversation);

    res.status(200).json({ success: true, conversation: updatedConversation });

  } catch (error) {
    logger.error('conversationController', 'خطأ في إعادة فتح المحادثة', { error, params: req.params });
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء إعادة فتح المحادثة' });
  }
};

/**
 * الحصول على قائمة المستخدمين المخولين للوصول إلى المحادثات
 */
exports.getConversationHandlers = async (req, res) => {
  try {
    // البحث عن جميع المستخدمين النشطين الذين يملكون صلاحية الوصول للمحادثات
    const handlers = await User.find({
      account_status: 'active',
      can_access_conversations: true
    })
    .select('_id username full_name')
    .sort({ full_name: 1 });
    
    return res.json({
      success: true,
      handlers: handlers.map(h => ({
        _id: h._id,
        username: h.username,
        full_name: h.full_name || h.username
      }))
    });
  } catch (error) {
    logger.error('conversationController', 'خطأ في جلب قائمة مستخدمي المحادثات', error);
    return res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ أثناء جلب قائمة المستخدمين' 
    });
  }
};

/**
 * API لتعيين المحادثة لمستخدم
 */
exports.assignConversationAPI = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.body;
    
    // التحقق من صلاحية المستخدم الحالي للعمليات على المحادثة
    if (!req.user || !req.user.can_access_conversations) {
      return res.status(403).json({
        success: false,
        error: 'لا تملك الصلاحيات اللازمة لتعيين المحادثات'
      });
    }

    // التحقق من وجود المحادثة
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ 
        success: false, 
        error: 'المحادثة غير موجودة' 
      });
    }
    
    // متغير لتخزين بيانات المستخدم المعين
    let assigneeData = null;
    
    // التعيين للمستخدم المحدد
    if (userId) {
      // التحقق من وجود المستخدم المعين
      const assignee = await User.findOne({ 
        _id: userId, 
        can_access_conversations: true,
        account_status: 'active'
      });
      
      if (!assignee) {
        return res.status(400).json({ 
          success: false, 
          error: 'المستخدم المحدد غير موجود أو لا يملك صلاحية الوصول للمحادثات' 
        });
      }
      
      // تخزين بيانات المستخدم المعين لاستخدامها لاحقاً
      assigneeData = {
        _id: assignee._id,
        username: assignee.username,
        full_name: assignee.full_name
      };
      
      // تحديث معلومات التعيين
      conversation.assignedTo = assignee._id;
      conversation.status = 'assigned';
    } else {
      // إلغاء التعيين
      conversation.assignedTo = null;
      conversation.status = 'open';
      assigneeData = null;
    }
    
    // تحديث معلومات الوقت والمستخدم الذي قام بالتعيين
    conversation.updatedAt = new Date();
    await conversation.save();
    
    // إرسال إشعار بالتحديث
    socketService.notifyConversationUpdate(conversationId, {
      type: 'assigned',
      status: conversation.status,
      assignedTo: conversation.assignedTo,
      assignedBy: req.user._id,
      assignee: assigneeData // إضافة بيانات المستخدم المعين المفصلة
    });
    
    // إرسال إشعارات لتغيير حالة المحادثة
    await notificationSocketService.updateConversationNotifications(conversationId, conversation);
    // استخدام الدالة المساعدة للحصول على اسم العميل المعروض
    const customerName = ContactHelper.getServerDisplayName(conversation);
    
    // إرسال إشعار شخصي للمستخدم الذي تم تعيينه
    if (userId) {
      socketService.notifyUser(userId, 'conversation_assigned', {
        conversationId,
        assignedBy: req.user.full_name || req.user.username,
        customerName: customerName,
        phoneNumber: conversation.phoneNumber,
        displayName: customerName
      });
    }
    
    // إرسال الاستجابة
    return res.json({
      success: true,
      message: userId ? 'تم تعيين المحادثة بنجاح' : 'تم إلغاء تعيين المحادثة بنجاح',
      conversation: {
        _id: conversation._id,
        status: conversation.status,
        assignedTo: conversation.assignedTo,
        assignee: assigneeData, // إضافة بيانات المستخدم المعين المفصلة للاستجابة
        displayName: customerName // إضافة الاسم المعروض للعميل
      }
    });
  } catch (error) {
    logger.error('conversationController', 'خطأ في تعيين المحادثة عبر API', error);
    return res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ أثناء محاولة تعيين المحادثة' 
    });
  }
};

/**
 * تعيين المحادثة للمستخدم الحالي (تعيين سريع)
 */
exports.assignToMe = async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // التحقق من وجود مستخدم مسجل
    if (!req.user || !req.user._id) {
      return res.status(403).json({ 
        success: false, 
        error: 'يجب تسجيل الدخول أولاً' 
      });
    }
    
    // التحقق من صلاحية المستخدم
    if (!req.user.can_access_conversations) {
      return res.status(403).json({ 
        success: false, 
        error: 'لا تملك الصلاحيات اللازمة للوصول للمحادثات' 
      });
    }
    
    // التحقق من وجود المحادثة
    const conversation = await Conversation.findById(conversationId)
      .populate('contactId', 'name phoneNumber');
    if (!conversation) {
      return res.status(404).json({ 
        success: false, 
        error: 'المحادثة غير موجودة' 
      });
    }
    
    // الحصول على اسم العميل المعروض باستخدام الدالة المساعدة
    const customerName = ContactHelper.getServerDisplayName(conversation);
    
    // تعيين المحادثة للمستخدم الحالي
    conversation.assignedTo = req.user._id;
    conversation.status = 'assigned';
    conversation.updatedAt = new Date();
    await conversation.save();
    
    // تجهيز بيانات المستخدم الحالي للإشعارات
    const assigneeData = {
      _id: req.user._id,
      username: req.user.username,
      full_name: req.user.full_name
    };
    
    // إرسال إشعار بالتحديث
    socketService.notifyConversationUpdate(conversationId, {
      type: 'assigned',
      status: conversation.status,
      assignedTo: conversation.assignedTo,
      assignedBy: req.user._id,
      assignee: assigneeData, // إضافة بيانات المستخدم الكاملة
      displayName: customerName // إضافة الاسم المعروض للعميل
    });
    
    // إرسال إشعارات لتغيير حالة المحادثة
    await notificationSocketService.updateConversationNotifications(conversationId, conversation);
    
    // إرسال الاستجابة
    return res.json({
      success: true,
      message: 'تم تعيين المحادثة لك بنجاح',
      conversation: {
        _id: conversation._id,
        status: conversation.status,
        assignedTo: conversation.assignedTo,
        assignee: assigneeData, // إضافة بيانات المستخدم المعين المفصلة للاستجابة
        displayName: customerName // إضافة الاسم المعروض للعميل
      }
    });
  } catch (error) {
    logger.error('conversationController', 'خطأ في تعيين المحادثة للمستخدم الحالي', error);
    return res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ أثناء محاولة تعيين المحادثة' 
    });
  }
};

/**
 * 5.1) إرجاع محادثة واحدة محدثة (للحل الاحتياطي في تحديثات السوكت)
 */
exports.getSingleConversationAjax = async (req, res) => {
  try {
    const conversationId = req.params.id;
    
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({ 
        success: false, 
        error: 'معرف المحادثة غير صالح' 
      });
    }

    // جلب المحادثة مع المعلومات الأساسية
    const conversation = await Conversation.findById(conversationId)
      .populate('assignedTo', 'username full_name')
      .populate('contactId', 'name phoneNumber') // إضافة معلومات جهة الاتصال
      .lean();
    
    if (!conversation) {
      return res.status(404).json({ 
        success: false, 
        error: 'المحادثة غير موجودة' 
      });
    }
    
    // استخدام الدالة المساعدة للحصول على الاسم المعروض
    const displayName = ContactHelper.getServerDisplayName(conversation);
    conversation.displayName = displayName;
    
    // جلب آخر رسالة
    const lastMessage = await WhatsappMessage.findOne({ conversationId })
      .sort({ timestamp: -1 })
      .lean();
    
    if (lastMessage) {
      conversation.lastMessage = lastMessage;
    }
    
    // حساب عدد الرسائل غير المقروءة
    const unreadCount = await WhatsappMessage.countDocuments({
      conversationId,
      direction: 'incoming',
      status: { $ne: 'read' }
    });
    
    conversation.unreadCount = unreadCount;
    
    return res.json({
      success: true,
      conversation
    });
    
  } catch (error) {
    logger.error('conversationController', 'خطأ في جلب محادثة واحدة', error);
    return res.status(500).json({ 
      success: false, 
      error: 'حدث خطأ أثناء جلب المحادثة' 
    });
  }
};

// إيجاد محادثة بواسطة المعرف
exports.getConversationById = async (req, res) => {
  try {
    const id = req.params.id;
    
    // البحث عن المحادثة مع بيانات جهة الاتصال
    const conversation = await Conversation.findById(id)
      .populate('contactId', 'name phoneNumber email company notes')
      .populate('assignedTo', 'username full_name');

    if (!conversation) {
      return res.status(404).json({
        message: 'المحادثة غير موجودة'
      });
    }

    // استخدام الدالة المساعدة للحصول على اسم العميل
    const customerDisplayName = ContactHelper.getServerDisplayName(conversation);
      
    // تجهيز البيانات للإرسال
    const conversationData = {
      _id: conversation._id,
      customerName: conversation.customerName,
      phoneNumber: conversation.phoneNumber,
      displayName: customerDisplayName,  // إضافة الاسم المعروض الموحد
      contactId: conversation.contactId,
      channelId: conversation.channelId,
      status: conversation.status,
      assignedTo: conversation.assignedTo,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt
    };
      
    return res.status(200).json(conversationData);
  } catch (error) {
    logger.error('conversationController', 'خطأ في getConversationById', { error, id: req.params.id });
    return res.status(500).json({
      message: 'حدث خطأ أثناء البحث عن المحادثة',
      error: error.message
    });
  }
};

/**
 * جلب المحادثات مجمعة حسب الحالة
 */
exports.getGroupedConversations = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const { userId } = req;
    
    // تحديد شروط البحث
    const assignedCondition = userId ? { assignedTo: userId } : {};
    
    // جلب المحادثات المفتوحة
    const openConversations = await Conversation.find({
      status: 'open',
      ...assignedCondition
    })
    .populate('contactId', 'name phoneNumber')
    .populate('assignedTo', 'username full_name')
    .sort({ lastMessageAt: -1 })
    .limit(limit)
    .lean();
    
    // جلب المحادثات المسندة
    const assignedConversations = await Conversation.find({
      status: 'assigned',
      ...assignedCondition
    })
    .populate('contactId', 'name phoneNumber')
    .populate('assignedTo', 'username full_name')
    .sort({ lastMessageAt: -1 })
    .limit(limit)
    .lean();
    
    // جلب المحادثات المغلقة
    const closedConversations = await Conversation.find({
      status: 'closed',
      ...assignedCondition
    })
    .populate('contactId', 'name phoneNumber')
    .populate('assignedTo', 'username full_name')
    .sort({ lastMessageAt: -1 })
    .limit(limit)
    .lean();
    
    // إضافة الاسم المعروض لكل محادثة
    const processedOpenConversations = openConversations.map(conv => ({
      ...conv,
      displayName: ContactHelper.getServerDisplayName(conv)
    }));
    
    const processedAssignedConversations = assignedConversations.map(conv => ({
      ...conv,
      displayName: ContactHelper.getServerDisplayName(conv)
    }));
    
    const processedClosedConversations = closedConversations.map(conv => ({
      ...conv,
      displayName: ContactHelper.getServerDisplayName(conv)
    }));
    
    res.json({
      open: processedOpenConversations,
      assigned: processedAssignedConversations,
      closed: processedClosedConversations
    });
  } catch (error) {
    logger.error('conversationController', 'خطأ في getGroupedConversations', { error });
    res.status(500).json({
      message: 'حدث خطأ أثناء استرجاع المحادثات المجمعة',
      error: error.message
    });
  }
};

/**
 * استرجاع محادثة واحدة مع تفاصيلها
 */
exports.getConversation = async (req, res) => {
  try {
    const conversationId = req.params.id;
    
    // استرجاع المحادثة مع معلومات المستخدم المعين
    let conversation = await Conversation.findById(conversationId)
      .populate('assignedTo', 'username full_name')
      .populate('contactId', 'name phoneNumber email company notes')
      .lean();
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'المحادثة غير موجودة'
      });
    }
    
    // التأكد من ربط المحادثة بجهة الاتصال إذا كانت موجودة
    if (!conversation.contactId) {
      const conversationDoc = await Conversation.findById(conversationId);
      await ensureContactLinked(conversationDoc);
      
      // إعادة استرجاع المحادثة بعد التحديث
      conversation = await Conversation.findById(conversationId)
        .populate('assignedTo', 'username full_name')
        .populate('contactId', 'name phoneNumber email company notes')
        .lean();
    }
    
    // استخدام الدالة المساعدة للحصول على الاسم المعروض
    conversation.displayName = ContactHelper.getServerDisplayName(conversation);
    
    // استرجاع آخر 50 رسالة في المحادثة
    const messages = await WhatsappMessage.find({ conversationId: conversationId })
      .sort({ timestamp: -1 })
      .limit(50)
      .populate('sentBy', 'username full_name')
      .lean();
    
    // قلب ترتيب الرسائل لتكون الأقدم أولاً
    messages.reverse();
    
    // تحديث محادثات المستخدم النشطة في الجلسة إذا كانت موجودة
    if (req.session.activeConversations) {
      if (!req.session.activeConversations.includes(conversationId)) {
        req.session.activeConversations.push(conversationId);
      }
    } else {
      req.session.activeConversations = [conversationId];
    }
    
    res.json({
      success: true,
      conversation,
      messages
    });
  } catch (error) {
    logger.error('conversationController', 'خطأ في استرجاع المحادثة', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء استرجاع المحادثة',
      error: error.message
    });
  }
};

/**
 * دالة مساعدة للبحث عن جهة اتصال وربطها بالمحادثة إذا لم تكن مرتبطة
 * @param {Object} conversation - كائن المحادثة
 * @returns {Promise<Object>} - المحادثة بعد التحديث
 */
async function ensureContactLinked(conversation) {
  try {
    // إذا كانت المحادثة مرتبطة بالفعل بجهة اتصال، لا تفعل شيئًا
    if (conversation.contactId) {
      return conversation;
    }

    // البحث عن جهة اتصال بنفس رقم الهاتف
    const Contact = require('../models/Contact');
    const contact = await Contact.findByPhoneNumber(conversation.phoneNumber);

    // إذا تم العثور على جهة اتصال، قم بربطها بالمحادثة
    if (contact) {
      conversation.contactId = contact._id;
      await conversation.save();
    }

    return conversation;
  } catch (error) {
    logger.error('conversationController', 'خطأ في ربط المحادثة بجهة الاتصال', {
      error: error.message,
      conversationId: conversation._id
    });
    return conversation;
  }
}

/**
 * عرض صفحة المحادثات
 */
exports.showConversationsAjax = async (req, res) => {
  try {
    const { status, assignment, search, selected } = req.query;
    const { user } = req;

    let statusFilter = status || 'open';
    let assignmentFilter = assignment || 'all';
    
    if (!['open', 'closed', 'all'].includes(statusFilter)) {
      statusFilter = 'open';
    }
    
    if (!['all', 'mine', 'unassigned'].includes(assignmentFilter)) {
      assignmentFilter = 'all';
    }
    
    // إعداد تصفية حسب الحالة
    const filter = {};
    if (statusFilter !== 'all') {
      filter.status = statusFilter;
    }
    
    // إعداد تصفية حسب التعيين
    if (assignmentFilter === 'mine' && user) {
      filter.assignedTo = user._id;
    } else if (assignmentFilter === 'unassigned') {
      filter.assignedTo = null;
    }
    
    // إضافة تصفية البحث إذا تم تقديمها
    if (search) {
      filter.$or = [
        { phoneNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        // إضافة البحث في جهات الاتصال المرتبطة (تتم بشكل منفصل)
      ];
    }
    
    // الصفحة
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;
    
    // استرجاع المحادثات
    let conversations = await Conversation.find(filter)
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('assignedTo', 'username full_name')
      .populate('contactId', 'name phoneNumber')  // تحميل معلومات جهة الاتصال المرتبطة
      .lean();
    
    // إضافة اسم العرض الموحد لكل محادثة
    conversations = conversations.map(conv => ({
      ...conv,
      displayName: ContactHelper.getServerDisplayName(conv)
    }));
    
    // تنفيذ البحث في جهات الاتصال بشكل منفصل إذا تم تقديم البحث
    if (search) {
      const Contact = require('../models/Contact');
      const matchingContacts = await Contact.find({
        name: { $regex: search, $options: 'i' }
      }).select('phoneNumber').lean();
      
      // تضمين محادثات جهات الاتصال المطابقة
      if (matchingContacts.length > 0) {
        const phoneNumbers = matchingContacts.map(c => c.phoneNumber);
        
        const additionalConversations = await Conversation.find({
          phoneNumber: { $in: phoneNumbers },
          ...filter
        })
          .sort({ lastMessageAt: -1 })
          .populate('assignedTo', 'username full_name')
          .populate('contactId', 'name phoneNumber')
          .lean();
        
        // إضافة اسم العرض الموحد للمحادثات الإضافية
        const processedAdditionalConvs = additionalConversations.map(conv => ({
          ...conv,
          displayName: ContactHelper.getServerDisplayName(conv)
        }));
        
        // دمج النتائج وإزالة التكرار
        const allConversations = [...conversations, ...processedAdditionalConvs];
        const uniqueConversations = Array.from(
          new Map(allConversations.map(conv => [conv._id.toString(), conv])).values()
        );
        
        // إعادة الترتيب حسب آخر رسالة
        uniqueConversations.sort((a, b) => 
          new Date(b.lastMessageAt || b.updatedAt) - new Date(a.lastMessageAt || a.updatedAt)
        );
        
        conversations = uniqueConversations.slice(0, limit);
      }
    }
    
    // عرض الصفحة مع المحادثات
    res.render('crm/conversations_split_ajax', {
      title: 'المحادثات',
      conversations,
      user,
      search,
      status: statusFilter,
      assignment: assignmentFilter,
      selectedId: selected,
      flashMessages: req.flash()
    });
  } catch (error) {
    logger.error('conversationController', 'خطأ في عرض صفحة المحادثات', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء عرض صفحة المحادثات' });
  }
};
