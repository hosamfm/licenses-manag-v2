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
        console.warn(`فشل إرسال حدث "${event}": اتصال Socket.io غير متاح`);
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

// تصدير الوظائف للاستخدام العام
window.isSocketConnected = isSocketConnected;
window.emitSocketEvent = emitSocketEvent;
window.joinConversationRoom = joinConversationRoom;
