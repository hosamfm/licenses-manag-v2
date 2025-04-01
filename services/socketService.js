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
          }
        } catch (err) {
          logger.error('socketService', 'خطأ في استخراج بيانات المستخدم من قاعدة البيانات', { 
            error: err.message 
          });
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
      logger.error('socketService', 'خطأ في معالجة معلومات المستخدم عند الاتصال', { 
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
    socket.on('add_reaction', async (data) => {
      try {
        // التحقق من صحة البيانات
        if (!data || !data.messageId || !data.reactionType) {
          logger.warning('socketService', 'محاولة إضافة رد فعل بدون بيانات كافية', { socketId: socket.id });
          return socket.emit('reaction_error', { error: 'بيانات غير كافية' });
        }

        // التأكد من وجود معرف المحادثة
        const conversationId = data.conversationId;
        if (!conversationId) {
          logger.warning('socketService', 'محاولة إضافة رد فعل بدون معرف محادثة', { messageId: data.messageId });
          return socket.emit('reaction_error', { error: 'معرف المحادثة غير متوفر' });
        }

        // تسجيل البيانات للتشخيص
        logger.info('socketService', 'بيانات طلب إضافة رد فعل', { 
          originalData: data,
          hasConversationId: !!data.conversationId
        });

        // استخدام معلومات المستخدم المخزنة في كائن socket بدلاً من الاعتماد على البيانات المرسلة
        const reactionData = {
          messageId: data.messageId,
          reactionType: data.reactionType,
          userId: socket.userId,         // استخدام معرف المستخدم من الجلسة
          username: socket.username,     // استخدام اسم المستخدم من الجلسة
          conversationId: conversationId,  // استخدام المتغير المحلي بدلاً من الوصول المباشر
          platform: data.platform || 'whatsapp' // إضافة حقل منصة التواصل
        };

        // التأكد مرة أخرى من وجود معرف المحادثة في البيانات النهائية
        if (!reactionData.conversationId) {
          logger.warning('socketService', 'معرف المحادثة غير موجود في بيانات التفاعل النهائية', { reactionData });
          reactionData.conversationId = data.conversattionId || data.conversationId || null;
        }

        logger.info('socketService', 'إضافة رد فعل على رسالة', { 
          messageId: reactionData.messageId,
          reactionType: reactionData.reactionType,
          userId: reactionData.userId,
          username: reactionData.username
        });

        // إرسال التفاعل عبر واتس أب إذا كانت المنصة واتس أب
        if (reactionData.platform === 'whatsapp' && reactionData.conversationId) {
          try {
            // استخدام mongoose للوصول إلى النموذج بدلاً من إعادة استيراده لتجنب إعادة التعريف
            const mongoose = require('mongoose');
            const WhatsAppMessage = mongoose.model('WhatsAppMessage');
            const Conversation = mongoose.model('Conversation');
            const WhatsappManager = require('./whatsapp/WhatsappManager');
            
            // البحث عن تفاصيل الرسالة والمحادثة
            const message = await WhatsAppMessage.findById(reactionData.messageId);
            const conversation = await Conversation.findById(reactionData.conversationId);
            
            if (message && conversation) {
              // إنشاء رسالة رد تحتوي على التفاعل
              const reactionContent = `${reactionData.username} تفاعل بـ ${reactionData.reactionType} على رسالة: "${message.content.substring(0, 50)}${message.content.length > 50 ? '...' : ''}"`;
              
              // إرسال رسالة التفاعل كرد في المحادثة
              const outgoingMessage = await WhatsAppMessage.createOutgoingMessage(
                conversation._id,
                reactionContent,
                reactionData.userId
              );
              
              // إذا تم إنشاء الرسالة بنجاح، قم بإرسالها عبر واتس أب
              if (outgoingMessage) {
                // تهيئة WhatsappManager إذا لم يكن مهيئًا بالفعل
                if (!WhatsappManager.initialized) {
                  await WhatsappManager.initialize();
                }
                
                // إرسال الرسالة عبر واتس أب
                const sendResult = await WhatsappManager.sendWhatsapp(
                  conversation.phoneNumber,
                  reactionContent,
                  {
                    skipMessageRecord: true,  // لأننا أنشأنا سجل رسالة WhatsAppMessage بالفعل
                    conversationId: conversation._id,
                    originalMessageId: message._id
                  }
                );
                
                // تحديث معرف الرسالة الخارجي إذا نجح الإرسال
                if (sendResult.success && sendResult.externalMessageId) {
                  outgoingMessage.externalMessageId = sendResult.externalMessageId;
                  await outgoingMessage.save();
                }
              }
            }
          } catch (error) {
            logger.error('socketService', 'فشل في إرسال التفاعل عبر واتس أب', { 
              error: error.message,
              reactionData 
            });
            // الاستمرار في تنفيذ العملية رغم الخطأ في إرسال التفاعل عبر واتس أب
          }
        }

        // بث حدث رد الفعل لجميع المستخدمين في نفس المحادثة
        io.to(reactionData.conversationId.toString()).emit('reaction_received', reactionData);
        
        // إرسال تأكيد للمستخدم الذي أضاف رد الفعل
        socket.emit('reaction_sent', { success: true, reactionData });
      } catch (error) {
        logger.error('socketService', 'خطأ أثناء إضافة رد فعل', { 
          error: error.message, 
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
  io.to(`conversation-${conversationId}`).emit('message_status_update', { externalId, status });
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

module.exports = {
  initialize,
  notifyNewMessage,
  notifyConversationUpdate,
  notifyMessageStatusUpdate,
  notifyMessageReaction,
  notifyMessageReply,
  notifyUser,
  broadcastNotification,
  emitToRoom
};
