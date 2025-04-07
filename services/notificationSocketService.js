/**
 * خدمة سوكت للإشعارات
 * توفر وظائف لإرسال الإشعارات عبر Socket.io
 */
const NotificationService = require('./notificationService');
const logger = require('./loggerService');

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
 * إرسال إشعار جديد إلى المستخدم عبر Socket.io
 * @param {String} userId - معرف المستخدم المستلم
 * @param {Object} notification - كائن الإشعار الذي تم إنشاؤه
 */
async function sendNotification(userId, notification) {
    if (!io) {
        return logger.error('notificationSocketService', 'لم يتم تهيئة Socket.io بعد');
    }
    
    try {
        const targetRoom = `notifications-${userId}`;
        
        // --- تسجيل إضافي: التحقق من السوكتات في الغرفة --- 
        const socketsInRoom = io.sockets.adapter.rooms.get(targetRoom);
        const socketIdsInRoom = socketsInRoom ? Array.from(socketsInRoom) : [];
        logger.info('notificationSocketService', '[sendNotification] Checking sockets in room before sending', { userId, targetRoom, socketIdsInRoom });
        // --- نهاية التسجيل الإضافي ---

        if (socketIdsInRoom.length === 0) {
            logger.warn('notificationSocketService', '[sendNotification] No sockets found in the target room. Skipping emit.', { userId, targetRoom });
            return; // لا يوجد أحد يستمع في هذه الغرفة
        }

        logger.info('notificationSocketService', '[sendNotification] Attempting to emit new-notification', { userId, targetRoom, event: 'new-notification', notificationId: notification._id });
        io.to(targetRoom).emit('new-notification', notification);
        logger.info('notificationSocketService', '[sendNotification] Successfully emitted new-notification (or at least attempted)', { userId, targetRoom });
        
        // تحديث عدد الإشعارات غير المقروءة
        const unreadCount = await NotificationService.getUnreadCount(userId);
        logger.info('notificationSocketService', '[sendNotification] Attempting to emit unread-count', { userId, targetRoom, event: 'unread-notifications-count', count: unreadCount });
        io.to(targetRoom).emit('unread-notifications-count', { count: unreadCount });
        logger.info('notificationSocketService', '[sendNotification] Successfully emitted unread-count (or at least attempted)', { userId, targetRoom });
        
        logger.info('notificationSocketService', '[sendNotification] All emits attempted successfully', { 
            userId, 
            notificationType: notification.type,
            targetRoom
        });
    } catch (error) {
        logger.error('notificationSocketService', '[sendNotification] Error during emit', {
            userId,
            error: error.message,
            stack: error.stack // تضمين الـ stack trace مفيد
        });
    }
}

/**
 * إرسال إشعار جديد للمستخدمين المعنيين بالمحادثة
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} message - الرسالة الجديدة
 * @param {Object} conversation - كائن المحادثة
 */
