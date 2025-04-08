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
            // logger.info('notificationSocketService', '[join-notifications] Received join request', { userId: socket.userId, socketId: socket.id });
            
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
            // logger.info('notificationSocketService', '[userId-set] تم تعيين userId للسوكت', { userId: data.userId, socketId: socket.id, userRole: data.userRole });
            
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
    
    // logger.info('notificationSocketService', 'تم تهيئة خدمة سوكت الإشعارات');
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
        // logger.info('notificationSocketService', '[sendNotification] Checking sockets in room before sending', { userId, targetRoom, socketIdsInRoom });

        if (socketIdsInRoom.length === 0) {
            logger.warn('notificationSocketService', '[sendNotification] No sockets found in the target room. Skipping emit.', { userId, targetRoom });
            // لا نُرجع false هنا بعد، قد يكون المستخدم نشطًا في غرفة المحادثة
            // سنقوم بإعادة foundActiveSocket في النهاية
        } else {
            foundActiveSocket = true; // وجدنا سوكتات نشطة في غرفة الإشعارات
            // logger.info('notificationSocketService', '[sendNotification] Attempting to emit new-notification', { userId, targetRoom, event: 'new-notification', notificationId: notification._id });
            io.to(targetRoom).emit('new-notification', notification);
            // logger.info('notificationSocketService', '[sendNotification] Successfully emitted new-notification (or at least attempted)', { userId, targetRoom });
            
            // تحديث عدد الإشعارات غير المقروءة
            const unreadCount = await NotificationService.getUnreadCount(userId);
            // logger.info('notificationSocketService', '[sendNotification] Attempting to emit unread-count', { userId, targetRoom, event: 'unread-notifications-count', count: unreadCount });
            io.to(targetRoom).emit('unread-notifications-count', { count: unreadCount });
            // logger.info('notificationSocketService', '[sendNotification] Successfully emitted unread-count (or at least attempted)', { userId, targetRoom });
        }
        
        // يمكن إضافة تحقق إضافي هنا للتحقق من النشاط في غرفة المحادثة إذا لزم الأمر
        // if (!foundActiveSocket && notification.relatedConversation) {
        //    if (isSocketInRoom(`conversation-${notification.relatedConversation}`, userId)) {
        //        foundActiveSocket = true;
        //        logger.info('notificationSocketService', '[sendNotification] User is active in conversation room, considering as active', { userId, conversationId: notification.relatedConversation });
        //    }
        // }

        // logger.info('notificationSocketService', '[sendNotification] Finished socket emit attempt.', { 
        //     userId, 
        //     notificationType: notification.type,
        //     targetRoom,
        //     foundActiveSocket // تسجيل الحالة النهائية
        // });
        
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
            // logger.info('notificationSocketService', 'التحقق من نشاط المستخدم المسند له', { conversationId, assignedTo, isAssignedUserActive });
            
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
                let sentViaSocket = false; // تتبع ما إذا تم الإرسال عبر سوكت الهيدر
                
                // --- التحقق من نشاط المستخدم قبل إرسال إشعار الهيدر --- 
                if (!isAssignedUserActive) {
                    // logger.info('notificationSocketService', '[sendMessageNotification] User not active in conversation, attempting header notification (Socket)...', { assignedTo, conversationId });
                    sentViaSocket = await sendNotification(assignedTo, notification); // محاولة الإرسال
                } else {
                    // logger.info('notificationSocketService', '[sendMessageNotification] User IS active in conversation. Skipping header notification (Socket).', { assignedTo, conversationId });
                    // نعتبر أنه تم التسليم طالما المستخدم موجود في غرفة الإشعارات العامة
                    // هذا يمنع إرسال Web Push غير ضروري
                    if (isSocketInRoom(`notifications-${assignedTo}`, assignedTo)) {
                         sentViaSocket = true; 
                         // logger.info('notificationSocketService', '[sendMessageNotification] User is in general notifications room, considering socket delivery successful.', { assignedTo });
                         // قد نحتاج لتحديث عدد غير المقروء هنا بشكل منفصل إذا لم يتم استدعاء sendNotification
                         try {
                             const unreadCount = await NotificationService.getUnreadCount(assignedTo);
                             const targetRoom = `notifications-${assignedTo}`;
                             io.to(targetRoom).emit('unread-notifications-count', { count: unreadCount });
                             // logger.info('notificationSocketService', '[sendMessageNotification] Manually emitted unread-count for active user.', { assignedTo, count: unreadCount });
                         } catch (countError) {
                              logger.error('notificationSocketService', '[sendMessageNotification] Error manually fetching/sending unread count', { assignedTo, error: countError.message });
                         }
                    } else {
                         logger.warn('notificationSocketService', '[sendMessageNotification] User active in conversation but NOT in general notifications room? Might still send Web Push.', { assignedTo });
                         sentViaSocket = false; // لم يتم التأكد من الاتصال العام، اسمح بإمكانية إرسال Web Push
                    }
                }
                // --- نهاية التحقق من نشاط المستخدم ---
                
                // --- إرسال ويب بوش فقط إذا لم يتم الإرسال عبر السوكت (أو لم يُعتبر كذلك) ---
                if (!sentViaSocket) {
                    // logger.info('notificationSocketService', '[sendMessageNotification] Socket delivery failed or skipped, attempting Web Push...', { assignedTo, notificationId: notification._id });
                    try {
                        const user = await User.findById(assignedTo).select('webPushSubscriptions').lean();
                        if (user && user.webPushSubscriptions && user.webPushSubscriptions.length > 0) {
                            await NotificationService.sendWebPushNotification(user, notification);
                            // logger.info('notificationSocketService', '[sendMessageNotification] Web Push attempted.', { assignedTo, notificationId: notification._id });
                        } else {
                            // logger.info('notificationSocketService', '[sendMessageNotification] No Web Push subscriptions found for assigned user.', { assignedTo });
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
            const admins = await User.find({
                can_access_conversations: true,
                account_status: 'active'
            }).select('_id webPushSubscriptions');

            for (const admin of admins) {
                const isAdminActive = isSocketInRoom(`conversation-${conversationId}`, admin._id.toString());
                // logger.info('notificationSocketService', 'التحقق من نشاط المشرف', { conversationId, adminId: admin._id, isAdminActiveInConv: isAdminActive });

                // --- إنشاء الإشعار للمشرف --- 
                const senderName = conversation?.customerName || conversation?.phoneNumber || 'عميل غير معروف';
                const messageId = message?._id || message?.id || null;
                const notification = await NotificationService.createNotification({
                    recipient: admin._id,
                    type: 'message',
                    title: `رسالة جديدة من ${senderName}`,
                    message: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''), 
                    content: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
                    link: `/crm/conversations/${conversationId}?msg=${messageId}`,
                    relatedConversation: conversationId,
                    relatedMessage: messageId
                }, conversation);
                // --- نهاية إنشاء الإشعار --- 

                if (notification) {
                    let sentViaSocket = false;
                    
                    // --- التحقق من النشاط قبل إرسال إشعار الهيدر --- 
                    if (!isAdminActive) {
                        // logger.info('notificationSocketService', '[sendMessageNotification] Admin not active in conversation, attempting header notification (Socket)...', { adminId: admin._id, conversationId });
                        sentViaSocket = await sendNotification(admin._id.toString(), notification);
                    } else {
                        // logger.info('notificationSocketService', '[sendMessageNotification] Admin IS active in conversation. Skipping header notification (Socket).', { adminId: admin._id, conversationId });
                        // نعتبر التسليم ناجحًا طالما المستخدم في غرفة الإشعارات العامة
                        if (isSocketInRoom(`notifications-${admin._id.toString()}`, admin._id.toString())) {
                            sentViaSocket = true;
                            // logger.info('notificationSocketService', '[sendMessageNotification] Admin is in general notifications room, considering socket delivery successful.', { adminId: admin._id });
                             try {
                                const unreadCount = await NotificationService.getUnreadCount(admin._id.toString());
                                const targetRoom = `notifications-${admin._id.toString()}`;
                                io.to(targetRoom).emit('unread-notifications-count', { count: unreadCount });
                                // logger.info('notificationSocketService', '[sendMessageNotification] Manually emitted unread-count for active admin.', { adminId: admin._id, count: unreadCount });
                             } catch (countError) {
                                  logger.error('notificationSocketService', '[sendMessageNotification] Error manually fetching/sending unread count for admin', { adminId: admin._id, error: countError.message });
                             }
                        } else {
                             logger.warn('notificationSocketService', '[sendMessageNotification] Admin active in conversation but NOT in general notifications room? Might still send Web Push.', { adminId: admin._id });
                             sentViaSocket = false; // السماح بإمكانية Web Push
                        }
                    }
                    // --- نهاية التحقق من النشاط ---

                    // --- إرسال ويب بوش فقط إذا لم يتم الإرسال عبر السوكت --- 
                    if (!sentViaSocket) {
                        // logger.info('notificationSocketService', '[sendMessageNotification] Socket delivery failed or skipped for admin, attempting Web Push...', { adminId: admin._id, notificationId: notification._id });
                        if (admin.webPushSubscriptions && admin.webPushSubscriptions.length > 0) {
                            await NotificationService.sendWebPushNotification(admin, notification);
                            // logger.info('notificationSocketService', '[sendMessageNotification] Web Push attempted for admin.', { adminId: admin._id });
                        } else {
                            // logger.info('notificationSocketService', '[sendMessageNotification] No Web Push subscriptions found for admin.', { adminId: admin._id });
                        }
                    }
                    // --- نهاية إرسال ويب بوش ---
                    
                } else {
                    logger.warn('notificationSocketService', '[sendMessageNotification] Notification creation failed for admin', { adminId: admin._id, conversationId });
                }
            }
        }
    } catch (error) {
        logger.error('notificationSocketService', '[sendMessageNotification] Critical error during send', { 
            conversationId, 
            errorMessage: error.message, 
            stack: error.stack,
            messageId: message?._id 
        });
    }
}

