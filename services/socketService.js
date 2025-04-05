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
            
            logger.info('socketService', 'اتصال جديد بواسطة Socket.io مع معلومات المستخدم من الجلسة', { 
              socketId: socket.id, 
              userId: socket.userId, 
              username: socket.username, 
              userRole: socket.userRole
            });
          } else {
            logger.warning('socketService', 'لم يتم العثور على المستخدم رغم وجود معرف في الجلسة', { 
              socketId: socket.id, 
              sessionUserId: socket.handshake.session.userId 
            });
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
        
        logger.info('socketService', 'اتصال جديد بواسطة Socket.io مع معلومات المستخدم من بيانات المصادقة', { 
          socketId: socket.id, 
          userId: socket.userId, 
          username: socket.username 
        });
      } else {
        // لا توجد معلومات مستخدم متاحة
        socket.userId = 'guest';
        socket.username = 'زائر';
        
        logger.info('socketService', 'اتصال جديد بواسطة Socket.io بدون معلومات المستخدم', { 
          socketId: socket.id,
          source: socket.handshake.headers.referer || 'غير معروف'
        });
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
        logger.info('socketService', 'انضمام المستخدم إلى غرفته الخاصة', { userId, socketId: socket.id });
      }
    });

    // الانضمام لغرفة - أمر عام (تنسيق جديد)
    socket.on('join', (data) => {
      if (data && data.room) {
        socket.join(data.room);
        logger.info('socketService', 'انضمام إلى غرفة', { room: data.room, socketId: socket.id });
      }
    });

    // مغادرة غرفة - أمر عام (تنسيق جديد)
    socket.on('leave', (data) => {
      if (data && data.room) {
        socket.leave(data.room);
        logger.info('socketService', 'مغادرة غرفة', { room: data.room, socketId: socket.id });
      }
    });

    // الانضمام لغرفة المحادثة (تنسيق قديم للتوافق)
    socket.on('join-conversation', (conversationId) => {
      if (conversationId) {
        socket.join(`conversation-${conversationId}`);
        logger.info('socketService', 'انضمام إلى غرفة المحادثة', { conversationId, socketId: socket.id });
      }
    });

    // مغادرة غرفة المحادثة (تنسيق قديم للتوافق)
    socket.on('leave-conversation', (conversationId) => {
      if (conversationId) {
        socket.leave(`conversation-${conversationId}`);
        logger.info('socketService', 'مغادرة غرفة المحادثة', { conversationId, socketId: socket.id });
      }
    });

    socket.on('disconnect', () => {
      logger.info('socketService', 'انقطع الاتصال', { socketId: socket.id });
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
        logger.info('socketService', 'إعادة بث إشعار برسالة جديدة مع وسائط', { 
          conversationId: message.conversationId, 
          mediaType: message.mediaType,
          messageId: message._id
        });
      }
      
      io.to(`conversation-${message.conversationId}`).emit('new-message', message);
      logger.info('socketService', 'تم إعادة بث إشعار برسالة جديدة', { conversationId: message.conversationId });
    });
  });

  logger.info('socketService', 'تم تهيئة خدمة Socket.io');
  return io;
}

/**
 * إرسال إشعار برسالة جديدة إلى غرفة المحادثة
 * ملاحظة: هذه الدالة للإشعارات فقط وليس لإرسال الرسالة نفسها
 * يتم استدعاء هذه الدالة من متحكم conversationController بعد حفظ الرسالة في قاعدة البيانات
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} message - الرسالة الجديدة
 */
