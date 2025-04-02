/**
 * وحدة مساعدة للمحادثات - Conversation Utilities Module
 * هذا الملف يحتوي على دوال عامة مشتركة للتعامل مع محادثات نظام خدمة العملاء
 * يستخدم في كل من واجهة المحادثات المفصلة وواجهة المحادثات المقسمة
 */

// نافذة عالمية للوظائف المشتركة
(function(window) {
  // تعيين وضع التصحيح (false لإيقاف رسائل التصحيح)
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
    if (!messageId || !emoji) return;
    
    // الحصول على معرف المحادثة
    const conversationId = document.getElementById('conversationId')?.value;
    if (!conversationId) {
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
    
    // حفظ نص الرسالة قبل مسحه
    const messageContent = replyMessage.value.trim();
    // حفظ معرف الرسالة المراد الرد عليها
    const replyToId = window.currentReplyToId;
    
    // مسح النص من النموذج فوراً لتمكين المستخدم من كتابة رسالة جديدة
    replyMessage.value = '';
    
    // إظهار مؤشر التحميل فقط دون تعطيل زر الإرسال
    sendingIndicator.style.display = 'inline-block';
    
    // إزالة مؤشر الرد إن وجد
    window.clearReplyIndicator();
    
    // إضافة معرف فريد للرسالة المرسلة لتتبعها
    const temporaryId = 'msg_' + Date.now();
    
    // إضافة رسالة مؤقتة بحالة إرسال
    const tempMessage = {
      _id: temporaryId,
      content: messageContent,
      direction: 'outgoing',
      status: 'sending',
      timestamp: new Date(),
      replyToMessageId: replyToId
    };
    
    // عرض الرسالة المؤقتة فوراً في واجهة المستخدم
    if (typeof window.addNewMessageToConversation === 'function') {
      window.addNewMessageToConversation(tempMessage);
    } else if (typeof window.addMessageToConversation === 'function') {
      window.addMessageToConversation(tempMessage);
    }
    
    // إرسال الرسالة للخادم
    fetch(`/crm/conversations/${conversationId}/reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        content: messageContent,
        replyToMessageId: replyToId || null,
        temporaryId: temporaryId // إرسال المعرف المؤقت للتمكن من تحديث حالة الرسالة
      })
    })
    .then(response => {
      if (!response.ok) throw new Error('فشل إرسال الرسالة');
      return response.json();
    })
    .then(data => {
      // إخفاء مؤشر الإرسال
      sendingIndicator.style.display = 'none';
      
      // تحديث الرسالة المؤقتة بالبيانات الحقيقية
      if (data.message) {
        // البحث عن الرسالة المؤقتة وتحديثها
        const tempMessageElement = document.querySelector(`.message[data-message-id="${temporaryId}"]`);
        if (tempMessageElement) {
          tempMessageElement.setAttribute('data-message-id', data.message._id);
          tempMessageElement.setAttribute('data-status', data.message.status);
          if (data.message.externalMessageId) {
            tempMessageElement.setAttribute('data-external-id', data.message.externalMessageId);
          }
          
          // تحديث أيقونة الحالة
          const statusIcon = tempMessageElement.querySelector('.message-status i');
          if (statusIcon) {
            statusIcon.className = 'fas fa-check text-silver';
            statusIcon.title = 'تم الإرسال';
          }
        } else {
          // إذا لم يتم العثور على الرسالة المؤقتة (حالة نادرة)، إضافة الرسالة الجديدة
          if (typeof window.addNewMessageToConversation === 'function') {
            window.addNewMessageToConversation(data.message);
          } else if (typeof window.addMessageToConversation === 'function') {
            window.addMessageToConversation(data.message);
          }
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
      
      // إخفاء مؤشر الإرسال
      sendingIndicator.style.display = 'none';
      
      // تحديث حالة الرسالة المؤقتة إلى فشل
      const tempMessageElement = document.querySelector(`.message[data-message-id="${temporaryId}"]`);
      if (tempMessageElement) {
        tempMessageElement.setAttribute('data-status', 'failed');
        
        // تحديث أيقونة الحالة
        const statusIcon = tempMessageElement.querySelector('.message-status i');
        if (statusIcon) {
          statusIcon.className = 'fas fa-exclamation-triangle text-danger';
          statusIcon.title = 'فشل الإرسال';
        }
      }
      
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
   * دالة لإضافة رسالة إلى المحادثة
   * @param {object} messageData - كائن يحتوي على بيانات الرسالة
   */
  window.addMessageToConversation = function(messageData) {
    if (!messageData || !currentConversationId) return;
    
    // التأكد من أن الرسالة تخص المحادثة الحالية
    if (messageData.conversationId !== currentConversationId) return;
    
    const messageContainer = document.getElementById('messageContainer');
    if (!messageContainer) return;
    
    // البحث عن الرسالة في وعاء الرسائل - إذا كانت موجودة، لا تضيفها
    const existingMessage = document.querySelector(`.message[data-external-id="${messageData.externalMessageId}"]`);
    if (existingMessage) {
      // تحديث حالة الرسالة فقط إذا كانت موجودة
      if (messageData.status) {
        window.updateMessageStatus(messageData.externalMessageId, messageData.status);
      }
      return;
    }

    // إنشاء عنصر الرسالة
    let messageHTML = `
      <div class="message ${messageData.direction}" 
           data-message-id="${messageData._id || ''}" 
           data-status="${messageData.status || 'sent'}"
           ${messageData.externalMessageId ? `data-external-id="${messageData.externalMessageId}"` : ''}>
    `;
    
    // إضافة الرد إذا كان موجودًا
    if (messageData.replyToMessageId) {
      messageHTML += `
        <div class="replied-message">
          <i class="fas fa-reply"></i>
          <span>${messageData.replyToContext || 'رد على رسالة'}</span>
        </div>
      `;
    }
    
    // فتح فقاعة الرسالة
    messageHTML += `<div class="message-bubble ${messageData.direction === 'incoming' ? 'incoming-bubble' : 'outgoing-bubble'}">`;
            
    // إضافة محتوى الوسائط إذا كان متاحًا
    if (messageData.mediaType) {
      if (messageData.mediaType === 'image') {
        messageHTML += `
          <div class="media-container">
            <img src="${messageData.fileDetails && messageData.fileDetails.publicUrl ? messageData.fileDetails.publicUrl : ''}" 
                 alt="صورة" class="message-image" />
            ${messageData.fileDetails && messageData.fileDetails.caption ? 
              `<div class="media-caption">${messageData.fileDetails.caption}</div>` : ''}
          </div>
        `;
      } else if (messageData.mediaType === 'video') {
        messageHTML += `
          <div class="media-container">
            <video controls class="message-video">
              <source src="${messageData.fileDetails && messageData.fileDetails.publicUrl ? messageData.fileDetails.publicUrl : ''}" 
                      type="${messageData.fileDetails && messageData.fileDetails.mimeType ? messageData.fileDetails.mimeType : 'video/mp4'}">
              فيديو غير مدعوم في متصفحك
            </video>
            ${messageData.fileDetails && messageData.fileDetails.caption ? 
              `<div class="media-caption">${messageData.fileDetails.caption}</div>` : ''}
          </div>
        `;
      } else if (messageData.mediaType === 'audio') {
        messageHTML += `
          <div class="media-container">
            <audio controls class="message-audio">
              <source src="${messageData.fileDetails && messageData.fileDetails.publicUrl ? messageData.fileDetails.publicUrl : ''}" 
                      type="${messageData.fileDetails && messageData.fileDetails.mimeType ? messageData.fileDetails.mimeType : 'audio/ogg'}">
              مقطع صوتي غير مدعوم في متصفحك
            </audio>
            ${messageData.fileDetails && messageData.fileDetails.caption ? 
              `<div class="media-caption">${messageData.fileDetails.caption}</div>` : ''}
          </div>
        `;
      } else if (messageData.mediaType === 'document') {
        messageHTML += `
          <div class="media-container document-container">
            <a href="${messageData.fileDetails && messageData.fileDetails.publicUrl ? messageData.fileDetails.publicUrl : ''}" 
               target="_blank" class="document-link">
              <i class="fas fa-file-alt document-icon"></i>
              <span class="document-name">${messageData.fileDetails && messageData.fileDetails.fileName ? messageData.fileDetails.fileName : 'مستند'}</span>
              ${messageData.fileDetails && messageData.fileDetails.fileSize ? 
                `<span class="document-size">(${Math.round(messageData.fileDetails.fileSize / 1024)} كيلوبايت)</span>` : ''}
            </a>
          </div>
        `;
      }
      
      // إضافة النص إذا كان موجودًا مع الوسائط
      if (messageData.content && messageData.content.trim() !== '') {
        messageHTML += `<div class="message-text">${messageData.content}</div>`;
      }
    } else {
      // إضافة محتوى النص إذا لم يكن محتوى وسائط
      messageHTML += messageData.content;
    }
    
    // إضافة معلومات الوقت والحالة
    messageHTML += `
      <div class="message-time">
        ${new Date(messageData.timestamp).toLocaleString('ar-LY')}
        ${messageData.direction === 'outgoing' ? `
          <span class="message-status">
            ${getStatusIcon(messageData.status)}
          </span>
        ` : ''}
      </div>
    `;
    
    // إغلاق فقاعة الرسالة
    messageHTML += '</div>';
    
    // إضافة أزرار الإجراءات
    messageHTML += `
      <div class="message-actions">
        <button type="button" class="btn btn-sm text-muted message-action-btn reaction-btn" 
                title="تفاعل" onclick="window.showReactionPicker('${messageData._id || ''}', '${messageData.externalMessageId || ''}', this)">
          <i class="far fa-smile"></i>
        </button>
        <button type="button" class="btn btn-sm text-muted message-action-btn reply-btn" 
              data-message-id="${messageData._id || ''}" 
              data-external-id="${messageData.externalMessageId || ''}" 
              title="رد" onclick="window.showReplyForm('${messageData._id || ''}', '${messageData.externalMessageId || ''}', this.closest('.message'))">
          <i class="fas fa-reply"></i>
        </button>
      </div>
    `;
    
    // إغلاق عنصر الرسالة
    messageHTML += `</div><div class="clear-both"></div>`;
    
    // إضافة الرسالة إلى النهاية
    messageContainer.insertAdjacentHTML('beforeend', messageHTML);
    
    // تطبيق مستمعات الأحداث على الرسالة الجديدة
    const newMessageElem = messageContainer.lastElementChild;
    window.setupMessageActions(newMessageElem);
    
    // التمرير إلى أسفل
    messageContainer.scrollTop = messageContainer.scrollHeight;
  };

  // دالة مساعدة للحصول على أيقونة الحالة
  function getStatusIcon(status) {
    if (!status) return '';
    
    switch(status) {
      case 'sending':
        return '<i class="fas fa-clock text-secondary" title="جاري الإرسال..."></i>';
      case 'sent':
        return '<i class="fas fa-check text-silver" title="تم الإرسال"></i>';
      case 'delivered':
        return '<i class="fas fa-check-double text-silver" title="تم التسليم"></i>';
      case 'read':
        return '<i class="fas fa-check-double text-primary" title="تم القراءة"></i>';
      case 'failed':
        return '<i class="fas fa-exclamation-triangle text-danger" title="فشل الإرسال"></i>';
      default:
        return '';
    }
  }

  /**
   * تحديث رابط الوسائط إذا كان منتهي الصلاحية
   * @param {string} mediaId - معرف الوسائط
   * @param {string} r2Key - مفتاح R2 للملف
   * @returns {Promise<string>} - رابط جديد للوسائط أو رابط الحالي إذا كان صالحًا
   */
  window.refreshMediaUrl = async function(mediaId, r2Key) {
    try {
      if (!mediaId || !r2Key) return null;
      
      const refreshEndpoint = `/api/whatsapp/media/refresh-url`;
      const response = await fetch(refreshEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          mediaId,
          r2Key
        })
      });
      
      if (!response.ok) {
        throw new Error('فشل تحديث رابط الوسائط');
      }
      
      const data = await response.json();
      return data.publicUrl;
    } catch (error) {
      if (window.debugMode === true) {
        console.error('خطأ في تحديث رابط الوسائط:', error);
      }
      return null;
    }
  };

  /**
   * تحميل الوسائط بشكل صحيح مع التعامل مع انتهاء صلاحية الروابط
   * @param {HTMLElement} mediaElement - عنصر الوسائط (img, video, audio)
   * @param {string} mediaId - معرف الوسائط
   * @param {string} r2Key - مفتاح R2 للملف
   */
  window.loadMedia = async function(mediaElement, mediaId, r2Key) {
    if (!mediaElement || !r2Key) return;
    
    // في حالة فشل تحميل الوسائط، نحاول تحديث الرابط
    mediaElement.addEventListener('error', async function() {
      const newUrl = await window.refreshMediaUrl(mediaId, r2Key);
      if (newUrl) {
        if (mediaElement.tagName.toLowerCase() === 'img') {
          mediaElement.src = newUrl;
        } else if (mediaElement.tagName.toLowerCase() === 'source') {
          mediaElement.src = newUrl;
          if (mediaElement.parentElement) {
            mediaElement.parentElement.load();
          }
        } else if (mediaElement.tagName.toLowerCase() === 'a') {
          mediaElement.href = newUrl;
        }
      }
    });
  };

})(window);