async function sendMessageNotification(conversationId, message, conversation) {
    if (!io) {
        return logger.error('notificationSocketService', 'لم يتم تهيئة Socket.io بعد');
    }
    
    try {
        // إذا كانت الرسالة واردة، نرسل إشعارات للمستخدمين المعنيين
        if (message.direction === 'incoming') {
            // الحصول على المستخدم المسند له المحادثة
            const assignedTo = conversation.assignedTo;
            
            // إذا كانت المحادثة مسندة لمستخدم ما
            if (assignedTo) {
                // التحقق مما إذا كان المستخدم المسند له نشطًا في غرفة المحادثة
                const isAssignedUserActive = isSocketInRoom(`conversation-${conversationId}`, assignedTo);
                logger.info('notificationSocketService', 'التحقق من نشاط المستخدم المسند له', { conversationId, assignedTo, isAssignedUserActive });

                if (!isAssignedUserActive) {
                    logger.info('notificationSocketService', 'إرسال إشعار للمستخدم المسند له (غير نشط في الغرفة)', { conversationId, assignedTo });
                    // إنشاء إشعار جديد
                    const notification = await NotificationService.createMessageNotification(
                        assignedTo,
                        'system', // رسائل واتساب ليس لها مرسل في النظام
                        conversationId,
                        message.content || 'رسالة جديدة'
                    );
                    
                    // إرسال الإشعار عبر سوكت
                    if (notification) {
                        await sendNotification(assignedTo, notification);
                    }
                } else {
                   logger.info('notificationSocketService', 'لن يتم إرسال إشعار للمستخدم المسند له (نشط في الغرفة)', { conversationId, assignedTo });
                }
            } else {
                // المحادثة غير مسندة، نرسل إشعارات للمشرفين
                const User = require('../models/User');
                const admins = await User.find({
                    $or: [
                        { user_role: 'admin' },
                        { user_role: 'supervisor', can_access_conversations: true }
                    ],
                    notify_unassigned_conversation: true
                }).select('_id');
                
                logger.info('notificationSocketService', 'إرسال إشعارات للمشرفين المؤهلين للمحادثة غير المسندة', { conversationId, adminCount: admins.length });

                // إنشاء إشعارات للمشرفين
                for (const admin of admins) {
                    // لا نرسل إشعارًا إذا كان المشرف يشاهد المحادثة حاليًا
                    const isAdminActive = isSocketInRoom(`conversation-${conversationId}`, admin._id);
                    logger.info('notificationSocketService', 'التحقق من نشاط المشرف', { conversationId, adminId: admin._id, isAdminActive });
                    
                    if (!isAdminActive) {
                        logger.info('notificationSocketService', 'إرسال إشعار للمشرف (غير نشط في الغرفة)', { conversationId, adminId: admin._id });
                        const notification = await NotificationService.createMessageNotification(
                            admin._id,
                            'system',
                            conversationId,
                            message.content || 'رسالة جديدة غير مسندة'
                        );
                        
                        if (notification) {
                            await sendNotification(admin._id, notification);
                        }
                    } else {
                       logger.info('notificationSocketService', 'لن يتم إرسال إشعار للمشرف (نشط في الغرفة)', { conversationId, adminId: admin._id });
                    }
                }
            }
        }
    } catch (error) {
        logger.error('notificationSocketService', 'خطأ في إرسال إشعار الرسالة', {
            conversationId,
            error: error.message
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
    
    for (const socketId of room) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket && socket.userId === userId.toString()) {
            return true;
        }
    }
    
    return false;
}

/**
 * تحديث إشعارات المحادثة عند تغيير حالتها
 * @param {String} conversationId - معرف المحادثة
 * @param {Object} conversation - كائن المحادثة المحدثة
 */
async function updateConversationNotifications(conversationId, conversation) {
    // تنفيذ منطق تحديث الإشعارات عند تغيير حالة المحادثة
    // مثلاً، وضع علامة قراءة للإشعارات المتعلقة بهذه المحادثة
    
    try {
        if (conversation.status === 'assigned' && conversation.assignedTo) {
            // إرسال إشعار للمستخدم المسند له المحادثة
            const notification = await NotificationService.createAndSendNotification({
                recipient: conversation.assignedTo,
                type: 'conversation',
                title: 'تم إسناد محادثة جديدة لك',
                content: `تم إسناد محادثة مع ${conversation.customerName || conversation.phoneNumber} إليك`,
                link: `/crm/conversations/ajax?selected=${conversationId}`,
                reference: {
                    model: 'Conversation',
                    id: conversationId
                }
            });
            
            if (notification) {
                await sendNotification(conversation.assignedTo, notification);
            }
        } else if (conversation.status === 'closed') {
            // يمكن إرسال إشعار بإغلاق المحادثة للمستخدم السابق
            // أو تحديث حالة الإشعارات السابقة المتعلقة بهذه المحادثة
        }
    } catch (error) {
        logger.error('notificationSocketService', 'خطأ في تحديث إشعارات المحادثة', {
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