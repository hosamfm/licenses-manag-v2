/**
 * خدمة الإشعارات الفورية باستخدام Socket.io
 * 
 * ملاحظات هامة حول نظام الرسائل:
 * 1. نظام الإرسال يعتمد على HTTP للإرسال الفعلي للرسائل الجديدة والردود والتفاعلات.
 * 2. Socket.io يستخدم فقط للإشعارات والتحديثات المباشرة.
 * 3. المسارات الرئيسية للإرسال:
 *    - الرسائل الجديدة: POST /crm/conversations/:conversationId
 *    - الردود: POST /crm/conversations/:conversationId/reply
 *    - التفاعلات: POST /crm/conversations/:conversationId/reaction
 */
const socketIO = require('socket.io');
const logger = require('./loggerService');

let io;

/**
 * بدء تشغيل خدمة Socket.io
 * @param {Object} server - خادم HTTP
 */
function initialize(server) {
  io = socketIO(server, {
    cors: {
      origin: '*', // في البيئة الإنتاجية، يجب تحديد أصول محددة فقط
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', async (socket) => {
    try {
      // استخراج معلومات المستخدم من الجلسة
      if (socket.handshake.session && socket.handshake.session.userId) {
        // هناك معرف مستخدم في الجلسة - استخراج بيانات المستخدم من قاعدة البيانات
        const User = require('../models/User');
        const userId = socket.handshake.session.userId;
        
        try {
          const user = await User.findById(userId);
          if (user) {
            socket.userId = user._id.toString();
            socket.username = user.username;
            socket.userRole = user.user_role;
            
            // --- إضافة إرسال الحدث userId-set للإعلام عن تعيين userId ---
            socket.emit('userId-set', { userId: socket.userId, userRole: socket.userRole, username: socket.username });
            
            // *** الأهم: إرسال أيضًا لنفس الاتصال حتى تتلقاه خدمة الإشعارات ***
            socket.emit('userId-set', { 
                userId: socket.userId, 
                userRole: socket.userRole, 
                username: socket.username,
                shouldJoinNotifications: true // علامة للانضمام لغرفة الإشعارات
            });
            
            /* logger.info('socketService', 'اتصال جديد بواسطة Socket.io مع معلومات المستخدم من الجلسة', { 
              socketId: socket.id, 
              userId: socket.userId, 
              username: socket.username, 
              userRole: socket.userRole
            }); */
          } else {
            /* logger.warning('socketService', 'لم يتم العثور على المستخدم رغم وجود معرف في الجلسة', { 
              socketId: socket.id, 
              sessionUserId: socket.handshake.session.userId 
            }); */
          }
        } catch (err) {
          logger.error('socketService', 'خطأ في استخراج بيانات المستخدم من قاعدة البيانات', { 
            socketId: socket.id, 
            sessionUserId: socket.handshake.session.userId,
            error: err.message 
          });
        }
      } 
      // استخدام معلومات المستخدم من بيانات المصادقة إذا لم تكن متوفرة في الجلسة
      else if (socket.handshake.auth && socket.handshake.auth.userId && socket.handshake.auth.userId !== 'guest') {
        socket.userId = socket.handshake.auth.userId;
        socket.username = socket.handshake.auth.username;
        
        // --- إضافة إرسال الحدث userId-set لهذه الحالة أيضًا ---
        socket.emit('userId-set', { 
            userId: socket.userId, 
            username: socket.username,
            shouldJoinNotifications: true // علامة للانضمام لغرفة الإشعارات
        });
        
        /* logger.info('socketService', 'اتصال جديد بواسطة Socket.io مع معلومات المستخدم من بيانات المصادقة', { 
          socketId: socket.id, 
          userId: socket.userId, 
          username: socket.username 
        }); */
      } else {
        // لا توجد معلومات مستخدم متاحة
        socket.userId = 'guest';
        socket.username = 'زائر';
        
        /* logger.info('socketService', 'اتصال جديد بواسطة Socket.io بدون معلومات المستخدم', { 
          socketId: socket.id,
          source: socket.handshake.headers.referer || 'غير معروف'
        }); */
      }
    } catch (error) {
      logger.error('socketService', 'خطأ في معالجة معلومات المستخدم عند الاتصال', { 
        socketId: socket.id, 
        error: error.message 
      });
      
      // استخدام قيم افتراضية في حالة حدوث خطأ
      socket.userId = 'guest';
      socket.username = 'زائر';
    }

    // الانضمام لغرفة المستخدم
    socket.on('join-user-room', (userId) => {
      if (userId) {
        socket.join(`user-${userId}`);
        /* logger.info('socketService', 'انضمام المستخدم إلى غرفته الخاصة', { userId, socketId: socket.id }); */
      }
    });

    // الانضمام لغرفة - أمر عام (تنسيق جديد)
    socket.on('join', (data) => {
      if (data && data.room) {
        socket.join(data.room);
        /* logger.info('socketService', 'انضمام إلى غرفة', { room: data.room, socketId: socket.id }); */
      }
    });

    // مغادرة غرفة - أمر عام (تنسيق جديد)
    socket.on('leave', (data) => {
      if (data && data.room) {
        socket.leave(data.room);
        /* logger.info('socketService', 'مغادرة غرفة', { room: data.room, socketId: socket.id }); */
      }
    });

    // الانضمام لغرفة المحادثة (تنسيق قديم للتوافق)
    socket.on('join-conversation', (conversationId) => {
      if (conversationId) {
        socket.join(`conversation-${conversationId}`);
        /* logger.info('socketService', 'انضمام إلى غرفة المحادثة', { conversationId, socketId: socket.id }); */
      }
    });

    // مغادرة غرفة المحادثة (تنسيق قديم للتوافق)
    socket.on('leave-conversation', (conversationId) => {
      if (conversationId) {
        socket.leave(`conversation-${conversationId}`);
        /* logger.info('socketService', 'مغادرة غرفة المحادثة', { conversationId, socketId: socket.id }); */
      }
    });

    socket.on('disconnect', () => {
      /* logger.info('socketService', 'انقطع الاتصال', { socketId: socket.id }); */
    });

    // استقبال إشعار بتحديث حالة الرسائل إلى "مقروءة"
    socket.on('mark-messages-read', async (data) => {
      if (!data || !data.conversationId || !data.messages || !Array.isArray(data.messages)) {
        return logger.warn('socketService', 'بيانات غير صالحة لتحديث حالة القراءة', { data });
      }
      
      try {
        // استدعاء وظيفة تحديث حالة القراءة
        await updateMessagesReadStatus(data.conversationId, data.messages, data.timestamp || new Date());
        
        // إشعار المستخدمين الآخرين بتحديث حالة الرسائل
        socket.to(`conversation-${data.conversationId}`).emit('messages-read-update', {
          conversationId: data.conversationId,
          messages: data.messages,
          timestamp: data.timestamp || new Date()
        });
        
        /* logger.info('socketService', 'تم استلام طلب تحديث حالة القراءة للرسائل', { 
          conversationId: data.conversationId,
          messagesCount: data.messages.length
        }); */
      } catch (error) {
        logger.error('socketService', 'خطأ في تحديث حالة قراءة الرسائل', { 
          error: error.message,
          conversationId: data.conversationId
        });
      }
    });

    // استقبال إشعار برسالة جديدة من العميل وإعادة بثه لبقية المستخدمين
    // ملاحظة هامة: هذا المعالج للإشعارات فقط وليس للإرسال الفعلي للرسائل الجديدة
    // الإرسال الفعلي للرسائل يتم عبر طلب HTTP إلى /crm/conversations/:conversationId/reply
    socket.on('new-message', (message) => {
      if (!io) {
        return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
      }
      
      // التأكد من أن كافة معلومات الوسائط متوفرة إذا كانت الرسالة تحتوي على وسائط
      if (message && message.mediaType) {
        /* logger.info('socketService', 'إعادة بث إشعار برسالة جديدة مع وسائط', { 
          conversationId: message.conversationId, 
          mediaType: message.mediaType,
          messageId: message._id
        }); */
      }
      
      io.to(`conversation-${message.conversationId}`).emit('new-message', message);
      /* logger.info('socketService', 'تم إعادة بث إشعار برسالة جديدة', { conversationId: message.conversationId }); */
    });
  });

  /* logger.info('socketService', 'تم تهيئة خدمة Socket.io'); */
  return io;
}

/**
 * إرسال تحديث برسالة جديدة إلى غرفة المحادثة
 * هذه الدالة تستخدم لتحديث واجهة المستخدم فوراً عند استلام رسالة جديدة
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} message - الرسالة الجديدة
 */
async function notifyNewMessage(conversationId, message) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }
  
  try {
    // --- جلب معلومات contactId للمحادثة إذا لم تكن موجودة بالفعل ---
    // تستخدم عند إرسال رسائل جديدة لتأكيد توفر معلومات جهة الاتصال الكاملة للواجهة الأمامية
    if (message && message.conversationId) {
      const Conversation = require('../models/Conversation');
      const conversation = await Conversation.findById(message.conversationId)
        .populate('contactId', 'name phoneNumber')
        .lean();
        
      if (conversation && conversation.contactId) {
        // إنشاء تحديث المحادثة بمعلومات جهة الاتصال
        const updateData = {
          _id: conversation._id,
          lastMessageAt: conversation.lastMessageAt,
          status: conversation.status,
          contactId: conversation.contactId, // إضافة معلومات جهة الاتصال الكاملة
          phoneNumber: conversation.phoneNumber,
          lastMessage: message // إضافة الرسالة الأخيرة
        };
        
        // إرسال تحديث للمحادثة بعد الرسالة الجديدة لضمان تحديث معلومات جهة الاتصال
        io.to(`conversation-${conversationId}`).emit('conversation-update', updateData);
        
        // إرسال تحديث لقائمة المحادثات أيضًا
        io.emit('conversation-list-update', updateData);
      }
    }
      
    // --- التأكد من إضافة معلومات المرسل للرسائل الصادرة --- 
    if (message && message.direction === 'outgoing' && message.sentBy) {
      // تأكد من أن sentBy هو سلسلة نصية
      const senderId = message.sentBy.toString();
      
      // تهيئة metadata إذا لم تكن موجودة
      if (!message.metadata) {
        message.metadata = {};
      }
      // تهيئة senderInfo إذا لم تكن موجودة
      if (!message.metadata.senderInfo) {
        message.metadata.senderInfo = {}; 
      }

      try {
        // التحقق إذا كان النظام هو المرسل
        if (senderId === 'system') {
          message.metadata.senderInfo.username = 'النظام';
          message.metadata.senderInfo.full_name = 'النظام';
          message.sentByUsername = 'النظام';
        } 
        // التحقق إذا كان المستخدم الحالي هو المرسل (من الخادم)
        else {
          const User = require('../models/User');
          const user = await User.findById(senderId);
          if (user) {
            message.metadata.senderInfo.username = user.username;
            message.metadata.senderInfo.full_name = user.full_name || user.username;
            message.metadata.senderInfo._id = user._id.toString();
            message.sentByUsername = user.username;
          } else {
            // في حالة عدم العثور على المستخدم، استخدم المعرف
            message.metadata.senderInfo.username = senderId;
            message.metadata.senderInfo.full_name = senderId;
            message.metadata.senderInfo._id = senderId;
            message.sentByUsername = senderId;
          }
        }
      } catch (error) {
        logger.error('socketService', 'خطأ في استرجاع معلومات المرسل لإشعار Socket.IO', { 
          conversationId, 
          senderId: message.sentBy.toString(),
          error: error.message
        });
        // محاولة استخدام قيمة افتراضية في حالة الخطأ
        if (!message.sentByUsername) message.sentByUsername = senderId; 
        if (!message.metadata.senderInfo.username) message.metadata.senderInfo.username = senderId;
      }
    }
    
    // إرسال التحديث إلى جميع المستخدمين في غرفة المحادثة
    io.to(`conversation-${conversationId}`).emit('new-message', message);
  } catch (error) {
    logger.error('socketService', 'خطأ في إرسال إشعار برسالة جديدة', { 
      conversationId, 
      error: error.message
    });
  }
}

