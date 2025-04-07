/**
 * وحدة أحداث الرسائل - Message Actions Module
 * تحتوي على الدوال المتعلقة بتفاعلات المستخدم مع الرسائل وإعداد معالجات الأحداث
 */

(function(window) {
  /**
   * دالة لتعليق مستمعات الأحداث للرسائل
   * @param {HTMLElement} messageElem - عنصر الرسالة (اختياري)
   */
  window.setupMessageActions = function(messageElem) {
    // إذا تم تمرير عنصر محدد، نضيف له مستمعات الأحداث فقط
    if (messageElem) {
      // زر الرد
      const replyButton = messageElem.querySelector('.reply-btn');
      if (replyButton) {
        // إزالة أي مستمعات سابقة لتجنب التكرار
        const oldReplyHandler = replyButton.onclick;
        if (oldReplyHandler) {
          replyButton.removeEventListener('click', oldReplyHandler);
        }
        
        // إضافة مستمع جديد
        replyButton.addEventListener('click', function() {
          const messageId = messageElem.getAttribute('data-message-id');
          const externalId = messageElem.getAttribute('data-external-id');
          window.showReplyForm && window.showReplyForm(messageId, externalId, messageElem);
        });
      }
      
      // زر التفاعل
      const reactionButton = messageElem.querySelector('.reaction-btn');
      if (reactionButton) {
        // إزالة أي مستمعات سابقة لتجنب التكرار
        const oldReactionHandler = reactionButton.onclick;
        if (oldReactionHandler) {
          reactionButton.removeEventListener('click', oldReactionHandler);
        }
        
        // إضافة مستمع جديد
        reactionButton.addEventListener('click', function(event) {
          const messageId = messageElem.getAttribute('data-message-id');
          const externalId = messageElem.getAttribute('data-external-id');
          window.showReactionPicker && window.showReactionPicker(messageId, externalId, event.target);
        });
      }
      
      return;
    }
    
    // إذا لم يتم تمرير عنصر محدد، نضيف مستمعات لجميع الرسائل
    document.querySelectorAll('.message').forEach(message => {
      // زر الرد
      const replyButton = message.querySelector('.reply-btn');
      if (replyButton) {
        // إزالة المستمعات السابقة
        const oldReplyHandler = replyButton.onclick;
        if (oldReplyHandler) {
          replyButton.removeEventListener('click', oldReplyHandler);
        }
        
        // إضافة مستمع جديد
        replyButton.addEventListener('click', function() {
          const messageId = message.getAttribute('data-message-id');
          const externalId = message.getAttribute('data-external-id');
          window.showReplyForm && window.showReplyForm(messageId, externalId, message);
        });
      }
      
      // زر التفاعل
      const reactionButton = message.querySelector('.reaction-btn');
      if (reactionButton) {
        // إزالة المستمعات السابقة
        const oldReactionHandler = reactionButton.onclick;
        if (oldReactionHandler) {
          reactionButton.removeEventListener('click', oldReactionHandler);
        }
        
        // إضافة مستمع جديد
        reactionButton.addEventListener('click', function(event) {
          const messageId = message.getAttribute('data-message-id');
          const externalId = message.getAttribute('data-external-id');
          window.showReactionPicker && window.showReactionPicker(messageId, externalId, event.target);
        });
      }
    });
  };

  /**
   * دالة لتعليق مستمعات الأحداث للمحادثة في الواجهة المفصلة
   */
  window.attachConversationEventListeners = function() {
    
    // الحصول على الإشارات إلى عناصر DOM
    const replyForm = document.getElementById('replyForm');
    const replyMessage = document.getElementById('replyMessage');
    const sendButton = document.getElementById('sendButton');
    const sendingIndicator = document.getElementById('sendingIndicator');
    const conversationId = document.getElementById('conversationId')?.value;
    const attachMediaBtn = document.getElementById('attachMediaBtn');
    const mediaFile = document.getElementById('mediaFile');
    
    if (!conversationId) {
      return;
    }
    
    // إضافة مستمعات الأحداث للرسائل الموجودة حالياً
    window.setupMessageActions();
    
    // حدث إرسال نموذج الرد
    if (replyForm) {
      // حذف مستمعات الأحداث السابقة إن وجدت
      const oldSubmitHandler = replyForm.onsubmit;
      if (oldSubmitHandler) {
        replyForm.removeEventListener('submit', oldSubmitHandler);
      }
      
      // إضافة حدث الإرسال
      replyForm.addEventListener('submit', window.sendReply);
      
      // إضافة اختصار لوحة المفاتيح (Ctrl+Enter) للإرسال
      if (replyMessage) {
        replyMessage.addEventListener('keydown', function(e) {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            window.sendReply && window.sendReply();
          }
        });

        // تفعيل خاصية السحب والإفلات على منطقة الكتابة
        window.setupDragAndDropOnMessageInput && window.setupDragAndDropOnMessageInput(replyMessage);
      }

      // إضافة حدث النقر على زر إرفاق ملف
      if (attachMediaBtn && mediaFile) {
        if (!attachMediaBtn.dataset.listenerAttached) {
          attachMediaBtn.addEventListener('click', function() {
            mediaFile.click();
          });
          attachMediaBtn.dataset.listenerAttached = 'true';
        }

        // إضافة حدث تغيير الملف المختار
        if (!mediaFile.dataset.listenerAttached) {
          mediaFile.addEventListener('change', window.handleFileSelection);
          mediaFile.dataset.listenerAttached = 'true';
        }
      }
    }
    
    // ربط حدث النقر لأزرار التفاعل
    document.querySelectorAll('.reaction-btn').forEach(button => {
      // التأكد من عدم إضافة المستمع مرتين
      if (!button.dataset.listenerAttached) {
        button.addEventListener('click', function(e) {
          e.stopPropagation(); // منع انتشار الحدث للرسالة نفسها
          const messageId = this.closest('.message').dataset.messageId;
          const externalId = this.closest('.message').dataset.externalId || '';
          window.showReactionPicker && window.showReactionPicker(messageId, externalId, this);
        });
        button.dataset.listenerAttached = 'true';
      }
    });

    // ربط حدث النقر لأزرار الرد
    document.querySelectorAll('.reply-btn').forEach(button => {
      if (!button.dataset.listenerAttached) {
        button.addEventListener('click', function(e) {
          e.stopPropagation();
          const messageId = this.dataset.messageId;
          const externalId = this.dataset.externalId || '';
          const messageElem = this.closest('.message');
          window.showReplyForm && window.showReplyForm(messageId, externalId, messageElem);
        });
        button.dataset.listenerAttached = 'true';
      }
    });

    // ربط أحداث أزرار إغلاق وإعادة فتح المحادثة
    const closeBtn = document.querySelector('.close-conversation-btn');
    if (closeBtn && !closeBtn.dataset.listenerAttached) {
      closeBtn.addEventListener('click', function() {
        const conversationId = this.getAttribute('data-conversation-id');
        window.closeConversation && window.closeConversation(conversationId);
      });
      closeBtn.dataset.listenerAttached = 'true';
    }
    
    const reopenBtn = document.querySelector('.reopen-conversation-btn');
    if (reopenBtn && !reopenBtn.dataset.listenerAttached) {
      reopenBtn.addEventListener('click', function() {
        const conversationId = this.getAttribute('data-conversation-id');
        window.reopenConversation && window.reopenConversation(conversationId);
      });
      reopenBtn.dataset.listenerAttached = 'true';
    }

    // تفعيل السحب والإفلات
    const messageInput = document.getElementById('replyMessage');
    if (messageInput) {
      window.setupDragAndDropOnMessageInput && window.setupDragAndDropOnMessageInput(messageInput);
    }
    
    // استدعاء وظائف أخرى ضرورية بعد تحميل المحادثة
    window.setupAudioPlayers && window.setupAudioPlayers();
    window.setupMessageReadObserver && window.setupMessageReadObserver();
  };

})(window); 