/**
 * خدمة الإشعارات الفورية باستخدام Socket.io
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

    // الانضمام لغرفة المحادثة
    socket.on('join-conversation', (conversationId) => {
      if (conversationId) {
        socket.join(`conversation-${conversationId}`);
        logger.info('socketService', 'انضمام إلى غرفة المحادثة', { conversationId, socketId: socket.id });
      }
    });

    // مغادرة غرفة المحادثة
    socket.on('leave-conversation', (conversationId) => {
      if (conversationId) {
        socket.leave(`conversation-${conversationId}`);
        logger.info('socketService', 'مغادرة غرفة المحادثة', { conversationId, socketId: socket.id });
      }
    });

    socket.on('disconnect', () => {
      logger.info('socketService', 'انقطع الاتصال', { socketId: socket.id });
    });

    // معالجة إضافة رد فعل على رسالة
    // ملاحظة: هذه الطريقة تمثل ازدواجية مع مسار HTTP (/reaction و /react)
    // يفضل استخدام مسار HTTP من خلال دالة window.sendReaction في conversation-utils.js
    // تم الاحتفاظ بهذه الطريقة للتوافق مع العملاء القديمين والحالات الخاصة فقط
    socket.on('add_reaction', async (data) => {
      try {
        // التحقق من صحة البيانات
        if (!data || !data.messageId || !data.reactionType) {
          logger.warning('socketService', 'محاولة إضافة رد فعل بدون بيانات كافية', { socketId: socket.id });
          return socket.emit('reaction_error', { error: 'بيانات غير كافية' });
        }

        // استخدام معلومات المستخدم المخزنة في كائن socket بدلاً من الاعتماد على البيانات المرسلة
        const reactionData = {
          messageId: data.messageId,
          reactionType: data.reactionType,
          userId: socket.userId,         // استخدام معرف المستخدم من الجلسة
          username: socket.username,     // استخدام اسم المستخدم من الجلسة
          conversationId: data.conversationId
        };

        logger.info('socketService', 'إضافة رد فعل على رسالة', { 
          messageId: reactionData.messageId,
          reactionType: reactionData.reactionType,
          userId: reactionData.userId,
          username: reactionData.username
        });
        
        // إرسال التفاعل إلى واتساب ميتا من خلال استدعاء وظيفة في مدير التفاعلات
        try {
          const conversationController = require('../controllers/conversationController');
          
          // البحث عن الرسالة باستخدام المعرف الداخلي للحصول على معرف واتساب الخارجي
          const WhatsappMessage = require('../models/WhatsappMessageModel');
          const message = await WhatsappMessage.findById(data.messageId);
          
          if (!message || !message.externalMessageId) {
            logger.error('socketService', 'لم يتم العثور على معرف خارجي للرسالة', { 
              messageId: data.messageId
            });
            return socket.emit('reaction_error', { error: 'الرسالة غير موجودة أو لا تحتوي معرف خارجي' });
          }
          
          // استدعاء وظيفة reactToMessage داخلياً
          // إنشاء كائنات req و res مخصصة للاستخدام الداخلي
          const req = {
            params: { conversationId: data.conversationId },
            body: { messageId: message.externalMessageId, emoji: data.reactionType },
            user: { _id: socket.userId, username: socket.username }
          };
          
          const res = {
            json: (responseData) => {
              if (responseData.success) {
                logger.info('socketService', 'تم إرسال التفاعل إلى واتساب بنجاح', { 
                  messageId: data.messageId,
                  emoji: data.reactionType
                });
                
                // إرسال تأكيد للمستخدم الذي أضاف رد الفعل
                socket.emit('reaction_sent', { success: true, reactionData });
              } else {
                logger.error('socketService', 'فشل في إرسال التفاعل إلى واتساب', { 
                  error: responseData.error,
                  messageId: data.messageId
                });
                
                // إعلام المستخدم بالخطأ
                socket.emit('reaction_error', { error: responseData.error || 'فشل في إرسال التفاعل إلى واتساب' });
              }
            },
            status: (code) => {
              return {
                json: (responseData) => {
                  logger.error('socketService', `فشل في إرسال التفاعل إلى واتساب (${code})`, { 
                    error: responseData.error,
                    messageId: data.messageId
                  });
                  
                  // إعلام المستخدم بالخطأ
                  socket.emit('reaction_error', { error: responseData.error || 'فشل في إرسال التفاعل إلى واتساب' });
                }
              };
            }
          };
          
          // استدعاء وظيفة المتحكم بشكل غير متزامن
          conversationController.reactToMessage(req, res);
        } catch (controllerError) {
          logger.error('socketService', 'خطأ في استدعاء متحكم التفاعلات', { 
            error: controllerError.message, 
            messageId: data.messageId
          });
          
          // إعلام المستخدم بالخطأ
          socket.emit('reaction_error', { error: 'حدث خطأ في معالجة رد الفعل' });
        }

        // بث حدث رد الفعل لجميع المستخدمين في نفس المحادثة
        io.to(data.conversationId.toString()).emit('reaction_received', reactionData);
      } catch (error) {
        logger.error('socketService', 'خطأ أثناء إضافة رد فعل', { 
          error: error.message, 
          socketId: socket.id,
          data
        });
        socket.emit('reaction_error', { error: 'حدث خطأ في معالجة رد الفعل' });
      }
    });
  });

  logger.info('socketService', 'تم تهيئة خدمة Socket.io');
  return io;
}

/**
 * إرسال إشعار برسالة جديدة إلى غرفة المحادثة
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} message - الرسالة الجديدة
 */
function notifyNewMessage(conversationId, message) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }
  io.to(`conversation-${conversationId}`).emit('new-message', message);
  logger.info('socketService', 'تم إرسال إشعار برسالة جديدة', { conversationId });
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
  io.to(`conversation-${conversationId}`).emit('message-status-update', { 
    externalId, 
    status, 
    conversationId 
  });
  logger.info('socketService', 'تم إرسال إشعار بتحديث حالة الرسالة', { conversationId, externalId, status });
}

/**
 * إرسال إشعار بتفاعل على رسالة
 * @param {String} conversationId - معرف المحادثة
 * @param {String} externalId - المعرف الخارجي للرسالة
 * @param {Object} reaction - بيانات التفاعل (المرسل، الإيموجي)
 */
function notifyMessageReaction(conversationId, externalId, reaction) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }
  io.to(`conversation-${conversationId}`).emit('message_reaction', { externalId, reaction });
  logger.info('socketService', 'تم إرسال إشعار بتفاعل على رسالة', { conversationId, externalId });
}

/**
 * إرسال إشعار برد على رسالة
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} message - الرسالة الجديدة
 * @param {String} replyToId - معرف الرسالة المرد عليها
 */
function notifyMessageReply(conversationId, message, replyToId) {
  if (!io) {
    return logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
  }
  io.to(`conversation-${conversationId}`).emit('message_reply', { message, replyToId });
  logger.info('socketService', 'تم إرسال إشعار برد على رسالة', { conversationId, replyToId });
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
  io.to(roomName).emit(eventName, data);
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
