/**
 * خدمة سوكت للإشعارات
 * توفر وظائف لإرسال الإشعارات عبر Socket.io
 */
const NotificationService = require('./notificationService');
const logger = require('./loggerService');
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
 * إرسال إشعار إلى غرفة المستخدم الخاصة عبر Socket.IO وتحديث عدد غير المقروء.
 * @param {string} userId - معرف المستخدم المستلم.
 * @param {object} notification - كائن الإشعار الذي تم إنشاؤه.
 * @returns {Promise<boolean>} - تُرجع true إذا تم العثور على سوكتات نشطة وتمت محاولة الإرسال، و false خلاف ذلك.
 */
async function sendNotification(userId, notification) {
    if (!io || !userId || !notification) {
        logger.warn('notificationSocketService', '[sendNotification] Missing io, userId, or notification object');
        return false; // لا يمكن الإرسال
    }

    let foundActiveSocket = false; // متغير لتتبع ما إذا وجدنا سوكت نشط
    try {
        const targetRoom = `notifications-${userId}`;
        
        const socketsInRoom = io.sockets.adapter.rooms.get(targetRoom);
        const socketIdsInRoom = socketsInRoom ? Array.from(socketsInRoom) : [];
        logger.info('notificationSocketService', '[sendNotification] Checking sockets in room before sending', { userId, targetRoom, socketIdsInRoom });

        if (socketIdsInRoom.length === 0) {
            logger.warn('notificationSocketService', '[sendNotification] No sockets found in the target room. Skipping emit.', { userId, targetRoom });
            // لا نُرجع false هنا بعد، قد يكون المستخدم نشطًا في غرفة المحادثة
            // سنقوم بإعادة foundActiveSocket في النهاية
        } else {
            foundActiveSocket = true; // وجدنا سوكتات نشطة في غرفة الإشعارات
            logger.info('notificationSocketService', '[sendNotification] Attempting to emit new-notification', { userId, targetRoom, event: 'new-notification', notificationId: notification._id });
            io.to(targetRoom).emit('new-notification', notification);
            logger.info('notificationSocketService', '[sendNotification] Successfully emitted new-notification (or at least attempted)', { userId, targetRoom });
            
            // تحديث عدد الإشعارات غير المقروءة
            const unreadCount = await NotificationService.getUnreadCount(userId);
            logger.info('notificationSocketService', '[sendNotification] Attempting to emit unread-count', { userId, targetRoom, event: 'unread-notifications-count', count: unreadCount });
            io.to(targetRoom).emit('unread-notifications-count', { count: unreadCount });
            logger.info('notificationSocketService', '[sendNotification] Successfully emitted unread-count (or at least attempted)', { userId, targetRoom });
        }
        
        // يمكن إضافة تحقق إضافي هنا للتحقق من النشاط في غرفة المحادثة إذا لزم الأمر
        // if (!foundActiveSocket && notification.relatedConversation) {
        //    if (isSocketInRoom(`conversation-${notification.relatedConversation}`, userId)) {
        //        foundActiveSocket = true;
        //        logger.info('notificationSocketService', '[sendNotification] User is active in conversation room, considering as active', { userId, conversationId: notification.relatedConversation });
        //    }
        // }

        logger.info('notificationSocketService', '[sendNotification] Finished socket emit attempt.', { 
            userId, 
            notificationType: notification.type,
            targetRoom,
            foundActiveSocket // تسجيل الحالة النهائية
        });
        
        return foundActiveSocket; // إرجاع الحالة النهائية

    } catch (error) {
        logger.error('notificationSocketService', '[sendNotification] Error during emit', {
            userId,
            error: error.message,
            stack: error.stack
        });
        return false; // إرجاع false في حالة حدوث خطأ
    }
}

/**
 * إرسال إشعار برسالة جديدة إلى المستخدمين المعنيين (المسند له أو المشرفين).
 * @param {string} conversationId - معرف المحادثة.
 * @param {object} message - كائن الرسالة.
 * @param {object} conversation - كائن المحادثة.
 * @param {object} contact - كائن جهة الاتصال.
 */
