/**
 * خدمة سوكت للإشعارات
 * توفر وظائف لإرسال الإشعارات عبر Socket.io و Web Push
 */
const NotificationService = require('./notificationService');
const logger = require('./loggerService');
const webPushService = require('./webPushService'); // استيراد خدمة Web Push
const User = require('../models/User');

let io = null;

/**
 * تهيئة خدمة سوكت الإشعارات
 * @param {Object} socketIo - كائن Socket.io الأساسي
 */
function initialize(socketIo) {
    io = socketIo;
    
    // إضافة معالج لاتصالات السوكت المتعلقة بالإشعارات
    io.on('connection', (socket) => {
        // سيتم استدعاء هذا الدالة عند اتصال مستخدم جديد
        
        // معالج الانضمام لغرفة الإشعارات الخاصة بالمستخدم
        socket.on('join-notifications', () => {
            logger.info('notificationSocketService', '[join-notifications] Received join request', { userId: socket.userId, socketId: socket.id });
            
            // فحص وجود userId للانضمام للغرفة الصحيحة
            if (socket.userId && socket.userId !== 'guest') {
                // لدينا userId متاح بالفعل، انضم للغرفة مباشرة
                joinUserToNotificationRoom(socket, socket.userId);
            } else {
                // تسجيل التحذير وتخزين المعلومة أنه يجب الانضمام للغرفة عندما يصبح userId متاحًا
                logger.warn('notificationSocketService', '[join-notifications] userId غير متوفر وقت استدعاء join-notifications', { socketId: socket.id });
                socket._shouldJoinNotificationsWhenUserIdAvailable = true;
            }
        });
        
        // مستمع جديد لحدث تحديث userId (يتم استدعاؤه من middleware أو socketService عند تعيين userId)
        socket.on('userId-set', (data) => {
            logger.info('notificationSocketService', '[userId-set] تم تعيين userId للسوكت', { userId: data.userId, socketId: socket.id, userRole: data.userRole });
            
            // إذا كان المفترض الانضمام للغرفة (من محاولة سابقة) أو تم تحديد ذلك في البيانات
            if (socket._shouldJoinNotificationsWhenUserIdAvailable || data.shouldJoinNotifications) {
                joinUserToNotificationRoom(socket, data.userId);
                // إزالة العلامة بعد الانضمام
                socket._shouldJoinNotificationsWhenUserIdAvailable = false;
            }
        });
        
        // معالج وضع علامة قراءة للإشعارات
        socket.on('mark-notification-read', async (data) => {
            if (!socket.userId || socket.userId === 'guest') return;
            
            try {
                if (!data || !data.notificationId) {
                    return logger.warn('notificationSocketService', 'معرف الإشعار مفقود', { userId: socket.userId });
                }
                
                // التحقق من ملكية الإشعار (يجب أن يكون المستخدم هو المستلم)
                const notification = await NotificationService.markAsRead(data.notificationId, true);
                
                if (notification) {
                    // إرسال تحديث بعدد الإشعارات غير المقروءة
                    const unreadCount = await NotificationService.getUnreadCount(socket.userId);
                    socket.emit('unread-notifications-count', { count: unreadCount });
                }
            } catch (error) {
                logger.error('notificationSocketService', 'خطأ في وضع علامة قراءة للإشعار', {
                    userId: socket.userId,
                    notificationId: data?.notificationId,
                    error: error.message
                });
            }
        });
        
        // معالج وضع علامة قراءة لجميع الإشعارات
        socket.on('mark-all-notifications-read', async () => {
            if (!socket.userId || socket.userId === 'guest') return;
            
            try {
                await NotificationService.markAllAsRead(socket.userId, true);
                
                // إرسال تحديث أن عدد الإشعارات غير المقروءة هو صفر
                socket.emit('unread-notifications-count', { count: 0 });
                
                // إرسال تحديث للإشعارات نفسها
                socket.emit('notifications-updated');
            } catch (error) {
                logger.error('notificationSocketService', 'خطأ في وضع علامة قراءة لجميع الإشعارات', {
                    userId: socket.userId,
                    error: error.message
                });
            }
        });
    });
    
    logger.info('notificationSocketService', 'تم تهيئة خدمة سوكت الإشعارات');
    return io;
}

/**
 * إرسال إشعار جديد إلى المستخدم عبر Socket.io و Web Push
 * @param {String} userId - معرف المستخدم المستلم
 * @param {Object} notification - كائن الإشعار الذي تم إنشاؤه
 */
