/**
 * نظام الإشعارات الفورية باستخدام Socket.IO
 * يستخدم لتحسين تجربة المستخدم مع التحديثات الفورية لنظام المراسلة
 */
document.addEventListener('DOMContentLoaded', function() {
    // تهيئة اتصال Socket.io
    const socketConnection = initializeSocketConnection();
    
    // تفعيل مستمعات الإشعارات
    setupNotificationListeners(socketConnection);
    
    // تفعيل مستمعات تحديث المحتوى
    setupContentUpdateListeners(socketConnection);
});

/**
 * تهيئة اتصال Socket.io
 * @returns {Object} كائن اتصال Socket.io
 */
function initializeSocketConnection() {
    // التحقق من وجود كائن socket.io في النافذة
    if (typeof io === 'undefined') {
        // إزالة التسجيل - لم يتم العثور على مكتبة Socket.io
        return null;
    }
    
    try {
        // إنشاء اتصال Socket.io مع الخادم
        const socket = io({
            auth: {
                userId: window.currentUserId || 'guest',
                username: window.currentUsername || 'زائر'
            },
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5
        });
        
        // تسجيل نجاح الاتصال
        socket.on('connect', function() {
            window.socketConnected = true;
            
            // الانضمام إلى غرف المستخدم
            if (window.currentUserId) {
                socket.emit('join', { room: `user-${window.currentUserId}` });
            }
            
            // الانضمام إلى غرف المحادثات المفتوحة
            if (window.currentConversationId) {
                socket.emit('join', { room: `conversation-${window.currentConversationId}` });
            }
            
            // تنفيذ أي عمليات معلقة بانتظار اتصال Socket.io
            if (Array.isArray(window.pendingSocketOperations)) {
                window.pendingSocketOperations.forEach(operation => {
                    if (typeof operation === 'function') {
                        operation(socket);
                    }
                });
                window.pendingSocketOperations = [];
            }
        });
        
        // تسجيل إعادة الاتصال
        socket.on('reconnect', function() {
            window.socketConnected = true;
            
            // تحديث المحتوى بعد إعادة الاتصال
            refreshCurrentContent();
        });
        
        // تسجيل فقدان الاتصال
        socket.on('disconnect', function() {
            window.socketConnected = false;
        });
        
        // تسجيل الأخطاء
        socket.on('error', function(error) {
            // إزالة التسجيل - خطأ في نظام الإشعارات
        });
        
        // تخزين الاتصال في نافذة المتصفح للاستخدام العام
        window.socketConnection = socket;
        
        return socket;
    } catch (error) {
        return null;
    }
}

/**
 * تفعيل مستمعات الإشعارات
 * @param {Object} socket - كائن اتصال Socket.io
 */
