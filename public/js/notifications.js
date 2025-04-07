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
                // يمكن إضافة سلوك احتياطي هنا إذا لزم الأمر
                console.warn('Function addMessageToConversation not found.');
            }
        }
        
        // لا تقم بتحديث القائمة هنا، الاعتماد على 'conversation-update'
        // updateConversationsList();
    });
    
    // استقبال تحديث حالة الرسالة
    socket.on('message-status-update', function(data) {        
        if (typeof window.updateMessageStatus === 'function') {
            console.log('Socket تلقى message-status-update:', data);
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
    // التحقق مما إذا كانت قائمة المحادثات موجودة في الصفحة
    const conversationsList = document.querySelector('.conversations-list');
    if (!conversationsList) return;
    
    // إضافة معلمة لمنع التخزين المؤقت
    const timestamp = new Date().getTime();
    
    // استعلام AJAX لتحديث قائمة المحادثات
    fetch(`/crm/conversations/ajax/list?t=${timestamp}`, {
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Cache-Control': 'no-cache' // تأكيد إضافي لعدم التخزين المؤقت
        }
    })
    .then(response => {
        if (!response.ok) {
            // محاولة إعادة تحميل الصفحة إذا كان الخطأ 404 (قد يشير إلى مشكلة في التوجيه أو الجلسة)
            if (response.status === 404) {
                console.warn('Received 404 when fetching conversations list. Attempting page reload.');
                window.location.reload();
            }
            throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.success && data.conversations) {
            // تحديث قائمة المحادثات
            updateConversationsUI(data.conversations);
        } else {
            console.warn('Failed to update conversations list or no conversations received:', data);
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
    
    // إنشاء خريطة للعناصر الموجودة لسهولة الوصول
    const existingItemsMap = new Map();
    conversationsList.querySelectorAll('.conversation-item').forEach(item => {
        const convId = item.getAttribute('data-conversation-id');
        if (convId) {
            existingItemsMap.set(convId, item);
        }
    });
    
    // حلقة على المحادثات الواردة من الخادم (يجب أن تكون مرتبة حسب آخر تحديث)
    conversations.forEach((conversation, index) => {
        const convId = conversation._id;
        let listItem = existingItemsMap.get(convId);
        
        // التحقق مما إذا كان العنصر موجودًا
        if (listItem) {
            // --- تحديث العنصر الموجود --- 
            
            // تحديث عدد الرسائل غير المقروءة
            const unreadBadge = listItem.querySelector('.conversation-badge'); // استخدام الفئة المحددة
            if (unreadBadge) {
                if (conversation.unreadCount > 0) {
                    unreadBadge.textContent = conversation.unreadCount;
                    unreadBadge.classList.remove('d-none', 'bg-secondary'); // إزالة الإخفاء وربما اللون الافتراضي
                    unreadBadge.classList.add('bg-danger'); // التأكد من أنه اللون الأحمر
                    listItem.classList.add('has-unread'); // إضافة فئة للدلالة على وجود غير مقروء
                } else {
                    unreadBadge.classList.add('d-none');
                    listItem.classList.remove('has-unread'); // إزالة الفئة إذا لم يعد هناك غير مقروء
                }
            }
            
            // تحديث محتوى آخر رسالة
            const lastMessageElement = listItem.querySelector('.conversation-preview small'); // تحديث المحدد ليكون أكثر دقة
            if (lastMessageElement && conversation.lastMessage) {
                const directionIcon = conversation.lastMessage.direction === 'incoming' ? 
                                      '<i class="fas fa-reply-all text-muted me-1 fa-flip-horizontal"></i>' : 
                                      '<i class="fas fa-reply text-muted me-1"></i>';
                const contentPreview = conversation.lastMessage.content 
                                       ? conversation.lastMessage.content.substring(0, 30) 
                                       : (conversation.lastMessage.mediaType ? 'محتوى وسائط' : 'رسالة');
                const ellipsis = conversation.lastMessage.content && conversation.lastMessage.content.length > 30 ? '...' : '';
                
                lastMessageElement.innerHTML = `${directionIcon} ${contentPreview}${ellipsis}`;
                lastMessageElement.className = conversation.unreadCount > 0 ? 'fw-bold' : 'text-muted'; // تحديث الخط ليكون عريضًا عند وجود رسائل غير مقروءة
            } else if (lastMessageElement) {
                 lastMessageElement.innerHTML = '<small class="text-muted"><i class="fas fa-info-circle me-1"></i> محادثة جديدة</small>';
                 lastMessageElement.className = 'text-muted'; // التأكد من إزالة الخط العريض
            }
            
            // تحديث وقت آخر رسالة
            const lastTimeElement = listItem.querySelector('.conversation-time');
            if (lastTimeElement && conversation.lastMessageAt) {
                lastTimeElement.textContent = typeof window.formatTime === 'function' ? 
                                              window.formatTime(conversation.lastMessageAt) : // استخدام lastMessageAt للتأكيد
                                              new Date(conversation.lastMessageAt).toLocaleString('ar-LY', { hour: '2-digit', minute: '2-digit' });
            }
            
            // تحديث أيقونة القناة
            const channelIcon = listItem.querySelector('.conversation-name i');
            if (channelIcon) {
              channelIcon.className = `${conversation.channel === 'whatsapp' ? 'fab fa-whatsapp text-success' : 'fas fa-comments text-primary'} me-2`;
            }
            
            // تحديث اسم العميل أو الرقم
            const nameSpan = listItem.querySelector('.conversation-name span');
            if (nameSpan) {
              nameSpan.textContent = conversation.customerName || conversation.phoneNumber;
            }
            
            // تحديث مؤشر الحالة
            const statusIndicator = listItem.querySelector('.status-indicator');
            if (statusIndicator) {
                statusIndicator.className = 'status-indicator'; // إعادة تعيين الفئات
                statusIndicator.classList.add(conversation.status);
                let statusTitle = 'مفتوحة';
                let statusIcon = 'fa-door-open';
                if (conversation.status === 'closed') {
                  statusTitle = 'مغلقة';
                  statusIcon = 'fa-lock';
                } else if (conversation.status === 'assigned') {
                  statusTitle = 'مسندة';
                  statusIcon = 'fa-user-check';
                }
                statusIndicator.title = `محادثة ${statusTitle}`;
                statusIndicator.innerHTML = `<i class="fas ${statusIcon}"></i>`;
            }
            
            // --- نقل العنصر إلى الموضع الصحيح --- 
            // نفترض أن conversations مرتبة من الأحدث للأقدم
            const expectedPosition = conversationsList.children[index];
            if (listItem !== expectedPosition) {
                conversationsList.insertBefore(listItem, expectedPosition || null);
            }
            
            // إزالة العنصر من الخريطة لأنه تم التعامل معه
            existingItemsMap.delete(convId);
            
        } else {
            // --- إنشاء عنصر جديد وإضافته في الموضع الصحيح --- 
            const newItemHTML = createConversationItemHTML(conversation);
            
            // إيجاد الموضع الصحيح للإدراج بناءً على الفهرس
            const insertBeforeElement = conversationsList.children[index];
            conversationsList.insertAdjacentHTML(insertBeforeElement ? 'beforebegin' : 'beforeend', newItemHTML);
            
            // إضافة مستمع النقر للعنصر الجديد
            const newItemElement = conversationsList.querySelector(`[data-conversation-id="${convId}"]`);
            if (newItemElement) {
                attachSingleConversationItemEvent(newItemElement);
            }
        }
    });
    
    // إزالة أي عناصر قديمة لم تعد موجودة في البيانات المحدثة
    existingItemsMap.forEach(item => item.remove());
}

/**
 * إنشاء HTML لعنصر محادثة واحد
 * @param {Object} conv - بيانات المحادثة
 * @returns {String} - كود HTML للعنصر
 */
function createConversationItemHTML(conv) {
    const hasUnread = conv.unreadCount > 0;
    const lastMessageContent = conv.lastMessage 
        ? conv.lastMessage.content
            ? conv.lastMessage.content.substring(0, 30)
            : (conv.lastMessage.mediaType ? 'محتوى وسائط' : 'رسالة')
        : 'محادثة جديدة';
    const ellipsis = conv.lastMessage && conv.lastMessage.content && conv.lastMessage.content.length > 30 ? '...' : '';
    const directionIcon = conv.lastMessage 
        ? (conv.lastMessage.direction === 'incoming' ? '<i class="fas fa-reply-all text-muted me-1 fa-flip-horizontal"></i>' : '<i class="fas fa-reply text-muted me-1"></i>')
        : '<i class="fas fa-info-circle me-1"></i>';
    
    let statusTitle = 'مفتوحة';
    let statusIcon = 'fa-door-open';
    if (conv.status === 'closed') {
      statusTitle = 'مغلقة';
      statusIcon = 'fa-lock';
    } else if (conv.status === 'assigned') {
      statusTitle = 'مسندة';
      statusIcon = 'fa-user-check';
    }

    return `
        <button type="button"
                class="list-group-item list-group-item-action conversation-item d-flex flex-column ${hasUnread ? 'has-unread' : ''}"
                data-conversation-id="${conv._id}">
          <div class="d-flex justify-content-between align-items-center w-100">
            <div class="conversation-info">
              <div class="conversation-name">
                <i class="${conv.channel === 'whatsapp' ? 'fab fa-whatsapp text-success' : 'fas fa-comments text-primary'} me-2"></i>
                <span>${conv.customerName || conv.phoneNumber}</span>
              </div>
              <div class="conversation-preview">
                <small class="${hasUnread ? 'fw-bold' : 'text-muted'}">
                  ${directionIcon} ${lastMessageContent}${ellipsis}
                </small>
              </div>
            </div>
            <div class="conversation-meta text-end">
              ${hasUnread ? `<span class="badge bg-danger rounded-pill conversation-badge mb-1">${conv.unreadCount}</span>` : '<span class="badge bg-secondary rounded-pill conversation-badge mb-1 d-none">0</span>'}
              <div class="conversation-time small">
                ${new Date(conv.lastMessageAt || conv.updatedAt).toLocaleString('ar-LY', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <span class="status-indicator ${conv.status}" title="محادثة ${statusTitle}"><i class="fas ${statusIcon}"></i></span>
            </div>
          </div>
        </button>
    `;
}

/**
 * ربط حدث النقر لعنصر محادثة واحد
 * @param {Element} item - عنصر المحادثة
 */
function attachSingleConversationItemEvent(item) {
    item.addEventListener('click', function() {
        const conversationList = document.getElementById('conversationList');
        if (!conversationList) return;
        
        // إزالة الفئة النشطة من جميع العناصر
        conversationList.querySelectorAll('.conversation-item').forEach(i => i.classList.remove('active'));
        
        // إضافة الفئة النشطة للعنصر المحدد
        this.classList.add('active');
        
        // الحصول على معرف المحادثة
        const convId = this.getAttribute('data-conversation-id');
        if (!convId) return;
        
        // تحديث معرف المحادثة الحالية (في النطاق الأعلى إذا كان معرفاً هناك)
        if (typeof currentConversationId !== 'undefined') {
             currentConversationId = convId;
        }
        window.currentConversationId = convId; // التأكد من تحديث المتغير العام
        
        // إضافة المعرف إلى تاريخ المتصفح
        if (history.pushState) {
          const url = `/crm/conversations/${convId}`;
          history.pushState({ conversationId: convId }, '', url);
        }
        
        // استدعاء AJAX لتحميل التفاصيل
        // التأكد من أن الدالة loadConversationDetails معرفة في النطاق العام أو يتم تمريرها
        if (typeof window.loadConversationDetails === 'function') {
            window.loadConversationDetails(convId);
        } else if (typeof loadConversationDetails === 'function') { // التحقق في النطاق المحلي كاحتياط
             loadConversationDetails(convId);
        } else {
            console.error('الدالة loadConversationDetails غير معرفة');
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
    
    const conversationDetailsContainer = document.getElementById('conversationDetailsContainer');
    if (!conversationDetailsContainer) return;

    // تحديث معلومات المحادثة في واجهة المستخدم
    const conversationHeader = conversationDetailsContainer.querySelector('.conversation-header');
    if (conversationHeader) {
        // تحديث الحالة
        const statusBadge = conversationHeader.querySelector('.conversation-status-badge');
        if (statusBadge && data.status) {
            let iconClass = 'fas fa-door-open';
            let badgeClass = 'bg-success';
            let statusText = 'مفتوحة';

            if (data.status === 'closed') {
                iconClass = 'fas fa-lock';
                badgeClass = 'bg-secondary';
                statusText = 'مغلقة';
            } else if (data.status === 'assigned') {
                iconClass = 'fas fa-user-check';
                badgeClass = 'bg-info';
                statusText = 'مسندة';
            }

            statusBadge.innerHTML = `<i class="${iconClass} me-1"></i> ${statusText}`;
            // إزالة فئات الخلفية القديمة وإضافة الجديدة
            statusBadge.classList.remove('bg-success', 'bg-info', 'bg-secondary');
            statusBadge.classList.add(badgeClass);
        }
        
        // تحديث المسؤول في الزر المنسدل
        const assignmentDropdownButton = conversationHeader.querySelector('#assignmentDropdown');
        if (assignmentDropdownButton) {
            let assigneeText = 'غير معين';
            if (data.assignee) { // استخدام assignee الذي يجب أن يرسله الخادم
                assigneeText = data.assignee.full_name || data.assignee.username;
            } else if (data.assignedTo) { // كحل بديل إذا لم يتم إرسال assignee
                 // محاولة استنتاج الاسم من assignedTo (قد يكون مجرد ID)
                 if(typeof data.assignedTo === 'object' && data.assignedTo !== null) {
                   assigneeText = data.assignedTo.full_name || data.assignedTo.username || 'غير معروف';
                 } else {
                   assigneeText = 'معين (غير معروف)'; // أو استعلام للحصول على الاسم؟
                 }
            }
            
            // تحديث نص الزر
            // يجب الإبقاء على الأيقونة وتحديث النص فقط
            const iconElement = assignmentDropdownButton.querySelector('i');
            assignmentDropdownButton.innerHTML = ''; // مسح المحتوى القديم
            if (iconElement) {
                assignmentDropdownButton.appendChild(iconElement); // إعادة إضافة الأيقونة
                assignmentDropdownButton.appendChild(document.createTextNode(` ${assigneeText}`)); // إضافة النص الجديد
            } else {
                // في حالة عدم وجود أيقونة لسبب ما
                assignmentDropdownButton.innerHTML = `<i class="fas fa-user-check me-1"></i> ${assigneeText}`;
            }
        }
        
        // قد تحتاج لتحديث عناصر أخرى هنا إذا لزم الأمر (مثل أزرار القائمة المنسدلة نفسها)
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