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
    
    // عرض مؤشر الإرسال
    if (sendingIndicator) {
      sendingIndicator.style.display = 'block';
    }
    
    // تعطيل زر الإرسال مؤقتاً أثناء عملية الإرسال
    if (sendButton) {
      sendButton.disabled = true;
    }
    
    try {
      // إرسال طلب الإضافة
      const requestUrl = `/crm/conversations/${conversationIdValue}/reply`;
      const requestData = {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify(messageData)
      };
      
      // عرض حالة الإرسال
      updatePendingMessageStatus(tempMessageId, 'sending');
      
      // إرسال الطلب للسيرفر
      const response = await fetch(requestUrl, requestData);
      
      // فحص للتأكد من نجاح الطلب
      if (!response.ok) {
        throw new Error(`فشل في الإرسال: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // التعامل مع الاستجابة
      if (result.success && result.message) {
        // تحديث معرف الرسالة المؤقتة بالمعرف الحقيقي
        updatePendingMessageId(tempMessageId, result.message._id);
        
        // تحديث حالة الرسالة
        updatePendingMessageStatus(result.message._id, 'sent');
        
        // إضافة المعرف الجديد للرسائل المرسلة لمنع تكرارها
        window.sentMessageIds.add(result.message._id);
      } else {
        // حالة الرسالة فشلت في جانب السيرفر
        updatePendingMessageStatus(tempMessageId, 'failed');
      }
    } catch (error) {
      console.error('خطأ أثناء إرسال الرسالة:', error);
      // تحديث حالة الرسالة للإشارة إلى الفشل
      updatePendingMessageStatus(tempMessageId, 'failed');
    } finally {
      // إخفاء مؤشر الإرسال وإعادة تمكين زر الإرسال
      if (sendingIndicator) {
        sendingIndicator.style.display = 'none';
      }
      if (sendButton) {
        sendButton.disabled = false;
      }
    }
  };

  /**
   * تحديث حالة الرسالة قيد الإرسال
   * @param {string} messageId - معرف الرسالة
   * @param {string} status - الحالة الجديدة
   */
  function updatePendingMessageStatus(messageId, status) {
    // البحث عن الرسالة بالمعرف
    const pendingMessage = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!pendingMessage) return;
    
    // تحديث سمة الحالة
    pendingMessage.setAttribute('data-status', status);
    
    // إزالة كافة فئات الحالة
    pendingMessage.classList.remove('message-pending', 'message-sent', 'message-failed');
    
    // إضافة فئة جديدة حسب الحالة
    if (status === 'sending') {
      pendingMessage.classList.add('message-pending');
    } else if (status === 'failed') {
      pendingMessage.classList.add('message-failed');
    } else {
      pendingMessage.classList.add('message-sent');
    }
    
    // تحديث أيقونة الحالة
    const statusIcon = pendingMessage.querySelector('.message-status');
    if (statusIcon) {
      statusIcon.innerHTML = '';
      if (status === 'sent') {
        statusIcon.innerHTML = '<i class="fas fa-check text-secondary"></i>';
      } else if (status === 'delivered') {
        statusIcon.innerHTML = '<i class="fas fa-check-double text-secondary"></i>';
      } else if (status === 'read') {
        statusIcon.innerHTML = '<i class="fas fa-check-double text-primary"></i>';
      } else if (status === 'failed') {
        statusIcon.innerHTML = '<i class="fas fa-exclamation-circle text-danger"></i>';
      } else {
        statusIcon.innerHTML = '<i class="fas fa-clock text-secondary"></i>';
      }
    }
  }
  
  /**
   * تحديث معرف الرسالة قيد الإرسال
   * @param {string} oldId - المعرف القديم
   * @param {string} newId - المعرف الجديد
   */
  function updatePendingMessageId(oldId, newId) {
    // البحث عن الرسالة بالمعرف القديم
    const pendingMessage = document.querySelector(`.message[data-message-id="${oldId}"]`);
    if (!pendingMessage) return;
    
    // تحديث معرف الرسالة
    pendingMessage.setAttribute('data-message-id', newId);
    
    // تحديث معرفات أزرار التفاعل
    const actionButtons = pendingMessage.querySelectorAll('.message-action-btn');
    actionButtons.forEach(button => {
      button.setAttribute('data-message-id', newId);
    });
  }

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
    
    // التحقق من وجود الرسالة مسبقاً حسب معرفها النهائي
    const messageExists = document.querySelector(`.message[data-message-id="${messageData._id}"]`);
    if (messageExists) {
      console.log('الرسالة موجودة بالفعل، تحديث حالتها فقط:', messageData._id);
      
      // تحديث حالة الرسالة الموجودة
      messageExists.setAttribute('data-status', messageData.status || 'sent');
      
      // تحديث المعرف الخارجي إذا كان متوفرًا
      if (messageData.externalMessageId) {
        messageExists.setAttribute('data-external-id', messageData.externalMessageId);
      }
      
      // تحديث أيقونة الحالة
      const statusIcon = messageExists.querySelector('.message-status');
      if (statusIcon) {
        if (messageData.status === 'sent') {
          statusIcon.innerHTML = '<i class="fas fa-check text-secondary"></i>';
        } else if (messageData.status === 'delivered') {
          statusIcon.innerHTML = '<i class="fas fa-check-double text-secondary"></i>';
        } else if (messageData.status === 'read') {
          statusIcon.innerHTML = '<i class="fas fa-check-double text-primary"></i>';
        } else if (messageData.status === 'failed') {
          statusIcon.innerHTML = '<i class="fas fa-exclamation-circle text-danger"></i>';
        }
      }
      
      return;
    }
    
    // التحقق من الرسائل المؤقتة (المرسلة محليًا)
    const pendingMessages = document.querySelectorAll('.message.message-pending');
    for (const pendingMsg of pendingMessages) {
      // إذا كانت هناك رسالة مؤقتة يجب تحديثها بدلاً من إضافة واحدة جديدة
      // نقارن محتوى الرسالة المؤقتة مع الرسالة الجديدة
      const pendingMsgContent = pendingMsg.querySelector('.message-text')?.textContent;
      
      if (pendingMsgContent === messageData.content) {
        console.log('تحديث رسالة مؤقتة برسالة مستلمة من السيرفر', messageData._id);
        
        // تحديث معرف الرسالة
        pendingMsg.setAttribute('data-message-id', messageData._id);
        
        // إزالة فئة الإرسال
        pendingMsg.classList.remove('message-pending');
        
        // تحديث الحالة
        pendingMsg.setAttribute('data-status', messageData.status || 'sent');
        
        // تحديث المعرف الخارجي إذا كان متوفرًا
        if (messageData.externalMessageId) {
          pendingMsg.setAttribute('data-external-id', messageData.externalMessageId);
        }
        
        // تحديث أيقونة الحالة
        const statusIcon = pendingMsg.querySelector('.message-status');
        if (statusIcon) {
          if (messageData.status === 'sent') {
            statusIcon.innerHTML = '<i class="fas fa-check text-secondary"></i>';
          } else if (messageData.status === 'delivered') {
            statusIcon.innerHTML = '<i class="fas fa-check-double text-secondary"></i>';
          } else if (messageData.status === 'read') {
            statusIcon.innerHTML = '<i class="fas fa-check-double text-primary"></i>';
          }
        }
        
        return;
      }
    }
    
    // إنشاء HTML للرسالة مطابق تمامًا لبنية القالب في _conversation_details_ajax.ejs
    let messageHTML = `
      <div class="message ${messageData.direction}" 
          data-message-id="${messageData._id}" 
          data-status="${messageData.status || 'sent'}"
          ${messageData.externalMessageId ? `data-external-id="${messageData.externalMessageId}"` : ''}>
    `;
    
    // إضافة معلومات الرد إذا كانت الرسالة رداً على رسالة أخرى
    if (messageData.replyToMessageId) {
      // العثور على الرسالة التي يتم الرد عليها (إن وجدت)
      const repliedMsgElem = document.querySelector(`.message[data-message-id="${messageData.replyToMessageId}"], .message[data-external-id="${messageData.replyToMessageId}"]`);
      const repliedMsgContent = repliedMsgElem ? (repliedMsgElem.querySelector('.message-text')?.textContent || 'محتوى وسائط') : 'رد على رسالة';
      
      messageHTML += `
        <div class="replied-message">
          <div class="replied-content">
            <i class="fas fa-reply"></i>
            <span>${repliedMsgContent.substring(0, 50)}${repliedMsgContent.length > 50 ? '...' : ''}</span>
          </div>
        </div>
      `;
    }
    
    // إضافة فقاعة الرسالة
    messageHTML += `<div class="message-bubble ${messageData.direction === 'incoming' ? 'incoming-bubble' : 'outgoing-bubble'} ${messageData.mediaType ? 'message-with-media' : ''}">`;
    
    // إضافة اسم المرسل للرسائل الصادرة
    if (messageData.direction === 'outgoing') {
      const senderName = messageData.metadata && messageData.metadata.senderInfo
        ? (messageData.metadata.senderInfo.username || messageData.metadata.senderInfo.full_name || 'مستخدم غير معروف')
        : (messageData.sentByUsername || 'مستخدم غير معروف');
        
      messageHTML += `<div class="message-sender">${senderName}</div>`;
    }
    
    // إضافة الوسائط إذا كانت موجودة
    if (messageData.mediaType) {
      if (messageData.mediaType === 'image') {
        messageHTML += `
          <div class="media-container">
            <img src="${messageData.mediaUrl}" alt="صورة" class="img-fluid">
          </div>
        `;
      } else if (messageData.mediaType === 'video') {
        messageHTML += `
          <div class="media-container">
            <video controls class="w-100">
              <source src="${messageData.mediaUrl}" type="video/mp4">
              متصفحك لا يدعم تشغيل الفيديو.
            </video>
          </div>
        `;
      } else if (messageData.mediaType === 'audio') {
        messageHTML += `
          <div class="media-container">
            <audio controls class="w-100 media-audio">
              <source src="${messageData.mediaUrl}" type="audio/mpeg">
              متصفحك لا يدعم تشغيل الصوت.
            </audio>
          </div>
        `;
      } else if (messageData.mediaType === 'document' || messageData.mediaType === 'file') {
        const fileName = messageData.mediaCaption || messageData.mediaName || 'ملف';
        messageHTML += `
          <div class="document-container">
            <i class="fas fa-file document-icon"></i>
            <div class="document-info">
              <div class="document-name">${fileName}</div>
              <div class="document-size">${messageData.mediaSize || ''}</div>
            </div>
            <a href="${messageData.mediaUrl}" download="${fileName}" class="document-download">
              <i class="fas fa-download"></i>
            </a>
          </div>
        `;
      } else if (messageData.mediaType === 'sticker') {
        messageHTML += `
          <div class="media-container">
            <img src="${messageData.mediaUrl}" alt="ملصق" class="img-fluid">
          </div>
        `;
      }
    }
    
    // إضافة نص الرسالة إذا كان موجوداً
    if (messageData.content && messageData.content.trim() !== '') {
      messageHTML += `<div class="message-text ${messageData.mediaType ? 'with-media' : ''}">${messageData.content}</div>`;
    }
    
    // إضافة معلومات الوقت والحالة
    messageHTML += `
      <div class="message-meta">
        <span class="message-time" title="${new Date(messageData.timestamp || messageData.createdAt).toLocaleString()}" 
              data-timestamp="${new Date(messageData.timestamp || messageData.createdAt).getTime()}"
              data-date="${new Date(messageData.timestamp || messageData.createdAt).toISOString().split('T')[0]}">
          ${new Date(messageData.timestamp || messageData.createdAt).toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' })}
        </span>
    `;
    
    // إضافة حالة الرسالة للرسائل الصادرة
    if (messageData.direction === 'outgoing') {
      messageHTML += '<span class="message-status" title="حالة الرسالة: ' + (messageData.status || 'sent') + '">';
      
      if (messageData.status === 'sent') {
        messageHTML += '<i class="fas fa-check text-secondary"></i>';
      } else if (messageData.status === 'delivered') {
        messageHTML += '<i class="fas fa-check-double text-secondary"></i>';
      } else if (messageData.status === 'read') {
        messageHTML += '<i class="fas fa-check-double text-primary"></i>';
      } else if (messageData.status === 'failed') {
        messageHTML += '<i class="fas fa-exclamation-circle text-danger"></i>';
      } else { // حالة sending أو غير معرفة
        messageHTML += '<i class="fas fa-clock text-secondary"></i>';
      }
      
      messageHTML += '</span>';
    }
    
    // إغلاق قسم معلومات الرسالة
    messageHTML += `</div>`;
    
    // إغلاق فقاعة الرسالة
    messageHTML += `</div>`;
    
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
      window.playNotificationSound && window.playNotificationSound();
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

})(window); 