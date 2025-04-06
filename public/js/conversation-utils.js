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
    
    if (window.debugMode);
    
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
      if (window.debugMode);
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
      if (window.debugMode);
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
  window.sendReply = async function(event) {
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
    const conversationIdValue = conversationId.value;
    if (!conversationIdValue) {
      if (window.debugMode === true) {
        // إزالة التسجيل
      }
      return;
    }
    
    // تخزين محتوى الرسالة والوسائط قبل تفريغ الحقول
    const messageData = {
      content: messageText,
      mediaId: mediaId,
      mediaType: mediaType,
      replyToId: window.currentReplyToId || null
    };
    
    // تفريغ حقل الرسالة مباشرة بعد الإرسال للسماح بكتابة رسالة جديدة
    messageInput.value = '';
    
    // مسح مؤشر الرد إذا كان موجودا
    window.clearReplyIndicator();
    
    // مسح الملف المرفق إذا كان موجوداً
    window.clearMediaAttachment();
    
    // إظهار مؤشر للرسالة قيد الإرسال في الواجهة
    const tempMessageId = 'pending_' + Date.now().toString();
    const pendingMessageElement = document.createElement('div');
    pendingMessageElement.className = 'message outgoing message-pending';
    pendingMessageElement.setAttribute('data-message-id', tempMessageId);
    
    // عرض محتوى الرسالة مع مؤشر الحالة قيد الإرسال
    pendingMessageElement.innerHTML = `
      <div class="message-content">
        ${window.currentUsername ? `<div class="message-sender">${window.currentUsername}</div>` : ''}
        <div class="message-text">${messageData.content || (mediaId ? 'وسائط' : '')}</div>
        <div class="message-meta">
          <span class="message-time">${new Date().toLocaleTimeString()}</span>
          <span class="message-status"><i class="fas fa-clock"></i></span>
        </div>
      </div>
    `;
    
    // إضافة الرسالة المؤقتة إلى الواجهة
    const messagesContainer = document.querySelector('.messages-container');
    if (messagesContainer) {
      messagesContainer.appendChild(pendingMessageElement);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    // تخزين المعرف المؤقت في متغير عام لمنع تكرار الرسالة عند استقبالها من الخادم
    const clientMessageId = 'local_' + Date.now().toString();
    if (!window.sentMessageIds) {
      window.sentMessageIds = new Set();
    }
    window.sentMessageIds.add(clientMessageId);
    window.sentMessageIds.add(tempMessageId);
    
    // إنشاء كائن البيانات للإرسال
    const requestData = {
      content: messageData.content,
      replyToId: messageData.replyToId,
      userId: window.currentUserId,
      username: window.currentUsername
    };
    
    // إضافة معلومات الوسائط إذا كانت متوفرة
    if (messageData.mediaId && messageData.mediaType) {
      requestData.mediaId = messageData.mediaId;
      requestData.mediaType = messageData.mediaType;
    }
    
    
    try {
      const response = await fetch(`/crm/conversations/${conversationIdValue}/reply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(requestData),
      });
      
      if (!response.ok) {
        throw new Error('فشل إرسال الرسالة');
      }
      const data = await response.json();
      
      if (data.success) {
        // تمرير المحتوى إلى وظيفة تشغيل صوت الرسالة (اختياري)
        if (typeof playMessageSound === 'function') {
          playMessageSound('sent');
        }
        
        // حفظ معرف الرسالة الحقيقي أيضاً لمنع التكرار عند استقبالها من خلال الإشعارات
        if (data.messageId) {
          window.sentMessageIds.add(data.messageId);
          
          // ربط المعرف المؤقت بالمعرف الحقيقي
          if (window.pendingMessageMapping === undefined) {
            window.pendingMessageMapping = {};
          }
          window.pendingMessageMapping[tempMessageId] = data.messageId;
        }
        
        // تحديث حالة الرسالة المؤقتة إلى "تم الإرسال"
        const pendingMessage = document.querySelector(`[data-message-id="${tempMessageId}"]`);
        if (pendingMessage) {
          const statusElement = pendingMessage.querySelector('.message-status');
          if (statusElement) {
            statusElement.innerHTML = '<i class="fas fa-check"></i>';
          }
          pendingMessage.classList.remove('message-pending');
        }
      }
    } catch (error) {
      
      // تحديث حالة الرسالة المؤقتة إلى "فشل الإرسال"
      const pendingMessage = document.querySelector(`[data-message-id="${tempMessageId}"]`);
      if (pendingMessage) {
        const statusElement = pendingMessage.querySelector('.message-status');
        if (statusElement) {
          statusElement.innerHTML = '<i class="fas fa-exclamation-triangle text-danger"></i>';
        }
        pendingMessage.classList.remove('message-pending');
        pendingMessage.classList.add('message-failed');
      }
      
      if (window.showToast) {
        window.showToast('حدث خطأ أثناء إرسال الرسالة', 'error');
      }
    }
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
    const attachMediaBtn = document.getElementById('attachMediaBtn');
    const mediaFile = document.getElementById('mediaFile');
    
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

        // تفعيل خاصية السحب والإفلات على منطقة الكتابة
        setupDragAndDropOnMessageInput(replyMessage);
      }

      // إضافة حدث النقر على زر إرفاق ملف
      if (attachMediaBtn && mediaFile) {
        attachMediaBtn.addEventListener('click', function() {
          mediaFile.click();
        });

        // إضافة حدث تغيير الملف المختار
        mediaFile.addEventListener('change', handleFileSelection);
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
    document.getElementById('mediaCaption').value = '';
    document.getElementById('filePreview').style.display = 'none';
    
    // إظهار النموذج
    const modal = new bootstrap.Modal(document.getElementById('mediaUploadModal'));
    modal.show();
    
    // تهيئة منطقة السحب والإفلات
    setupDragAndDrop();
  };

  /**
   * دالة لتهيئة خاصية السحب والإفلات
   */
  window.setupDragAndDrop = function() {
    const mediaPreview = document.getElementById('mediaPreview');
    const fileInput = document.getElementById('mediaFile');
    
    if (!mediaPreview || !fileInput) return;
    
    // إضافة أنماط CSS لمنطقة السحب والإفلات
    if (!document.getElementById('dragDropStyles')) {
      const style = document.createElement('style');
      style.id = 'dragDropStyles';
      style.textContent = `
        .message-input {
          border: 2px solid #ccc;
          border-radius: 5px;
          padding: 10px;
          transition: all 0.3s;
        }
        .message-input.drag-over {
          background-color: #e9ecef;
          border-color: #6c757d;
        }
      `;
      document.head.appendChild(style);
    }
    
    // الحصول على منطقة الكتابة
    const messageInput = document.getElementById('replyMessage');
    if (!messageInput) return;
    
    // معالجة أحداث السحب والإفلات
    messageInput.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.add('drag-over');
    });
    
    messageInput.addEventListener('dragleave', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove('drag-over');
    });
    
    messageInput.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove('drag-over');
      
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        window.handleFileSelection();
      }
    });
    
    // معالجة اختيار الملف عن طريق النقر
    fileInput.addEventListener('change', window.handleFileSelection);
  }

  /**
   * دالة لمعالجة اختيار الملف
   */
  function handleFileSelection() {
    const fileInput = document.getElementById('mediaFile');
    const mediaPreview = document.getElementById('mediaPreview');
    const mediaFileName = document.getElementById('mediaFileName');
    const uploadMediaType = document.getElementById('uploadMediaType');
    
    if (fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      
      // عرض اسم الملف
      mediaFileName.textContent = file.name;
      
      // تحديد نوع الملف وتحديث القيمة
      let mediaType = 'document';
      
      if (file.type.startsWith('image/')) {
        mediaType = 'image';
      } else if (file.type.startsWith('video/')) {
        mediaType = 'video';
      } else if (file.type.startsWith('audio/')) {
        mediaType = 'audio';
      }
      
      // قائمة أنواع MIME المدعومة في واتساب API
      const supportedTypes = {
        'image': ['image/jpeg', 'image/png', 'image/webp'],
        'video': ['video/mp4'],
        'audio': ['audio/mpeg', 'audio/ogg', 'audio/mp3', 'audio/mp4'],
        'document': [
          'application/pdf', 
          'application/msword', 
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        ]
      };
      
      // التحقق من دعم نوع الملف
      let isSupported = false;
      for (const type in supportedTypes) {
        if (supportedTypes[type].includes(file.type)) {
          isSupported = true;
          break;
        }
      }
      
      if (!isSupported) {
        window.showToast && window.showToast(`نوع الملف ${file.type} غير مدعوم في واتساب. الأنواع المدعومة هي: JPEG, PNG, WEBP للصور، MP4 للفيديو، MP3/OGG للصوت، PDF/DOC/DOCX/XLS/XLSX للمستندات.`, 'warning');
        fileInput.value = '';
        return;
      }
      
      // إظهار معاينة الملف
      mediaPreview.style.display = 'block';
      
      // تحديث نوع الوسائط إذا كان تلقائيًا
      if (uploadMediaType && uploadMediaType.value === 'auto') {
        uploadMediaType.value = mediaType;
      }
      
      // بدء تحميل الملف تلقائياً
      window.uploadMedia && window.uploadMedia();
    }
  }

  /**
   * دالة لتحميل الوسائط إلى الخادم
   */
  window.uploadMedia = function() {
    const fileInput = document.getElementById('mediaFile');
    const mediaType = document.getElementById('uploadMediaType').value;
    const conversationId = document.getElementById('uploadConversationId').value;
    const progressBar = document.querySelector('.upload-progress .progress-bar');
    const progressContainer = document.querySelector('.upload-progress');
    
    // التحقق من اختيار ملف
    if (!fileInput.files || fileInput.files.length === 0) {
      window.showToast && window.showToast('يرجى اختيار ملف للتحميل', 'warning');
      return;
    }
    
    // إنشاء FormData
    const formData = new FormData();
    formData.append('mediaFile', fileInput.files[0]);
    formData.append('mediaType', mediaType);
    formData.append('conversationId', conversationId);
    
    // إظهار شريط التقدم
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    
    // تعطيل زر التحميل (إذا كان موجودًا)
    const uploadBtn = document.getElementById('uploadMediaBtn');
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحميل...';
    }
    
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
          document.getElementById('mediaId').value = response.media._id;
          document.getElementById('mediaType').value = response.media.mediaType;
          window.showToast && window.showToast('تم تحميل الملف بنجاح', 'success');
        } else {
          window.showToast && window.showToast(response.error || 'حدث خطأ أثناء تحميل الملف', 'danger');
        }
      } catch (error) {
        window.showToast && window.showToast('حدث خطأ أثناء معالجة الاستجابة', 'danger');
        if (window.debugMode === true) {
          console.error('خطأ في معالجة استجابة تحميل الملف:', error);
        }
      } finally {
        // إخفاء شريط التقدم بعد الانتهاء
        setTimeout(function() {
          progressContainer.style.display = 'none';
        }, 1000);
      }
    };
    
    // معالجة الأخطاء
    xhr.onerror = function() {
      window.showToast && window.showToast('حدث خطأ أثناء الاتصال بالخادم', 'danger');
      
      // إخفاء شريط التقدم
      progressContainer.style.display = 'none';
    };
    
    // إرسال البيانات
    xhr.send(formData);
  };

  /**
   * دالة لمسح الملف المرفق من الرسالة
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

  /**
   * دالة لإغلاق المحادثة
   */
  window.closeConversation = async function(conversationId, reason, note) {
    if (!conversationId) return Promise.reject('معرف المحادثة مطلوب');

    // إعادة تعريف مؤقت لمنع النافذة الافتراضية
    const originalConfirm = window.confirm;
    const originalPrompt = window.prompt;
    window.confirm = () => true; // افتراض أن التأكيد تم بواسطة SweetAlert2
    window.prompt = () => null; // افتراض أن البيانات تم جمعها بواسطة SweetAlert2

    const fetchCallImpl = window.fetchCallImpl || window.fetch;

    try {
      const response = await fetchCallImpl(`/crm/conversations/${conversationId}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ reason, note })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `فشل إغلاق المحادثة: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'فشل إغلاق المحادثة');
      }

      // إزالة استدعاء الدالة غير الموجودة
      // window.updateConversationUI(conversationId, 'closed');
      return result;
    } catch (error) {
      console.error('Error closing conversation:', error);
      return Promise.reject(error.message || 'حدث خطأ غير متوقع');
    } finally {
      // استعادة الدوال الأصلية
      window.confirm = originalConfirm;
      window.prompt = originalPrompt;
    }
  };

  /**
   * دالة لإعادة فتح المحادثة
   */
  window.reopenConversation = async function(conversationId) {
    if (!conversationId) return Promise.reject('معرف المحادثة مطلوب');

    // إعادة تعريف مؤقت لمنع النافذة الافتراضية
    const originalConfirm = window.confirm;
    window.confirm = () => true; // افتراض أن التأكيد تم بواسطة SweetAlert2

    const fetchCallImpl = window.fetchCallImpl || window.fetch;

    try {
      const response = await fetchCallImpl(`/crm/conversations/${conversationId}/reopen`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `فشل إعادة فتح المحادثة: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'فشل إعادة فتح المحادثة');
      }

      // إزالة استدعاء الدالة غير الموجودة
      // window.updateConversationUI(conversationId, 'open');
      return result;
    } catch (error) {
      console.error('Error reopening conversation:', error);
      return Promise.reject(error.message || 'حدث خطأ غير متوقع');
    } finally {
      // استعادة الدالة الأصلية
      window.confirm = originalConfirm;
    }
  };

  /**
   * دالة لربط مستمعات الأحداث لعناصر المحادثة (تُستدعى بعد تحميل التفاصيل)
   */
  window.attachConversationEventListeners = function() {
    // --- ربط الأحداث الموجودة --- 
    // (تأكد من أن هذا الجزء لا يتعارض مع الكود الموجود بالفعل لربط الأحداث)
    
    // ربط حدث النقر لأزرار التفاعل
    document.querySelectorAll('.reaction-btn').forEach(button => {
      // التأكد من عدم إضافة المستمع مرتين
      if (!button.dataset.listenerAttached) {
        button.addEventListener('click', function(e) {
          e.stopPropagation(); // منع انتشار الحدث للرسالة نفسها
          const messageId = this.closest('.message').dataset.messageId;
          const externalId = this.closest('.message').dataset.externalId || '';
          window.showReactionPicker(messageId, externalId, this);
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
          window.showReplyForm(messageId, externalId, messageElem);
        });
        button.dataset.listenerAttached = 'true';
      }
    });

    // --- ربط الأحداث الجديدة --- 
    // << إزالة الكود الخاص بأزرار الإغلاق وإعادة الفتح من هنا >>
    
    // ربط حدث النقر لزر إرفاق الوسائط
    const attachMediaBtn = document.getElementById('attachMediaBtn');
    const mediaFileInput = document.getElementById('mediaFile');
    if (attachMediaBtn && mediaFileInput && !attachMediaBtn.dataset.listenerAttached) {
      attachMediaBtn.addEventListener('click', () => {
        mediaFileInput.click();
      });
      mediaFileInput.addEventListener('change', handleFileSelection);
      attachMediaBtn.dataset.listenerAttached = 'true';
    }

    // تفعيل السحب والإفلات
    const messageInput = document.getElementById('replyMessage');
    if (messageInput) {
      setupDragAndDropOnMessageInput(messageInput);
    }
    
    // استدعاء وظائف أخرى ضرورية بعد تحميل المحادثة
    window.setupAudioPlayers && window.setupAudioPlayers();
  };

  // استدعاء attachConversationEventListeners عند تحميل الصفحة لأول مرة (إذا لزم الأمر)
  // أو تأكد من استدعائها بعد كل تحميل AJAX لتفاصيل المحادثة
  // (الكود الموجود في conversations_split_ajax.ejs يستدعيها بالفعل)
})(window);

