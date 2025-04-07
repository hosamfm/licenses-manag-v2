/**
 * وحدة الردود على الرسائل - Message Replies Module
 * تحتوي على الدوال المتعلقة بالردود على الرسائل
 */

(function(window) {
  /**
   * دالة لعرض نموذج الرد على رسالة معينة
   * @param {string} messageId - معرف الرسالة
   * @param {string} externalId - المعرف الخارجي للرسالة (اختياري)
   * @param {HTMLElement} messageElem - عنصر الرسالة
   */
  window.showReplyForm = function(messageId, externalId, messageElem) {
    if (!messageElem || !messageId) {
      return;
    }
    
    // تخزين معرف الرسالة للرد عليها
    window.currentReplyToId = messageId;
    
    // عرض مؤشر الرد
    let replyIndicator = document.getElementById('replyIndicator');
    
    if (!replyIndicator) {
      replyIndicator = document.createElement('div');
      replyIndicator.id = 'replyIndicator';
      replyIndicator.className = 'reply-indicator alert alert-info d-flex justify-content-between align-items-center py-2 mb-2';
      
      // الحصول على محتوى الرسالة للعرض
      const messageContent = messageElem.querySelector('.message-bubble').textContent.trim().substring(0, 50);
      
      replyIndicator.innerHTML = `
        <div>
          <i class="fas fa-reply me-1"></i>
          <small>رد على: ${messageContent}${messageContent.length > 50 ? '...' : ''}</small>
        </div>
        <button type="button" class="btn btn-sm text-secondary cancel-reply-btn">
          <i class="fas fa-times"></i>
        </button>
      `;
      
      // إضافة المؤشر قبل حقل الإدخال
      const replyForm = document.getElementById('replyForm');
      if (replyForm) {
        replyForm.insertBefore(replyIndicator, replyForm.firstChild);
      }
      
      // إضافة حدث إلغاء الرد
      const cancelButton = replyIndicator.querySelector('.cancel-reply-btn');
      if (cancelButton) {
        cancelButton.addEventListener('click', function() {
          window.clearReplyIndicator();
        });
      }
    } else {
      // تحديث المحتوى إذا كان موجوداً
      const messageContent = messageElem.querySelector('.message-bubble').textContent.trim().substring(0, 50);
      replyIndicator.querySelector('small').innerHTML = `رد على: ${messageContent}${messageContent.length > 50 ? '...' : ''}`;
    }
    
    // التركيز على حقل الإدخال
    const replyMessage = document.getElementById('replyMessage');
    if (replyMessage) {
      replyMessage.focus();
    }
  };
  
  /**
   * دالة لإزالة مؤشر الرد
   */
  window.clearReplyIndicator = function() {
    const replyIndicator = document.getElementById('replyIndicator');
    if (replyIndicator) {
      replyIndicator.remove();
    }
    window.currentReplyToId = null;
  };

})(window); 