async function sendNotification(userId, notification) {
    let socketSent = false;
    let pushSent = false;

    // 1. إرسال عبر Socket.IO إذا كان متاحًا
    if (io) {
        try {
            const targetRoom = `notifications-${userId}`;
            
            // التحقق من وجود سوكتات في الغرفة
            const socketsInRoom = io.sockets.adapter.rooms.get(targetRoom);
            const socketIdsInRoom = socketsInRoom ? Array.from(socketsInRoom) : [];
            
            logger.info('notificationSocketService', '[sendNotification - Socket.IO] التحقق من السوكتات في الغرفة', { userId, targetRoom, socketIdsInRoom });

            if (socketIdsInRoom.length > 0) {
                logger.info('notificationSocketService', '[sendNotification - Socket.IO] محاولة الإرسال إلى الغرفة', { userId, targetRoom, event: 'new-notification', notificationId: notification._id });
                // إرسال الإشعار للمستخدم عبر غرفته الخاصة
                io.to(targetRoom).emit('new-notification', notification);
                
                // تحديث عدد الإشعارات غير المقروءة
                const unreadCount = await NotificationService.getUnreadCount(userId);
                logger.info('notificationSocketService', '[sendNotification - Socket.IO] محاولة إرسال عدد غير المقروء', { userId, targetRoom, event: 'unread-notifications-count', count: unreadCount });
                io.to(targetRoom).emit('unread-notifications-count', { count: unreadCount });
                
                socketSent = true;
                logger.info('notificationSocketService', '[sendNotification - Socket.IO] تم إرسال الأحداث عبر Socket.IO', { userId, targetRoom });
            } else {
                logger.info('notificationSocketService', '[sendNotification - Socket.IO] لا يوجد سوكتات متصلة في الغرفة، لن يتم الإرسال عبر Socket.IO', { userId, targetRoom });
            }
        } catch (error) {
            logger.error('notificationSocketService', '[sendNotification - Socket.IO] خطأ في إرسال الإشعار عبر Socket.IO', {
                userId,
                error: error.message
            });
        }
    } else {
        logger.warn('notificationSocketService', '[sendNotification - Socket.IO] لم يتم تهيئة Socket.io، لن يتم الإرسال عبر Socket.IO');
    }

    // 2. إرسال عبر Web Push
    try {
        logger.info('notificationSocketService', '[sendNotification - Web Push] محاولة الإرسال عبر Web Push', { userId, notificationId: notification._id });
        const pushResult = await webPushService.sendNotificationToUser(userId, {
            title: notification.title,
            content: notification.content,
            link: notification.link,
            tag: notification.reference?.id || notification.type || 'default' // استخدام مرجع الإشعار للـ tag
        });
        if (pushResult.success) {
            pushSent = true;
            logger.info('notificationSocketService', '[sendNotification - Web Push] تم إرسال الإشعار عبر Web Push بنجاح', { userId });
        } else if (pushResult.expired) {
            logger.warn('notificationSocketService', '[sendNotification - Web Push] اشتراك Web Push منتهي الصلاحية', { userId });
        } else {
            logger.warn('notificationSocketService', '[sendNotification - Web Push] فشل إرسال الإشعار عبر Web Push', { userId, message: pushResult.message });
        }
    } catch (error) {
        logger.error('notificationSocketService', '[sendNotification - Web Push] خطأ فادح في إرسال الإشعار عبر Web Push', {
            userId,
            error: error.message
        });
    }

    // تسجيل النتيجة النهائية
    if (socketSent || pushSent) {
        logger.info('notificationSocketService', '[sendNotification - Result] تم إرسال الإشعار بنجاح عبر وسيلة واحدة على الأقل', {
            userId,
            socketSent,
            pushSent
        });
    } else {
        logger.warn('notificationSocketService', '[sendNotification - Result] فشل إرسال الإشعار عبر جميع الوسائل', {
            userId
        });
    }
}

/**
 * إرسال إشعار جديد للمستخدمين المعنيين بالمحادثة
 * تم تعديل هذه الدالة لاستخدام دالة sendNotification العامة
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} message - الرسالة الجديدة
 * @param {Object} conversation - كائن المحادثة
 */