/**
 * دالة لتفعيل خاصية السحب والإفلات على منطقة الكتابة
 * @param {HTMLElement} messageInput - عنصر منطقة الكتابة
 */
function setupDragAndDropOnMessageInput(messageInput) {
  if (!messageInput) return;

  // إضافة أنماط CSS لتأثيرات السحب والإفلات
  if (!document.getElementById('messageDragDropStyles')) {
    const style = document.createElement('style');
    style.id = 'messageDragDropStyles';
    style.textContent = `
      .message-input-container {
        position: relative;
      }
      .message-input {
        transition: all 0.3s;
      }
      .message-input.drag-over {
        background-color: #e9ecef;
        border-color: #6c757d;
      }
      .message-input-actions {
        position: absolute;
        left: 10px;
        bottom: 10px;
        z-index: 5;
      }
      .rtl .message-input-actions {
        left: auto;
        right: 10px;
      }
    `;
    document.head.appendChild(style);
  }

  // أحداث السحب والإفلات
  messageInput.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.add('drag-over');
  });

  messageInput.addEventListener('dragleave', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('drag-over');
  });

  messageInput.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
    this.classList.remove('drag-over');
    
    // التأكد من وجود ملفات
    if (e.dataTransfer.files.length) {
      const fileInput = document.getElementById('mediaFile');
      if (fileInput) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelection();
      }
    }
  });
}