function setupNotificationListeners(socket) {
    if (!socket) return;
    
    // استقبال إشعار برسالة جديدة
    socket.on('new-message', function(data) {
        const message = data.message || data;
        const conversationId = message.conversationId;
        const messageId = message._id;
        
        if (window.debugMode) console.log('استلام إشعار برسالة جديدة:', message);
        
        // التحقق ما إذا كانت هذه الرسالة قد تم إنشاؤها محلياً (لتجنب التكرار)
        if (window.sentMessageIds && (window.sentMessageIds.has(messageId) || (message.clientMessageId && window.sentMessageIds.has(message.clientMessageId)))) {
            if (window.debugMode) console.log('تجاهل الرسالة المكررة:', messageId);
            return;
        }
        
        // تحديد ما إذا كانت الرسالة واردة من شخص آخر
        const isFromOthers = message.direction === 'incoming' || 
                              (message.direction === 'outgoing' && message.sentBy && 
                               window.currentUserId !== message.sentBy.toString());
        
        // تحديد اسم المرسل بنفس منطق ملف _conversation_details_ajax.ejs
        let senderName = '';
        
        if (message.direction === 'outgoing') {
            // للرسائل الصادرة: نستخدم معلومات المرسل بنفس الترتيب المستخدم في _conversation_details_ajax.ejs
            if (message.metadata && message.metadata.senderInfo) {
                senderName = message.metadata.senderInfo.username || message.metadata.senderInfo.full_name || 'النظام';
            } else if (message.sentByUsername) {
                senderName = message.sentByUsername;
            } else if (message.sentBy) {
                try {
                    const senderId = message.sentBy.toString();
                    if (senderId === 'system') {
                        senderName = 'النظام';
                    } else if (senderId === window.currentUserId) {
                        senderName = window.currentUsername || 'أنت';
                    }
                } catch (e) { }
            }
            
            // إذا لم نجد اسم المرسل، نستخدم اسم المستخدم الحالي إذا كان متاحاً
            if (!senderName && window.currentUserId && message.sentBy && window.currentUserId === message.sentBy.toString()) {
                senderName = window.currentUsername || 'أنت';
            } else if (!senderName) {
                senderName = 'مستخدم آخر';
            }
        } 
        // للرسائل الواردة: نستخدم اسم العميل أو رقم الهاتف
        else if (message.direction === 'incoming') {
            senderName = '';  // لا نعرض اسم المرسل للرسائل الواردة كما في _conversation_details_ajax.ejs
        }
        // للملاحظات الداخلية: نستخدم معلومات المرسل من metadata
        else if (message.direction === 'internal') {
            if (message.metadata && message.metadata.senderInfo) {
                senderName = message.metadata.senderInfo.full_name || message.metadata.senderInfo.username || 'مستخدم';
            }
        }

        // عرض الإشعار فقط إذا كانت الرسالة من الآخرين أو كانت ملاحظة داخلية
        if (isFromOthers || message.direction === 'internal') {
            // تحديد نوع الرسالة للإشعار
            const messageType = message.direction === 'internal' ? 'ملاحظة داخلية' : 'رسالة جديدة';
            
            // إزالة علامات HTML من المحتوى لعرضه في الإشعار
            const cleanContent = message.content ? message.content.replace(/<[^>]*>?/gm, '') : '';
            
            // عرض عنوان مناسب حسب نوع الرسالة
            let title = messageType;
            if (message.direction === 'internal') {
                title = `ملاحظة داخلية ${senderName ? 'من ' + senderName : ''}`;
            } else if (message.direction === 'incoming') {
                title = `رسالة واردة ${data.conversationName ? 'من ' + data.conversationName : ''}`;
            } else {
                title = `رسالة صادرة ${senderName ? 'من ' + senderName : ''}`;
            }
            
            // عرض الإشعار
            notifications.showNotification(title, cleanContent, function() {
                if (conversationId) {
                    // توجيه المستخدم إلى المحادثة ذات الصلة عند النقر على الإشعار
                    if (window.location.href.includes(`/crm/conversations/${conversationId}`)) {
                        // إذا كنا بالفعل في صفحة المحادثة، قم بالتحديث
                        location.reload();
                    } else {
                        // وإلا انتقل إلى صفحة المحادثة
                        window.location.href = `/crm/conversations/${conversationId}`;
                    }
                }
            });
        }

        // عرض إشعار صغير في أعلى الشاشة
        if (isFromOthers || message.direction === 'internal') {
            let notificationText = '';
            if (message.direction === 'internal') {
                notificationText = `<b>ملاحظة داخلية جديدة${senderName ? ' من ' + senderName : ''}</b>`;
            } else if (message.direction === 'incoming') {
                notificationText = `<b>رسالة واردة جديدة${data.conversationName ? ' من ' + data.conversationName : ''}</b>`;
            } else {
                notificationText = `<b>رسالة صادرة جديدة${senderName ? ' من ' + senderName : ''}</b>`;
            }
            
            if (window.showToast) {
                window.showToast(notificationText, 'info', 5000);
            }
        }
    });
    
    // استقبال إشعار بتحديث حالة الرسالة
    socket.on('message-status-update', function(data) {        
        // تحديث حالة الرسالة في واجهة المستخدم
        if (typeof window.updateMessageStatus === 'function') {
            window.updateMessageStatus(data.externalId, data.status);
        }
    });
    
    // استقبال إشعار بتفاعل جديد
    socket.on('message-reaction', function(data) {        
        // تحديث التفاعل في واجهة المستخدم
        if (typeof window.updateMessageReaction === 'function') {
            window.updateMessageReaction(data.externalId, data.reaction);
        }
    });
    
    // استقبال إشعار بتحديث معرف خارجي للرسالة
    socket.on('message-external-id-update', function(data) {        
        // تحديث المعرف الخارجي في واجهة المستخدم
        updateMessageExternalId(data.messageId, data.externalId);
    });
    
    // استقبال إشعار بتحديث المحادثة
    socket.on('conversation-update', function(data) {        
        // تحديث معلومات المحادثة في واجهة المستخدم
        updateConversationInfo(data);
        
        // تحديث قائمة المحادثات
        updateConversationsList();
    });
    
    // استقبال إشعار برد على رسالة
    socket.on('message-reply', function(data) {        
        // التعامل مع بنيتين مختلفتين للبيانات
        const message = data.message || data;
        
        // تحديث واجهة المستخدم إذا كان الرد يخص المحادثة الحالية
        if (window.currentConversationId && message.conversationId === window.currentConversationId) {
            // استخدام نفس الدالة لإضافة الرسالة في واجهة المستخدم
            if (typeof window.addMessageToConversation === 'function') {
                window.addMessageToConversation(message);
            } else {
                appendNewMessage(message);
            }
            }
        
        // تحديث قائمة المحادثات
        updateConversationsList();
        
        // تشغيل صوت الإشعار للرسائل الواردة فقط
        if (typeof window.playNotificationSound === 'function' && message.direction === 'incoming') {
            window.playNotificationSound();
        }
    });
    
    // استقبال إشعار بملاحظة داخلية جديدة
    socket.on('internal-note', function(data) {        
        // التعامل مع الهيكل المتوقع للبيانات
        const note = data.note || data;
        
        // تحديث واجهة المستخدم إذا كانت الملاحظة تخص المحادثة الحالية
        if (window.currentConversationId && note.conversationId === window.currentConversationId) {
            // فحص متقدم لمنع تكرار الملاحظات

            // 1. التحقق من وجود الملاحظة في واجهة المستخدم بالفعل
            const existingNote = document.querySelector(`[data-note-id="${note._id}"]`);
            if (existingNote) {
                return;
            }

            // 2. التحقق من وجود الملاحظة في قائمة الملاحظات المرسلة
            if (window.sentNoteIds && (
                window.sentNoteIds.has(note._id) || 
                (note._clientId && window.sentNoteIds.has(note._clientId))
            )) {
                return;
            }

            // 3. إضافة معرف الملاحظة إلى قائمة الملاحظات المرسلة لتجنب التكرار المستقبلي
            if (window.sentNoteIds && note._id) {
                window.sentNoteIds.add(note._id);
                if (note._clientId) {
                    window.sentNoteIds.add(note._clientId);
                }
            } else if (!window.sentNoteIds) {
                window.sentNoteIds = new Set();
                window.sentNoteIds.add(note._id);
            }

            // إضافة الملاحظة إلى واجهة المستخدم
            if (typeof window.addNoteToUI === 'function') {
                window.addNoteToUI(note);
            }
        }
        
        // تحديث قائمة المحادثات
        updateConversationsList();
        
        // تشغيل صوت الإشعار للملاحظات الداخلية إذا لم تكن من المستخدم الحالي
        if (typeof window.playNotificationSound === 'function' && 
            (!note.author || note.author._id !== window.currentUserId)) {
            window.playNotificationSound();
        }
    });
}

