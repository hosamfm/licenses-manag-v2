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
    
    // تخزين رابط الوسائط المؤقت (إذا كان متاحاً)
    const tempMediaPreviewSrc = document.getElementById('mediaPreviewImage')?.src || 
                                document.getElementById('mediaPreviewVideo')?.src || 
                                document.getElementById('mediaPreviewAudio')?.src;
                                
    const tempMediaFileName = document.getElementById('mediaFileName')?.textContent;
    
    // مسح مؤشر الرد إذا كان موجودا
    window.clearReplyIndicator && window.clearReplyIndicator();
    
    // مسح الملف المرفق إذا كان موجوداً
    window.clearMediaAttachment && window.clearMediaAttachment();
    
    // إظهار مؤشر للرسالة قيد الإرسال في الواجهة
    const tempMessageId = 'pending_' + Date.now().toString();
    
    // إنشاء HTML للرسالة المؤقتة
    let pendingMessageHTML = `
      <div class="message outgoing message-pending" 
          data-message-id="${tempMessageId}" 
          data-status="sending">
          
        <div class="message-bubble outgoing-bubble ${mediaId ? 'message-with-media' : ''}">
        
          <div class="message-sender">${window.currentUsername || 'مستخدم النظام'}</div>
          
          `;
          
    // إضافة عنصر نائب للوسائط للرسائل الصادرة المؤقتة
    if (mediaId && mediaType) {
      pendingMessageHTML += `<div class="media-placeholder" data-media-type="${mediaType}">`;
      if (mediaType === 'image' && tempMediaPreviewSrc) {
        pendingMessageHTML += `<img src="${tempMediaPreviewSrc}" alt="جاري الرفع..." class="img-fluid temp-media-preview">`;
      } else if (mediaType === 'video' && tempMediaPreviewSrc) {
        pendingMessageHTML += `<video src="${tempMediaPreviewSrc}" controls class="w-100 temp-media-preview" muted></video>`; // muted لمنع التشغيل التلقائي
      } else if (mediaType === 'audio' && tempMediaPreviewSrc) {
        pendingMessageHTML += `<audio src="${tempMediaPreviewSrc}" controls class="w-100 media-audio temp-media-preview"></audio>`;
      } else if (mediaType === 'document' || mediaType === 'file') {
        pendingMessageHTML += `
          <div class="document-container temp-media-preview">
            <i class="fas fa-spinner fa-spin document-icon"></i>
            <div class="document-info">
              <div class="document-name">${tempMediaFileName || 'جاري رفع الملف...'}</div>
            </div>
          </div>
        `;
      } else {
        pendingMessageHTML += `<div class="text-muted p-2"><i>جاري تحميل ${mediaType}...</i></div>`;
      }
      pendingMessageHTML += `</div>`;
    }
    
    // إضافة النص إذا كان موجوداً
    if (messageData.content) {
      pendingMessageHTML += `<div class="message-text ${mediaId ? 'with-media' : ''}">${messageData.content}</div>`;
    }
          
    pendingMessageHTML += `
        <div class="message-meta">
            <span class="message-time">${new Date().toLocaleTimeString('ar-LY', { hour: '2-digit', minute: '2-digit' })}</span>
            <span class="message-status" title="حالة الرسالة: جاري الإرسال"><i class="fas fa-clock text-secondary"></i></span>
          </div>
        </div>
        
        <div class="message-actions">
          <button type="button" class="btn btn-sm text-muted message-action-btn reaction-btn" 
                  data-message-id="${tempMessageId}"
                  title="تفاعل">
            <i class="far fa-smile"></i>
          </button>
          <button type="button" class="btn btn-sm text-muted message-action-btn reply-btn" 
                  data-message-id="${tempMessageId}" 
                  title="رد">
            <i class="fas fa-reply"></i>
          </button>
        </div>
      </div>
    `;
    
    // إضافة الرسالة المؤقتة إلى الواجهة
    const messagesContainer = document.querySelector('.messages-container');
    if (messagesContainer) {
      messagesContainer.insertAdjacentHTML('beforeend', pendingMessageHTML);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      
      // تعليق مستمعات الأحداث للرسالة الجديدة
      const pendingMessageElement = messagesContainer.querySelector(`.message[data-message-id="${tempMessageId}"]`);
      if (pendingMessageElement && window.setupMessageActions) {
        window.setupMessageActions(pendingMessageElement);
      }
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
        updatePendingMessageStatus(result.message._id, result.message.status || 'sent');
        
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
   * تحديث حالة الرسالة قيد الإرسال (جعلها عامة)
   * @param {string} messageId - معرف الرسالة
   * @param {string} status - الحالة الجديدة
   */
  window.updatePendingMessageStatus = function(messageId, status) {
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
   * تحديث محتوى الوسائط للرسالة المؤقتة (جعلها عامة)
   * تتوقع الآن بيانات كاملة (مع mediaUrl) من السوكت
   * @param {string} messageId - المعرف النهائي للرسالة
   * @param {object} messageData - بيانات الرسالة الكاملة
   */
  window.updatePendingMediaContent = function(messageId, messageData) {
    console.log(`[updatePendingMediaContent] محاولة تحديث وسائط الرسالة ID: ${messageId} -- البيانات المستلمة:`, JSON.stringify(messageData, null, 2));
    
    const mediaType = messageData.mediaType;
    if (!mediaType) {
      console.log(`[updatePendingMediaContent] لا يوجد mediaType في messageData ID: ${messageId}.`);
      return;
    }
    
    // *** إعادة بناء الرابط إذا كان مفقوداً ***
    let mediaUrl = messageData.mediaUrl;
    const isExternalId = mediaUrl && !mediaUrl.startsWith('/');
    
    if ((!mediaUrl || isExternalId) && messageId) {
      // بناء الرابط محلياً بناءً على النمط المعروف
      mediaUrl = `/whatsapp/media/content/${messageId}`;
      console.log(`[updatePendingMediaContent] تم بناء mediaUrl محلياً: ${mediaUrl} [النوع: ${messageData.mediaType}]`);
    } else if (!mediaUrl) {
      // لا يزال mediaUrl مفقوداً ولا يمكن بناؤه (لا يوجد messageId؟)
      console.error(`[updatePendingMediaContent] الرابط mediaUrl مفقود ولا يمكن بناؤه للرسالة ID: ${messageId}`);
       // عرض رسالة خطأ للمستخدم في العنصر النائب
       const errorPlaceholder = document.querySelector(`.message[data-message-id="${messageId}"] .media-placeholder`);
       if (errorPlaceholder) {
           errorPlaceholder.innerHTML = '<div class="text-danger p-2"><i>خطأ: رابط الوسائط غير متوفر</i></div>';
           errorPlaceholder.classList.remove('media-placeholder');
       }
       return;
    }
    
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageElement) {
      console.error(`[updatePendingMediaContent] لم يتم العثور على عنصر الرسالة ID: ${messageId}`);
      return;
    }
    console.log(`[updatePendingMediaContent] تم العثور على عنصر الرسالة ID: ${messageId}`, messageElement);
    
    const mediaPlaceholder = messageElement.querySelector('.media-placeholder');
    if (!mediaPlaceholder) {
      console.warn(`[updatePendingMediaContent] لم يتم العثور على العنصر النائب (.media-placeholder) للرسالة ID: ${messageId}`);
      return; 
    }
    console.log(`[updatePendingMediaContent] تم العثور على العنصر النائب للرسالة ID: ${messageId}`, mediaPlaceholder);
    
    const mediaCaption = messageData.mediaCaption || messageData.mediaName;
    const mediaSize = messageData.mediaSize;
    
    console.log(`[updatePendingMediaContent] تحديث الوسائط بالرابط: ${mediaUrl} والنوع: ${mediaType}`);
    
    // *** طريقة جديدة لتحديث DOM ***
    mediaPlaceholder.innerHTML = ''; // إفراغ المحتوى المؤقت أولاً
    let mediaElement = null;
    
    if (!mediaUrl) {
      mediaElement = document.createElement('div');
      mediaElement.className = 'text-danger p-2';
      mediaElement.innerHTML = '<i>فشل تحميل الوسائط</i>';
    } else if (mediaType === 'image') {
      mediaElement = document.createElement('img');
      mediaElement.src = mediaUrl;
      mediaElement.alt = mediaCaption || 'صورة';
      mediaElement.className = 'img-fluid';
      // معالجة خطأ تحميل الصورة
      mediaElement.onerror = () => {
        console.error(`[updatePendingMediaContent] فشل تحميل الصورة من الرابط: ${mediaUrl}`);
        mediaPlaceholder.innerHTML = '<div class="text-danger p-2"><i>فشل عرض الصورة</i></div>';
      };
    } else if (mediaType === 'video') {
      mediaElement = document.createElement('video');
      mediaElement.controls = true;
      mediaElement.className = 'w-100';
      const source = document.createElement('source');
      source.src = mediaUrl;
      source.type = 'video/mp4'; // أو تحديد النوع ديناميكيًا إذا لزم الأمر
      mediaElement.appendChild(source);
      mediaElement.appendChild(document.createTextNode('متصفحك لا يدعم تشغيل الفيديو.'));
    } else if (mediaType === 'audio') {
      mediaElement = document.createElement('audio');
      mediaElement.controls = true;
      mediaElement.className = 'w-100 media-audio';
      const source = document.createElement('source');
      source.src = mediaUrl;
      source.type = 'audio/mpeg'; // أو تحديد النوع ديناميكيًا
      mediaElement.appendChild(source);
      mediaElement.appendChild(document.createTextNode('متصفحك لا يدعم تشغيل الصوت.'));
    } else if (mediaType === 'document' || mediaType === 'file') {
      mediaElement = document.createElement('div');
      mediaElement.className = 'document-container';
      const fileName = messageData.fileName || mediaCaption || 'ملف';
      const fileSize = messageData.fileSize ? (Math.round(messageData.fileSize / 1024) + ' كيلوبايت') : '';
      
      console.log(`[updatePendingMediaContent] عرض وثيقة/ملف:
        اسم الملف: ${fileName}
        حجم الملف: ${fileSize}
        رابط التنزيل: ${mediaUrl}`);
        
      mediaElement.innerHTML = `
        <div class="document-icon">
          <i class="fas fa-file-alt"></i>
        </div>
        <div class="document-info">
          <div class="document-name">${fileName}</div>
          <div class="document-size">${fileSize}</div>
        </div>
        <a href="${mediaUrl}" target="_blank" class="document-download">
          <i class="fas fa-download"></i>
        </a>
      `;
    } else if (mediaType === 'sticker') {
      mediaElement = document.createElement('img');
      mediaElement.src = mediaUrl;
      mediaElement.alt = 'ملصق';
      mediaElement.className = 'img-fluid sticker-image';
       mediaElement.onerror = () => {
        console.error(`[updatePendingMediaContent] فشل تحميل الملصق من الرابط: ${mediaUrl}`);
        mediaPlaceholder.innerHTML = '<div class="text-danger p-2"><i>فشل عرض الملصق</i></div>';
      };
    } else {
       mediaElement = document.createElement('div');
       mediaElement.className = 'text-warning p-2';
       mediaElement.innerHTML = `<i>نوع وسائط غير مدعوم: ${mediaType}</i>`;
    }
      
    // إضافة العنصر الجديد إلى العنصر النائب
    if (mediaElement) {
       mediaPlaceholder.appendChild(mediaElement);
       console.log(`[updatePendingMediaContent] تم إضافة عنصر الوسائط للرسالة ID: ${messageId}`);
    } else {
        console.warn(`[updatePendingMediaContent] لم يتم إنشاء عنصر وسائط للنوع: ${mediaType}, ID: ${messageId}`);
    }
    
    // يمكن إزالة الفئة أو السمة إذا أردت بعد الاستبدال
    mediaPlaceholder.classList.remove('media-placeholder');
    // قد تحتاج لإضافة فئة media-container إذا كانت تستخدم للتنسيق
    // mediaPlaceholder.classList.add('media-container'); 
  }

  /**
   * دالة لإضافة رسالة جديدة للمحادثة الحالية
   * @param {Object} messageData بيانات الرسالة المراد إضافتها
   */
  window.addMessageToConversation = function(messageData) {
    if (!messageData || !window.currentConversationId) return;
    
    // *** التحقق الجديد: تجاهل الرسائل التي أرسلها العميل الحالي ولا تزال قيد المعالجة المحلية ***
    if (window.sentMessageIds && window.sentMessageIds.has(messageData._id)) {
      console.log('تجاهل معالجة الرسالة الصادرة محلياً بواسطة addMessageToConversation:', messageData._id);
      // يمكننا إزالتها من المجموعة هنا إذا أردنا السماح بتحديثات لاحقة عبر السوكت
      // window.sentMessageIds.delete(messageData._id);
      return; 
    }
    
    // التأكد من أن الرسالة تخص المحادثة الحالية
    if (messageData.conversationId !== window.currentConversationId) return;
    
    // الحصول على حاوية الرسائل
    const messageContainer = document.getElementById('messages');
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
      const statusElement = messageExists.querySelector('.message-status');
      if (statusElement) {
        if (messageData.status === 'sent') {
          statusElement.innerHTML = '<i class="fas fa-check text-secondary"></i>';
        } else if (messageData.status === 'delivered') {
          statusElement.innerHTML = '<i class="fas fa-check-double text-secondary"></i>';
        } else if (messageData.status === 'read') {
          statusElement.innerHTML = '<i class="fas fa-check-double text-primary"></i>';
        } else if (messageData.status === 'failed') {
          statusElement.innerHTML = '<i class="fas fa-exclamation-circle text-danger"></i>';
        }
      }
      
      return;
    }
    
    // التحقق من الرسائل المؤقتة (المرسلة محليًا)
    const pendingMessages = document.querySelectorAll('.message.message-pending, .message.outgoing:not([data-status="read"]):not([data-status="delivered"])');
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
        const statusElement = pendingMsg.querySelector('.message-status');
          if (statusElement) {
          if (messageData.status === 'sent') {
            statusElement.innerHTML = '<i class="fas fa-check text-secondary"></i>';
          } else if (messageData.status === 'delivered') {
            statusElement.innerHTML = '<i class="fas fa-check-double text-secondary"></i>';
          } else if (messageData.status === 'read') {
            statusElement.innerHTML = '<i class="fas fa-check-double text-primary"></i>';
          }
        }
        
        // تحديث أزرار التفاعل مع الرسالة
        const actionButtons = pendingMsg.querySelectorAll('.message-action-btn');
        actionButtons.forEach(button => {
          button.setAttribute('data-message-id', messageData._id);
          if (messageData.externalMessageId) {
            button.setAttribute('data-external-id', messageData.externalMessageId);
          }
        });
        
        return;
      }
    }
    
    // *** التحقق من وجود رابط الوسائط وبناؤه محلياً إذا كان غير موجود ***
    if (messageData.mediaType && messageData._id) {
      // تجاهل الروابط الخارجية (مثل أرقام معرفات الوسائط) واستخدام الرابط المحلي دائماً
      const isExternalId = messageData.mediaUrl && !messageData.mediaUrl.startsWith('/');
      
      if (!messageData.mediaUrl || isExternalId) {
        // بناء الرابط محلياً بناءً على معرف الرسالة
        messageData.mediaUrl = `/whatsapp/media/content/${messageData._id}`;
        console.log(`[addMessageToConversation] تم بناء mediaUrl محلياً للرسائل: ${messageData.mediaUrl} [النوع: ${messageData.mediaType}, الاتجاه: ${messageData.direction}]`);
      }
    }
    
    // إنشاء HTML للرسالة مطابق تمامًا لبنية القالب في _conversation_details_ajax.ejs
    let messageHTML = `
      <div class="message ${messageData.direction === 'incoming' ? 'incoming' : 'outgoing'}" 
          data-message-id="${messageData._id}"
          data-external-id="${messageData.externalMessageId || ''}">
          
        <div class="message-bubble ${messageData.direction === 'incoming' ? 'incoming-bubble' : 'outgoing-bubble'}">
          
          ${messageData.direction === 'incoming' ? `
            <div class="message-sender">${messageData.senderName || 'مستخدم'}</div>
          ` : ''}
          
          ${messageData.content ? `
            <div class="message-content">${messageData.content}</div>
          ` : ''}
          
          ${messageData.mediaType ? `
            <div class="media-container">
              ${messageData.mediaType === 'image' ? `
                <img src="${messageData.mediaUrl}" 
                     alt="${messageData.fileName || 'صورة'}" 
                     class="img-fluid media-content" 
                     data-media-id="${messageData._id}">
              ` : messageData.mediaType === 'video' ? `
                <video src="${messageData.mediaUrl}" 
                       controls 
                       class="w-100 media-content" 
                       muted>
                  <source src="${messageData.mediaUrl}" 
                          type="${messageData.mimeType || 'video/mp4'}">
                </video>
              ` : messageData.mediaType === 'audio' ? `
                <audio controls 
                       class="w-100 media-content">
                  <source src="${messageData.mediaUrl}" 
                          type="${messageData.mimeType || 'audio/mpeg'}">
                </audio>
              ` : ''}
            </div>
          ` : ''}
          
          <div class="message-metadata">
            <span class="message-time">${window.formatTime(messageData.timestamp)}</span>
            <span class="message-status ${messageData.status}">
              ${messageData.status === 'sent' ? '<i class="fas fa-paper-plane"></i>' : 
               messageData.status === 'delivered' ? '<i class="fas fa-check-double"></i>' : 
               messageData.status === 'read' ? '<i class="fas fa-check-double read"></i>' : ''}
            </span>
          </div>
        </div>
      </div>
    `;

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
      window.messageReadObserver.observe(newMessage);
      
      // تشغيل وظيفة markMessagesAsRead بعد فترة قصيرة من الزمن
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