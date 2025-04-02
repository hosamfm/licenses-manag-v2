/**
 * وحدة مساعدة للمحادثات - Conversation Utilities Module
 * هذا الملف يحتوي على دوال عامة مشتركة للتعامل مع محادثات نظام خدمة العملاء
 * يستخدم في كل من واجهة المحادثات المفصلة وواجهة المحادثات المقسمة
 */

// نافذة عالمية للوظائف المشتركة
(function(window) {
  // تعيين وضع التصحيح (اجعله false لإيقاف رسائل التصحيح)
  window.debugMode = false;
  
  // تعريف الدوال العالمية للتفاعل مع الرسائل
  
  /**
   * دالة لعرض منتقي التفاعلات
   * @param {string} messageId - معرف الرسالة
   * @param {string} externalId - المعرف الخارجي للرسالة (اختياري)
   * @param {HTMLElement} buttonElement - عنصر الزر الذي تم النقر عليه
   */
  window.showReactionPicker = function(messageId, externalId, buttonElement) {
    if (!messageId) return;
    
    if (window.debugMode === true) {
      console.log('تنفيذ دالة showReactionPicker مع المعرف:', messageId);
    }
    
    // إزالة أي منتقي سابق موجود
    const existingPicker = document.getElementById('reactionPicker');
    if (existingPicker) {
      existingPicker.remove();
    }
    
    // العثور على الرسالة التي سيتم إضافة التفاعل لها
    const messageElem = buttonElement.closest('.message');
    if (!messageElem) {
      if (window.debugMode === true) {
        console.error('لم يتم العثور على عنصر الرسالة!');
      }
      return;
    }
    
    // إنشاء منتقي التفاعلات
    const reactionPicker = document.createElement('div');
    reactionPicker.id = 'reactionPicker';
    reactionPicker.className = 'reaction-picker';
    
    const reactions = ['👍', '❤️', '😂', '😮', '😢', '👏'];
    
    let buttonsHTML = '';
    reactions.forEach(emoji => {
      buttonsHTML += `<button class="reaction-emoji-btn" data-emoji="${emoji}">${emoji}</button>`;
    });
    
    reactionPicker.innerHTML = buttonsHTML;
    document.body.appendChild(reactionPicker);
    
    // إضافة أحداث للأزرار
    reactionPicker.querySelectorAll('.reaction-emoji-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        const emoji = this.getAttribute('data-emoji');
        window.sendReaction(messageId, emoji, externalId);
        reactionPicker.remove();
      });
    });
    
    // إغلاق عند النقر في أي مكان آخر
    document.addEventListener('click', function closeReactionPicker(e) {
      if (!reactionPicker.contains(e.target) && 
          !e.target.classList.contains('reaction-btn') && 
          !e.target.closest('.reaction-btn')) {
        reactionPicker.remove();
        document.removeEventListener('click', closeReactionPicker);
      }
    });
    
    // التأكد من أن منتقي التفاعلات ليس خارج حدود الشاشة
    const rect = buttonElement.getBoundingClientRect();
    
    // الحصول على اتجاه المستند
    const isRTL = document.dir === 'rtl' || getComputedStyle(document.body).direction === 'rtl';
    
    // تحديد إحداثيات العرض
    const windowWidth = window.innerWidth;
    const pickerWidth = 250; // تقدير عرض منتقي التفاعلات
    
    // تحديد الموضع الأفقي
    let left, right;
    if (isRTL) {
      right = windowWidth - rect.right;
      reactionPicker.style.right = `${right}px`;
    } else {
      left = rect.left;
      // التأكد من أن المنتقي لا يتجاوز حدود الشاشة
      if (left + pickerWidth > windowWidth) {
        left = windowWidth - pickerWidth - 10;
      }
      reactionPicker.style.left = `${left}px`;
    }
    
    // تحديد الموضع الرأسي (فوق أو تحت الزر حسب المساحة المتاحة)
    const pickerHeight = 60; // تقدير ارتفاع منتقي التفاعلات
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    if (spaceBelow < pickerHeight && spaceAbove > pickerHeight) {
      // وضع المنتقي فوق الزر إذا لم تكن هناك مساحة كافية بالأسفل
      reactionPicker.style.top = `${rect.top - pickerHeight - 5 + window.scrollY}px`;
    } else {
      // وضع المنتقي تحت الزر (الوضع الافتراضي)
      reactionPicker.style.top = `${rect.bottom + window.scrollY + 5}px`;
    }
    
    if (window.debugMode === true) {
      console.log('تم إنشاء منتقي التفاعلات بنجاح:', reactionPicker);
    }
  };
  
  /**
   * دالة لإرسال تفاعل
   * @param {string} messageId - معرف الرسالة
   * @param {string} emoji - رمز التفاعل
   * @param {string} externalId - المعرف الخارجي للرسالة (اختياري)
   * 
   * ملاحظة هامة:
   * هذه هي الطريقة المفضلة لإرسال التفاعلات (عبر HTTP)
   * يتم استخدام مسار /reaction (الأحدث والمفضل)
   * تجنب استخدام socket.emit('add_reaction') مباشرة لتجنب الازدواجية
   */
  window.sendReaction = function(messageId, emoji, externalId) {
    if (!messageId || !emoji) return;
    
    if (window.debugMode === true) {
      console.log('إرسال تفاعل:', messageId, emoji);
    }
    
    // الحصول على معرف المحادثة
    const conversationId = document.getElementById('conversationId')?.value;
    if (!conversationId) {
      if (window.debugMode === true) {
        console.error('معرف المحادثة غير موجود!');
      }
      return;
    }
    
    // إرسال التفاعل إلى الخادم
    fetch(`/crm/conversations/${conversationId}/reaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        messageId: messageId,
        externalMessageId: externalId,
        emoji: emoji,
        senderId: window.currentUserId,
        senderName: window.currentUsername
      })
    })
    .then(response => {
      if (!response.ok) throw new Error('فشل إرسال التفاعل');
      return response.json();
    })
    .then(data => {
      if (window.debugMode === true) {
        console.log('تم إرسال التفاعل بنجاح:', data);
      }
    })
    .catch(error => {
      if (window.debugMode === true) {
        console.error('خطأ في إرسال التفاعل:', error);
      }
      window.showToast && window.showToast('فشل في إرسال التفاعل، يرجى المحاولة مرة أخرى.', 'danger');
    });
  };
  
  /**
   * دالة لعرض نموذج الرد على رسالة معينة
   * @param {string} messageId - معرف الرسالة
   * @param {string} externalId - المعرف الخارجي للرسالة (اختياري)
   * @param {HTMLElement} messageElem - عنصر الرسالة
   */
  window.showReplyForm = function(messageId, externalId, messageElem) {
    if (!messageElem || !messageId) {
      if (window.debugMode === true) {
        console.error('بيانات غير كافية لعرض نموذج الرد:', { messageId, messageElem });
      }
      return;
    }
    
    if (window.debugMode === true) {
      console.log('تنفيذ دالة showReplyForm مع المعرف:', messageId);
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

  /**
   * دالة إرسال الرد
   * @param {Event} event - حدث الإرسال (اختياري)
   */
  window.sendReply = function(event) {
    if (event) event.preventDefault();
    
    const replyMessage = document.getElementById('replyMessage');
    const sendButton = document.getElementById('sendButton');
    const sendingIndicator = document.getElementById('sendingIndicator');
    const conversationId = document.getElementById('conversationId')?.value;
    
    // التحقق من وجود العناصر
    if (!replyMessage || !sendButton || !sendingIndicator || !conversationId) {
      if (window.debugMode === true) {
        console.error('عناصر النموذج غير متوفرة:', { 
          replyMessage: !!replyMessage, 
          sendButton: !!sendButton,
          sendingIndicator: !!sendingIndicator,
          conversationId: conversationId 
        });
      }
      return;
    }
    
    // التحقق من الإدخال
    if (!replyMessage.value.trim()) {
      alert('يرجى كتابة نص الرسالة');
      return;
    }
    
    // تعطيل الزر وإظهار مؤشر التحميل
    sendButton.disabled = true;
    sendingIndicator.style.display = 'inline-block';
    
    // إرسال الرسالة للخادم
    fetch(`/crm/conversations/${conversationId}/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        content: replyMessage.value.trim(),
        replyToMessageId: window.currentReplyToId || null
      })
    })
    .then(response => {
      if (!response.ok) throw new Error('فشل إرسال الرسالة');
      return response.json();
    })
    .then(data => {
      if (window.debugMode === true) {
        console.log('تم إرسال الرسالة بنجاح:', data);
      }
      
      // مسح النص من النموذج
      replyMessage.value = '';
      
      // إعادة تمكين زر الإرسال وإخفاء المؤشر
      sendButton.disabled = false;
      sendingIndicator.style.display = 'none';
      
      // إزالة مؤشر الرد إن وجد
      window.clearReplyIndicator();
      
      // إضافة الرسالة المرسلة للمحادثة
      if (data.message) {
        // استخدام الدالة المناسبة حسب الواجهة
        if (typeof window.addNewMessageToConversation === 'function') {
          window.addNewMessageToConversation(data.message);
        } else if (typeof window.addMessageToConversation === 'function') {
          window.addMessageToConversation(data.message);
        }
      }
      
      // تحديث قائمة المحادثات إذا كانت الدالة موجودة
      if (typeof refreshConversationsList === 'function') {
        refreshConversationsList();
      }
    })
    .catch(error => {
      if (window.debugMode === true) {
        console.error('خطأ في إرسال الرسالة:', error);
      }
      
      // إعادة تمكين زر الإرسال وإخفاء المؤشر
      sendButton.disabled = false;
      sendingIndicator.style.display = 'none';
      
      // عرض رسالة خطأ
      window.showToast && window.showToast('فشل في إرسال الرسالة، يرجى المحاولة مرة أخرى.', 'danger');
    });
  };

  /**
   * دالة لتحديث حالة الرسالة في الواجهة
   * @param {string} messageId - معرف الرسالة (يكون عادة المعرف الخارجي wamid)
   * @param {string} newStatus - الحالة الجديدة
   */
  window.updateMessageStatus = function(messageId, newStatus) {
    if (!messageId || !newStatus) {
      if (window.debugMode === true) {
        console.warn('معلومات غير كافية لتحديث حالة الرسالة:', { messageId, newStatus });
      }
      return;
    }
    
    // البحث أولاً عن الرسالة حسب المعرف الخارجي (الذي يأتي من واتساب)
    let messageElem = document.querySelector(`.message[data-external-id="${messageId}"]`);
    
    // إذا لم يتم العثور على الرسالة بالمعرف الخارجي، حاول البحث بمعرف الرسالة في قاعدة البيانات
    if (!messageElem) {
      messageElem = document.querySelector(`.message[data-message-id="${messageId}"]`);
      
      if (window.debugMode === true && !messageElem) {
        // تسجيل معلومات التصحيح عن كل الرسائل الموجودة في الصفحة
        const allMessages = document.querySelectorAll('.message');
        console.log('جميع رسائل الصفحة:', Array.from(allMessages).map(el => ({
          id: el.getAttribute('data-message-id'),
          externalId: el.getAttribute('data-external-id'),
          status: el.getAttribute('data-status')
        })));
      }
    }
    
    // إذا لم يتم العثور على الرسالة بأي من المعرفين
    if (!messageElem) {
      if (window.debugMode === true) {
        console.warn('لم يتم العثور على الرسالة لتحديث حالتها. المعرف:', messageId);
      }
      return;
    }
    
    if (window.debugMode === true) {
      console.log('تم العثور على الرسالة وسيتم تحديث حالتها:', { 
        messageId, 
        elementId: messageElem.getAttribute('data-message-id'),
        externalId: messageElem.getAttribute('data-external-id'),
        oldStatus: messageElem.getAttribute('data-status'),
        newStatus 
      });
    }
    
    // تحديث السمة
    messageElem.setAttribute('data-status', newStatus);
    
    // تحديث أيقونة الحالة
    const statusIcon = messageElem.querySelector('.message-status i');
    if (statusIcon) {
      // إزالة جميع الأصناف
      statusIcon.className = '';
      
      // إضافة الصنف المناسب للحالة الجديدة
      if (newStatus === 'sending') {
        statusIcon.className = 'fas fa-clock text-secondary';
        statusIcon.title = 'جاري الإرسال...';
      } else if (newStatus === 'sent') {
        statusIcon.className = 'fas fa-check text-silver';
        statusIcon.title = 'تم الإرسال';
      } else if (newStatus === 'delivered') {
        statusIcon.className = 'fas fa-check-double text-silver';
        statusIcon.title = 'تم التسليم';
      } else if (newStatus === 'read') {
        statusIcon.className = 'fas fa-check-double text-primary';
        statusIcon.title = 'تم القراءة';
      } else if (newStatus === 'failed') {
        statusIcon.className = 'fas fa-exclamation-triangle text-danger';
        statusIcon.title = 'فشل الإرسال';
      }
    }
  };
  
  /**
   * دالة لإظهار إشعار منبثق (توست)
   * @param {string} message - نص الإشعار
   * @param {string} type - نوع الإشعار (info, success, warning, danger)
   */
  window.showToast = function(message, type = 'info') {
    // التأكد من وجود حاوية الإشعارات
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.className = 'position-fixed bottom-0 end-0 p-3';
      toastContainer.style.zIndex = '1050';
      document.body.appendChild(toastContainer);
    }
    
    // إنشاء الإشعار
    const toastId = 'toast-' + Date.now();
    const toastElem = document.createElement('div');
    toastElem.id = toastId;
    toastElem.className = `toast show bg-${type} text-white`;
    toastElem.setAttribute('role', 'alert');
    toastElem.setAttribute('aria-live', 'assertive');
    toastElem.setAttribute('aria-atomic', 'true');
    
    toastElem.innerHTML = `
      <div class="toast-header bg-${type} text-white">
        <strong class="me-auto">إشعار</strong>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="إغلاق"></button>
      </div>
      <div class="toast-body">
        ${message}
      </div>
    `;
    
    // إضافة الإشعار للحاوية
    toastContainer.appendChild(toastElem);
    
    // إضافة حدث للزر إغلاق
    const closeBtn = toastElem.querySelector('.btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        toastElem.remove();
      });
    }
    
    // إزالة الإشعار بعد فترة
    setTimeout(() => {
      if (toastElem && toastElem.parentNode) {
        toastElem.remove();
      }
    }, 5000);
  };
  
  /**
   * دالة لتعليق مستمعات الأحداث للمحادثة
   */
  window.setupMessageActions = function(messageElem) {
    if (!messageElem) return;
    
    if (window.debugMode === true) {
      console.log('إعداد أحداث الرسالة للعنصر:', messageElem);
    }
    
    // زر الرد
    const replyButton = messageElem.querySelector('.reply-btn');
    if (replyButton) {
      if (window.debugMode === true) {
        console.log('تم العثور على زر الرد:', replyButton);
      }
      
      // إزالة أي مستمعات سابقة لتجنب التكرار
      const oldReplyHandler = replyButton.onclick;
      if (oldReplyHandler) {
        replyButton.removeEventListener('click', oldReplyHandler);
      }
      
      // إضافة مستمع جديد
      replyButton.addEventListener('click', function() {
        if (window.debugMode === true) {
          console.log('تم النقر على زر الرد');
        }
        const messageId = messageElem.getAttribute('data-message-id');
        const externalId = messageElem.getAttribute('data-external-id');
        window.showReplyForm(messageId, externalId, messageElem);
      });
    }
    
    // زر التفاعل
    const reactionButton = messageElem.querySelector('.reaction-btn');
    if (reactionButton) {
      if (window.debugMode === true) {
        console.log('تم العثور على زر التفاعل:', reactionButton);
      }
      
      // إزالة أي مستمعات سابقة لتجنب التكرار
      const oldReactionHandler = reactionButton.onclick;
      if (oldReactionHandler) {
        reactionButton.removeEventListener('click', oldReactionHandler);
      }
      
      // إضافة مستمع جديد
      reactionButton.addEventListener('click', function(event) {
        if (window.debugMode === true) {
          console.log('تم النقر على زر التفاعل');
        }
        const messageId = messageElem.getAttribute('data-message-id');
        const externalId = messageElem.getAttribute('data-external-id');
        window.showReactionPicker(messageId, externalId, event.target);
      });
    }
  };

  /**
   * دالة لتشغيل صوت عند وصول رسائل جديدة
   */
  window.playNotificationSound = function() {
    try {
      const sound = document.getElementById('messageSound');
      if (sound) {
        sound.currentTime = 0;
        sound.play().catch(err => {
          if (window.debugMode === true) {
            console.error('خطأ تشغيل الصوت:', err);
          }
        });
      }
    } catch (error) {
      if (window.debugMode === true) {
        console.error('خطأ في تشغيل صوت الإشعار:', error);
      }
    }
  };

  /**
   * دالة لتعليق مستمعات الأحداث للمحادثة في الواجهة المفصلة
   */
  window.attachConversationEventListeners = function() {
    if (window.debugMode === true) {
      console.log('بدء تطبيق مستمعات الأحداث للمحادثة...');
    }
    
    // الحصول على الإشارات إلى عناصر DOM
    const replyForm = document.getElementById('replyForm');
    const replyMessage = document.getElementById('replyMessage');
    const sendButton = document.getElementById('sendButton');
    const sendingIndicator = document.getElementById('sendingIndicator');
    const conversationId = document.getElementById('conversationId')?.value;
    
    if (!conversationId) {
      if (window.debugMode === true) {
        console.error('معرف المحادثة غير موجود! replyForm:', replyForm, 'conversationId element:', document.getElementById('conversationId'));
      }
      return;
    }
    
    if (window.debugMode === true) {
      console.log('تهيئة النموذج للمحادثة:', conversationId);
    }
    
    // إضافة مستمعات الأحداث للرسائل الموجودة حالياً
    if (window.debugMode === true) {
      console.log('إضافة مستمعات الأحداث للرسائل...');
    }
    const allMessages = document.querySelectorAll('.message');
    allMessages.forEach(message => {
      window.setupMessageActions(message);
    });
    
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
            window.sendReply();
          }
        });
      }
    } else {
      if (window.debugMode === true) {
        console.warn('نموذج الرد غير موجود! قد تكون المحادثة مغلقة.');
      }
    }
    
    // التأكد من وجود Socket.io
    if (typeof socket !== 'undefined') {
      // مستمع لحدث الرد على رسالة
      socket.on('message-reply', function(data) {
        if (window.debugMode === true) {
          console.log('تم استلام حدث رد على رسالة:', data);
        }
        
        try {
          if (!data || !data.message) {
            return console.warn('بيانات الرد غير مكتملة:', data);
          }
          
          // تجهيز بيانات الرسالة
          const message = data.message;
          const replyToId = data.replyToId;
          
          if (!replyToId) {
            return console.warn('معرف الرسالة المراد الرد عليها غير موجود!', data);
          }
          
          // ضبط خاصية replyToMessageId في كائن الرسالة لضمان معالجتها كرد
          if (!message.replyToMessageId) {
            message.replyToMessageId = replyToId;
          }
          
          // استخدام طريقة addMessageToConversation إذا كانت متاحة
          if (typeof window.addMessageToConversation === 'function') {
            // استخدام نفس الواجهة للرسائل الجديدة
            window.addMessageToConversation(message);
            return;
          }
          
          // الطريقة القديمة (احتياطي) - نستخدمها فقط إذا لم تكن الدالة الجديدة متاحة
          // 1. إنشاء عنصر الرسالة الجديدة
          const messageContainer = document.getElementById('messageContainer');
          if (!messageContainer) {
            return console.warn('حاوية الرسائل غير موجودة في الصفحة!');
          }
          
          // 2. البحث عن الرسالة المرد عليها
          const repliedMsg = document.querySelector(`.message[data-external-id="${replyToId}"], .message[data-message-id="${replyToId}"]`);
          
          // 3. إنشاء HTML للرسالة مع معلومات الرد
          let messageHTML = `
            <div class="message ${message.direction}" 
                data-message-id="${message._id}" 
                data-status="${message.status}"
                ${message.externalMessageId ? `data-external-id="${message.externalMessageId}"` : ''}>
              <div class="replied-message">
                <div class="replied-content">
                  <i class="fas fa-reply"></i>
                  <span>${repliedMsg ? 
                    (repliedMsg.querySelector('.message-bubble').textContent.trim().substring(0, 50) + (repliedMsg.querySelector('.message-bubble').textContent.trim().length > 50 ? '...' : '')) : 
                    `رد على رسالة غير موجودة<small class="text-muted d-block">(المعرف: ${replyToId.substring(0, 10)}...)</small>`}</span>
                </div>
              </div>
              <div class="message-bubble ${message.direction === 'incoming' ? 'incoming-bubble' : 'outgoing-bubble'}">
                ${message.content}
                <div class="message-time">
                  ${new Date(message.timestamp).toLocaleString('ar-LY')}
                  ${message.direction === 'outgoing' ? `
                    <span class="message-status">
                      ${message.status === 'sending' ? '<i class="fas fa-clock text-secondary" title="جاري الإرسال..."></i>' : ''}
                      ${message.status === 'sent' ? '<i class="fas fa-check text-silver" title="تم الإرسال"></i>' : ''}
                      ${message.status === 'delivered' ? '<i class="fas fa-check-double text-silver" title="تم التسليم"></i>' : ''}
                      ${message.status === 'read' ? '<i class="fas fa-check-double text-primary" title="تم القراءة"></i>' : ''}
                      ${message.status === 'failed' ? '<i class="fas fa-exclamation-triangle text-danger" title="فشل الإرسال"></i>' : ''}
                    </span>
                  ` : ''}
                </div>
              </div>
              <div class="message-actions">
                <button type="button" class="btn btn-sm text-muted message-action-btn reaction-btn" title="تفاعل" onclick="window.showReactionPicker('${message._id}', '${message.externalMessageId || ''}', this)">
                  <i class="far fa-smile"></i>
                </button>
                <button type="button" class="btn btn-sm text-muted message-action-btn reply-btn" 
                      data-message-id="${message._id}" 
                      data-external-id="${message.externalMessageId || ''}" 
                      title="رد" onclick="window.showReplyForm('${message._id}', '${message.externalMessageId || ''}', this.closest('.message'))">
                  <i class="fas fa-reply"></i>
                </button>
              </div>
            </div>
            <div class="clear-both"></div>
          `;
          
          // إضافة الرسالة إلى النهاية
          messageContainer.insertAdjacentHTML('beforeend', messageHTML);
          
          // تطبيق مستمعات الأحداث على الرسالة الجديدة
          const newMessageElem = messageContainer.lastElementChild;
          window.setupMessageActions(newMessageElem);
          
          // التمرير إلى أسفل
          messageContainer.scrollTop = messageContainer.scrollHeight;
          
          // تشغيل صوت الإشعار إذا كانت رسالة واردة
          if (message.direction === 'incoming') {
            window.playNotificationSound();
          }
        } catch (error) {
          console.error('خطأ في معالجة حدث رد على رسالة:', error);
        }
      });
    } else {
      if (window.debugMode === true) {
        console.warn('Socket.io غير متاح! لن يتم استلام الإشعارات في الوقت الحقيقي.');
      }
    }
  };

  /**
   * دالة لتحديث تفاعل على رسالة في الواجهة
   * @param {string} messageId - معرف الرسالة (يمكن أن يكون معرف خارجي أو داخلي)
   * @param {object} reaction - كائن يحتوي على معلومات التفاعل (المرسل، الإيموجي)
   */
  window.updateMessageReaction = function(messageId, reaction) {
    if (!messageId || !reaction) {
      if (window.debugMode === true) {
        console.warn('بيانات غير كاملة لتحديث التفاعل', { messageId, reaction });
      }
      return;
    }
    
    // البحث أولاً عن الرسالة حسب المعرف الخارجي
    let messageElem = document.querySelector(`.message[data-external-id="${messageId}"]`);
    
    // إذا لم يتم العثور على الرسالة بالمعرف الخارجي، حاول البحث بمعرف الرسالة في قاعدة البيانات
    if (!messageElem) {
      messageElem = document.querySelector(`.message[data-message-id="${messageId}"]`);
    }
    
    // إذا لم يتم العثور على الرسالة بأي من المعرفين
    if (!messageElem) {
      if (window.debugMode === true) {
        console.warn('لم يتم العثور على الرسالة لإضافة التفاعل. المعرف:', messageId);
      }
      return;
    }
    
    if (window.debugMode === true) {
      console.log('تم العثور على الرسالة وسيتم إضافة التفاعل:', messageId, reaction);
    }
    
    // البحث عن وجود حاوية التفاعلات في الرسالة
    let reactionsContainer = messageElem.querySelector('.message-reactions');
    
    // إذا لم تكن موجودة، أنشئها
    if (!reactionsContainer) {
      reactionsContainer = document.createElement('div');
      reactionsContainer.className = 'message-reactions';
      
      // إضافة حاوية التفاعلات بعد فقاعة الرسالة
      const messageBubble = messageElem.querySelector('.message-bubble');
      if (messageBubble) {
        messageBubble.insertAdjacentElement('afterend', reactionsContainer);
      } else {
        // إذا لم يتم العثور على فقاعة الرسالة، أضفها في نهاية الرسالة
        messageElem.appendChild(reactionsContainer);
      }
    }
    
    // عرض التفاعل
    // يمكننا تحديث هذا لدعم تفاعلات متعددة إذا لزم الأمر
    reactionsContainer.innerHTML = `
      <div class="reaction-item" title="${reaction.sender || 'غير معروف'}">
        ${reaction.emoji || '👍'}
      </div>
    `;
    
    // تحديث سمات الرسالة لتسجيل التفاعل
    messageElem.setAttribute('data-has-reaction', 'true');
    
    if (window.debugMode === true) {
      console.log('تم تحديث تفاعل الرسالة بنجاح');
    }
  };
  
})(window);