/**
 * إرسال إشعار برسالة جديدة إلى غرفة المحادثة
 * ملاحظة: هذه الدالة للإشعارات فقط وليس لإرسال الرسالة نفسها
 * يتم استدعاء هذه الدالة من متحكم conversationController بعد حفظ الرسالة في قاعدة البيانات
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} update - بيانات التحديث
 */
async function notifyConversationUpdate(conversationId, update) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }

  // التأكد من أن conversationId هو سلسلة نصية
  if (conversationId && typeof conversationId === 'object') {
    conversationId = conversationId.toString();
  }

  try {
    // إذا لم تكن هناك معلومات contactId في التحديث، نقوم بجلبها من قاعدة البيانات
    if (update._id && !update.contactId) {
      const Conversation = require('../models/Conversation');
      const conversation = await Conversation.findById(update._id)
        .populate('contactId', 'name phoneNumber')
        .lean();
        
      if (conversation && conversation.contactId) {
        update.contactId = conversation.contactId;
      }
    }
    
    // إذا كان التحديث متعلق بتعيين المحادثة لمستخدم، وكانت بيانات المستخدم المعين غير كاملة
    if (update.type === 'assigned' && update.assignedTo && !update.assignee) {
      try {
        // استرجاع معلومات المستخدم المعين من قاعدة البيانات
        const User = require('../models/User');
        const assignee = await User.findById(update.assignedTo).select('_id username full_name');
        
        if (assignee) {
          // إضافة معلومات المستخدم المعين إلى التحديث
          update.assignee = {
            _id: assignee._id,
            username: assignee.username,
            full_name: assignee.full_name
          };
        }
      } catch (error) {
        logger.error('socketService', 'خطأ في استرجاع معلومات المستخدم المعين لتحديث المحادثة', {
          conversationId,
          assignedTo: update.assignedTo,
          error: error.message
        });
      }
    }
    
    // إذا كان التحديث متعلق بتغيير حالة المحادثة (مفتوحة/مغلقة) ولم يتم تحديد نوع التحديث
    if (!update.type && update.status) {
      // إضافة نوع التحديث للتعرف عليه من طرف المستقبل
      update.type = 'status';
    }
    
    // إرسال التحديث إلى غرفة المحادثة
    io.to(`conversation-${conversationId}`).emit('conversation-update', update);
    
    // إرسال التحديث لجميع المستخدمين - مهم لتحديث القائمة
    // استخدام حدث منفصل مع المعلومات المطلوبة فقط
    const updateForList = {
      _id: update._id,
      status: update.status,
      lastMessageAt: update.lastMessageAt,
      unreadCount: update.unreadCount,
      lastMessage: update.lastMessage,
      customerName: update.customerName,
      phoneNumber: update.phoneNumber,
      assignedTo: update.assignedTo,
      // إضافة معلومات المستخدم المعين إلى تحديث القائمة
      assignee: update.assignee,
      // إضافة معلومات جهة الاتصال إذا كانت موجودة
      contactId: update.contactId
    };
    
    // إرسال التحديث للجميع
    io.emit('conversation-list-update', updateForList);
    
    /* logger.info('socketService', 'تم إرسال إشعار بتحديث المحادثة', { 
      conversationId,
      updateType: update.type || 'غير محدد',
      updateFields: Object.keys(update).join(', ')
    }); */
  } catch (error) {
    logger.error('socketService', 'خطأ في تحديث المحادثة', { 
      conversationId,
      error: error.message
    });
  }
}