/**
 * التحقق مما إذا كان سوكت معين موجودًا في غرفة محددة.
 * @param {string} roomName - اسم الغرفة.
 * @param {string} userId - معرف المستخدم للتحقق منه.
 * @returns {boolean} - هل المستخدم متصل في الغرفة.
 */
function isSocketInRoom(roomName, userId) {
    if (!io || !userId) {
        return false;
    }
    const room = io.sockets.adapter.rooms.get(roomName);
    if (!room) {
        return false;
    }
    
    // المرور على معرفات السوكت في الغرفة للتحقق من userId
    for (const socketId of room) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket && socket.userId === userId) {
            return true; // وجدنا سوكت للمستخدم في الغرفة
        }
    }
    return false; // لم نجد سوكت للمستخدم في الغرفة
}

/**
 * إرسال إشعارات عند تحديث حالة المحادثة (مثل الإسناد أو الإغلاق).
 * @param {string} conversationId - معرف المحادثة.
 * @param {object} conversation - كائن المحادثة المحدث.
 */
async function updateConversationNotifications(conversationId, conversation) {
    try {
        // إرسال إشعار للمستخدم الذي تم إسناد المحادثة إليه (إذا تغير)
        if (conversation.assignedTo && conversation.isModified('assignedTo')) {
            const notification = await NotificationService.createNotification({
                recipient: conversation.assignedTo,
                type: 'assignment',
                title: 'تم إسناد محادثة إليك',
                content: `تم إسناد محادثة مع ${conversation.customerName || conversation.phoneNumber} إليك.`,
                link: `/crm/conversations/${conversationId}`,
                relatedConversation: conversationId
            });
            if (notification) {
                // logger.info('notificationSocketService', '[updateConversationNotifications] Sending assignment notification...', { recipient: conversation.assignedTo, conversationId });
                await sendNotification(conversation.assignedTo.toString(), notification);
                // لا حاجة لإرسال Web Push هنا، sendNotification تتعامل مع ذلك
            }
        }
        
        // يمكن إضافة إشعارات أخرى هنا (مثل إغلاق المحادثة، إعادة فتحها، إلخ)
        
    } catch (error) {
        logger.error('notificationSocketService', '[updateConversationNotifications] Error sending update notifications', { conversationId, error: error.message });
    }
}

