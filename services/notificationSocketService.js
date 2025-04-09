/**
 * خدمة سوكت للإشعارات
 * توفر وظائف لإرسال الإشعارات عبر Socket.io
 */
const NotificationService = require('./notificationService');
const logger = require('./loggerService');
const User = require('../models/User');
const ContactHelper = require('../utils/contactHelper');

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
            // فحص وجود userId للانضمام للغرفة الصحيحة
            if (socket.userId && socket.userId !== 'guest') {
                // لدينا userId متاح بالفعل، انضم للغرفة مباشرة
                joinUserToNotificationRoom(socket, socket.userId);
            } else {
                // تسجيل التحذير وتخزين المعلومة أنه يجب الانضمام للغرفة عندما يصبح userId متاحًا
                socket._shouldJoinNotificationsWhenUserIdAvailable = true;
            }
        });
        
        // مستمع جديد لحدث تحديث userId (يتم استدعاؤه من middleware أو socketService عند تعيين userId)
        socket.on('userId-set', (data) => {
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
        logger.warn('notificationSocketService', '[sendNotification] Missing io, userId, or notification object', {
            hasIo: !!io,
            hasUserId: !!userId,
            hasNotification: !!notification
        });
        return false; // لا يمكن الإرسال
    }

    let foundActiveSocket = false; // متغير لتتبع ما إذا وجدنا سوكت نشط
    try {
        const targetRoom = `notifications-${userId}`;
        logger.info('notificationSocketService', `[sendNotification] محاولة إرسال إشعار للمستخدم ${userId}`, {
            notificationType: notification.type,
            title: notification.title,
            targetRoom
        });
        
        const socketsInRoom = io.sockets.adapter.rooms.get(targetRoom);
        const socketIdsInRoom = socketsInRoom ? Array.from(socketsInRoom) : [];

        if (socketIdsInRoom.length === 0) {
            logger.warn('notificationSocketService', '[sendNotification] No sockets found in the target room. Switching to Web Push.', { 
                userId, 
                targetRoom,
                notificationId: notification._id
            });
            // ستتم محاولة إرسال إشعار Web Push لاحقًا إذا كان لدى المستخدم اشتراكات
        } else {
            foundActiveSocket = true; // وجدنا سوكتات نشطة في غرفة الإشعارات
            logger.info('notificationSocketService', `[sendNotification] Found ${socketIdsInRoom.length} active sockets in room. Emitting.`, {
                userId,
                socketCount: socketIdsInRoom.length
            });
            
            io.to(targetRoom).emit('new-notification', notification);
            
            // تحديث عدد الإشعارات غير المقروءة
            const unreadCount = await NotificationService.getUnreadCount(userId);
            io.to(targetRoom).emit('unread-notifications-count', { count: unreadCount });
            
            logger.info('notificationSocketService', '[sendNotification] Successfully emitted notification to sockets', {
                userId,
                notificationId: notification._id
            });
        }
        
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
 * إرسال إشعار برسالة جديدة إلى المستخدمين المعنيين (المسند له أو المشرفين) مع عنوان مخصص للإشعار.
 * @param {string} conversationId - معرف المحادثة.
 * @param {object} message - كائن الرسالة.
 * @param {object} conversation - كائن المحادثة.
 * @param {object} contact - كائن جهة الاتصال (اختياري).
 * @param {string} customTitle - عنوان مخصص للإشعار (اختياري).
 */
async function sendMessageNotificationWithCustomTitle(conversationId, message, conversation, contact = null, customTitle = null) {
    try {
        const assignedTo = conversation.assignedTo?.toString();
        
        // 1. إرسال للمستخدم المسند له (إذا كان موجودًا)
        if (assignedTo) {
            const isAssignedUserActive = isSocketInRoom(`conversation-${conversationId}`, assignedTo); // التحقق من النشاط في غرفة المحادثة
            
            // تخطي إنشاء الإشعار تماماً إذا كان المستخدم نشطاً في المحادثة وكان نوع الإشعار هو رسالة
            // هذا سيمنع إنشاء إشعارات للرسائل الواردة عندما يكون المستخدم نشطاً في المحادثة
            if (isAssignedUserActive && message && message.direction === 'incoming') {
                return; // خروج مبكر لمنع إنشاء الإشعار والعمليات اللاحقة
            }
            
            // --- إنشاء الإشعار أولاً --- 
            const senderName = ContactHelper.getServerDisplayName(conversation);
            const messageId = message?._id || message?.id || null;
            
            // استخدام العنوان المخصص إذا تم تمريره
            const title = customTitle || `رسالة جديدة من ${senderName}`;
            
            const notification = await NotificationService.createNotification({
                recipient: assignedTo,
                type: 'message',
                title: title,
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
                    sentViaSocket = await sendNotification(assignedTo, notification); // محاولة الإرسال
                } else if (isSocketInRoom(`notifications-${assignedTo}`, assignedTo)) {
                    sentViaSocket = true; 
                    // قد نحتاج لتحديث عدد غير المقروء هنا بشكل منفصل إذا لم يتم استدعاء sendNotification
                    try {
                        const unreadCount = await NotificationService.getUnreadCount(assignedTo);
                        const targetRoom = `notifications-${assignedTo}`;
                        io.to(targetRoom).emit('unread-notifications-count', { count: unreadCount });
                    } catch (countError) {
                        logger.error('notificationSocketService', '[sendMessageNotificationWithCustomTitle] Error manually fetching/sending unread count', { assignedTo, error: countError.message });
                    }
                } else {
                    logger.warn('notificationSocketService', '[sendMessageNotificationWithCustomTitle] User active in conversation but NOT in general notifications room? Might still send Web Push.', { assignedTo });
                    sentViaSocket = false; // لم يتم التأكد من الاتصال العام، اسمح بإمكانية إرسال Web Push
                }
                
                // --- إرسال ويب بوش فقط إذا لم يتم الإرسال عبر السوكت (أو لم يُعتبر كذلك) ---
                if (!sentViaSocket) {
                    try {
                        const user = await User.findById(assignedTo).select('webPushSubscriptions').lean();
                        if (user && user.webPushSubscriptions && user.webPushSubscriptions.length > 0) {
                            await NotificationService.sendWebPushNotification(user, notification);
                        }
                    } catch (fetchUserError) {
                        logger.error('notificationSocketService', '[sendMessageNotificationWithCustomTitle] Error fetching user for Web Push', { assignedTo, error: fetchUserError.message });
                    }
                }
            } else {
                logger.warn('notificationSocketService', '[sendMessageNotificationWithCustomTitle] Notification creation failed for assigned user', { assignedTo, conversationId });
            }
        } 
        // 2. إرسال للمشرفين (إذا كانت المحادثة غير مسندة أو بناءً على قواعد أخرى)
        else {
            // البحث عن المستخدمين النشطين الذين لديهم صلاحية الوصول للمحادثات
            const admins = await User.find({
              account_status: 'active',
              can_access_conversations: true
            }).select('_id webPushSubscriptions').lean();
            
            // ... (الحلقة للمرور على المشرفين)
            for (const admin of admins) {
                // تعديل التحقق من نشاط المشرف ليشمل غرفة الإشعارات العامة
                const isAdminActiveInConv = isSocketInRoom(`conversation-${conversationId}`, admin._id);
                
                // تخطي إنشاء الإشعار تماماً إذا كان المشرف نشطاً في المحادثة وكان نوع الإشعار هو رسالة
                if (isAdminActiveInConv && message && message.direction === 'incoming') {
                    continue; // تخطي هذا المشرف والانتقال للتالي
                }
                
                // إنشاء الإشعار للمشرف
                const senderName = ContactHelper.getServerDisplayName(conversation, { useContact: true });
                const messageId = message?._id || message?.id || null;
                
                // استخدام العنوان المخصص إذا تم تمريره
                const title = customTitle || `رسالة جديدة غير مسندة من ${senderName}`;
                
                const adminNotification = await NotificationService.createNotification({
                    recipient: admin._id,
                    type: 'message',
                    title: title,
                    message: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
                    content: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
                    link: `/crm/conversations/${conversationId}?msg=${messageId}`,
                    relatedConversation: conversationId,
                    relatedMessage: messageId
                }, conversation);

                if (adminNotification) {
                    let adminSentViaSocket = false;
                    
                    // --- التحقق من نشاط المشرف قبل إرسال إشعار الهيدر --- 
                    if (!isAdminActiveInConv) {
                        adminSentViaSocket = await sendNotification(admin._id, adminNotification);
                    } else if (isSocketInRoom(`notifications-${admin._id}`, admin._id)) {
                        adminSentViaSocket = true;
                        // تحديث عدد غير المقروء للمشرف النشط
                        try {
                            const unreadCount = await NotificationService.getUnreadCount(admin._id);
                            const targetRoom = `notifications-${admin._id}`;
                            io.to(targetRoom).emit('unread-notifications-count', { count: unreadCount });
                        } catch (countError) {
                            logger.error('notificationSocketService', '[sendMessageNotificationWithCustomTitle] Error manually fetching/sending unread count for admin', { adminId: admin._id, error: countError.message });
                        }
                    } else {
                        logger.warn('notificationSocketService', '[sendMessageNotificationWithCustomTitle] Admin active in conversation but NOT in general notifications room? Might still send Web Push.', { adminId: admin._id });
                        adminSentViaSocket = false;
                    }
                    
                    // --- إرسال ويب بوش للمشرف فقط إذا لم يتم الإرسال عبر السوكت --- 
                    if (!adminSentViaSocket) {
                        if (admin.webPushSubscriptions && admin.webPushSubscriptions.length > 0) {
                            await NotificationService.sendWebPushNotification(admin, adminNotification);
                        }
                    }
                } else {
                    logger.warn('notificationSocketService', '[sendMessageNotificationWithCustomTitle] Notification creation failed for admin', { adminId: admin._id, conversationId });
                }
            }
        }
    } catch (error) {
        logger.error('notificationSocketService', 'خطأ فادح في sendMessageNotificationWithCustomTitle', {
            conversationId,
            error: error.message,
            stack: error.stack
        });
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
            
            // تخطي إنشاء الإشعار تماماً إذا كان المستخدم نشطاً في المحادثة وكان نوع الإشعار هو رسالة
            // هذا سيمنع إنشاء إشعارات للرسائل الواردة عندما يكون المستخدم نشطاً في المحادثة
            if (isAssignedUserActive && message && message.direction === 'incoming') {

                return; // خروج مبكر لمنع إنشاء الإشعار والعمليات اللاحقة
            }
            
            // --- إنشاء الإشعار أولاً --- 
            const senderName = ContactHelper.getServerDisplayName(conversation);
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
                    sentViaSocket = await sendNotification(assignedTo, notification); // محاولة الإرسال
                } else {
                    // نعتبر أنه تم التسليم طالما المستخدم موجود في غرفة الإشعارات العامة
                    // هذا يمنع إرسال Web Push غير ضروري
                    if (isSocketInRoom(`notifications-${assignedTo}`, assignedTo)) {
                         sentViaSocket = true; 
                         // قد نحتاج لتحديث عدد غير المقروء هنا بشكل منفصل إذا لم يتم استدعاء sendNotification
                         try {
                             const unreadCount = await NotificationService.getUnreadCount(assignedTo);
                             const targetRoom = `notifications-${assignedTo}`;
                             io.to(targetRoom).emit('unread-notifications-count', { count: unreadCount });
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
                    try {
                        const user = await User.findById(assignedTo).select('webPushSubscriptions').lean();
                        if (user && user.webPushSubscriptions && user.webPushSubscriptions.length > 0) {
                            await NotificationService.sendWebPushNotification(user, notification);
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
            // البحث عن المستخدمين النشطين الذين لديهم صلاحية الوصول للمحادثات
            const admins = await User.find({
              account_status: 'active',
              can_access_conversations: true
            }).select('_id webPushSubscriptions').lean();
            
            // ... (الحلقة للمرور على المشرفين)
            for (const admin of admins) {
                // تعديل التحقق من نشاط المشرف ليشمل غرفة الإشعارات العامة
                const isAdminActiveInConv = isSocketInRoom(`conversation-${conversationId}`, admin._id);
                
                // تخطي إنشاء الإشعار تماماً إذا كان المشرف نشطاً في المحادثة وكان نوع الإشعار هو رسالة
                if (isAdminActiveInConv && message && message.direction === 'incoming') {

                    continue; // تخطي هذا المشرف والانتقال للتالي
                }
                
                // إنشاء الإشعار للمشرف
                const senderName = ContactHelper.getServerDisplayName(conversation, { useContact: true });
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
                    let adminSentViaSocket = false;
                    
                    // --- التحقق من نشاط المشرف قبل إرسال إشعار الهيدر --- 
                    if (!isAdminActiveInConv) {
                         adminSentViaSocket = await sendNotification(admin._id, adminNotification);
                    } else {
                         if (isSocketInRoom(`notifications-${admin._id}`, admin._id)) {
                             adminSentViaSocket = true;
                              // تحديث عدد غير المقروء للمشرف النشط
                             try {
                                 const unreadCount = await NotificationService.getUnreadCount(admin._id);
                                 const targetRoom = `notifications-${admin._id}`;
                                 io.to(targetRoom).emit('unread-notifications-count', { count: unreadCount });
                             } catch (countError) {
                                  logger.error('notificationSocketService', '[sendMessageNotification] Error manually fetching/sending unread count for admin', { adminId: admin._id, error: countError.message });
                             }
                         } else {
                              logger.warn('notificationSocketService', '[sendMessageNotification] Admin active in conversation but NOT in general notifications room? Might still send Web Push.', { adminId: admin._id });
                              adminSentViaSocket = false;
                         }
                    }
                    // --- نهاية التحقق من نشاط المشرف ---
                    
                    // --- إرسال ويب بوش للمشرف فقط إذا لم يتم الإرسال عبر السوكت --- 
                    if (!adminSentViaSocket) {
                         if (admin.webPushSubscriptions && admin.webPushSubscriptions.length > 0) {
                             await NotificationService.sendWebPushNotification(admin, adminNotification);
                         }
                    }
                    // --- نهاية إرسال ويب بوش للمشرف ---
                    
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
            const customerName = ContactHelper.getServerDisplayName(conversation);
            const notification = await NotificationService.createAndSendNotification({
                recipient: conversation.assignedTo,
                type: 'conversation',
                title: 'تم إسناد محادثة جديدة لك',
                content: `تم إسناد محادثة مع ${customerName} إليك`,
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
        
        // مغادرة الغرفة الخاطئة إذا كان قد انضم إليها سابقًا
        if (socket.rooms.has('notifications-unknown')) {
            socket.leave('notifications-unknown');
        }
        
        // الانضمام للغرفة الصحيحة
        socket.join(notificationRoom);
        
        // إرسال عدد الإشعارات غير المقروءة عند الانضمام
        NotificationService.getUnreadCount(userId)
            .then(unreadCount => {
                socket.emit('unread-notifications-count', { count: unreadCount });
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
    sendMessageNotificationWithCustomTitle,
    updateConversationNotifications
}; 