/**
 * إرسال إشعار بتحديث حالة الرسالة
 * @param {String} conversationId - معرف المحادثة
 * @param {String} externalId - المعرف الخارجي للرسالة
 * @param {String} status - الحالة الجديدة
 */
function notifyMessageStatusUpdate(conversationId, externalId, status) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }

  if (!externalId) {
    return logger.warn('socketService', 'محاولة تحديث حالة رسالة بدون معرف خارجي', { 
      conversationId, 
      status 
    });
  }

  const data = { 
    externalId, 
    status, 
    conversationId 
  };

  io.to(`conversation-${conversationId}`).emit('message-status-update', data);
  
  /* logger.info('socketService', 'تم إرسال إشعار بتحديث حالة الرسالة', { 
    conversationId, 
    externalId, 
    status,
    dataObject: JSON.stringify(data)
  }); */
}

/**
 * إرسال إشعار شخصي لمستخدم معين
 * @param {String} userId - معرف المستخدم
 * @param {String} type - نوع الإشعار
 * @param {Object} data - بيانات الإشعار
 */
function notifyUser(userId, type, data) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }
  io.to(`user-${userId}`).emit('user-notification', { type, data });
  /* logger.info('socketService', 'تم إرسال إشعار للمستخدم', { userId, type }); */
}

