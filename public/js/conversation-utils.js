/**
 * وحدة مساعدة للمحادثات - Conversation Utilities Module
 * هذا الملف يحتوي على دوال عامة مشتركة للتعامل مع محادثات نظام خدمة العملاء
 * يستخدم في كل من واجهة المحادثات المفصلة وواجهة المحادثات المقسمة
 * 
 * ملاحظات نظام الإرسال:
 * - الرسائل الجديدة: ترسل عبر HTTP إلى مسار /crm/conversations/:conversationId
 * - الردود: ترسل عبر HTTP إلى مسار /crm/conversations/:conversationId/reply
 * - التفاعلات: ترسل عبر HTTP إلى مسار /crm/conversations/:conversationId/reaction
 * - Socket.io: يستخدم للإشعارات فقط وليس للإرسال الفعلي للرسائل
 */

// نافذة عالمية للوظائف المشتركة
(function(window) {
  // تعيين وضع التصحيح (false لإيقاف رسائل التصحيح)
  window.debugMode = false;
  
  /**
   * دالة لعرض منتقي التفاعلات
   * @param {string} messageId - معرف الرسالة
   * @param {string} externalId - المعرف الخارجي للرسالة (اختياري)
   * @param {HTMLElement} buttonElement - عنصر الزر الذي تم النقر عليه
   */
  window.showReactionPicker = function(messageId, externalId, buttonElement) {
    if (!messageId) return;
    
    // إزالة أي منتقي سابق موجود
    const existingPicker = document.getElementById('reactionPicker');
    if (existingPicker) {
      existingPicker.remove();
    }
    
    // العثور على الرسالة التي سيتم إضافة التفاعل لها
    const messageElem = buttonElement.closest('.message');
    if (!messageElem) {
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
    if (!messageId || !emoji) {
      console.error('خطأ: messageId وemoji مطلوبان لإرسال التفاعل');
      return;
    }
    
    const conversationId = document.getElementById('conversationId')?.value;
    if (!conversationId) {
      console.error('خطأ: لم يتم العثور على معرف المحادثة');
      return;
    }
    
    const senderId = document.getElementById('currentUserId')?.value;
    const senderName = document.getElementById('currentUserName')?.value || 'مستخدم';
    
    if (window.debugMode) console.log(`إرسال تفاعل [${emoji}] للرسالة [${messageId}]`);
    
    fetch(`/crm/conversations/${conversationId}/reaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messageId: messageId,
        externalId: externalId,
        emoji: emoji,
        senderId: senderId,
        senderName: senderName
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`خطأ في إرسال التفاعل: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (window.debugMode) console.log('تم إرسال التفاعل بنجاح:', data);
      updateReactionInUI(messageId, externalId, emoji, senderId, senderName);
    })
    .catch(error => {
      console.error('خطأ في إرسال التفاعل:', error);
    });
    
    // إغلاق منتقي التفاعلات
    const reactionPicker = document.getElementById('reactionPicker');
    if (reactionPicker) {
      reactionPicker.remove();
    }
  };
  
  /**
   * تحديث واجهة المستخدم بعد إرسال تفاعل
   * @param {string} messageId - معرف الرسالة
   * @param {string} externalId - المعرف الخارجي للرسالة (اختياري)
   * @param {string} emoji - رمز التفاعل
   * @param {string} senderId - معرف المرسل
   * @param {string} senderName - اسم المرسل
   */
  window.updateReactionInUI = function(messageId, externalId, emoji, senderId, senderName) {
    // البحث عن الرسالة باستخدام المعرف الداخلي أو الخارجي
    let messageElem;
    
    if (messageId) {
      messageElem = document.querySelector(`.message[data-message-id="${messageId}"]`);
    }
    
    if (!messageElem && externalId) {
      messageElem = document.querySelector(`.message[data-external-id="${externalId}"]`);
    }
    
    if (!messageElem) {
      if (window.debugMode) console.error('لم يتم العثور على الرسالة لتحديث التفاعل:', { messageId, externalId });
      return;
    }
    
    // البحث عن حاوية التفاعلات أو إنشاء واحدة جديدة
    let reactionsContainer = messageElem.querySelector('.message-reactions');
    
    if (!reactionsContainer) {
      reactionsContainer = document.createElement('div');
      reactionsContainer.className = 'message-reactions';
      
      // إضافة حاوية التفاعلات بعد فقاعة الرسالة
      const messageBubble = messageElem.querySelector('.message-bubble');
      if (messageBubble) {
        messageBubble.insertAdjacentElement('afterend', reactionsContainer);
      } else {
        messageElem.appendChild(reactionsContainer);
      }
    }
    
    // إنشاء عنصر التفاعل
    const reactionElem = document.createElement('span');
    reactionElem.className = 'reaction-emoji';
    reactionElem.title = `تفاعل من ${senderName || senderId || 'مستخدم'}`;
    reactionElem.textContent = emoji;
    
    // إضافة التفاعل إلى الحاوية
    reactionsContainer.appendChild(reactionElem);
    
    if (window.debugMode) console.log('تم تحديث التفاعل في واجهة المستخدم:', { messageId, emoji });
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
    if (event) {
      event.preventDefault();
    }
    
    const messageInput = document.getElementById('replyMessage');
    const conversationId = document.getElementById('conversationId');
    const sendButton = document.getElementById('sendButton');
    const sendingIndicator = document.getElementById('sendingIndicator');
    
    // الحصول على نص الرسالة
    const messageText = messageInput.value.trim();
    
    // التحقق ما إذا كان هناك ملف مرفق
    const mediaId = document.getElementById('mediaId').value;
    const mediaType = document.getElementById('mediaType').value;
    
    // التحقق من وجود نص رسالة أو ملف مرفق على الأقل
    if (!messageText && !mediaId) {
      if (window.showToast) {
        window.showToast('يرجى كتابة رسالة أو إرفاق ملف', 'warning');
      }
      return;
    }
    
    // التحقق من وجود معرف محادثة
    if (!conversationId || !conversationId.value) {
      if (window.debugMode === true) {
        console.error('لم يتم العثور على معرّف المحادثة');
      }
      return;
    }
    
    // تعطيل زر الإرسال وإظهار مؤشر الإرسال
    sendButton.disabled = true;
    sendingIndicator.style.display = 'inline-block';
    
    // الحصول على معرف الرسالة المراد الرد عليها (إن وجد)
    const replyToMessageId = window.currentReplyToId || null;
    
    // إنشاء كائن البيانات للإرسال
    const requestData = {
      content: messageText,
      replyToId: replyToMessageId
    };
    
    // إضافة معلومات الوسائط إذا كانت متوفرة
    if (mediaId && mediaType) {
      requestData.mediaId = mediaId;
      requestData.mediaType = mediaType;
    }
    
    // إرسال الرسالة باستخدام Fetch API
    fetch(`/crm/conversations/${conversationId.value}/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify(requestData)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('فشل إرسال الرسالة');
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        // مسح حقل الإدخال
        messageInput.value = '';
        
        // مسح مؤشر الرد إذا كان موجودا
        window.clearReplyIndicator();
        
        // مسح الملف المرفق إذا كان موجوداً
        window.clearMediaAttachment();
        
        // تمرير المحتوى إلى وظيفة تشغيل صوت الرسالة (اختياري)
        if (typeof playMessageSound === 'function') {
          playMessageSound('sent');
        }
      } else {
        throw new Error(data.error || 'فشل في إرسال الرسالة');
      }
    })
    .catch(error => {
      if (window.debugMode === true) {
        console.error('خطأ في إرسال الرسالة:', error);
      }
      
      // عرض رسالة خطأ
      if (window.showToast) {
        window.showToast('فشل في إرسال الرسالة، يرجى المحاولة مرة أخرى.', 'danger');
      }
    })
    .finally(() => {
      // إعادة تفعيل زر الإرسال وإخفاء مؤشر الإرسال
      sendButton.disabled = false;
      sendingIndicator.style.display = 'none';
    });
  };

  /**
   * دالة لتحديث حالة الرسالة في الواجهة
   * @param {string} messageId - معرف الرسالة (يكون عادة المعرف الخارجي wamid)
   * @param {string} newStatus - الحالة الجديدة
   */
  window.updateMessageStatus = function(messageId, newStatus) {
    if (!messageId || !newStatus) {
      return;
    }
    
    // البحث أولاً عن الرسالة حسب المعرف الخارجي (الذي يأتي من واتساب)
    let messageElem = document.querySelector(`.message[data-external-id="${messageId}"]`);
    
    // إذا لم يتم العثور على الرسالة بالمعرف الخارجي، حاول البحث بمعرف الرسالة في قاعدة البيانات
    if (!messageElem) {
      messageElem = document.querySelector(`.message[data-message-id="${messageId}"]`);
      
    }
    
    // إذا لم يتم العثور على الرسالة بأي من المعرفين
    if (!messageElem) {
      return;
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
   * دالة لتنسيق حجم الملفات بشكل مقروء
   * @param {number} bytes - حجم الملف بالبايت
   * @returns {string} - الحجم المنسق (مثال: 1.5 MB)
   */
  window.formatFileSize = function(bytes) {
    if (!bytes || isNaN(bytes)) return '';
    
    const units = ['بايت', 'كيلوبايت', 'ميجابايت', 'جيجابايت', 'تيرابايت'];
    let size = parseInt(bytes, 10);
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
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
   * دالة لتنسيق الوقت بشكل مقروء
   * @param {string|Date} timestamp - طابع زمني
   * @returns {string} - الوقت المنسق
   */
  window.formatTime = function(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    // إذا كان اليوم نفسه
    if (diffDays === 0) {
      return date.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' });
    }
    
    // إذا كان بالأمس
    if (diffDays === 1) {
      return `الأمس ${date.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // إذا كان خلال الأسبوع الحالي (أقل من 7 أيام)
    if (diffDays < 7) {
      const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      return `${days[date.getDay()]} ${date.toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' })}`;
    }
    
    // غير ذلك، عرض التاريخ كاملاً
    return date.toLocaleDateString('ar-LY', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  /**
   * دالة لتعليق مستمعات الأحداث للمحادثة
   */
  window.setupMessageActions = function(messageElem) {
    if (!messageElem) return;
    
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
        window.showReplyForm(messageId, externalId, messageElem);
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
        });
      }
    } catch (error) {
    }
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
    
    if (!conversationId) {
      return;
    }
    
    // إضافة مستمعات الأحداث للرسائل الموجودة حالياً
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
    }
    
    // التأكد من وجود Socket.io
    if (typeof socket !== 'undefined') {
      
      // مستمع لحدث الرد على رسالة
      socket.on('message-reply', function(data) {
        
        try {
          if (!data || !data.message) {
            return;
          }
          
          // تجهيز بيانات الرسالة
          const message = data.message;
          const replyToId = data.replyToId;
          
          if (!replyToId) {
            return;
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
            return;
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
        }
      });
    } else {
    }
  };

  /**
   * دالة لتحديث تفاعل على رسالة في الواجهة
   * @param {string} messageId - معرف الرسالة (يمكن أن يكون معرف خارجي أو داخلي)
   * @param {object} reaction - كائن يحتوي على معلومات التفاعل (المرسل، الإيموجي)
   */
  window.updateMessageReaction = function(messageId, reaction) {
    if (!messageId || !reaction) {
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
      return;
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
  };

  /**
   * دالة لتفعيل نموذج تحميل الوسائط
   * @param {string} mediaType - نوع الوسائط (اختياري، يتم تحديده تلقائيًا إذا لم يتم تحديده)
   */
  window.showMediaUpload = function(mediaType = 'auto') {
    // تحديث العنوان
    document.getElementById('mediaUploadTitle').textContent = 'تحميل ملف';
    
    // تحديث قيمة نوع الوسائط في النموذج
    document.getElementById('uploadMediaType').value = mediaType;
    
    // إعادة تعيين حالة النموذج
    document.getElementById('mediaFile').value = '';
    document.getElementById('filePreview').style.display = 'none';
    
    // إعادة ضبط مسجل الصوت
    resetAudioRecorder();
    
    // إظهار النموذج
    const modal = new bootstrap.Modal(document.getElementById('mediaUploadModal'));
    modal.show();
    
    // تهيئة منطقة السحب والإفلات
    setupDragAndDrop();
    
    // تهيئة مسجل الصوت
    initAudioRecorder();
  };

  /**
   * دالة لتهيئة خاصية السحب والإفلات
   */
  function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('mediaFile');
    
    if (!uploadArea || !fileInput) return;
    
    // إضافة أنماط CSS لمنطقة السحب والإفلات
    if (!document.getElementById('dragDropStyles')) {
      const style = document.createElement('style');
      style.id = 'dragDropStyles';
      style.textContent = `
        .upload-area {
          border: 2px dashed #ccc;
          border-radius: 5px;
          padding: 25px;
          text-align: center;
          position: relative;
          transition: all 0.3s;
          background-color: #f8f9fa;
          min-height: 150px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .upload-area.drag-over {
          background-color: #e9ecef;
          border-color: #6c757d;
        }
        .upload-area-inner {
          pointer-events: none;
        }
      `;
      document.head.appendChild(style);
    }
    
    // معالجة أحداث السحب والإفلات
    uploadArea.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove('drag-over');
    });
    
    uploadArea.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove('drag-over');
      
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelection();
      }
    });
    
    // معالجة اختيار الملف عن طريق النقر
    fileInput.addEventListener('change', handleFileSelection);
  }

  /**
   * دالة لمعالجة اختيار الملف
   */
  function handleFileSelection() {
    const fileInput = document.getElementById('mediaFile');
    const filePreview = document.getElementById('filePreview');
    const selectedFileName = document.getElementById('selectedFileName');
    const fileTypeIcon = document.getElementById('fileTypeIcon');
    const uploadMediaType = document.getElementById('uploadMediaType');
    
    if (fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      
      // عرض اسم الملف
      selectedFileName.textContent = file.name;
      
      // تحديد نوع الملف وتعيين الأيقونة المناسبة
      let iconClass = 'fa-file';
      let mediaType = 'document';
      
      if (file.type.startsWith('image/')) {
        iconClass = 'fa-image';
        mediaType = 'image';
      } else if (file.type.startsWith('video/')) {
        iconClass = 'fa-video';
        mediaType = 'video';
      } else if (file.type.startsWith('audio/')) {
        iconClass = 'fa-music';
        mediaType = 'audio';
      } else if (file.type === 'application/pdf') {
        iconClass = 'fa-file-pdf';
      } else if (file.type.includes('word') || file.type.includes('document')) {
        iconClass = 'fa-file-word';
      } else if (file.type.includes('excel') || file.type.includes('sheet')) {
        iconClass = 'fa-file-excel';
      } else if (file.type.includes('powerpoint') || file.type.includes('presentation')) {
        iconClass = 'fa-file-powerpoint';
      }
      
      // تعيين الأيقونة
      fileTypeIcon.className = `fas ${iconClass} me-2`;
      
      // تحديث نوع الوسائط إذا كان تلقائيًا
      if (uploadMediaType.value === 'auto') {
        uploadMediaType.value = mediaType;
      }
      
      // إظهار معاينة الملف
      filePreview.style.display = 'block';
    }
  }

  /**
   * دالة لمسح الملف المحدد
   */
  window.clearSelectedFile = function() {
    document.getElementById('mediaFile').value = '';
    document.getElementById('filePreview').style.display = 'none';
  };

  /**
   * دالة لتحميل الوسائط إلى الخادم
   */
  window.uploadMedia = function() {
    const form = document.getElementById('mediaUploadForm');
    const fileInput = document.getElementById('mediaFile');
    const mediaType = document.getElementById('uploadMediaType').value;
    const conversationId = document.getElementById('uploadConversationId').value;
    
    // التحقق من اختيار ملف أو وجود تسجيل صوتي
    if ((!fileInput.files || fileInput.files.length === 0) && !window.recordedAudioData) {
      window.showToast && window.showToast('يرجى اختيار ملف للتحميل أو تسجيل صوت', 'warning');
      return;
    }
    
    // إظهار شريط التقدم
    const progressBar = document.querySelector('.upload-progress .progress-bar');
    document.querySelector('.upload-progress').style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    
    // تعطيل زر التحميل
    const uploadBtn = document.getElementById('uploadMediaBtn');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحميل...';
    
    // تحميل تسجيل صوتي
    if (window.recordedAudioData) {
      // إنشاء FormData
      const formData = new FormData();
      
      // تحويل بيانات Base64 إلى ملف
      const byteString = atob(window.recordedAudioData.base64.split(',')[1]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      
      const blob = new Blob([ab], { type: window.recordedAudioData.type });
      const file = new File([blob], window.recordedAudioData.name, { type: window.recordedAudioData.type });
      
      formData.append('mediaFile', file);
      formData.append('mediaType', 'audio');
      formData.append('conversationId', conversationId);
      
      // إرسال طلب تحميل الملف
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/whatsapp/media/upload', true);
      
      // مراقبة تقدم التحميل
      xhr.upload.onprogress = function(e) {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          progressBar.style.width = percentComplete + '%';
          progressBar.textContent = percentComplete + '%';
          progressBar.setAttribute('aria-valuenow', percentComplete);
        }
      };
      
      // معالجة الاستجابة
      xhr.onload = function() {
        try {
          const response = JSON.parse(xhr.responseText);
          
          if (response.success) {
            // إخفاء النموذج
            const modal = bootstrap.Modal.getInstance(document.getElementById('mediaUploadModal'));
            modal.hide();
            
            // عرض معاينة الملف المرفق
            document.getElementById('mediaPreview').style.display = 'block';
            document.getElementById('mediaFileName').textContent = response.media.fileName || 'تسجيل صوتي';
            document.getElementById('mediaId').value = response.media._id;
            document.getElementById('mediaType').value = response.media.mediaType;
            
            // تنظيف نموذج التحميل
            resetAudioRecorder();
            
            window.showToast && window.showToast('تم تحميل التسجيل الصوتي بنجاح', 'success');
          } else {
            window.showToast && window.showToast(response.error || 'حدث خطأ أثناء تحميل التسجيل الصوتي', 'danger');
          }
        } catch (error) {
          window.showToast && window.showToast('حدث خطأ أثناء معالجة الاستجابة', 'danger');
        }
        
        // إعادة تمكين زر التحميل
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = 'تحميل';
        
        // إخفاء شريط التقدم
        document.querySelector('.upload-progress').style.display = 'none';
      };
      
      xhr.onerror = function() {
        window.showToast && window.showToast('حدث خطأ في الاتصال بالخادم', 'danger');
        
        // إعادة تمكين زر التحميل
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = 'تحميل';
        
        // إخفاء شريط التقدم
        document.querySelector('.upload-progress').style.display = 'none';
      };
      
      xhr.send(formData);
      return;
    }
    
    // الكود الحالي لتحميل الملفات العادية
    const file = fileInput.files[0];
    const supportedTypes = {
      'image': ['image/jpeg', 'image/png', 'image/webp'],
      'video': ['video/mp4', 'video/3gpp'],
      'audio': ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'],
      'document': [
        'application/pdf', 
        'application/vnd.ms-powerpoint', 
        'application/msword', 
        'application/vnd.ms-excel', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', 
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
        'text/plain',
        'application/octet-stream'
      ]
    };
    
    // إذا كان النوع تلقائيًا، نحدده بناءً على نوع الملف
    if (mediaType === 'auto') {
      if (file.type.startsWith('image/')) {
        document.getElementById('uploadMediaType').value = 'image';
      } else if (file.type.startsWith('video/')) {
        document.getElementById('uploadMediaType').value = 'video';
      } else if (file.type.startsWith('audio/')) {
        document.getElementById('uploadMediaType').value = 'audio';
      } else {
        document.getElementById('uploadMediaType').value = 'document';
      }
    }
    
    // التحقق من دعم نوع الملف
    let isSupported = false;
    for (const type in supportedTypes) {
      if (supportedTypes[type].includes(file.type)) {
        isSupported = true;
        break;
      }
    }
    
    // التحقق من الامتداد إذا كان نوع الملف application/octet-stream
    if (!isSupported && file.type === 'application/octet-stream') {
      const extension = file.name.toLowerCase().split('.').pop();
      if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(extension)) {
        isSupported = true;
      }
    }
    
    if (!isSupported) {
      window.showToast && window.showToast(`نوع الملف ${file.type} غير مدعوم في واتساب. الأنواع المدعومة هي: JPEG, PNG, WEBP للصور، MP4 للفيديو، MP3/OGG للصوت، PDF/DOC/DOCX/XLS/XLSX للمستندات.`, 'warning');
      
      // إعادة تمكين زر التحميل
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = 'تحميل';
      
      // إخفاء شريط التقدم
      document.querySelector('.upload-progress').style.display = 'none';
      
      return;
    }
    
    // إنشاء FormData
    const formData = new FormData();
    formData.append('mediaFile', fileInput.files[0]);
    formData.append('mediaType', document.getElementById('uploadMediaType').value);
    formData.append('conversationId', conversationId);
    
    // إرسال طلب تحميل الملف باستخدام XMLHttpRequest لتتبع التقدم
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/whatsapp/media/upload', true);
    
    // مراقبة تقدم التحميل
    xhr.upload.onprogress = function(e) {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = percentComplete + '%';
        progressBar.textContent = percentComplete + '%';
        progressBar.setAttribute('aria-valuenow', percentComplete);
      }
    };
    
    // معالجة الاستجابة
    xhr.onload = function() {
      try {
        const response = JSON.parse(xhr.responseText);
        
        if (response.success) {
          // إخفاء النموذج
          const modal = bootstrap.Modal.getInstance(document.getElementById('mediaUploadModal'));
          modal.hide();
          
          // عرض معاينة الملف المرفق
          document.getElementById('mediaPreview').style.display = 'block';
          document.getElementById('mediaFileName').textContent = response.media.fileName || 'ملف مرفق';
          document.getElementById('mediaId').value = response.media._id;
          document.getElementById('mediaType').value = response.media.mediaType;
          
          // تنظيف نموذج التحميل
          fileInput.value = '';
          document.getElementById('filePreview').style.display = 'none';
          
          window.showToast && window.showToast('تم تحميل الملف بنجاح', 'success');
        } else {
          window.showToast && window.showToast(response.error || 'حدث خطأ أثناء تحميل الملف', 'danger');
        }
      } catch (error) {
        window.showToast && window.showToast('حدث خطأ أثناء معالجة الاستجابة', 'danger');
      }
      
      // إعادة تمكين زر التحميل
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = 'تحميل';
      
      // إخفاء شريط التقدم
      document.querySelector('.upload-progress').style.display = 'none';
    };
    
    xhr.onerror = function() {
      window.showToast && window.showToast('حدث خطأ في الاتصال بالخادم', 'danger');
      
      // إعادة تمكين زر التحميل
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = 'تحميل';
      
      // إخفاء شريط التقدم
      document.querySelector('.upload-progress').style.display = 'none';
    };
    
    xhr.send(formData);
  };

  /**
   * دالة لإزالة ملف مرفق من الرسالة
   */
  window.clearMediaAttachment = function() {
    document.getElementById('mediaPreview').style.display = 'none';
    document.getElementById('mediaFileName').textContent = '';
    document.getElementById('mediaId').value = '';
    document.getElementById('mediaType').value = '';
  };

  /**
   * دالة لفتح معاينة الوسائط
   * @param {string} url - رابط الوسائط
   * @param {string} type - نوع الوسائط
   */
  window.openMediaPreview = function(url, type) {
    // تفعيل النموذج
    const mediaModal = document.getElementById('mediaPreviewModal');
    if (!mediaModal) return;
    
    const mediaContent = document.getElementById('mediaPreviewContent');
    const downloadButton = document.getElementById('downloadMediaBtn');
    
    if (mediaContent && downloadButton) {
      mediaContent.innerHTML = '';
      
      // تعيين الرابط للتحميل
      downloadButton.href = url;
      
      // إنشاء العنصر المناسب حسب النوع
      if (type === 'image') {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'img-fluid';
        img.alt = 'صورة';
        mediaContent.appendChild(img);
      } else if (type === 'video') {
        const video = document.createElement('video');
        video.controls = true;
        video.className = 'w-100';
        
        const source = document.createElement('source');
        source.src = url;
        source.type = 'video/mp4';
        
        video.appendChild(source);
        mediaContent.appendChild(video);
      } else if (type === 'audio') {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.className = 'w-100 media-audio';
        audio.preload = 'metadata';
        
        const source = document.createElement('source');
        source.src = url;
        source.type = 'audio/ogg';
        
        audio.appendChild(source);
        mediaContent.appendChild(audio);
      }
    }
    
    // تفعيل النموذج (تحتاج إلى Bootstrap JS)
    const bsModal = new bootstrap.Modal(mediaModal);
    bsModal.show();
  };
  
  /**
   * دالة لتحسين تجربة تشغيل الملفات الصوتية
   * تقوم بمعالجة أحداث تشغيل الملفات الصوتية وضمان عرضها بشكل صحيح
   */
  window.setupAudioPlayers = function() {
    // الحصول على جميع عناصر الصوت في الصفحة
    const audioElements = document.querySelectorAll('.media-audio');
    
    // إضافة مستمعي الأحداث لكل عنصر صوت
    audioElements.forEach(audio => {
      // إضافة حدث تحميل البيانات
      audio.addEventListener('loadedmetadata', function() {
        // تحسين عرض المدة عند تحميل الملف
        if (this.duration) {
          const durationMinutes = Math.floor(this.duration / 60);
          const durationSeconds = Math.floor(this.duration % 60);
          const formattedDuration = `${durationMinutes}:${durationSeconds < 10 ? '0' : ''}${durationSeconds}`;
          
          // إضافة سمة بيانات للمدة
          this.setAttribute('data-duration', formattedDuration);
          
          // تحسين قابلية وصول العنصر
          this.setAttribute('aria-label', `ملف صوتي، المدة ${formattedDuration}`);
        }
      });
      
      // إضافة حدث عند النقر
      audio.addEventListener('click', function(e) {
        // منع انتشار الحدث إذا كان النقر على عناصر التحكم
        if (e.target !== this) {
          e.stopPropagation();
        }
      });
      
      // إضافة حدث عند بدء التشغيل
      audio.addEventListener('play', function() {
        // إيقاف تشغيل أي ملفات صوتية أخرى عند تشغيل ملف
        audioElements.forEach(otherAudio => {
          if (otherAudio !== this && !otherAudio.paused) {
            otherAudio.pause();
          }
        });
      });
    });
  };

  // استدعاء دالة إعداد مشغلات الصوت عند تحميل الصفحة
  window.addEventListener('DOMContentLoaded', function() {
    window.setupAudioPlayers();
    
    // إضافة حدث لتحديث التنسيق بعد تحديث محتوى الرسائل بالـ AJAX
    document.addEventListener('messages-loaded', function() {
      window.setupAudioPlayers();
    });
  });
})(window);

