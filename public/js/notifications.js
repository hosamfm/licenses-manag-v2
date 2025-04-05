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
        
        // تخزين الاتصال في نافذة المتصفح للاستخدام العام
        window.socketConnection = socket;
        
        return socket;
    } catch (error) {
        return null;
    }
}

/**
 * تفعيل مستمعات تحديث الواجهة
 * @param {Object} socket - كائن اتصال Socket.io
 */
function setupNotificationListeners(socket) {
    if (!socket) return;
    
    // استقبال تحديث برسالة جديدة
    socket.on('new-message', function(data) {
        // التعامل مع بنيتين مختلفتين للبيانات
        const message = data.message || data;
        
        // تأكد من تعريف حقل metadata إذا لم يكن موجودًا
        if (!message.metadata) {
            message.metadata = {};
        }
        
        // تحديث واجهة المستخدم إذا كانت الرسالة تخص المحادثة الحالية
        if (window.currentConversationId && message.conversationId === window.currentConversationId) {
            // نقوم باستدعاء الدالة الصحيحة لإضافة الرسالة
            if (typeof window.addMessageToConversation === 'function') {
                window.addMessageToConversation(message);
            } else {
                appendNewMessage(message);
            }
        }
        
        // تحديث قائمة المحادثات
        updateConversationsList();
    });
    
    // استقبال تحديث حالة الرسالة
    socket.on('message-status-update', function(data) {        
        if (typeof window.updateMessageStatus === 'function') {
            window.updateMessageStatus(data.externalId, data.status);
        }
    });
    
    // استقبال تحديث تفاعل
    socket.on('message-reaction', function(data) {        
        if (typeof window.updateMessageReaction === 'function') {
            window.updateMessageReaction(data.externalId, data.reaction);
        }
    });
    
    // استقبال تحديث معرف خارجي للرسالة
    socket.on('message-external-id-update', function(data) {        
        updateMessageExternalId(data.messageId, data.externalId);
    });
    
    // استقبال تحديث المحادثة
    socket.on('conversation-update', function(data) {        
        updateConversationInfo(data);
        updateConversationsList();
    });

    // إضافة معالج لحدث الملاحظات الداخلية
    socket.on('internal-note', function(data) {
        // التحقق من أن الملاحظة تخص المحادثة الحالية
        if (window.currentConversationId && data.conversationId === window.currentConversationId) {
            // تحويل البيانات إلى الشكل المطلوب
            const noteData = {
                _id: data._id || 'temp-' + Date.now(),
                conversationId: data.conversationId,
                direction: data.direction,
                content: data.content,
                timestamp: data.timestamp,
                status: data.status,
                sentBy: data.sentBy,
                metadata: data.metadata || {}
            };
            
            // إضافة الملاحظة إلى الواجهة
            if (typeof window.addNoteToUI === 'function') {
                window.addNoteToUI(noteData);
            } else {
                appendInternalNote(noteData);
            }
            
            // تشغيل صوت الإشعار
            playNotificationSound();
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
        return;
    }
    
    // 3. التحقق من وجود رسالة مؤقتة مرتبطة برسالة حقيقية
    if (window.pendingMessageMapping) {
        const tempIdEntries = Object.entries(window.pendingMessageMapping).filter(([tempId, realId]) => realId === message._id);
        if (tempIdEntries.length > 0) {
            const tempId = tempIdEntries[0][0];
            const pendingMessage = document.querySelector(`[data-message-id="${tempId}"]`);
            
            if (pendingMessage) {
                // استبدال الرسالة المؤقتة بالرسالة الحقيقية
                pendingMessage.setAttribute('data-message-id', message._id);
                if (message.externalMessageId) {
                    pendingMessage.setAttribute('data-external-id', message.externalMessageId);
                }
                
                // تحديث محتوى الرسالة
                pendingMessage.className = `message ${message.direction === 'incoming' ? 'incoming' : 'outgoing'}`;
                pendingMessage.innerHTML = getMessageTemplate(message);
                
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
        
        // تحديث الموضع إلى أحدث رسالة
        scrollToBottom(messagesContainer);
    } catch (error) {
        console.error('خطأ في إضافة الرسالة:', error);
    }
}

/**
 * الحصول على قالب الرسالة
 * @param {Object} message - الرسالة
 * @returns {string} HTML للرسالة
 */
function getMessageTemplate(message) {
    // تحديد اتجاه الرسالة
    const isOutgoing = message.direction === 'outgoing';
    
    // تنسيق الوقت
    const time = new Date(message.timestamp).toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // الحصول على نص الحالة
    const statusText = getStatusText(message.status);
    
    // استخراج اسم المرسل للرسائل الصادرة فقط
    let senderHtml = '';
    if (isOutgoing) {
        let senderName = '';
        if (message.metadata && message.metadata.senderInfo) {
            senderName = message.metadata.senderInfo.full_name || message.metadata.senderInfo.username || 'مجهول';
        } else if (message.sentByUsername) {
            senderName = message.sentByUsername;
        }
        if (senderName) {
            senderHtml = `<div class="message-sender">${senderName}</div>`;
        }
    }
    
    // إنشاء قالب الرسالة
    return `
        <div class="message-content">
            ${message.content}
            <div class="message-time">${time}</div>
            ${statusText ? `<div class="message-status">${statusText}</div>` : ''}
        </div>
        ${senderHtml}
    `;
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
    // استخدم الدالة العامة refreshConversationsList إذا كانت متاحة
    if (typeof window.refreshConversationsList === 'function') {
        console.log('استخدام الدالة العامة لتحديث قائمة المحادثات');
        return window.refreshConversationsList();
    }
    
    // التحقق مما إذا كانت قائمة المحادثات موجودة في الصفحة
    const conversationsList = document.querySelector('.conversations-list');
    if (!conversationsList) {
        console.warn('عنصر قائمة المحادثات غير موجود في الصفحة');
        return;
    }
    
    console.log('تحديث قائمة المحادثات من خلال دالة التحديث في notifications.js');
    
    // استعلام AJAX لتحديث قائمة المحادثات
    fetch('/crm/conversations/ajax/list')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.conversations) {
                // تحديث قائمة المحادثات
                updateConversationsUI(data.conversations);
                console.log('تم تحديث قائمة المحادثات عبر AJAX - ' + new Date().toLocaleTimeString());
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

/**
 * إضافة ملاحظة داخلية إلى واجهة المستخدم
 * @param {Object} note - الملاحظة الداخلية
 */
function appendInternalNote(note) {
    // التحقق من وجود حاوية الرسائل
    const messagesContainer = document.querySelector('.messages-container');
    if (!messagesContainer) return;
    
    // التحقق من وجود الملاحظة في الواجهة بالفعل
    const existingNote = document.querySelector(`[data-note-id="${note._id}"]`);
    if (existingNote) {
        return;
    }
    
    // تنسيق التاريخ
    const date = new Date(note.timestamp || Date.now());
    const formattedDate = date.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // استخراج اسم المرسل
    let senderName = 'مجهول';
    if (note.metadata && note.metadata.senderInfo) {
        senderName = note.metadata.senderInfo.full_name || note.metadata.senderInfo.username || 'مجهول';
    } else if (note.sentBy) {
        senderName = note.sentBy.toString();
    }
    
    // إنشاء عنصر الملاحظة
    const noteElement = document.createElement('div');
    noteElement.className = 'internal-note';
    noteElement.setAttribute('data-note-id', note._id);
    
    // إضافة محتوى الملاحظة
    noteElement.innerHTML = `
        <div class="note-content">
            <div class="note-text">${note.content}</div>
            <div class="note-meta">
                <span class="note-sender">${senderName}</span>
                <span class="note-time">${formattedDate}</span>
            </div>
        </div>
    `;
    
    // إضافة الملاحظة إلى حاوية الرسائل
    messagesContainer.appendChild(noteElement);
    
    // تحديث الموضع إلى أحدث رسالة
    scrollToBottom(messagesContainer);
}