/**
 * إرسال إشعار عام للجميع
 * @param {String} type - نوع الإشعار
 * @param {Object} data - بيانات الإشعار
 */
function broadcastNotification(type, data) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }
  io.emit(type, data);
  /* logger.info('socketService', 'تم إرسال إشعار عام', { type }); */
}

/**
 * إرسال إشعار إلى غرفة محددة
 * @param {String} roomName - اسم الغرفة
 * @param {String} eventName - اسم الحدث
 * @param {Object} data - بيانات الإشعار
 */
function emitToRoom(roomName, eventName, data) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }
  io.to(`${roomName}`).emit(eventName, data);
  /* logger.info('socketService', 'تم إرسال إشعار إلى غرفة محددة', { roomName, eventName }); */
}

/**
 * إرسال إشعار بربط معرف داخلي للرسالة بمعرف خارجي من واتساب
 * هذه الدالة تستخدم لتحديث الرسائل الصادرة عندما نتلقى معرف خارجي من واتساب بعد الإرسال
 * @param {String} conversationId - معرف المحادثة
 * @param {String} messageId - معرف الرسالة في قاعدة البيانات
 * @param {String} externalId - المعرف الخارجي من واتساب
 */
function notifyMessageExternalIdUpdate(conversationId, messageId, externalId) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }
  
  if (!conversationId || !messageId || !externalId) {
    return logger.warn('socketService', 'معلومات غير كاملة لتحديث معرف خارجي', { conversationId, messageId, externalId });
  }
  
  io.to(`conversation-${conversationId}`).emit('message-external-id-update', { 
    messageId, 
    externalId, 
    conversationId 
  });
  
  /* logger.info('socketService', 'تم إرسال إشعار بتحديث معرف خارجي للرسالة', { conversationId, messageId, externalId }); */
}