async function notifyNewMessage(conversationId, message) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }
  
  // إضافة معلومات المرسل للرسائل الصادرة إذا لم تكن موجودة
  if (message && message.direction === 'outgoing' && message.sentBy && 
      (!message.metadata || !message.metadata.senderInfo || Object.keys(message.metadata.senderInfo).length === 0)) {
    try {
      const User = require('../models/User');
      const senderId = typeof message.sentBy === 'string' ? message.sentBy : message.sentBy.toString();

      // لا نحتاج لاسترجاع معلومات المرسل إذا كان النظام
      if (senderId === 'system') {
        if (!message.metadata) message.metadata = {};
        message.metadata.senderInfo = { 
          username: 'النظام', 
          full_name: 'النظام',
          _id: 'system'
        };
        message.sentByUsername = 'النظام';
        
        logger.info('socketService', 'تم إضافة معلومات النظام كمرسل للإشعار', { 
          conversationId
        });
      } 
      // استرجاع معلومات المستخدم المرسل من قاعدة البيانات
      else {
        const user = await User.findById(senderId);
        if (user) {
          if (!message.metadata) message.metadata = {};
          message.metadata.senderInfo = {
            username: user.username,
            full_name: user.full_name || user.username,
            _id: user._id.toString()
          };
          
          // تخزين اسم المستخدم المرسل بشكل مباشر أيضًا لتسهيل الوصول إليه
          message.sentByUsername = user.username;
          
          logger.info('socketService', 'تم إضافة معلومات المرسل للإشعار', { 
            conversationId, 
            senderUsername: user.username,
            senderId: user._id.toString()
          });
        } else {
          // في حالة عدم العثور على المستخدم، نضع بيانات افتراضية
          if (!message.metadata) message.metadata = {};
          message.metadata.senderInfo = { 
            username: `مستخدم (${senderId.substring(0, 5)}...)`, 
            _id: senderId 
          };
          message.sentByUsername = `مستخدم (${senderId.substring(0, 5)}...)`;
          
          logger.warn('socketService', 'لم يتم العثور على معلومات المرسل في قاعدة البيانات', { 
            conversationId, 
            senderId
          });
        }
      }
    } catch (error) {
      logger.error('socketService', 'خطأ في استرجاع معلومات المرسل للإشعار', { 
        conversationId, 
        senderId: typeof message.sentBy === 'string' ? message.sentBy : message.sentBy.toString(),
        error: error.message
      });
    }
  }
  
  // التأكد من أن كافة معلومات الوسائط متوفرة إذا كانت الرسالة تحتوي على وسائط
  if (message && message.mediaType) {
    logger.info('socketService', 'إرسال إشعار برسالة جديدة مع وسائط', { 
      conversationId, 
      mediaType: message.mediaType,
      messageId: message._id
    });
  }
  
  // إضافة معلومات المرسل إذا كانت الرسالة صادرة وليس هناك معلومات مرسل كاملة
  if (message && message.direction === 'outgoing' && message.sentBy && 
      (!message.metadata || !message.metadata.senderInfo)) {
    try {
      const User = require('../models/User');
      const senderId = message.sentBy.toString();

      // لا نحتاج لاسترجاع معلومات المرسل إذا كان النظام
      if (senderId === 'system') {
        if (!message.metadata) message.metadata = {};
        message.metadata.senderInfo = { username: 'النظام', full_name: 'النظام' };
      } 
      // استرجاع معلومات المستخدم المرسل من قاعدة البيانات
      else {
        const user = await User.findById(senderId);
        if (user) {
          if (!message.metadata) message.metadata = {};
          message.metadata.senderInfo = {
            username: user.username,
            full_name: user.full_name || user.username,
            _id: user._id.toString()
          };
          
          // تخزين اسم المستخدم المرسل بشكل مباشر أيضًا لتسهيل الوصول إليه
          message.sentByUsername = user.username;
          
          logger.info('socketService', 'تم إضافة معلومات المرسل للإشعار', { 
            conversationId, 
            senderUsername: user.username,
            senderId: user._id.toString()
          });
        }
      }
    } catch (error) {
      logger.error('socketService', 'خطأ في استرجاع معلومات المرسل للإشعار', { 
        conversationId, 
        senderId: message.sentBy.toString(),
        error: error.message
      });
    }
  }
  
  io.to(`conversation-${conversationId}`).emit('new-message', message);
  logger.info('socketService', 'تم إرسال إشعار برسالة جديدة', { conversationId });
}

/**
 * إرسال إشعار برد على رسالة
 * ملاحظة: هذه الدالة للإشعارات فقط وليس لإرسال الرد نفسه
 * يتم استدعاء هذه الدالة من متحكم conversationController بعد حفظ الرد في قاعدة البيانات
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} message - الرسالة الجديدة
 * @param {String} replyToId - معرف الرسالة المرد عليها
 */
function notifyMessageReply(conversationId, message, replyToId) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }
  
  // إرسال إشعار إلى غرفة المحادثة بأن هناك رد جديد
  message.replyToId = replyToId;
  io.to(`conversation-${conversationId}`).emit('message-reply', message);
  
  logger.info('socketService', 'تم إرسال إشعار برد على رسالة', { 
    conversationId, 
    replyToId,
    messageId: message._id 
  });
}

/**
 * إرسال إشعار بتفاعل على رسالة
 * ملاحظة: هذه الدالة للإشعارات فقط، الإرسال الفعلي للتفاعلات يتم عبر HTTP
 * @param {String} conversationId - معرف المحادثة
 * @param {String} externalId - المعرف الخارجي للرسالة
 * @param {Object} reaction - بيانات التفاعل (المرسل، الإيموجي)
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
  
  logger.info('socketService', 'تم إرسال إشعار بتفاعل على رسالة', { 
    conversationId, 
    externalId,
    senderName: reaction.senderName 
  });
}

/**
 * إرسال إشعار بتحديث المحادثة (مثلاً تغير الحالة أو الإسناد)
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} update - التحديث الجديد
 */
function notifyConversationUpdate(conversationId, update) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }
  io.to(`conversation-${conversationId}`).emit('conversation-update', update);
  logger.info('socketService', 'تم إرسال إشعار بتحديث المحادثة', { conversationId });
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
  
  logger.info('socketService', 'تم إرسال إشعار بتحديث حالة الرسالة', { 
    conversationId, 
    externalId, 
    status,
    dataObject: JSON.stringify(data)
  });
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
  logger.info('socketService', 'تم إرسال إشعار للمستخدم', { userId, type });
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
  logger.info('socketService', 'تم إرسال إشعار عام', { type });
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
  logger.info('socketService', 'تم إرسال إشعار إلى غرفة محددة', { roomName, eventName });
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
  
  logger.info('socketService', 'تم إرسال إشعار بتحديث معرف خارجي للرسالة', { conversationId, messageId, externalId });
}

module.exports = {
  initialize,
  notifyNewMessage,
  notifyConversationUpdate,
  notifyMessageStatusUpdate,
  notifyMessageReaction,
  notifyMessageReply,
  notifyUser,
  broadcastNotification,
  emitToRoom,
  notifyMessageExternalIdUpdate
};
