/**
 * وحدة حالات الرسائل - Message Status Module
 * تحتوي على الدوال المتعلقة بإدارة حالات الرسائل (مثل: قيد الإرسال، تم التسليم، تم القراءة)
 */

(function(window) {
  /**
   * دالة لتحديث حالة الرسالة في الواجهة
   * @param {string} messageId - معرف الرسالة (يكون عادة المعرف الخارجي wamid)
   * @param {string} newStatus - الحالة الجديدة
   */
  window.updateMessageStatus = function(messageId, newStatus) {
    if (!messageId || !newStatus) {
      return;
    }
    
    console.log('تحديث حالة الرسالة:', messageId, newStatus);
    
    // البحث أولاً عن الرسالة حسب المعرف الخارجي (الذي يأتي من واتساب)
    let messageElem = document.querySelector(`.message[data-external-id="${messageId}"]`);
    
    // إذا لم يتم العثور على الرسالة بالمعرف الخارجي، حاول البحث بمعرف الرسالة في قاعدة البيانات
    if (!messageElem) {
      messageElem = document.querySelector(`.message[data-message-id="${messageId}"]`);
    }
    
    // إذا لم يتم العثور على الرسالة بأي من المعرفين
    if (!messageElem) {
      console.warn('لم يتم العثور على الرسالة للتحديث:', messageId);
      return;
    }
    
    console.log('تم العثور على الرسالة، تحديث الحالة:', messageId, newStatus);
    
    // تحديث السمة
    messageElem.setAttribute('data-status', newStatus);
    
    // تحديث أيقونة الحالة
    const statusElement = messageElem.querySelector('.message-status');
    if (statusElement) {
      if (newStatus === 'sending') {
        statusElement.innerHTML = '<i class="fas fa-clock text-secondary" title="جاري الإرسال..."></i>';
      } else if (newStatus === 'sent') {
        statusElement.innerHTML = '<i class="fas fa-check text-secondary" title="تم الإرسال"></i>';
      } else if (newStatus === 'delivered') {
        statusElement.innerHTML = '<i class="fas fa-check-double text-secondary" title="تم التسليم"></i>';
      } else if (newStatus === 'read') {
        statusElement.innerHTML = '<i class="fas fa-check-double text-primary" title="تم القراءة"></i>';
      } else if (newStatus === 'failed') {
        statusElement.innerHTML = '<i class="fas fa-exclamation-circle text-danger" title="فشل الإرسال"></i>';
      }
    } else {
      console.warn('لم يتم العثور على عنصر حالة الرسالة للتحديث:', messageId);
    }
  };
  
  /**
   * دالة لعرض نص حالة الرسالة
   * @param {string} status - حالة الرسالة
   * @returns {string} - النص المقابل للحالة
   */
  window.getStatusText = function(status) {
    switch (status) {
      case 'sending':
        return 'جاري الإرسال...';
      case 'sent':
        return 'تم الإرسال';
      case 'delivered':
        return 'تم التسليم';
      case 'read':
        return 'تم القراءة';
      case 'failed':
        return 'فشل الإرسال';
      default:
        return status || 'غير معروف';
    }
  };
  
  /**
   * وظيفة لإعداد مراقب رؤية الرسائل غير المقروءة
   * تستخدم تقنية Intersection Observer لتتبع متى يرى المستخدم الرسائل
   */
  window.setupMessageReadObserver = function() {
    // إذا كان المراقب موجوداً بالفعل، قم بإلغائه أولاً
    if (window.messageReadObserver) {
      window.messageReadObserver.disconnect();
    }
    
    // إنشاء مجموعة لتتبع الرسائل التي شوهدت خلال الدورة الحالية
    const viewedMessages = new Set();
    
    // إنشاء Intersection Observer جديد
    window.messageReadObserver = new IntersectionObserver((entries) => {
      // تحديد الرسائل التي ظهرت في نطاق الرؤية
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const messageElement = entry.target;
          const messageId = messageElement.getAttribute('data-message-id');
          const externalId = messageElement.getAttribute('data-external-id');
          const status = messageElement.getAttribute('data-status');
          const direction = messageElement.classList.contains('incoming') ? 'incoming' : 'outgoing';
          
          // إضافة الرسالة إلى مجموعة الرسائل المشاهدة فقط إذا كانت واردة وليست مقروءة بالفعل
          if (messageId && direction === 'incoming' && status !== 'read') {
            viewedMessages.add({
              messageId: messageId,
              externalId: externalId || null
            });
          }
        }
      });
      
      // إذا كانت هناك رسائل مشاهدة جديدة، قم بتحديث حالتها بعد تأخير قصير
      if (viewedMessages.size > 0) {
        setTimeout(() => {
          if (viewedMessages.size > 0) {
            window.markMessagesAsRead(Array.from(viewedMessages));
            viewedMessages.clear();
          }
        }, 1500); // تأخير 1.5 ثانية للتأكد من أن المستخدم قد رأى الرسائل فعلاً
      }
    }, { 
      threshold: 0.5, // يجب أن يكون 50% من الرسالة مرئية على الأقل
      rootMargin: '0px' // لا هوامش إضافية
    });
    
    // مراقبة جميع الرسائل الواردة غير المقروءة
    const unreadMessages = document.querySelectorAll('.message.incoming:not([data-status="read"])');
    let count = 0;
    unreadMessages.forEach(msg => {
      window.messageReadObserver.observe(msg);
      count++;
    });
    
    return count;
  };

  /**
   * وظيفة لتحديث حالة الرسائل إلى "مقروءة"
   * @param {Array} messages مصفوفة من معرفات الرسائل التي تمت قراءتها
   */
  window.markMessagesAsRead = function(messages) {
    if (!messages || !messages.length || !window.currentConversationId) {
      return;
    }
    
    // تحديث حالة الرسائل في واجهة المستخدم فوراً
    messages.forEach(msg => {
      let messageElement = null;
      
      if (msg.messageId) {
        messageElement = document.querySelector(`.message[data-message-id="${msg.messageId}"]`);
      } else if (msg.externalId) {
        messageElement = document.querySelector(`.message[data-external-id="${msg.externalId}"]`);
      }
      
      if (messageElement) {
        // تغيير حالة الرسالة في واجهة المستخدم إلى "مقروءة"
        messageElement.setAttribute('data-status', 'read');
      }
    });
    
    // إرسال معلومات القراءة إلى الخادم عبر Socket.IO
    if (window.socketConnection && window.socketConnected) {
      window.socketConnection.emit('mark-messages-read', {
        conversationId: window.currentConversationId,
        messages: messages,
        timestamp: new Date().toISOString()
      });
      
      // تحديث عدد الرسائل غير المقروءة في القائمة (إذا وجدت)
      const conversationItem = document.querySelector(`.conversation-item[data-conversation-id="${window.currentConversationId}"]`);
      if (conversationItem) {
        // تحديث الباج أو إزالته إذا كانت جميع الرسائل مقروءة
        const unreadBadge = conversationItem.querySelector('.conversation-badge');
        if (unreadBadge) {
          const currentCount = parseInt(unreadBadge.textContent, 10);
          if (!isNaN(currentCount) && currentCount > 0) {
            // تقليل العدد بمقدار عدد الرسائل التي تمت قراءتها
            const newCount = Math.max(0, currentCount - messages.length);
            if (newCount > 0) {
              unreadBadge.textContent = newCount;
            } else {
              // إزالة الباج إذا كان العدد صفراً
              unreadBadge.remove();
              // إزالة فئة "has-unread" من عنصر المحادثة
              conversationItem.classList.remove('has-unread');
            }
          }
        }
      }
    }
  };
  
})(window); 