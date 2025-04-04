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
        console.error('لم يتم العثور على مكتبة Socket.io. بعض الوظائف قد لا تعمل بشكل صحيح.');
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
            console.log('تم الاتصال بنظام الإشعارات الفورية');
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
                console.log('تنفيذ العمليات المعلقة:', window.pendingSocketOperations.length);
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
            console.log('تم إعادة الاتصال بنظام الإشعارات');
            window.socketConnected = true;
            
            // تحديث المحتوى بعد إعادة الاتصال
            refreshCurrentContent();
        });
        
        // تسجيل فقدان الاتصال
        socket.on('disconnect', function() {
            console.log('تم فقدان الاتصال بنظام الإشعارات');
            window.socketConnected = false;
        });
        
        // تسجيل الأخطاء
        socket.on('error', function(error) {
            console.error('خطأ في نظام الإشعارات:', error);
        });
        
        // تخزين الاتصال في نافذة المتصفح للاستخدام العام
        window.socketConnection = socket;
        
        return socket;
    } catch (error) {
        console.error('خطأ في إنشاء اتصال Socket.io:', error);
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
        console.log('تم استلام رسالة جديدة:', data);
        
        // التعامل مع بنيتين مختلفتين للبيانات: إما الرسالة مباشرة أو داخل كائن message
        const message = data.message || data;
        
        // تحديث واجهة المستخدم إذا كانت الرسالة تخص المحادثة الحالية
        if (window.currentConversationId && message.conversationId === window.currentConversationId) {
            // نقوم باستدعاء الدالة الصحيحة لإضافة الرسالة
            if (typeof window.addMessageToConversation === 'function') {
                window.addMessageToConversation(message);
            } else {
                appendNewMessage(message);
            }
            
            // تسجيل تأكيد في السجل
            console.log('تمت إضافة رسالة جديدة للمحادثة:', message._id);
        } else {
            console.log('تم تجاهل الرسالة لأنها لا تخص المحادثة الحالية');
        }
        
        // تحديث قائمة المحادثات إذا كانت موجودة
        updateConversationsList();
        
        // تشغيل صوت الإشعار
        if (typeof window.playNotificationSound === 'function') {
            window.playNotificationSound();
        }
    });
    
    // استقبال إشعار بتحديث حالة الرسالة
    socket.on('message-status-update', function(data) {
        console.log('تم تحديث حالة الرسالة:', data);
        
        // تحديث حالة الرسالة في واجهة المستخدم
        if (typeof window.updateMessageStatus === 'function') {
            window.updateMessageStatus(data.externalId, data.status);
        }
    });
    
    // استقبال إشعار بتفاعل جديد
    socket.on('message-reaction', function(data) {
        console.log('تم استلام تفاعل جديد:', data);
        
        // تحديث التفاعل في واجهة المستخدم
        if (typeof window.updateMessageReaction === 'function') {
            window.updateMessageReaction(data.messageId, data.reaction);
        }
    });
    
    // استقبال إشعار بتحديث معرف خارجي للرسالة
    socket.on('message-external-id-update', function(data) {
        console.log('تم تحديث معرف خارجي للرسالة:', data);
        
        // تحديث المعرف الخارجي في واجهة المستخدم
        updateMessageExternalId(data.messageId, data.externalId);
    });
    
    // استقبال إشعار بتحديث المحادثة
    socket.on('conversation-update', function(data) {
        console.log('تم تحديث المحادثة:', data);
        
        // تحديث معلومات المحادثة في واجهة المستخدم
        updateConversationInfo(data);
        
        // تحديث قائمة المحادثات
        updateConversationsList();
    });
    
    // استقبال إشعار برد على رسالة
    socket.on('message-reply', function(data) {
        console.log('تم استلام رد على رسالة:', data);
        
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
            
            console.log('تمت إضافة رد جديد للمحادثة:', message._id);
        }
        
        // تحديث قائمة المحادثات
        updateConversationsList();
        
        // تشغيل صوت الإشعار
        if (typeof window.playNotificationSound === 'function') {
            window.playNotificationSound();
        }
    });
    
    // استقبال إشعار بملاحظة داخلية جديدة
    socket.on('internal-note', function(data) {
        console.log('تم استلام ملاحظة داخلية جديدة:', data);
        
        // التعامل مع الهيكل المتوقع للبيانات
        const note = data.note || data;
        
        // تحديث واجهة المستخدم إذا كانت الملاحظة تخص المحادثة الحالية
        if (window.currentConversationId && note.conversationId === window.currentConversationId) {
            // إضافة الملاحظة إلى واجهة المستخدم
            if (typeof window.addNoteToUI === 'function') {
                // التحقق من عدم وجود الملاحظة مسبقاً (لتجنب التكرار)
                if (!window.sentNoteIds || !window.sentNoteIds.has(note._id)) {
                    window.addNoteToUI(note);
                    console.log('تمت إضافة ملاحظة داخلية جديدة للمحادثة:', note._id);
                } else {
                    console.log('تم تجاهل ملاحظة داخلية مكررة:', note._id);
                }
            }
        }
        
        // تحديث قائمة المحادثات
        updateConversationsList();
        
        // تشغيل صوت الإشعار
        if (typeof window.playNotificationSound === 'function') {
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
    
    // التحقق من وجود الرسالة في الواجهة بالفعل
    const existingMessage = document.querySelector(`[data-message-id="${message._id}"]`);
    if (existingMessage) return;
    
    // إنشاء عنصر الرسالة الجديدة
    try {
        // للحصول على قالب الرسالة، يمكننا إما استخدام قالب موجود أو إنشاء واحد
        const messageTemplate = getMessageTemplate(message);
        
        // إضافة الرسالة إلى حاوية الرسائل
        if (message.direction === 'incoming') {
            // إضافة الرسالة في بداية الحاوية للرسائل الواردة
            messagesContainer.insertAdjacentHTML('afterbegin', messageTemplate);
        } else {
            // إضافة الرسالة في بداية الحاوية للرسائل الصادرة
            messagesContainer.insertAdjacentHTML('afterbegin', messageTemplate);
        }
        
        // تفعيل مستمعات الأحداث للرسالة الجديدة
        const messageElement = document.querySelector(`[data-message-id="${message._id}"]`);
        if (messageElement && typeof window.setupMessageActions === 'function') {
            window.setupMessageActions(messageElement);
        }
        
        // تمرير حدث بأن الرسائل تم تحديثها
        document.dispatchEvent(new CustomEvent('messages-loaded'));
        
        // تحديث الموضع إلى أحدث رسالة
        scrollToBottom(messagesContainer);
    } catch (error) {
        console.error('خطأ في إضافة رسالة جديدة:', error);
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
    // التحقق من أن هذه هي المحادثة الحالية
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