/**
 * تفعيل مستمعات تحديث المحتوى
 * @param {Object} socket - كائن اتصال Socket.io
 */
function setupContentUpdateListeners(socket) {
    if (!socket) return;
    
    // الاستماع لتغييرات في الصفحة
    document.addEventListener('conversation-opened', function(event) {
        if (event.detail && event.detail.conversationId) {
            // الانضمام إلى غرفة المحادثة الجديدة
            socket.emit('join', { room: `conversation-${event.detail.conversationId}` });
            
            // تحديث معرف المحادثة الحالية
            window.currentConversationId = event.detail.conversationId;
        }
    });
}

/**
 * إضافة رسالة جديدة إلى واجهة المستخدم
 * @param {Object} message - الرسالة الجديدة
 */
function appendNewMessage(message) {
    // التحقق من وجود حاوية الرسائل
    const messagesContainer = document.querySelector('.messages-container');
    if (!messagesContainer) return;
    
    // فحص متقدم لمنع تكرار الرسائل
    
    // 1. التحقق من وجود الرسالة في الواجهة بالفعل
    const existingMessage = document.querySelector(`[data-message-id="${message._id}"]`);
    if (existingMessage) {
        if (window.DEBUG_MESSAGES) {
        }
        
        // تحديث حالة الرسالة الموجودة إذا تغيرت
        if (message.status) {
            const statusElement = existingMessage.querySelector('.message-status');
            if (statusElement) {
                statusElement.innerHTML = getStatusIcon(message.status);
            }
        }
        
        return;
    }
    
    // 2. التحقق من وجود المعرف في مجموعة الرسائل المرسلة
    if (window.sentMessageIds && window.sentMessageIds.has(message._id)) {
        if (window.DEBUG_MESSAGES) {
        }
        return;
    }
    
    // 3. التحقق من وجود رسالة مؤقتة مرتبطة برسالة حقيقية
    if (window.pendingMessageMapping) {
        const tempIdEntries = Object.entries(window.pendingMessageMapping).filter(([tempId, realId]) => realId === message._id);
        if (tempIdEntries.length > 0) {
            const tempId = tempIdEntries[0][0];
            const pendingMessage = document.querySelector(`[data-message-id="${tempId}"]`);
            
            if (pendingMessage) {
                if (window.DEBUG_MESSAGES) {
                }
                
                // استبدال الرسالة المؤقتة بالرسالة الحقيقية
                pendingMessage.setAttribute('data-message-id', message._id);
                if (message.externalMessageId) {
                    pendingMessage.setAttribute('data-external-id', message.externalMessageId);
                }
                
                // تحديث محتوى الرسالة
                pendingMessage.className = `message ${message.direction === 'incoming' ? 'incoming' : 'outgoing'}`;
                pendingMessage.innerHTML = getMessageTemplate(message);
                
                // تحديث الإجراءات
                if (typeof window.setupMessageActions === 'function') {
                    window.setupMessageActions(pendingMessage);
                }
                
                // حذف المعرف المؤقت من التخطيط
                delete window.pendingMessageMapping[tempId];
                return;
            }
        }
    }
    
    // عرض الرسالة في الواجهة
    try {
        // إضافة الرسالة إلى DOM
        const newMessageElement = document.createElement('div');
        newMessageElement.className = `message ${message.direction === 'incoming' ? 'incoming' : 'outgoing'}`;
        newMessageElement.setAttribute('data-message-id', message._id);
        
        if (message.externalMessageId) {
            newMessageElement.setAttribute('data-external-id', message.externalMessageId);
        }
        
        // إضافة قالب الرسالة
        newMessageElement.innerHTML = getMessageTemplate(message);
        
        // إضافة الرسالة إلى حاوية الرسائل
        messagesContainer.appendChild(newMessageElement);
        
        // إعداد الإجراءات للرسالة الجديدة
        if (typeof window.setupMessageActions === 'function') {
            window.setupMessageActions(newMessageElement);
        }
        
        // تمرير حدث بأن الرسائل تم تحديثها
        document.dispatchEvent(new CustomEvent('messages-loaded'));
        
        // تحديث الموضع إلى أحدث رسالة
        scrollToBottom(messagesContainer);
    } catch (error) {
    }
}