/**
 * إرسال تحديث بتفاعل على رسالة
 * @param {String} conversationId - معرف المحادثة
 * @param {String} externalId - المعرف الخارجي للرسالة
 * @param {Object} reaction - بيانات التفاعل
 */
function notifyMessageReaction(conversationId, externalId, reaction) {
    if (!io) {
        return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
    }

    if (!externalId) {
        return logger.warn('socketService', 'محاولة إرسال تفاعل لرسالة بدون معرف خارجي', { 
            conversationId, 
            reaction 
        });
    }

    io.to(`conversation-${conversationId}`).emit('message-reaction', { 
        externalId, 
        reaction, 
        conversationId 
    });
    
    /* logger.info('socketService', 'تم إرسال تحديث بتفاعل على رسالة', { 
        conversationId, 
        externalId,
        senderName: reaction.senderName 
    }); */
}

/**
 * إرسال تحديث برد على رسالة إلى غرفة المحادثة
 * هذه الدالة تستخدم لتحديث واجهة المستخدم فوراً عند وجود رد على رسالة
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} message - الرسالة (الرد)
 * @param {String} originalMessageId - معرف الرسالة الأصلية التي تم الرد عليها
 */
async function notifyMessageReply(conversationId, message, originalMessageId) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }
  
  try {
    // --- جلب معلومات contactId للمحادثة إذا لم تكن موجودة بالفعل ---
    // تستخدم عند إرسال رسائل جديدة لتأكيد توفر معلومات جهة الاتصال الكاملة للواجهة الأمامية
    if (message && message.conversationId) {
      const Conversation = require('../models/Conversation');
      const conversation = await Conversation.findById(message.conversationId)
        .populate('contactId', 'name phoneNumber')
        .lean();
        
      if (conversation && conversation.contactId) {
        // إنشاء تحديث المحادثة بمعلومات جهة الاتصال
        const updateData = {
          _id: conversation._id,
          lastMessageAt: conversation.lastMessageAt,
          status: conversation.status,
          contactId: conversation.contactId, // إضافة معلومات جهة الاتصال الكاملة
          phoneNumber: conversation.phoneNumber,
          lastMessage: message // إضافة الرسالة الأخيرة
        };
        
        // إرسال تحديث للمحادثة بعد الرسالة الجديدة لضمان تحديث معلومات جهة الاتصال
        io.to(`conversation-${conversationId}`).emit('conversation-update', updateData);
        
        // إرسال تحديث لقائمة المحادثات أيضًا
        io.emit('conversation-list-update', updateData);
      }
    }
    
    // --- التأكد من إضافة معلومات المرسل للرسائل الصادرة --- 
    if (message && message.direction === 'outgoing' && message.sentBy) {
      // نفس منطق notifyNewMessage
      const senderId = message.sentBy.toString();
      
      if (!message.metadata) {
        message.metadata = {};
      }
      if (!message.metadata.senderInfo) {
        message.metadata.senderInfo = {}; 
      }

      try {
        // التحقق إذا كان النظام هو المرسل
        if (senderId === 'system') {
          message.metadata.senderInfo.username = 'النظام';
          message.metadata.senderInfo.full_name = 'النظام';
          message.sentByUsername = 'النظام';
        } else {
          const User = require('../models/User');
          const user = await User.findById(senderId);
          if (user) {
            message.metadata.senderInfo.username = user.username;
            message.metadata.senderInfo.full_name = user.full_name || user.username;
            message.metadata.senderInfo._id = user._id.toString();
            message.sentByUsername = user.username;
          } else {
            message.metadata.senderInfo.username = senderId;
            message.metadata.senderInfo.full_name = senderId;
            message.metadata.senderInfo._id = senderId;
            message.sentByUsername = senderId;
          }
        }
      } catch (error) {
        logger.error('socketService', 'خطأ في استرجاع معلومات المرسل لإشعار Socket.IO', { 
          conversationId, 
          senderId,
          error: error.message
        });
        if (!message.sentByUsername) message.sentByUsername = senderId; 
        if (!message.metadata.senderInfo.username) message.metadata.senderInfo.username = senderId;
      }
    }
    
    // إضافة معلومات الرد
    message.originalMessageId = originalMessageId;
    
    // إرسال إشعار بالرد إلى غرفة المحادثة
    io.to(`conversation-${conversationId}`).emit('new-message', message);
  } catch (error) {
    logger.error('socketService', 'خطأ في إرسال إشعار برد على رسالة', { 
      conversationId, 
      error: error.message
    });
  }
}