/**
 * دالة لمعالجة اختيار الملف
 */
function handleFileSelection() {
  const fileInput = document.getElementById('mediaFile');
  const mediaPreview = document.getElementById('mediaPreview');
  const mediaFileName = document.getElementById('mediaFileName');
  const uploadMediaType = document.getElementById('uploadMediaType');
  
  if (fileInput.files && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    
    // عرض اسم الملف
    mediaFileName.textContent = file.name;
    
    // تحديد نوع الملف وتحديث القيمة
    let mediaType = 'document';
    
    if (file.type.startsWith('image/')) {
      mediaType = 'image';
    } else if (file.type.startsWith('video/')) {
      mediaType = 'video';
    } else if (file.type.startsWith('audio/')) {
      mediaType = 'audio';
    }
    
    // قائمة أنواع MIME المدعومة في واتساب API
    const supportedTypes = {
      'image': ['image/jpeg', 'image/png', 'image/webp'],
      'video': ['video/mp4'],
      'audio': ['audio/mpeg', 'audio/ogg', 'audio/mp3', 'audio/mp4'],
      'document': [
        'application/pdf', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ]
    };
    
    // التحقق من دعم نوع الملف
    let isSupported = false;
    for (const type in supportedTypes) {
      if (supportedTypes[type].includes(file.type)) {
        isSupported = true;
        break;
      }
    }
    
    if (!isSupported) {
      window.showToast && window.showToast(`نوع الملف ${file.type} غير مدعوم في واتساب. الأنواع المدعومة هي: JPEG, PNG, WEBP للصور، MP4 للفيديو، MP3/OGG للصوت، PDF/DOC/DOCX/XLS/XLSX للمستندات.`, 'warning');
      fileInput.value = '';
      return;
    }
    
    // إظهار معاينة الملف
    mediaPreview.style.display = 'block';
    
    // تحديث نوع الوسائط إذا كان تلقائيًا
    if (uploadMediaType && uploadMediaType.value === 'auto') {
      uploadMediaType.value = mediaType;
    }
    
    // بدء تحميل الملف تلقائياً
    window.uploadMedia && window.uploadMedia();
  }
}

