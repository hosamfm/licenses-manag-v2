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
let io;

/**
 * بدء تشغيل خدمة Socket.io
 * @param {Object} server - خادم HTTP
 */
function initialize(server) {
  // إنشاء مثيل Socket.io
  io = socketIO(server, {
    cors: {
      origin: '*', // في البيئة الإنتاجية، يجب تحديد أصول محددة فقط
      methods: ['GET', 'POST']
    }
  });

  // معالجة اتصالات العملاء
  io.on('connection', async (socket) => {
    try {
      // استخراج معلومات المستخدم من الجلسة
      if (socket.handshake.session && socket.handshake.session.userId) {
        // محاولة الحصول على معلومات المستخدم من قاعدة البيانات
        try {
          const User = require('../models/User');
          const userId = socket.handshake.session.userId;
          
          const user = await User.findById(userId);
          if (user) {
            socket.userId = user._id.toString();
            socket.username = user.username;
            socket.userRole = user.user_role;            
            
          } else {
            // إزالة التسجيل
          }
        } catch (err) {
          // إزالة التسجيل
        }
      } 
      // استخدام معلومات المستخدم من بيانات المصادقة إذا لم تكن متوفرة في الجلسة
      else if (socket.handshake.auth && socket.handshake.auth.userId && socket.handshake.auth.userId !== 'guest') {
        socket.userId = socket.handshake.auth.userId;
        socket.username = socket.handshake.auth.username;       
        
      } else {
        // لا توجد معلومات مستخدم متاحة
        socket.userId = 'guest';
        socket.username = 'زائر';       
        
      }
    } catch (error) {
      // إزالة التسجيل
    }

    // انضمام المستخدم إلى غرفته الخاصة
    socket.on('join-user-room', (userId) => {
      if (userId) {
        socket.join(`user-${userId}`);
      }
    });

    // انضمام إلى غرفة محددة
    socket.on('join', (data) => {
      if (data && data.room) {
        socket.join(data.room);
      }
    });

    // مغادرة غرفة محددة
    socket.on('leave', (data) => {
      if (data && data.room) {
        socket.leave(data.room);
      }
    });

    // انضمام إلى غرفة محادثة
    socket.on('join-conversation', (conversationId) => {
      if (conversationId) {
        socket.join(`conversation-${conversationId}`);
      }
    });

    // مغادرة غرفة محادثة
    socket.on('leave-conversation', (conversationId) => {
      if (conversationId) {
        socket.leave(`conversation-${conversationId}`);
      }
    });

    // تسجيل حدث انقطاع الاتصال
    socket.on('disconnect', () => {
      // إزالة التسجيل
    });
    
    // استقبال رسالة جديدة لإعادة البث
    socket.on('broadcast-message', (message) => {
      if (!message || !message.conversationId) {
        return;
      }
      
      // إذا كانت الرسالة تحتوي على معلومات الملف المؤقت
      if (message.tempId) {
        io.to(`conversation-${message.conversationId}`).emit('message-external-id-update', {
          messageId: message.tempId,
          externalId: message._id
        });
      }
      
      io.to(`conversation-${message.conversationId}`).emit('new-message', message);
    });
  });

  return io;
}

/**
 * إرسال إشعار برسالة جديدة إلى غرفة المحادثة
 * ملاحظة: هذه الدالة للإشعارات فقط وليس لإرسال الرسالة نفسها
 * يتم استدعاء هذه الدالة من متحكم conversationController بعد حفظ الرسالة في قاعدة البيانات
 * @param {Object} message - الرسالة الجديدة
 */
function notifyNewMessage(message) {
  if (!io) {
    return;
  }
  
  io.to(`conversation-${message.conversationId}`).emit('new-message', message);
}

/**
 * إرسال إشعار برد على رسالة
 * ملاحظة: هذه الدالة للإشعارات فقط وليس لإرسال الرد نفسه
 * يتم استدعاء هذه الدالة من متحكم conversationController بعد حفظ الرد في قاعدة البيانات
 * @param {Object} message - الرسالة الجديدة
 */
function notifyMessageReply(message) {
  if (!io) {
    return;
  }
  
  io.to(`conversation-${message.conversationId}`).emit('message-reply', message);
}

/**
 * إرسال إشعار بتفاعل على رسالة
 * ملاحظة: هذه الدالة للإشعارات فقط، الإرسال الفعلي للتفاعلات يتم عبر HTTP
 * @param {string} conversationId - معرف المحادثة
 * @param {string} messageId - معرف الرسالة
 * @param {string} externalId - المعرف الخارجي للرسالة (اختياري)
 * @param {Object} reaction - معلومات التفاعل
 */
function notifyMessageReaction(conversationId, messageId, externalId, reaction) {
  if (!io) {
    return;
  }
  
  io.to(`conversation-${conversationId}`).emit('message-reaction', {
    messageId,
    externalId,
    reaction, 
    conversationId 
  });
}

/**
 * إرسال إشعار بتحديث معلومات المحادثة
 * @param {string} conversationId - معرف المحادثة
 * @param {Object} update - التحديثات المطلوب إرسالها
 */
function notifyConversationUpdate(conversationId, update) {
  if (!io) {
    return;
  }
  io.to(`conversation-${conversationId}`).emit('conversation-update', update);
}

/**
 * إرسال إشعار بتحديث حالة رسالة
 * @param {string} conversationId - معرف المحادثة
 * @param {string} messageId - معرف الرسالة
 * @param {string} externalId - المعرف الخارجي للرسالة
 * @param {string} status - الحالة الجديدة
 * @param {Object} additionalData - بيانات إضافية
 */
function notifyMessageStatusUpdate(conversationId, messageId, externalId, status, additionalData = {}) {
  if (!io) {
    return;
  }

  const data = {
    messageId,
    externalId,
    status,
    ...additionalData
  };

  io.to(`conversation-${conversationId}`).emit('message-status-update', data);
}

/**
 * إرسال إشعار شخصي لمستخدم معين
 * @param {String} userId - معرف المستخدم
 * @param {String} type - نوع الإشعار
 * @param {Object} data - بيانات الإشعار
 */
function notifyUser(userId, type, data) {
  if (!io) {
    return;
  }
  
  io.to(`user-${userId}`).emit('user-notification', { type, data });
}

/**
 * إرسال إشعار عام للجميع
 * @param {String} type - نوع الإشعار
 * @param {Object} data - بيانات الإشعار
 */
function broadcastNotification(type, data) {
  if (!io) {
    return;
  }
  
  io.emit(type, data);
}

/**
 * إرسال إشعار إلى غرفة محددة
 * @param {String} roomName - اسم الغرفة
 * @param {String} eventName - اسم الحدث
 * @param {Object} data - بيانات الإشعار
 */
function emitToRoom(roomName, eventName, data) {
  if (!io) {
    return;
  }
  
  io.to(`${roomName}`).emit(eventName, data);
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
    return;
  }
  
  if (!conversationId || !messageId || !externalId) {
    return;
  }
  
  io.to(`conversation-${conversationId}`).emit('message-external-id-update', { 
    messageId, 
    externalId, 
    conversationId 
  });
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