/**
 * الحصول على قالب الرسالة
 * @param {Object} message - الرسالة
 * @returns {string} HTML للرسالة
 */
function getMessageTemplate(message) {
    // إذا كان هناك قالب موجود بالفعل، يمكن استخدامه
    // وإلا، نقوم بإنشاء قالب بسيط هنا
    
    // تحديد اتجاه الرسالة
    const isOutgoing = message.direction === 'outgoing';
    const messageClass = isOutgoing ? 'message outgoing' : 'message incoming';
    
    // تنسيق الوقت
    const formattedTime = typeof window.formatTime === 'function' ? 
                          window.formatTime(message.timestamp) : 
                          new Date(message.timestamp).toLocaleTimeString();
    
    // تحديد نص الحالة
    const statusText = typeof window.getStatusText === 'function' ? 
                      window.getStatusText(message.status) : 
                      message.status;
    
    // تحديد اسم المرسل للرسائل الصادرة فقط
    let senderHtml = '';
    if (isOutgoing) {
        let senderName = '';
        
        // 1. محاولة الحصول على الاسم من معلومات المرسل في metadata
        if (message.metadata && message.metadata.senderInfo) {
            senderName = message.metadata.senderInfo.username || message.metadata.senderInfo.full_name;
        }
        // 2. محاولة الحصول على الاسم من sentByUsername مباشرة
        else if (message.sentByUsername) {
            senderName = message.sentByUsername;
        }
        // 3. محاولة الحصول على المعلومات من معرف المرسل
        else if (message.sentBy) {
            try {
                // محاولة استخدام معرف المرسل
                const senderId = typeof message.sentBy === 'string' ? message.sentBy : 
                              (message.sentBy.toString ? message.sentBy.toString() : '');
                
                if (senderId === 'system') {
                    senderName = 'النظام';
                } else if (window.currentUserId && senderId === window.currentUserId) {
                    senderName = window.currentUsername || 'أنت';
                }
            } catch (e) {
                console.error('خطأ في استخراج معرف المرسل:', e);
            }
        }
        
        // 4. إذا لم نجد اسم المرسل، نستخدم اسم المستخدم الحالي إذا كانت الرسالة صادرة من المستخدم الحالي
        if (!senderName && window.currentUsername && 
            ((message.sentBy && message.sentBy === window.currentUserId) || 
             (message.metadata && message.metadata.senderInfo && message.metadata.senderInfo._id === window.currentUserId))) {
            senderName = window.currentUsername;
        }
        
        // 5. إذا لم يكن هناك اسم بعد كل هذه المحاولات، استخدم اسم افتراضي
        if (!senderName) {
            senderName = 'المستخدم';
        }
        
        // تسجيل معلومات التشخيص إذا كان وضع التصحيح مفعل
        if (window.DEBUG_MESSAGES === true) {
            console.log('معلومات المرسل للرسالة:', {
                senderName: senderName,
                messageId: message._id,
                sentBy: message.sentBy,
                metadata: message.metadata,
                currentUserId: window.currentUserId
            });
        }
        
        // إضافة اسم المرسل إلى قالب الرسالة
        senderHtml = `<div class="message-sender">${senderName}</div>`;
    }
    
    // محتوى الرسالة الأساسي
    let messageContent = `<div class="message-text">${message.content}</div>`;
    
    // إضافة عناصر الوسائط إذا كان هناك
    if (message.mediaType && message.mediaUrl) {
        if (message.mediaType === 'image') {
            messageContent = `<div class="media-container">
                <img src="${message.mediaUrl}" alt="صورة" class="message-media" 
                     onclick="openMediaPreview('${message.mediaUrl}', 'image')">
                ${message.caption ? `<div class="media-caption">${message.caption}</div>` : ''}
                ${message.content ? `<div class="message-text">${message.content}</div>` : ''}
            </div>`;
        } else if (message.mediaType === 'video') {
            messageContent = `<div class="media-container">
                <video controls class="message-media">
                    <source src="${message.mediaUrl}" type="video/mp4">
                    المتصفح لا يدعم تشغيل الفيديو
                </video>
                ${message.caption ? `<div class="media-caption">${message.caption}</div>` : ''}
                ${message.content ? `<div class="message-text">${message.content}</div>` : ''}
            </div>`;
        } else if (message.mediaType === 'audio') {
            messageContent = `<div class="media-container">
                <audio controls class="media-audio">
                    <source src="${message.mediaUrl}" type="audio/mp3">
                    المتصفح لا يدعم تشغيل الصوت
                </audio>
                ${message.content ? `<div class="message-text">${message.content}</div>` : ''}
            </div>`;
        } else if (message.mediaType === 'document') {
            messageContent = `<div class="media-container">
                <div class="document-preview">
                    <i class="fas fa-file-alt"></i>
                    <a href="${message.mediaUrl}" target="_blank" class="document-link">
                        فتح المستند
                    </a>
                </div>
                ${message.caption ? `<div class="media-caption">${message.caption}</div>` : ''}
                ${message.content ? `<div class="message-text">${message.content}</div>` : ''}
            </div>`;
        }
    }
    
    // إنشاء قالب الرسالة
    return `
    <div class="${messageClass}" data-message-id="${message._id}" data-external-id="${message.externalMessageId || ''}">
        <div class="message-container">
            ${senderHtml}
            ${messageContent}
            <div class="message-meta">
                <span class="message-time">${formattedTime}</span>
                ${isOutgoing ? `<span class="message-status" title="${statusText}">${getStatusIcon(message.status)}</span>` : ''}
            </div>
        </div>
        <div class="message-actions">
            <button class="btn btn-sm reaction-btn" onclick="showReactionPicker('${message._id}', '${message.externalMessageId || ''}', this)">
                <i class="far fa-smile"></i>
            </button>
            <button class="btn btn-sm reply-btn" onclick="showReplyForm('${message._id}', '${message.externalMessageId || ''}', this)">
                <i class="fas fa-reply"></i>
            </button>
        </div>
    </div>`;
}

