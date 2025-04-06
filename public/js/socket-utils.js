/**
 * أدوات مساعدة للتعامل مع اتصالات Socket.io
 */

/**
 * التحقق من حالة اتصال Socket.io
 * @returns {Boolean} حالة الاتصال
 */
function isSocketConnected() {
    return window.socketConnected === true && window.socketConnection && window.socketConnection.connected;
}

/**
 * إرسال أمر عبر Socket.io مع دعم التخزين المؤقت للعمليات
 * @param {String} event - اسم الحدث المراد إرساله
 * @param {Object} data - البيانات المراد إرسالها
 * @param {Boolean} important - إذا كانت العملية مهمة ويجب تخزينها للتنفيذ لاحقًا
 * @returns {Boolean} - نجاح العملية
 */
function emitSocketEvent(event, data, important = true) {
    // التحقق من وجود اتصال جاهز
    if (isSocketConnected()) {
        window.socketConnection.emit(event, data);
        return true;
    } 
    // تخزين العملية للتنفيذ لاحقًا إذا كانت مهمة
    else if (important) {
        
        if (!Array.isArray(window.pendingSocketOperations)) {
            window.pendingSocketOperations = [];
        }
        
        window.pendingSocketOperations.push((socket) => {
            socket.emit(event, data);
        });
        
        return true;
    } else {
        return false;
    }
}

/**
 * الانضمام إلى غرفة محادثة مع معالجة الغرفة السابقة
 * @param {String} conversationId - معرف المحادثة
 * @returns {Boolean} - نجاح العملية
 */
function joinConversationRoom(conversationId) {
    if (!conversationId) return false;
    
    // الانضمام للغرفة الجديدة
    const success = emitSocketEvent('join', { room: `conversation-${conversationId}` });
    
    // مغادرة الغرفة السابقة إذا كانت مختلفة
    if (window.previousConversationId && window.previousConversationId !== conversationId) {
        emitSocketEvent('leave', { room: `conversation-${window.previousConversationId}` });
    }
    
    // تحديث المتغيرات العامة
    window.currentConversationId = conversationId;
    window.previousConversationId = conversationId;
    
    return success;
}

/**
 * إعداد معالجات أحداث المرتبطة بتعيين المحادثات
 * @param {Object} socket - كائن اتصال Socket.io
 */
function setupAssignmentListeners(socket) {
    if (!socket) return;
    
    // الاستماع لأحداث تحديث المحادثة (بما في ذلك التعيين)
    socket.on('conversation-update', function(data) {
        // التأكد من أن التحديث يتعلق بالتعيين
        if (data && data.type === 'assigned') {
            // إذا كانت المحادثة المفتوحة حالياً
            if (window.currentConversationId === data._id || 
                window.currentConversationId === data.conversationId) {
                
                // تحديث عرض المسؤول في الواجهة
                const assigneeInfo = document.getElementById('assigneeInfo');
                const assignToMeBtn = document.getElementById('assignToMeBtn');
                const statusBadge = document.querySelector('.conversation-status-badge');
                
                if (assigneeInfo) {
                    if (data.assignedTo) {
                        // الحصول على اسم المستخدم المعين
                        let assigneeName = 'معين لمستخدم آخر';
                        
                        // إذا كان التعيين للمستخدم الحالي
                        if (data.assignedTo === window.currentUserId) {
                            assigneeName = window.currentUsername;
                        } 
                        // إذا كان اسم المستخدم مرسلاً في البيانات
                        else if (data.assigneeName) {
                            assigneeName = data.assigneeName;
                        } else if (data.assigneeUsername) {
                            assigneeName = data.assigneeUsername;
                        }
                        
                        // تحديث عرض معلومات المسؤول
                        assigneeInfo.innerHTML = `<i class="fas fa-user-check me-1"></i> ${assigneeName}`;
                        
                        // إخفاء زر التعيين الذاتي
                        if (assignToMeBtn) {
                            assignToMeBtn.style.display = 'none';
                        }
                        
                        // تحديث حالة المحادثة
                        if (statusBadge) {
                            statusBadge.className = 'badge bg-info ms-2 conversation-status-badge';
                            statusBadge.innerHTML = '<i class="fas fa-user-check me-1"></i> مسندة';
                        }
                    } else {
                        // المحادثة غير معينة
                        assigneeInfo.innerHTML = '<i class="fas fa-exclamation-circle me-1"></i> غير معين';
                        
                        // إظهار زر التعيين الذاتي
                        if (assignToMeBtn) {
                            assignToMeBtn.style.display = 'inline-block';
                        }
                        
                        // تحديث حالة المحادثة
                        if (statusBadge) {
                            statusBadge.className = 'badge bg-success ms-2 conversation-status-badge';
                            statusBadge.innerHTML = '<i class="fas fa-door-open me-1"></i> مفتوحة';
                        }
                    }
                }
            }
            
            // تحديث القائمة للعرض الصحيح للتعيينات
            if (typeof window.refreshConversationsList === 'function') {
                window.refreshConversationsList();
            }
        }
    });
    
    // الاستماع لإشعارات تعيين المحادثة للمستخدم الحالي
    socket.on('user-notification', function(notification) {
        if (notification && notification.type === 'conversation_assigned') {
            const data = notification.data;
            if (!data) return;
            
            // عرض إشعار للمستخدم
            if ('Notification' in window && Notification.permission === 'granted') {
                const notif = new Notification('تم تعيينك لمحادثة جديدة', {
                    body: `تم تعيينك للتعامل مع محادثة ${data.customerName || data.phoneNumber}`,
                    icon: '/images/logo.png'
                });
                
                // فتح المحادثة عند النقر على الإشعار
                notif.onclick = function() {
                    window.focus();
                    window.location.href = `/crm/conversations/ajax?selected=${data.conversationId}`;
                };
            }
            
            // تشغيل صوت الإشعار
            if (typeof window.playNotificationSound === 'function') {
                window.playNotificationSound();
            }
        }
    });
}

// تصدير الوظائف للاستخدام العام
window.isSocketConnected = isSocketConnected;
window.emitSocketEvent = emitSocketEvent;
window.joinConversationRoom = joinConversationRoom;
window.setupAssignmentListeners = setupAssignmentListeners;
