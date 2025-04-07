/**
 * وحدة إرسال الرسائل - Message Sending Module
 * تحتوي على الدوال المتعلقة بإرسال الرسائل الجديدة
 */

(function(window) {
  // تعيين وضع التصحيح (false لإيقاف رسائل التصحيح)
  window.debugMode = false;

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
    window.clearReplyIndicator && window.clearReplyIndicator();
    
    // مسح الملف المرفق إذا كان موجوداً
    window.clearMediaAttachment && window.clearMediaAttachment();
    
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
        if (typeof window.playMessageSound === 'function') {
          window.playMessageSound('sent');
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
   * دالة لتشغيل صوت عند وصول رسائل جديدة
   */
  window.playNotificationSound = function() {
    try {
      const sound = document.getElementById('messageSound');
      if (sound) {
        sound.currentTime = 0;
        sound.play().catch(err => {
          // تجاهل الأخطاء (مثل: المتصفح يتطلب تفاعل المستخدم لتشغيل الصوت)
        });
      }
    } catch (error) {
      // تجاهل أخطاء الصوت
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
   * دالة لإضافة رسالة جديدة للمحادثة الحالية
   * @param {Object} messageData بيانات الرسالة المراد إضافتها
   */
  window.addMessageToConversation = function(messageData) {
    if (!messageData || !window.currentConversationId) return;
    
    // التأكد من أن الرسالة تخص المحادثة الحالية
    if (messageData.conversationId !== window.currentConversationId) return;
    
    // الحصول على حاوية الرسائل
    const messageContainer = document.getElementById('messageContainer');
    if (!messageContainer) return;
    
    // التحقق من وجود الرسالة مسبقاً (لمنع إضافتها مرتين)
    const messageExists = document.querySelector(`.message[data-message-id="${messageData._id}"]`);
    if (messageExists) {
      return;
    }
    
    // إنشاء HTML للرسالة مطابق تمامًا لبنية القالب في _conversation_details_ajax.ejs
    let messageHTML = `
      <div class="message ${messageData.direction}" 
          data-message-id="${messageData._id}" 
          data-status="${messageData.status || 'sent'}"
          ${messageData.externalMessageId ? `data-external-id="${messageData.externalMessageId}"` : ''}>
    `;
    
    // إضافة قسم الرد على رسالة (إذا كان موجودًا)
    if (messageData.replyToMessageId) {
      // البحث عن الرسالة المرد عليها
      const repliedMsg = document.querySelector(`.message[data-external-id="${messageData.replyToMessageId}"], .message[data-message-id="${messageData.replyToMessageId}"]`);
      
      messageHTML += `
        <div class="replied-message">
          <div class="replied-content">
            <i class="fas fa-reply"></i>
            <span>${repliedMsg ? 
              (repliedMsg.querySelector('.message-bubble').textContent.trim().substring(0, 50) + 
              (repliedMsg.querySelector('.message-bubble').textContent.trim().length > 50 ? '...' : '')) : 
              `رد على رسالة غير موجودة<small class="text-muted d-block">(المعرف: ${messageData.replyToMessageId.substring(0, 10)}...)</small>`}</span>
          </div>
        </div>
      `;
    }
    
    // إضافة فقاعة الرسالة مع دعم الوسائط
    messageHTML += `
      <div class="message-bubble ${messageData.direction === 'incoming' ? 'incoming-bubble' : 'outgoing-bubble'} ${messageData.mediaType ? 'message-with-media' : ''}">
        ${messageData.direction === 'outgoing' ? `
        <!-- إضافة اسم المرسل فقط للرسائل الصادرة -->
        <div class="message-sender">
          ${messageData.metadata && messageData.metadata.senderInfo 
            ? messageData.metadata.senderInfo.username || messageData.metadata.senderInfo.full_name || 'مجهول'
            : messageData.sentByUsername || 'مجهول'}
        </div>
        ` : ''}
        <div class="message-content">
    `;
    
    // إضافة الوسائط حسب النوع
    if (messageData.mediaType) {
      if (messageData.mediaType === 'image') {
        messageHTML += `
          <div class="media-container">
            <img src="/whatsapp/media/content/${messageData._id}" class="media-image" alt="صورة" onclick="window.openMediaPreview(this.src, 'image')">
          </div>
        `;
      } else if (messageData.mediaType === 'video') {
        messageHTML += `
          <div class="media-container">
            <video controls class="media-video">
              <source src="/whatsapp/media/content/${messageData._id}" type="video/mp4">
              المتصفح لا يدعم عرض الفيديو
            </video>
          </div>
        `;
      } else if (messageData.mediaType === 'audio') {
        messageHTML += `
          <div class="media-container">
            <audio controls class="media-audio">
              <source src="/whatsapp/media/content/${messageData._id}" type="audio/ogg">
              المتصفح لا يدعم تشغيل الملفات الصوتية
            </audio>
          </div>
        `;
      } else if (messageData.mediaType === 'document') {
        messageHTML += `
          <div class="document-container">
            <div class="document-icon">
              <i class="fas fa-file-alt"></i>
            </div>
            <div class="document-info">
              <div class="document-name">${messageData.fileName || 'مستند'}</div>
              <div class="document-size">${messageData.fileSize ? (Math.round(messageData.fileSize / 1024) + ' كيلوبايت') : ''}</div>
            </div>
            <a href="/whatsapp/media/content/${messageData._id}" target="_blank" class="document-download">
              <i class="fas fa-download"></i>
            </a>
          </div>
        `;
      } else if (messageData.mediaType === 'sticker') {
        messageHTML += `
          <div class="media-container">
            <img src="/whatsapp/media/content/${messageData._id}" class="media-sticker" alt="ملصق">
          </div>
        `;
      } else if (messageData.mediaType === 'location') {
        messageHTML += `
          <div class="location-container">
            <div class="location-icon">
              <i class="fas fa-map-marker-alt"></i>
            </div>
            <div class="location-info">
              <div class="location-name">موقع جغرافي</div>
              <div class="location-coordinates">${messageData.content || 'إحداثيات غير متوفرة'}</div>
            </div>
          </div>
        `;
      }
    }
    
    // إضافة نص الرسالة (إذا كان موجودًا)
    if (messageData.content && messageData.content.trim() !== '') {
      messageHTML += `
        <div class="message-text ${messageData.mediaType ? 'with-media' : ''}">
          ${messageData.content}
        </div>
      `;
    }
    
    // إضافة معلومات الوقت والحالة
    messageHTML += `
      <div class="message-meta">
        <span class="message-time" title="${new Date(messageData.timestamp || messageData.createdAt || Date.now()).toLocaleString()}">
          ${new Date(messageData.timestamp || messageData.createdAt || Date.now()).toLocaleString('ar-LY', { hour: '2-digit', minute: '2-digit' })}
        </span>
        
        ${messageData.direction === 'outgoing' ? `
          <span class="message-status" title="حالة الرسالة: ${messageData.status || 'sent'}">
            ${messageData.status === 'sent' ? '<i class="fas fa-check text-secondary"></i>' : ''}
            ${messageData.status === 'delivered' ? '<i class="fas fa-check-double text-secondary"></i>' : ''}
            ${messageData.status === 'read' ? '<i class="fas fa-check-double text-primary"></i>' : ''}
            ${messageData.status === 'failed' ? '<i class="fas fa-exclamation-circle text-danger"></i>' : ''}
            ${(!messageData.status || messageData.status === 'sending') ? '<i class="fas fa-clock text-secondary"></i>' : ''}
          </span>
        ` : ''}
      </div>
    `;
    
    // إغلاق فقاعة الرسالة
    messageHTML += `</div>`;
    
    // إضافة قسم التفاعلات (إذا وجدت)
    if (messageData.reactions && messageData.reactions.length > 0) {
      messageHTML += `
        <div class="message-reactions">
          ${messageData.reactions.map(reaction => `
            <span class="reaction-emoji" title="تفاعل من ${reaction.sender}">
              ${reaction.emoji}
            </span>
          `).join('')}
        </div>
      `;
    }
    
    // إضافة قسم أزرار التفاعل مع الرسالة
    messageHTML += `
      <div class="message-actions">
        <button type="button" class="btn btn-sm text-muted message-action-btn reaction-btn" 
                data-message-id="${messageData._id}"
                data-external-id="${messageData.externalMessageId || ''}"
                title="تفاعل">
          <i class="far fa-smile"></i>
        </button>
        <button type="button" class="btn btn-sm text-muted message-action-btn reply-btn" 
                data-message-id="${messageData._id}" 
                data-external-id="${messageData.externalMessageId || ''}" 
                title="رد">
          <i class="fas fa-reply"></i>
        </button>
      </div>
    `;
    
    // إغلاق عنصر الرسالة
    messageHTML += `</div><div class="clear-both"></div>`;
    
    // إضافة الرسالة لحاوية الرسائل
    messageContainer.insertAdjacentHTML('beforeend', messageHTML);
    
    // تمرير المحادثة لأسفل
    messageContainer.scrollTop = messageContainer.scrollHeight;
    
    // تشغيل صوت الإشعار للرسائل الواردة
    if (messageData.direction === 'incoming') {
      window.playNotificationSound();
    }
    
    // تعليق مستمعات الأحداث للرسالة الجديدة
    const newMessage = messageContainer.querySelector(`.message[data-message-id="${messageData._id}"]`);
    if (newMessage) {
      window.setupMessageActions && window.setupMessageActions(newMessage);
    }
    
    // إضافة الرسالة الواردة الجديدة إلى مراقب القراءة
    if (messageData.direction === 'incoming' && 
        messageData.status !== 'read' && 
        window.messageReadObserver) {
      // إضافة الرسالة لمراقب القراءة
      window.messageReadObserver.observe(newMessage);
      
      // تشغيل وظيفة markMessagesAsRead بعد فترة قصيرة من الزمن للتأكد من رؤية الرسالة
      setTimeout(() => {
        if (newMessage && document.body.contains(newMessage)) {
          window.markMessagesAsRead && window.markMessagesAsRead([{
            messageId: messageData._id,
            externalId: messageData.externalMessageId || null
          }]);
        }
      }, 1500);
    }
  };
  
})(window); 