async function sendMessageNotification(conversationId, message, conversation) {
    try {
        // إذا كانت الرسالة واردة، نرسل إشعارات للمستخدمين المعنيين
        if (message.direction === 'incoming') {
            // الحصول على المستخدم المسند له المحادثة
            const assignedTo = conversation.assignedTo;
            
            // إذا كانت المحادثة مسندة لمستخدم ما
            if (assignedTo) {
                // التحقق مما إذا كان المستخدم المسند له نشطًا في غرفة المحادثة
                const isAssignedUserActive = isSocketInRoom(`conversation-${conversationId}`, assignedTo);
                logger.info('notificationSocketService', '[sendMessageNotification] التحقق من نشاط المستخدم المسند له', { conversationId, assignedTo, isAssignedUserActive });

                if (!isAssignedUserActive) {
                    logger.info('notificationSocketService', '[sendMessageNotification] إرسال إشعار للمستخدم المسند له (غير نشط في الغرفة)', { conversationId, assignedTo });
                    // إنشاء إشعار جديد في قاعدة البيانات
                    const notification = await NotificationService.createMessageNotification(
                        assignedTo,
                        message.sender, // أو 'system' إذا لم يكن هناك مرسل واضح
                        conversationId,
                        message.content || 'رسالة جديدة'
                    );
                    
                    // إرسال الإشعار عبر Socket.IO و Web Push
                    if (notification) {
                        // تعديل الرابط ليكون الرابط الصحيح للمحادثة
                        notification.link = `/crm/conversations/ajax?selected=${conversationId}`;
                        await sendNotification(assignedTo, notification);
                    }
                } else {
                   logger.info('notificationSocketService', '[sendMessageNotification] لن يتم إرسال إشعار للمستخدم المسند له (نشط في الغرفة)', { conversationId, assignedTo });
                }
            } else {
                // المحادثة غير مسندة، نرسل إشعارات للمشرفين
                const admins = await User.find({
                    $or: [
                        { user_role: 'admin' },
                        { user_role: 'supervisor', can_access_conversations: true }
                    ],
                    notify_unassigned_conversation: true
                }).select('_id');
                
                logger.info('notificationSocketService', '[sendMessageNotification] إرسال إشعارات للمشرفين المؤهلين للمحادثة غير المسندة', { conversationId, adminCount: admins.length });

                // إنشاء وإرسال إشعارات للمشرفين
                for (const admin of admins) {
                    // لا نرسل إشعارًا إذا كان المشرف يشاهد المحادثة حاليًا
                    const isAdminActive = isSocketInRoom(`conversation-${conversationId}`, admin._id);
                    logger.info('notificationSocketService', '[sendMessageNotification] التحقق من نشاط المشرف', { conversationId, adminId: admin._id, isAdminActive });
                    
                    if (!isAdminActive) {
                        logger.info('notificationSocketService', '[sendMessageNotification] إرسال إشعار للمشرف (غير نشط في الغرفة)', { conversationId, adminId: admin._id });
                        const notification = await NotificationService.createMessageNotification(
                            admin._id,
                            message.sender, // أو 'system'
                            conversationId,
                            message.content || 'رسالة جديدة غير مسندة'
                        );
                        
                        if (notification) {
                            // تعديل الرابط للمحادثة
                            notification.link = `/crm/conversations/ajax?selected=${conversationId}`;
                            await sendNotification(admin._id, notification);
                        }
                    } else {
                       logger.info('notificationSocketService', '[sendMessageNotification] لن يتم إرسال إشعار للمشرف (نشط في الغرفة)', { conversationId, adminId: admin._id });
                    }
                }
            }
        }
    } catch (error) {
        logger.error('notificationSocketService', '[sendMessageNotification] خطأ في إرسال إشعار الرسالة', {
            conversationId,
            error: error.message,
            stack: error.stack
        });
    }
}

/**
 * التحقق مما إذا كان سوكت المستخدم موجودًا في غرفة معينة
 * @param {String} roomName - اسم الغرفة
 * @param {String} userId - معرف المستخدم
 * @returns {Boolean} نتيجة التحقق
 */
function isSocketInRoom(roomName, userId) {
    if (!io) return false;
    
    const room = io.sockets.adapter.rooms.get(roomName);
    if (!room) return false;
    
    // التأكد من أن userId ليس null أو undefined قبل تحويله إلى سلسلة نصية
    const userIdString = userId ? userId.toString() : null;
    if (!userIdString) return false;
    
    for (const socketId of room) {
        const socket = io.sockets.sockets.get(socketId);
        // مقارنة بعد تحويل معرف السوكت أيضًا إلى سلسلة نصية (احتياطي)
        if (socket && socket.userId && socket.userId.toString() === userIdString) {
            return true;
        }
    }
    
    return false;
}