/**
 * دالة مساعدة لضم سوكت إلى غرفة إشعارات المستخدم
 * @param {Object} socket - كائن السوكت
 * @param {String} userId - معرف المستخدم
 */
function joinUserToNotificationRoom(socket, userId) {
    if (!socket || !userId || userId === 'guest') {
        logger.warn('notificationSocketService', '[joinUserToNotificationRoom] Invalid socket or userId', { userId, socketId: socket?.id });
        return;
    }
    
    const notificationRoom = `notifications-${userId}`;
    socket.join(notificationRoom);
    // logger.info('notificationSocketService', '[joinUserToNotificationRoom] Socket joined notification room', { userId, socketId: socket.id, room: notificationRoom });
    
    // إرسال العدد الحالي للإشعارات غير المقروءة للمستخدم المنضم حديثًا
    NotificationService.getUnreadCount(userId).then(count => {
        socket.emit('unread-notifications-count', { count });
    }).catch(error => {
        logger.error('notificationSocketService', '[joinUserToNotificationRoom] Error fetching initial unread count', {
            userId, 
            socketId: socket.id,
            error: error.message
        });
    });
}

// تصدير الوظائف
module.exports = {
    initialize,
    sendNotification,
    sendMessageNotification,
    updateConversationNotifications,
    io
}; 