/**
 * الحصول على أيقونة الحالة
 * @param {string} status - حالة الرسالة
 * @returns {string} HTML للأيقونة
 */
function getStatusIcon(status) {
    switch (status) {
        case 'pending':
            return '<i class="fas fa-clock"></i>';
        case 'sent':
            return '<i class="fas fa-check"></i>';
        case 'delivered':
            return '<i class="fas fa-check-double"></i>';
        case 'read':
            return '<i class="fas fa-check-double text-primary"></i>';
        case 'failed':
            return '<i class="fas fa-exclamation-triangle text-danger"></i>';
        default:
            return '<i class="fas fa-check"></i>';
    }
}

/**
 * تمرير إلى أسفل حاوية الرسائل
 * @param {HTMLElement} container - حاوية الرسائل
 */
function scrollToBottom(container) {
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

/**
 * تحديث قائمة المحادثات
 */
function updateConversationsList() {
    // التحقق مما إذا كانت قائمة المحادثات موجودة في الصفحة
    const conversationsList = document.querySelector('.conversations-list');
    if (!conversationsList) return;
    
    // استعلام AJAX لتحديث قائمة المحادثات
    fetch('/crm/conversations/ajax/list')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.conversations) {
                // تحديث قائمة المحادثات
                // هذا يعتمد على كيفية عرض المحادثات في التطبيق الخاص بك
                updateConversationsUI(data.conversations);
            }
        })
        .catch(error => {
            console.error('خطأ في تحديث قائمة المحادثات:', error);
        });
}