/**
 * تحديث حالة الرسائل في قاعدة البيانات إلى "مقروءة"
 * @param {String} conversationId - معرف المحادثة
 * @param {Array} messages - مصفوفة من معرفات الرسائل
 * @param {Date} timestamp - طابع زمني للقراءة
 */
async function updateMessagesReadStatus(conversationId, messages, timestamp) {
  try {
    // استيراد نموذج الرسائل
    const WhatsAppMessage = require('../models/WhatsappMessageModel');
    
    if (!messages || !messages.length) {
      return;
    }
    
    // إنشاء مصفوفة من الشروط - تحديث بناءً على المعرف الداخلي أو الخارجي
    const conditions = messages.map(msg => {
      let condition = { conversationId: conversationId, direction: 'incoming' };
      
      // إضافة شرط المعرف الداخلي إذا وجد
      if (msg.messageId) {
        condition._id = msg.messageId;
      }
      // إضافة شرط المعرف الخارجي إذا وجد
      else if (msg.externalId) {
        condition.externalMessageId = msg.externalId;
      }
      
      return condition;
    });
    
    // تنفيذ تحديث متعدد لكل الرسائل المحددة
    const bulkOps = conditions.map(condition => ({
      updateOne: {
        filter: condition,
        update: { 
          $set: { 
            status: 'read',
            readAt: timestamp
          } 
        }
      }
    }));
    
    if (bulkOps.length > 0) {
      const result = await WhatsAppMessage.bulkWrite(bulkOps);
      
      // تحديث عدد الرسائل غير المقروءة في المحادثة
      await updateConversationUnreadCount(conversationId);
      
      /* logger.info('socketService', 'تم تحديث حالة الرسائل إلى مقروءة', { 
        conversationId,
        messagesCount: messages.length,
        modifiedCount: result.modifiedCount
      }); */
      
      return true;
    }
    
    return false;
  } catch (error) {
    logger.error('socketService', 'خطأ في تحديث حالة الرسائل إلى مقروءة', { 
      error: error.message,
      conversationId,
      stack: error.stack 
    });
    throw error;
  }
}

/**
 * تحديث عدد الرسائل غير المقروءة في المحادثة
 * @param {String} conversationId - معرف المحادثة
 */
async function updateConversationUnreadCount(conversationId) {
  try {
    // استيراد نماذج قاعدة البيانات
    const WhatsAppMessage = require('../models/WhatsappMessageModel');
    const Conversation = require('../models/Conversation');
    
    // حساب عدد الرسائل غير المقروءة
    const unreadCount = await WhatsAppMessage.countDocuments({
      conversationId,
      direction: 'incoming',
      status: { $ne: 'read' }
    });
    
    // تحديث المحادثة مع العدد الجديد
    await Conversation.findByIdAndUpdate(conversationId, { unreadCount });
    
    // إرسال تحديث إلى واجهة المستخدم
    notifyConversationUpdate(conversationId, { 
      _id: conversationId,
      unreadCount 
    });
    
    return unreadCount;
  } catch (error) {
    logger.error('socketService', 'خطأ في تحديث عدد الرسائل غير المقروءة', { 
      error: error.message,
      conversationId
    });
    return null;
  }
}

module.exports = {
  initialize,
  notifyNewMessage,
  notifyConversationUpdate,
  notifyMessageStatusUpdate,
  notifyMessageReaction,
  notifyUser,
  broadcastNotification,
  emitToRoom,
  notifyMessageExternalIdUpdate,
  updateMessagesReadStatus,
  updateConversationUnreadCount,
  notifyMessageReply
};
