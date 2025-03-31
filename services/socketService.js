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

  // تسجيل التوصيلات الجديدة
  io.on('connection', (socket) => {
    logger.info('socketService', 'اتصال جديد بواسطة Socket.io', { socketId: socket.id });

    // الانضمام إلى غرفة المستخدم
    socket.on('join-user-room', (userId) => {
      if (userId) {
        socket.join(`user-${userId}`);
        logger.info('socketService', 'انضمام المستخدم إلى غرفته الخاصة', { userId, socketId: socket.id });
      }
    });

    // الانضمام إلى غرفة المحادثة
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

    // تسجيل قطع الاتصال
    socket.on('disconnect', () => {
      logger.info('socketService', 'انقطع الاتصال', { socketId: socket.id });
    });
  });

  logger.info('socketService', 'تم تهيئة خدمة Socket.io');
  return io;
}

/**
 * إرسال إشعار برسالة جديدة
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} message - الرسالة الجديدة
 */
function notifyNewMessage(conversationId, message) {
  if (!io) {
    logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
    return;
  }

  // إرسال الإشعار إلى غرفة المحادثة المحددة
  io.to(`conversation-${conversationId}`).emit('new-message', message);
  logger.info('socketService', 'تم إرسال إشعار برسالة جديدة', { conversationId });
}

/**
 * إرسال إشعار بتحديث المحادثة (تغير الحالة، الإسناد، الخ)
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} update - التحديث الجديد
 */
function notifyConversationUpdate(conversationId, update) {
  if (!io) {
    logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
    return;
  }

  // إرسال الإشعار إلى غرفة المحادثة المحددة
  io.to(`conversation-${conversationId}`).emit('conversation-update', update);
  logger.info('socketService', 'تم إرسال إشعار بتحديث المحادثة', { conversationId });
}

/**
 * إرسال إشعار شخصي لمستخدم معين
 * @param {String} userId - معرف المستخدم
 * @param {String} type - نوع الإشعار
 * @param {Object} data - بيانات الإشعار
 */
function notifyUser(userId, type, data) {
  if (!io) {
    logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
    return;
  }

  // إرسال الإشعار إلى غرفة المستخدم المحددة
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
    logger.error('socketService', 'لم يتم تهيئة Socket.io بعد');
    return;
  }

  // إرسال الإشعار للجميع
  io.emit('notification', { type, data });
  logger.info('socketService', 'تم إرسال إشعار عام', { type });
}

module.exports = {
  initialize,
  notifyNewMessage,
  notifyConversationUpdate,
  notifyUser,
  broadcastNotification
};