/**
 * تحديث واجهة قائمة المحادثات
 * @param {Array} conversations - قائمة المحادثات المحدثة
 */
function updateConversationsUI(conversations) {
    const conversationsList = document.querySelector('.conversations-list');
    if (!conversationsList) return;
    
    // الملحق الحالي من عنوان URL
    const currentPath = window.location.pathname;
    
    // تحديث القائمة
    conversations.forEach(conversation => {
        // البحث عن عنصر المحادثة إذا كان موجودًا بالفعل
        const existingConversation = document.querySelector(`[data-conversation-id="${conversation._id}"]`);
        
        if (existingConversation) {
            // تحديث العنصر الموجود
            // تحديث عدد الرسائل غير المقروءة
            const unreadBadge = existingConversation.querySelector('.unread-badge');
            if (unreadBadge) {
                if (conversation.unreadCount > 0) {
                    unreadBadge.textContent = conversation.unreadCount;
                    unreadBadge.classList.remove('d-none');
                } else {
                    unreadBadge.classList.add('d-none');
                }
            }
            
            // تحديث آخر رسالة
            const lastMessageElement = existingConversation.querySelector('.conversation-last-message');
            if (lastMessageElement && conversation.lastMessage) {
                lastMessageElement.textContent = conversation.lastMessage.content || '(وسائط)';
            }
            
            // تحديث وقت آخر رسالة
            const lastTimeElement = existingConversation.querySelector('.conversation-time');
            if (lastTimeElement && conversation.lastMessage) {
                lastTimeElement.textContent = typeof window.formatTime === 'function' ? 
                                              window.formatTime(conversation.lastMessage.timestamp) : 
                                              new Date(conversation.lastMessage.timestamp).toLocaleTimeString();
            }
            
            // تحديث حالة المحادثة
            existingConversation.classList.remove('status-open', 'status-assigned', 'status-closed');
            existingConversation.classList.add(`status-${conversation.status}`);
            
            // نقل المحادثة إلى أعلى القائمة إذا كانت هي آخر محادثة محدثة
            const firstChild = conversationsList.firstChild;
            if (existingConversation !== firstChild) {
                conversationsList.insertBefore(existingConversation, firstChild);
            }
        } else {
            // إنشاء عنصر محادثة جديد
            // هذا يعتمد على كيفية عرض المحادثات في التطبيق الخاص بك
            // يمكنك استخدام قالب مشابه للموجود في النظام
        }
    });
}