/**
 * تحديث إشعارات المحادثة عند تغيير حالتها
 * تم تعديل هذه الدالة لاستخدام دالة sendNotification العامة
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} conversation - كائن المحادثة المحدثة
 */
async function updateConversationNotifications(conversationId, conversation) {
    try {
        if (conversation.status === 'assigned' && conversation.assignedTo) {
            logger.info('notificationSocketService', '[updateConversationNotifications] إرسال إشعار بإسناد المحادثة', { conversationId, assignedTo: conversation.assignedTo });
            // إرسال إشعار للمستخدم المسند له المحادثة
            const notification = await NotificationService.createNotification({
                recipient: conversation.assignedTo,
                type: 'conversation',
                title: 'تم إسناد محادثة جديدة لك',
                content: `تم إسناد محادثة مع ${conversation.customerName || conversation.phoneNumber} إليك`,
                link: `/crm/conversations/ajax?selected=${conversationId}`, // استخدام الرابط الصحيح
                reference: {
                    model: 'Conversation',
                    id: conversationId
                }
            });
            
            if (notification) {
                await sendNotification(conversation.assignedTo, notification);
            }
        } else if (conversation.status === 'closed') {
            logger.info('notificationSocketService', '[updateConversationNotifications] المحادثة أغلقت، يمكن تنفيذ إجراءات إضافية للإشعارات', { conversationId });
            // يمكن إرسال إشعار بإغلاق المحادثة للمستخدم السابق
            // أو تحديث حالة الإشعارات السابقة المتعلقة بهذه المحادثة (مثلاً وضع علامة مقروءة)
        }
    } catch (error) {
        logger.error('notificationSocketService', '[updateConversationNotifications] خطأ في تحديث إشعارات المحادثة', {
            conversationId,
            error: error.message
        });
    }
}

/**
 * دالة مساعدة للانضمام للغرفة بشكل آمن
 * @param {Object} socket - كائن السوكت
 * @param {String} userId - معرف المستخدم
 */
function joinUserToNotificationRoom(socket, userId) {
    if (!userId || userId === 'guest') {
        logger.warn('notificationSocketService', '[joinUserToNotificationRoom] محاولة انضمام مستخدم بمعرف غير صالح', { userId, socketId: socket.id });
        return;
    }
    
    try {
        const notificationRoom = `notifications-${userId}`;
        logger.info('notificationSocketService', '[joinUserToNotificationRoom] Attempting to join room...', { userId: userId, room: notificationRoom, socketId: socket.id });
        
        // مغادرة الغرفة الخاطئة إذا كان قد انضم إليها سابقًا
        if (socket.rooms.has('notifications-unknown')) {
            socket.leave('notifications-unknown');
            logger.info('notificationSocketService', '[joinUserToNotificationRoom] تمت مغادرة الغرفة الخاطئة', { oldRoom: 'notifications-unknown', socketId: socket.id });
        }
        
        // الانضمام للغرفة الصحيحة
        socket.join(notificationRoom);
        
        // التأكد من الانضمام
        const roomsUserIsIn = Array.from(socket.rooms);
        logger.info('notificationSocketService', '[joinUserToNotificationRoom] Successfully joined room. Rooms user is now in:', { userId: userId, rooms: roomsUserIsIn, socketId: socket.id });
        
        // إرسال عدد الإشعارات غير المقروءة عند الانضمام
        NotificationService.getUnreadCount(userId)
            .then(unreadCount => {
                socket.emit('unread-notifications-count', { count: unreadCount });
                logger.info('notificationSocketService', '[joinUserToNotificationRoom] تم إرسال عدد الإشعارات غير المقروءة', { userId, count: unreadCount });
            })
            .catch(error => {
                logger.error('notificationSocketService', '[joinUserToNotificationRoom] خطأ في جلب عدد الإشعارات غير المقروءة', {
                    userId,
                    error: error.message
                });
            });
    } catch (joinError) {
        logger.error('notificationSocketService', '[joinUserToNotificationRoom] Error during socket.join()', { userId, error: joinError.message, socketId: socket.id });
    }
}

module.exports = {
    initialize,
    sendNotification,
    sendMessageNotification,
    updateConversationNotifications
}; 