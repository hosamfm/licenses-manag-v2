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
    
    // لمنع معالجة التحديثات المتكررة
    const processedUpdates = new Map(); // خريطة لتخزين آخر وقت معالجة لكل محادثة
    const updateDebounceTime = 300; // الوقت بالمللي ثانية بين التحديثات
    
    // الاستماع لأحداث تحديث المحادثة (بما في ذلك التعيين)
    socket.on('conversation-update', function(data) {
        // التحقق من تكرار التحديث خلال فترة زمنية قصيرة
        const now = Date.now();
        const lastUpdateTime = processedUpdates.get(data._id);
        
        if (lastUpdateTime && (now - lastUpdateTime) < updateDebounceTime) {
            console.log(`تجاهل تحديث متكرر للمحادثة ${data._id}`);
            return; // تجاهل التحديثات المتكررة في وقت قصير
        }
        
        // تسجيل وقت المعالجة الحالية
        processedUpdates.set(data._id, now);
        
        // التأكد من أن التحديث يتعلق بالتعيين
        if (data && data.type === 'assigned') {
            // إذا كانت المحادثة المفتوحة حالياً
            if (window.currentConversationId === data._id || 
                window.currentConversationId === data.conversationId) {
                
                // تحديث عرض المسؤول في الواجهة
                const assignmentDropdownBtn = document.querySelector('#assignmentDropdown'); // الزر الرئيسي للقائمة
                const assignToMeBtn = document.getElementById('assignToMeBtn');
                const statusBadge = document.querySelector('.conversation-status-badge');
                const assignedNameSpan = statusBadge ? statusBadge.querySelector('.assigned-to-name') : null;
                
                if (assignmentDropdownBtn && statusBadge && assignedNameSpan) {
                    if (data.assignedTo) {
                        // الحصول على اسم المستخدم المعين
                        let assigneeName = 'مستخدم غير معروف'; // قيمة افتراضية
                        
                        // التحقق من وجود بيانات المستخدم المعين في الحدث
                        if (data.assignee && (data.assignee.full_name || data.assignee.username)) {
                            assigneeName = data.assignee.full_name || data.assignee.username;
                        } 
                        // إذا لم تكن بيانات المستخدم متوفرة في الحدث، استخدم بيانات المستخدم الحالي إذا كان هو المعين
                        else if (data.assignedTo === window.currentUserId) {
                            assigneeName = window.currentUsername;
                        } 
                        // إذا كان اسم المستخدم فقط متاحًا في الحدث (من إصدارات أقدم ربما)
                        else if (data.assigneeName) {
                             assigneeName = data.assigneeName;
                        } else if (data.assigneeUsername) {
                             assigneeName = data.assigneeUsername;
                        }
                        
                        // تحديث زر القائمة المنسدلة
                        assignmentDropdownBtn.innerHTML = `<i class="fas fa-user-check me-1"></i> ${assigneeName}`;
                        
                        // تحديث حالة المحادثة لعرض الاسم
                        statusBadge.className = 'badge bg-info conversation-status-badge'; // التأكد من أنها زرقاء
                        assignedNameSpan.textContent = `( ${assigneeName} )`;
                        assignedNameSpan.style.display = 'inline';
                        // تحديث المحتوى الرئيسي للشارة (الأيقونة والنص)
                        // يجب التأكد من عدم استبدال الـ span الذي أضفناه
                        const icon = statusBadge.querySelector('i');
                        if (icon) icon.className = 'fas fa-user-check me-1';
                        // التأكد من النص الأساسي هو "مسندة"
                        // الطريقة الأضمن هي إعادة بناء المحتوى مع الحفاظ على الـ span
                        statusBadge.innerHTML = `<i class="fas fa-user-check me-1"></i> مسندة <span class="assigned-to-name ms-1" style="display: inline;">${assignedNameSpan.textContent}</span>`;

                        // إخفاء زر التعيين الذاتي
                        if (assignToMeBtn) {
                            assignToMeBtn.style.display = 'none';
                        }
                    } else {
                        // المحادثة غير معينة
                        assignmentDropdownBtn.innerHTML = '<i class="fas fa-user-check me-1"></i> غير معين';
                        
                        // تحديث حالة المحادثة لإظهار "مفتوحة" وإخفاء اسم المستخدم
                        statusBadge.className = 'badge bg-success conversation-status-badge'; // تغيير إلى اللون الأخضر
                        assignedNameSpan.textContent = '';
                        assignedNameSpan.style.display = 'none';
                        // تحديث المحتوى الرئيسي للشارة
                        statusBadge.innerHTML = `<i class="fas fa-door-open me-1"></i> مفتوحة <span class="assigned-to-name ms-1" style="display: none;"></span>`;

                        // إظهار زر التعيين الذاتي (إذا كان مسموحًا به في الحالة الحالية)
                        if (assignToMeBtn) {
                            assignToMeBtn.style.display = 'block'; // أو 'inline-block' حسب التنسيق
                        }
                    }
                }
            }
            
            // تحديث القائمة للعرض الصحيح للتعيينات (يجب أن يتم بالفعل بواسطة حدث منفصل conversation-list-update)
            // نتركها هنا كاحتياط، لكن يجب التحقق من عدم وجود تحديث مزدوج للقائمة
            if (typeof window.refreshConversationsList === 'function') {
                // window.refreshConversationsList(); // قد يكون هذا غير ضروري إذا كان conversation-list-update يعالجها
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
                // الحصول على اسم العميل باستخدام الدالة المساعدة إذا كانت متاحة
                let customerName = data.customerName || data.phoneNumber;
                
                if (window.ContactHelper && data) {
                    customerName = window.ContactHelper.getContactDisplayName(data);
                }
                
                const notif = new Notification('تم تعيينك لمحادثة جديدة', {
                    body: `تم تعيينك للتعامل مع محادثة ${customerName}`,
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