/**
 * تحديث معلومات المحادثة
 * @param {Object} data - بيانات المحادثة المحدثة
 */
function updateConversationInfo(data) {
    // التحقق مما إذا كانت هذه هي المحادثة الحالية
    if (!window.currentConversationId || data._id !== window.currentConversationId) return;
    
    // تحديث معلومات المحادثة في واجهة المستخدم
    const conversationHeader = document.querySelector('.conversation-header');
    if (conversationHeader) {
        // تحديث الحالة
        const statusElement = conversationHeader.querySelector('.conversation-status');
        if (statusElement) {
            statusElement.textContent = getStatusText(data.status);
            
            // تحديث لون الحالة
            statusElement.className = 'conversation-status';
            statusElement.classList.add(`status-${data.status}`);
        }
        
        // تحديث المسؤول
        const assignedToElement = conversationHeader.querySelector('.conversation-assigned');
        if (assignedToElement && data.assignedTo) {
            assignedToElement.textContent = data.assignedTo.full_name || data.assignedTo.username;
        }
    }
}

/**
 * الحصول على نص الحالة
 * @param {string} status - حالة المحادثة
 * @returns {string} نص الحالة
 */
function getStatusText(status) {
    switch (status) {
        case 'open':
            return 'مفتوحة';
        case 'assigned':
            return 'مسندة';
        case 'closed':
            return 'مغلقة';
        default:
            return status;
    }
}

/**
 * تحديث المحتوى الحالي من الخادم
 */
function refreshCurrentContent() {
    // التحقق مما إذا كنا في صفحة المحادثة
    if (window.currentConversationId) {
        // تحديث تفاصيل المحادثة
        fetch(`/crm/conversations/${window.currentConversationId}/ajax`)
            .then(response => response.text())
            .then(html => {
                const messagesContainer = document.querySelector('.messages-container');
                if (messagesContainer) {
                    messagesContainer.innerHTML = html;
                    
                    // تفعيل مستمعات الأحداث للرسائل
                    if (typeof window.attachConversationEventListeners === 'function') {
                        window.attachConversationEventListeners();
                    }
                    
                    // تمرير حدث بأن الرسائل تم تحديثها
                    document.dispatchEvent(new CustomEvent('messages-loaded'));
                }
            })
            .catch(error => {
                console.error('خطأ في تحديث المحتوى:', error);
            });
    }
    
    // تحديث قائمة المحادثات
    updateConversationsList();
}

/**
 * تحديث المعرف الخارجي للرسالة
 * @param {string} messageId - معرف الرسالة الداخلي
 * @param {string} externalId - المعرف الخارجي
 */
function updateMessageExternalId(messageId, externalId) {
    // البحث عن عنصر الرسالة
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageElement) return;
    
    // تحديث سمة البيانات
    messageElement.setAttribute('data-external-id', externalId);
    
    // تحديث المعرف في أي عناصر أخرى داخل الرسالة
    const reactionButtons = messageElement.querySelectorAll('.reaction-btn');
    reactionButtons.forEach(button => {
        const onclickAttr = button.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes('showReactionPicker')) {
            button.setAttribute('onclick', `showReactionPicker('${messageId}', '${externalId}', this)`);
        }
    });
    
    const replyButtons = messageElement.querySelectorAll('.reply-btn');
    replyButtons.forEach(button => {
        const onclickAttr = button.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes('showReplyForm')) {
            button.setAttribute('onclick', `showReplyForm('${messageId}', '${externalId}', this)`);
        }
    });
}