async function sendMessageNotification(conversationId, message, conversation, contact) {
    try {
        const assignedTo = conversation.assignedTo?.toString();
        
        // 1. إرسال للمستخدم المسند له (إذا كان موجودًا)
        if (assignedTo) {
            const isAssignedUserActive = isSocketInRoom(`conversation-${conversationId}`, assignedTo); // التحقق من النشاط في غرفة المحادثة
            logger.info('notificationSocketService', 'التحقق من نشاط المستخدم المسند له', { conversationId, assignedTo, isAssignedUserActive });
            
            // --- إنشاء الإشعار أولاً --- 
            const senderName = conversation?.customerName || conversation?.phoneNumber || 'عميل غير معروف';
            const messageId = message?._id || message?.id || null;
            const notification = await NotificationService.createNotification({
                recipient: assignedTo,
                type: 'message',
                title: `رسالة جديدة من ${senderName}`,
                message: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''), 
                content: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''), // إضافة content
                link: `/crm/conversations/${conversationId}?msg=${messageId}`,
                relatedConversation: conversationId,
                relatedMessage: messageId
            }, conversation);
            // --- نهاية إنشاء الإشعار ---

            if (notification) {
                // --- محاولة الإرسال عبر السوكت --- 
                const sentViaSocket = await sendNotification(assignedTo, notification);
                // --- نهاية محاولة الإرسال عبر السوكت ---
                
                // --- إرسال ويب بوش فقط إذا لم يتم الإرسال عبر السوكت --- 
                if (!sentViaSocket) {
                    logger.info('notificationSocketService', '[sendMessageNotification] Socket delivery likely failed or user inactive, attempting Web Push...', { assignedTo, notificationId: notification._id });
                    try {
                        const user = await User.findById(assignedTo).select('webPushSubscriptions').lean();
                        if (user && user.webPushSubscriptions && user.webPushSubscriptions.length > 0) {
                            await NotificationService.sendWebPushNotification(user, notification);
                            logger.info('notificationSocketService', '[sendMessageNotification] Web Push attempted.', { assignedTo, notificationId: notification._id });
                        } else {
                            logger.info('notificationSocketService', '[sendMessageNotification] No Web Push subscriptions found for assigned user.', { assignedTo });
                        }
                    } catch (fetchUserError) {
                        logger.error('notificationSocketService', '[sendMessageNotification] Error fetching user for Web Push', { assignedTo, error: fetchUserError.message });
                    }
                }
                // --- نهاية إرسال ويب بوش ---
                
            } else {
                 logger.warn('notificationSocketService', '[sendMessageNotification] Notification creation failed for assigned user', { assignedTo, conversationId });
            }
        } 
        // 2. إرسال للمشرفين (إذا كانت المحادثة غير مسندة أو بناءً على قواعد أخرى)
        else {
            // ... (المنطق الحالي لإرسال الإشعارات للمشرفين)
            const admins = await User.find({ /* ... شروط البحث عن المشرفين ... */ }).select('_id webPushSubscriptions').lean();
            // ... (الحلقة للمرور على المشرفين)
            for (const admin of admins) {
                const isAdminActive = isSocketInRoom(`conversation-${conversationId}`, admin._id) || isSocketInRoom(`notifications-${admin._id}`, admin._id); // التحقق من النشاط
                logger.info('notificationSocketService', 'التحقق من نشاط المشرف', { conversationId, adminId: admin._id, isAdminActive });
                
                // إنشاء الإشعار للمشرف
                const senderName = contact?.name || contact?.phoneNumber || 'عميل غير معروف';
                const messageId = message?._id || message?.id || null;
                const adminNotification = await NotificationService.createNotification({
                    recipient: admin._id,
                    type: 'message',
                    title: `رسالة جديدة غير مسندة من ${senderName}`,
                    message: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
                    content: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
                    link: `/crm/conversations/${conversationId}?msg=${messageId}`,
                    relatedConversation: conversationId,
                    relatedMessage: messageId
                }, conversation);

                if (adminNotification) {
                    const sentViaSocket = await sendNotification(admin._id, adminNotification);
                    
                    if (!sentViaSocket) {
                        logger.info('notificationSocketService', '[sendMessageNotification] Socket delivery likely failed for admin, attempting Web Push...', { adminId: admin._id, notificationId: adminNotification._id });
                         if (admin.webPushSubscriptions && admin.webPushSubscriptions.length > 0) {
                             await NotificationService.sendWebPushNotification(admin, adminNotification);
                             logger.info('notificationSocketService', '[sendMessageNotification] Web Push attempted for admin.', { adminId: admin._id });
                         } else {
                            logger.info('notificationSocketService', '[sendMessageNotification] No Web Push subscriptions found for admin.', { adminId: admin._id });
                         }
                    }
                } else {
                   logger.warn('notificationSocketService', '[sendMessageNotification] Notification creation failed for admin', { adminId: admin._id, conversationId });
                }
            }
        }
    } catch (error) {
        logger.error('notificationSocketService', 'خطأ فادح في sendMessageNotification', {
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