/**
 * دالة لتسجيل الصوت مباشرة من المتصفح
 */
// متغيرات عامة لتسجيل الصوت
let mediaRecorder;           // مسجل الوسائط
let audioChunks = [];        // مقاطع الصوت المسجلة
let recordingTimerInterval;  // مؤقت التسجيل
let recordingStartTime;      // وقت بدء التسجيل
let audioBlob;               // كائن blob للصوت المسجل
let audioMimeType = 'audio/ogg; codecs=opus'; // نوع الصوت المسجل (مدعوم في واتساب)

/**
 * تهيئة مسجل الصوت
 */
window.initAudioRecorder = function() {
  // التأكد من وجود العناصر اللازمة
  const startRecordBtn = document.getElementById('startRecordBtn');
  const stopRecordBtn = document.getElementById('stopRecordBtn');
  const useRecordingBtn = document.getElementById('useRecordingBtn');
  const cancelRecordingBtn = document.getElementById('cancelRecordingBtn');
  const recordingStatus = document.getElementById('recordingStatus');
  const recordingTimer = document.getElementById('recordingTimer');
  const audioPreview = document.getElementById('audioPreview');
  const recordedAudio = document.getElementById('recordedAudio');
  
  if (!startRecordBtn || !stopRecordBtn) return;
  
  // إضافة مستمعي الأحداث
  startRecordBtn.addEventListener('click', startRecording);
  stopRecordBtn.addEventListener('click', stopRecording);
  
  if (useRecordingBtn) {
    useRecordingBtn.addEventListener('click', useRecording);
  }
  
  if (cancelRecordingBtn) {
    cancelRecordingBtn.addEventListener('click', cancelRecording);
  }
  
  // تحديث نمط CSS للمؤشر
  if (!document.getElementById('recorderStyles')) {
    const style = document.createElement('style');
    style.id = 'recorderStyles';
    style.textContent = `
      .recording-indicator {
        animation: pulse 1s infinite;
      }
      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
};

/**
 * بدء تسجيل الصوت
 */
async function startRecording() {
  try {
    // التحقق من دعم تسجيل الصوت
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      window.showToast && window.showToast('متصفحك لا يدعم تسجيل الصوت', 'warning');
      return;
    }
    
    // الحصول على إذن الميكروفون
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // إعداد مسجل الوسائط بمنطق لاختيار التنسيق المدعوم
    const mimeTypes = [
      'audio/ogg; codecs=opus', // تنسيق OGG (مدعوم في واتساب)
      'audio/webm; codecs=opus', // تنسيق WebM (سنحوله لاحقاً)
      'audio/mp3', // MP3 (مدعوم في واتساب)
      'audio/wav' // WAV (سنحوله لاحقاً)
    ];
    
    // البحث عن تنسيق مدعوم
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        audioMimeType = type;
        break;
      }
    }
    
    // تهيئة المسجل
    mediaRecorder = new MediaRecorder(stream, { mimeType: audioMimeType });
    audioChunks = [];
    
    // إعداد معالجات الأحداث
    mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    // معالج انتهاء التسجيل
    mediaRecorder.onstop = () => {
      // إنشاء blob من المقاطع المسجلة
      audioBlob = new Blob(audioChunks, { type: audioMimeType });
      
      // إنشاء URL للتشغيل
      const audioUrl = URL.createObjectURL(audioBlob);
      const recordedAudio = document.getElementById('recordedAudio');
      recordedAudio.src = audioUrl;
      
      // عرض المعاينة
      document.getElementById('audioPreview').style.display = 'block';
      document.getElementById('recordingStatus').style.display = 'none';
      
      // إيقاف المؤقت
      clearInterval(recordingTimerInterval);
      
      // إغلاق المسارات
      stream.getTracks().forEach(track => track.stop());
    };
    
    // بدء التسجيل
    mediaRecorder.start(100); // تقسيم البيانات كل 100 مللي ثانية
    
    // إظهار حالة التسجيل
    document.getElementById('startRecordBtn').style.display = 'none';
    document.getElementById('stopRecordBtn').style.display = 'inline-block';
    document.getElementById('recordingStatus').style.display = 'block';
    
    // بدء مؤقت التسجيل
    recordingStartTime = Date.now();
    recordingTimerInterval = setInterval(updateRecordingTimer, 1000);
    
  } catch (error) {
    console.error('خطأ في بدء تسجيل الصوت:', error);
    window.showToast && window.showToast('حدث خطأ أثناء محاولة بدء التسجيل: ' + error.message, 'danger');
  }
}

/**
 * إيقاف تسجيل الصوت
 */
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    document.getElementById('startRecordBtn').style.display = 'inline-block';
    document.getElementById('stopRecordBtn').style.display = 'none';
  }
}

/**
 * تحديث مؤقت التسجيل
 */
function updateRecordingTimer() {
  const recordingTimer = document.getElementById('recordingTimer');
  const elapsedTime = Math.floor((Date.now() - recordingStartTime) / 1000);
  const minutes = Math.floor(elapsedTime / 60).toString().padStart(2, '0');
  const seconds = (elapsedTime % 60).toString().padStart(2, '0');
  recordingTimer.textContent = `${minutes}:${seconds}`;
  
  // إيقاف التسجيل تلقائياً بعد 5 دقائق (قيود واتساب)
  if (elapsedTime >= 300) {
    stopRecording();
    window.showToast && window.showToast('تم إيقاف التسجيل تلقائياً بعد 5 دقائق (الحد الأقصى لرسائل الصوت في واتساب)', 'info');
  }
}

/**
 * استخدام التسجيل الصوتي
 */
async function useRecording() {
  try {
    if (!audioBlob) {
      window.showToast && window.showToast('لا يوجد تسجيل صوتي لاستخدامه', 'warning');
      return;
    }
    
    // التأكد من أن التنسيق مدعوم في واتساب
    let finalAudioBlob = audioBlob;
    let finalMimeType = audioMimeType;
    
    // إذا كان التنسيق غير مدعوم، نحوله إلى OGG أو MP3
    const supportedMimeTypes = ['audio/ogg', 'audio/mp3', 'audio/mpeg', 'audio/aac', 'audio/amr'];
    const isMimeTypeSupported = supportedMimeTypes.some(type => finalMimeType.startsWith(type));
    
    if (!isMimeTypeSupported) {
      // سنستخدم التنسيق كما هو وسيقوم الخادم بالتحقق وإجراء التحويل إذا لزم الأمر
      console.log('تنسيق الصوت غير مدعوم مباشرة في واتساب، سيتم التعامل معه في الخادم');
    }
    
    // تحويل الملف إلى Base64
    const reader = new FileReader();
    reader.readAsDataURL(finalAudioBlob);
    
    reader.onloadend = function() {
      // الحصول على بيانات Base64
      const base64data = reader.result;
      
      // ضبط نوع الوسائط على "audio"
      document.getElementById('uploadMediaType').value = 'audio';
      
      // معلومات الملف الصوتي المسجل
      const recordingInfo = {
        name: `تسجيل_صوتي_${new Date().toISOString().replace(/[:.]/g, '-')}.ogg`,
        type: finalMimeType,
        size: finalAudioBlob.size
      };
      
      // عرض معاينة الملف
      document.getElementById('filePreview').style.display = 'block';
      document.getElementById('fileTypeIcon').className = 'fas fa-music me-2';
      document.getElementById('selectedFileName').textContent = recordingInfo.name;
      
      // إخفاء قسم تسجيل الصوت
      document.getElementById('audioPreview').style.display = 'none';
      document.getElementById('recordingStatus').style.display = 'none';
      
      // تخزين بيانات الصوت
      window.recordedAudioData = {
        base64: base64data,
        name: recordingInfo.name,
        type: recordingInfo.type,
        size: recordingInfo.size
      };
      
      window.showToast && window.showToast('تم اختيار التسجيل الصوتي بنجاح', 'success');
    };
  } catch (error) {
    console.error('خطأ في استخدام التسجيل الصوتي:', error);
    window.showToast && window.showToast('حدث خطأ أثناء محاولة استخدام التسجيل: ' + error.message, 'danger');
  }
}

/**
 * إلغاء التسجيل الصوتي
 */
function cancelRecording() {
  // إعادة ضبط متغيرات التسجيل
  audioBlob = null;
  audioChunks = [];
  
  // إخفاء عناصر التسجيل
  document.getElementById('audioPreview').style.display = 'none';
  document.getElementById('recordingStatus').style.display = 'none';
  document.getElementById('startRecordBtn').style.display = 'inline-block';
  document.getElementById('stopRecordBtn').style.display = 'none';
  
  // إعادة ضبط المشغل الصوتي
  const recordedAudio = document.getElementById('recordedAudio');
  recordedAudio.src = '';
  
  window.showToast && window.showToast('تم إلغاء التسجيل الصوتي', 'info');
}

/**
 * إعادة ضبط مسجل الصوت
 */
function resetAudioRecorder() {
  // إعادة ضبط متغيرات التسجيل
  audioBlob = null;
  audioChunks = [];
  window.recordedAudioData = null;
  
  // إخفاء عناصر التسجيل
  const audioPreview = document.getElementById('audioPreview');
  const recordingStatus = document.getElementById('recordingStatus');
  const startRecordBtn = document.getElementById('startRecordBtn');
  const stopRecordBtn = document.getElementById('stopRecordBtn');
  const filePreview = document.getElementById('filePreview');
  
  if (audioPreview) audioPreview.style.display = 'none';
  if (recordingStatus) recordingStatus.style.display = 'none';
  if (startRecordBtn) startRecordBtn.style.display = 'inline-block';
  if (stopRecordBtn) stopRecordBtn.style.display = 'none';
  if (filePreview) filePreview.style.display = 'none';
  
  // إعادة ضبط المشغل الصوتي
  const recordedAudio = document.getElementById('recordedAudio');
  if (recordedAudio) recordedAudio.src = '';
  
  // إعادة ضبط حقل الملف
  const fileInput = document.getElementById('mediaFile');
  if (fileInput) fileInput.value = '';
}