/**
 * دالة لتحميل الوسائط إلى الخادم
 */
window.uploadMedia = function() {
  const fileInput = document.getElementById('mediaFile');
  const mediaType = document.getElementById('uploadMediaType').value;
  const conversationId = document.getElementById('uploadConversationId').value;
  const progressBar = document.querySelector('.upload-progress .progress-bar');
  const progressContainer = document.querySelector('.upload-progress');
  
  // التحقق من اختيار ملف
  if (!fileInput.files || fileInput.files.length === 0) {
    window.showToast && window.showToast('يرجى اختيار ملف للتحميل', 'warning');
    return;
  }
  
  // إنشاء FormData
  const formData = new FormData();
  formData.append('mediaFile', fileInput.files[0]);
  formData.append('mediaType', mediaType);
  formData.append('conversationId', conversationId);
  
  // إظهار شريط التقدم
  progressContainer.style.display = 'block';
  progressBar.style.width = '0%';
  progressBar.textContent = '0%';
  
  // تعطيل زر التحميل (إذا كان موجودًا)
  const uploadBtn = document.getElementById('uploadMediaBtn');
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحميل...';
  }
  
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
        document.getElementById('mediaId').value = response.media._id;
        document.getElementById('mediaType').value = response.media.mediaType;
        window.showToast && window.showToast('تم تحميل الملف بنجاح', 'success');
      } else {
        window.showToast && window.showToast(response.error || 'حدث خطأ أثناء تحميل الملف', 'danger');
      }
    } catch (error) {
      window.showToast && window.showToast('حدث خطأ أثناء معالجة الاستجابة', 'danger');
      if (window.debugMode === true) {
        console.error('خطأ في معالجة استجابة تحميل الملف:', error);
      }
    } finally {
      // إخفاء شريط التقدم بعد الانتهاء
      setTimeout(function() {
        progressContainer.style.display = 'none';
      }, 1000);
    }
  };
  
  // معالجة الأخطاء
  xhr.onerror = function() {
    window.showToast && window.showToast('حدث خطأ أثناء الاتصال بالخادم', 'danger');
    
    // إخفاء شريط التقدم
    progressContainer.style.display = 'none';
  };
  
  // إرسال البيانات
  xhr.send(formData);
};