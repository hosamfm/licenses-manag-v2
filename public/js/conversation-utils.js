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
   * مجموعة دوال مساعدة للتعامل مع طلبات HTTP
   */
  window.httpClient = {
    /**
     * إرسال طلب HTTP باستخدام Fetch API
     * @param {string} url - عنوان URL للطلب
     * @param {string} method - طريقة الطلب (GET, POST, PUT, DELETE)
     * @param {Object} data - البيانات المرسلة مع الطلب (اختياري)
     * @param {Object} options - خيارات إضافية للطلب (اختياري)
     * @returns {Promise} - وعد يحل إلى استجابة الطلب
     */
    async request(url, method = 'GET', data = null, options = {}) {
      try {
        const fetchOptions = {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers
          },
          ...options
        };
        
        // إضافة البيانات إلى الطلب إذا كانت موجودة
        if (data) {
          fetchOptions.body = JSON.stringify(data);
        }
        
        // إرسال الطلب
        const response = await fetch(url, fetchOptions);
        
        // التحقق من نجاح الطلب
        if (!response.ok) {
          throw new Error(`خطأ في الطلب: ${response.status} - ${response.statusText}`);
        }
        
        // تحويل الاستجابة إلى JSON إذا كان ذلك ممكناً
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        }
        
        return await response.text();
      } catch (error) {
        if (window.debugMode) console.error('خطأ في طلب HTTP:', error);
        throw error;
      }
    },
    
    /**
     * إرسال طلب GET
     * @param {string} url - عنوان URL للطلب
     * @param {Object} options - خيارات إضافية للطلب (اختياري)
     * @returns {Promise} - وعد يحل إلى استجابة الطلب
     */
    async get(url, options = {}) {
      return this.request(url, 'GET', null, options);
    },
    
    /**
     * إرسال طلب POST
     * @param {string} url - عنوان URL للطلب
     * @param {Object} data - البيانات المرسلة مع الطلب
     * @param {Object} options - خيارات إضافية للطلب (اختياري)
     * @returns {Promise} - وعد يحل إلى استجابة الطلب
     */
    async post(url, data, options = {}) {
      return this.request(url, 'POST', data, options);
    },
    
    /**
     * تحميل ملف إلى الخادم مع تتبع التقدم
     * @param {string} url - عنوان URL للتحميل
     * @param {FormData} formData - بيانات النموذج المرسلة
     * @param {Function} onProgress - دالة تستدعى لتحديث تقدم التحميل (اختياري)
     * @param {Object} options - خيارات إضافية للطلب (اختياري)
     * @returns {Promise} - وعد يحل إلى استجابة الطلب
     */
    async uploadFile(url, formData, onProgress = null, options = {}) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        
        // إضافة الرؤوس المخصصة إذا كانت موجودة
        if (options.headers) {
          Object.keys(options.headers).forEach(key => {
            xhr.setRequestHeader(key, options.headers[key]);
          });
        }
        
        // إعداد معالج التقدم
        if (onProgress && typeof onProgress === 'function') {
          xhr.upload.onprogress = function(e) {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100);
              onProgress(percentComplete, e);
            }
          };
        }
        
        // إعداد معالج الاستجابة
        xhr.onload = function() {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              // محاولة تحليل الاستجابة كـ JSON
              const contentType = xhr.getResponseHeader('Content-Type');
              if (contentType && contentType.includes('application/json')) {
                resolve(JSON.parse(xhr.responseText));
              } else {
                resolve(xhr.responseText);
              }
            } catch (error) {
              resolve(xhr.responseText);
            }
          } else {
            reject(new Error(`خطأ في التحميل: ${xhr.status} - ${xhr.statusText}`));
          }
        };
        
        // إعداد معالج الخطأ
        xhr.onerror = function() {
          reject(new Error('حدث خطأ في الاتصال بالخادم'));
        };
        
        // إرسال البيانات
        xhr.send(formData);
      });
    }
  };
  
  /**
   * دالة مساعدة لإدارة حالة واجهة المستخدم أثناء العمليات المتزامنة
   * @param {Function} asyncOperation - العملية المتزامنة المراد تنفيذها
   * @param {Object} uiElements - عناصر واجهة المستخدم المراد تحديثها
   * @param {Object} options - خيارات إضافية
   * @returns {Promise} - وعد يحل إلى نتيجة العملية المتزامنة
   */
  window.withUIState = async function(asyncOperation, uiElements = {}, options = {}) {
    const {
      button,                   // زر يجب تعطيله أثناء العملية
      buttonText,               // النص الأصلي للزر
      loadingText,              // نص التحميل للزر
      progressElement,          // عنصر شريط التقدم
      successMessage,           // رسالة النجاح
      errorMessage,             // رسالة الخطأ
      onSuccess,                // دالة تستدعى عند النجاح
      onError,                  // دالة تستدعى عند الخطأ
      finallyCallback           // دالة تستدعى دائماً في النهاية
    } = uiElements;
    
    // تحديث حالة واجهة المستخدم قبل بدء العملية
    if (button) {
      button.disabled = true;
      if (loadingText) {
        button.dataset.originalText = button.innerHTML;
        button.innerHTML = loadingText;
      }
    }
    
    if (progressElement) {
      progressElement.style.display = 'block';
      if (progressElement.querySelector) {
        const progressBar = progressElement.querySelector('.progress-bar');
        if (progressBar) {
          progressBar.style.width = '0%';
          progressBar.textContent = '0%';
          progressBar.setAttribute('aria-valuenow', 0);
        }
      }
    }
    
    try {
      // تنفيذ العملية المتزامنة
      const result = await asyncOperation();
      
      // عرض رسالة النجاح إذا كانت موجودة
      if (successMessage && window.showToast) {
        window.showToast(successMessage, 'success');
      }
      
      // استدعاء دالة النجاح إذا كانت موجودة
      if (onSuccess && typeof onSuccess === 'function') {
        onSuccess(result);
      }
      
      return result;
    } catch (error) {
      // عرض رسالة الخطأ إذا كانت موجودة
      if (window.showToast) {
        window.showToast(errorMessage || error.message || 'حدث خطأ أثناء تنفيذ العملية', 'danger');
      }
      
      // تسجيل الخطأ في وحدة التحكم
      console.error('خطأ في العملية:', error);
      
      // استدعاء دالة الخطأ إذا كانت موجودة
      if (onError && typeof onError === 'function') {
        onError(error);
      }
      
      throw error;
    } finally {
      // استعادة حالة واجهة المستخدم بعد انتهاء العملية
      if (button) {
        button.disabled = false;
        if (button.dataset.originalText) {
          button.innerHTML = button.dataset.originalText;
          delete button.dataset.originalText;
        }
      }
      
      if (progressElement) {
        progressElement.style.display = 'none';
      }
      
      // استدعاء دالة النهاية إذا كانت موجودة
      if (finallyCallback && typeof finallyCallback === 'function') {
        finallyCallback();
      }
    }
  };
  
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
  window.sendReaction = async function(messageId, emoji, externalId) {
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
    
    try {
      // استخدام النظام الجديد لإرسال الطلب
      const data = await window.httpClient.post(`/crm/conversations/${conversationId}/reaction`, {
        messageId: messageId,
        externalId: externalId,
        emoji: emoji,
        senderId: senderId,
        senderName: senderName
      });
      
      if (window.debugMode) console.log('تم إرسال التفاعل بنجاح:', data);
      
      // تحديث واجهة المستخدم بالتفاعل
      updateReactionInUI(messageId, externalId, emoji, senderId, senderName);
    } catch (error) {
      console.error('خطأ في إرسال التفاعل:', error);
    } finally {
      // إغلاق منتقي التفاعلات
      const reactionPicker = document.getElementById('reactionPicker');
      if (reactionPicker) {
        reactionPicker.remove();
      }
    }
  };
  
  /**
   * دالة موحدة لتحديث تفاعلات الرسائل في واجهة المستخدم
   * تدعم إضافة تفاعل جديد أو تحديث التفاعلات الموجودة
   * 
   * @param {string} messageId - معرف الرسالة (يمكن أن يكون معرف داخلي أو خارجي)
   * @param {string|object} reaction - إما رمز التفاعل (إيموجي) كنص أو كائن يحتوي على معلومات التفاعل
   * @param {string} externalId - المعرف الخارجي للرسالة (اختياري)
   * @param {string} senderId - معرف المرسل (اختياري، يستخدم فقط إذا كان reaction نصياً)
   * @param {string} senderName - اسم المرسل (اختياري، يستخدم فقط إذا كان reaction نصياً)
   * @param {boolean} replaceExisting - إذا كان true سيتم استبدال التفاعلات الموجودة، وإلا سيتم إضافة تفاعل جديد
   */
  window.updateMessageReaction = function(messageId, reaction, externalId, senderId, senderName, replaceExisting = false) {
    // التحقق من وجود المعلومات الأساسية
    if (!messageId || !reaction) {
      if (window.debugMode) console.error('بيانات غير كافية لتحديث التفاعل:', { messageId, reaction });
      return;
    }
    
    // التعامل مع الاستدعاء القديم (messageId, reaction) - حيث reaction هو كائن
    // هذا للحفاظ على التوافق مع الكود القديم الذي يستخدم الدالة بالشكل القديم
    if (typeof reaction === 'object' && !externalId && !senderId && !senderName) {
      replaceExisting = true; // الشكل القديم كان يستبدل المحتوى دائماً
    }
    
    // البحث عن الرسالة باستخدام المعرف الداخلي أو الخارجي
    let messageElem;
    
    if (messageId) {
      messageElem = document.querySelector(`.message[data-message-id="${messageId}"]`);
    }
    
    if (!messageElem && externalId) {
      messageElem = document.querySelector(`.message[data-external-id="${externalId}"]`);
    }
    
    // محاولة البحث باستخدام messageId كمعرف خارجي إذا لم يتم العثور على الرسالة
    if (!messageElem) {
      messageElem = document.querySelector(`.message[data-external-id="${messageId}"]`);
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
    
    // تحديد نوع التفاعل (نص أو كائن)
    let emoji, sender;
    
    if (typeof reaction === 'string') {
      // إذا كان التفاعل نصاً، فهو الإيموجي مباشرة
      emoji = reaction;
      sender = senderName || senderId || 'مستخدم';
    } else {
      // إذا كان التفاعل كائناً، استخرج الإيموجي والمرسل منه
      emoji = reaction.emoji || '👍';
      sender = reaction.sender || 'غير معروف';
    }
    
    // تحديث واجهة المستخدم بناءً على الوضع المطلوب
    if (replaceExisting) {
      // استبدال جميع التفاعلات الموجودة بتفاعل واحد
      reactionsContainer.innerHTML = `
        <div class="reaction-item" title="${sender}">
          ${emoji}
        </div>
      `;
    } else {
      // إضافة تفاعل جديد إلى التفاعلات الموجودة
      const reactionElem = document.createElement('span');
      reactionElem.className = 'reaction-emoji';
      reactionElem.title = `تفاعل من ${sender}`;
      reactionElem.textContent = emoji;
      
      // إضافة التفاعل إلى الحاوية
      reactionsContainer.appendChild(reactionElem);
    }
    
    // تحديث سمات الرسالة لتسجيل التفاعل
    messageElem.setAttribute('data-has-reaction', 'true');
    
    if (window.debugMode) console.log('تم تحديث التفاعل في واجهة المستخدم:', { messageId, emoji });
  };
  
  /**
   * دالة مساعدة للحفاظ على التوافق مع الكود القديم
   * تستخدم الدالة الموحدة لتحديث التفاعلات
   */
  window.updateReactionInUI = function(messageId, externalId, emoji, senderId, senderName) {
    // استدعاء الدالة الموحدة مع وضع الإضافة (عدم استبدال التفاعلات الموجودة)
    window.updateMessageReaction(messageId, emoji, externalId, senderId, senderName, false);
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
      
      // الحصول على محتوى الرسالة المختصر للعرض
      const messageContent = window.getShortMessageText(messageElem);
      
      replyIndicator.innerHTML = `
        <div>
          <i class="fas fa-reply me-1"></i>
          <small>رد على: ${messageContent}</small>
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
      const messageContent = window.getShortMessageText(messageElem);
      replyIndicator.querySelector('small').innerHTML = `رد على: ${messageContent}`;
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
    // التحقق من صحة المعلمات
    if (!messageId || !newStatus) {
      if (window.debugMode) console.warn('updateMessageStatus: معلمات غير صالحة', { messageId, newStatus });
      return;
    }
    
    try {
      // البحث أولاً عن الرسالة حسب المعرف الخارجي (الذي يأتي من واتساب)
      let messageElem = document.querySelector(`.message[data-external-id="${messageId}"]`);
      
      // إذا لم يتم العثور على الرسالة بالمعرف الخارجي، حاول البحث بمعرف الرسالة في قاعدة البيانات
      if (!messageElem) {
        messageElem = document.querySelector(`.message[data-message-id="${messageId}"]`);
      }
      
      // إذا لم يتم العثور على الرسالة بأي من المعرفين
      if (!messageElem) {
        if (window.debugMode) console.warn(`updateMessageStatus: لم يتم العثور على الرسالة بالمعرف ${messageId}`);
        return;
      }
      
      // تحديث السمة
      messageElem.setAttribute('data-status', newStatus);
      
      // تحديث أيقونة الحالة
      const statusIcon = messageElem.querySelector('.message-status i');
      if (!statusIcon) {
        if (window.debugMode) console.warn(`updateMessageStatus: لم يتم العثور على أيقونة الحالة للرسالة ${messageId}`);
        
        // محاولة إنشاء عنصر أيقونة الحالة إذا لم يكن موجوداً
        const statusContainer = messageElem.querySelector('.message-status');
        if (statusContainer) {
          const newStatusIcon = document.createElement('i');
          newStatusIcon.className = getStatusIconClass(newStatus);
          newStatusIcon.title = getStatusTitle(newStatus);
          statusContainer.appendChild(newStatusIcon);
        }
        
        return;
      }
      
      // إزالة جميع الأصناف
      statusIcon.className = getStatusIconClass(newStatus);
      statusIcon.title = getStatusTitle(newStatus);
    } catch (error) {
      console.error('خطأ في تحديث حالة الرسالة:', error);
    }
  };

  /**
   * دالة مساعدة للحصول على صنف أيقونة الحالة
   * @param {string} status - حالة الرسالة
   * @returns {string} - صنف الأيقونة
   */
  function getStatusIconClass(status) {
    switch (status) {
      case 'sending':
        return 'fas fa-clock text-secondary';
      case 'sent':
        return 'fas fa-check text-silver';
      case 'delivered':
        return 'fas fa-check-double text-silver';
      case 'read':
        return 'fas fa-check-double text-primary';
      case 'failed':
        return 'fas fa-exclamation-triangle text-danger';
      default:
        return 'fas fa-info-circle text-secondary';
    }
  }

  /**
   * دالة مساعدة للحصول على عنوان أيقونة الحالة
   * @param {string} status - حالة الرسالة
   * @returns {string} - عنوان الأيقونة
   */
  function getStatusTitle(status) {
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
  }
  
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
    
    // استخدام خاصية dataset لتخزين حالة تهيئة مستمعات الأحداث
    // هذا يسمح لنا بمعرفة ما إذا كانت العناصر قد تمت تهيئتها بالفعل
    if (messageElem.dataset.eventsInitialized === 'true') {
      return; // تم تهيئة مستمعات الأحداث بالفعل، لا داعي للتكرار
    }
    
    // زر الرد
    const replyButton = messageElem.querySelector('.reply-btn');
    if (replyButton) {
      // إزالة أي مستمعات سابقة عن طريق استخدام نمط تفويض الأحداث
      replyButton.replaceWith(replyButton.cloneNode(true));
      
      // الحصول على المرجع الجديد بعد الاستبدال
      const newReplyButton = messageElem.querySelector('.reply-btn');
      
      // إضافة مستمع جديد
      newReplyButton.addEventListener('click', function replyHandler(event) {
        const messageId = messageElem.getAttribute('data-message-id');
        const externalId = messageElem.getAttribute('data-external-id');
        window.showReplyForm(messageId, externalId, messageElem);
      });
    }
    
    // زر التفاعل
    const reactionButton = messageElem.querySelector('.reaction-btn');
    if (reactionButton) {
      // إزالة أي مستمعات سابقة عن طريق استخدام نمط تفويض الأحداث
      reactionButton.replaceWith(reactionButton.cloneNode(true));
      
      // الحصول على المرجع الجديد بعد الاستبدال
      const newReactionButton = messageElem.querySelector('.reaction-btn');
      
      // إضافة مستمع جديد
      newReactionButton.addEventListener('click', function reactionHandler(event) {
        const messageId = messageElem.getAttribute('data-message-id');
        const externalId = messageElem.getAttribute('data-external-id');
        window.showReactionPicker(messageId, externalId, event.target);
      });
    }
    
    // تحديث حالة تهيئة مستمعات الأحداث
    messageElem.dataset.eventsInitialized = 'true';
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
    // التحقق من صحة المعلمات
    if (!messageId || !newStatus) {
      if (window.debugMode) console.warn('updateMessageStatus: معلمات غير صالحة', { messageId, newStatus });
      return;
    }
    
    try {
      // البحث أولاً عن الرسالة حسب المعرف الخارجي (الذي يأتي من واتساب)
      let messageElem = document.querySelector(`.message[data-external-id="${messageId}"]`);
      
      // إذا لم يتم العثور على الرسالة بالمعرف الخارجي، حاول البحث بمعرف الرسالة في قاعدة البيانات
      if (!messageElem) {
        messageElem = document.querySelector(`.message[data-message-id="${messageId}"]`);
      }
      
      // إذا لم يتم العثور على الرسالة بأي من المعرفين
      if (!messageElem) {
        if (window.debugMode) console.warn(`updateMessageStatus: لم يتم العثور على الرسالة بالمعرف ${messageId}`);
        return;
      }
      
      // تحديث السمة
      messageElem.setAttribute('data-status', newStatus);
      
      // تحديث أيقونة الحالة
      const statusIcon = messageElem.querySelector('.message-status i');
      if (!statusIcon) {
        if (window.debugMode) console.warn(`updateMessageStatus: لم يتم العثور على أيقونة الحالة للرسالة ${messageId}`);
        
        // محاولة إنشاء عنصر أيقونة الحالة إذا لم يكن موجوداً
        const statusContainer = messageElem.querySelector('.message-status');
        if (statusContainer) {
          const newStatusIcon = document.createElement('i');
          newStatusIcon.className = getStatusIconClass(newStatus);
          newStatusIcon.title = getStatusTitle(newStatus);
          statusContainer.appendChild(newStatusIcon);
        }
        
        return;
      }
      
      // إزالة جميع الأصناف
      statusIcon.className = getStatusIconClass(newStatus);
      statusIcon.title = getStatusTitle(newStatus);
    } catch (error) {
      console.error('خطأ في تحديث حالة الرسالة:', error);
    }
  };

  /**
   * دالة مساعدة للحصول على صنف أيقونة الحالة
   * @param {string} status - حالة الرسالة
   * @returns {string} - صنف الأيقونة
   */
  function getStatusIconClass(status) {
    switch (status) {
      case 'sending':
        return 'fas fa-clock text-secondary';
      case 'sent':
        return 'fas fa-check text-silver';
      case 'delivered':
        return 'fas fa-check-double text-silver';
      case 'read':
        return 'fas fa-check-double text-primary';
      case 'failed':
        return 'fas fa-exclamation-triangle text-danger';
      default:
        return 'fas fa-info-circle text-secondary';
    }
  }

  /**
   * دالة مساعدة للحصول على عنوان أيقونة الحالة
   * @param {string} status - حالة الرسالة
   * @returns {string} - عنوان الأيقونة
   */
  function getStatusTitle(status) {
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
  }
  
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
    
    // استخدام خاصية dataset لتخزين حالة تهيئة مستمعات الأحداث
    // هذا يسمح لنا بمعرفة ما إذا كانت العناصر قد تمت تهيئتها بالفعل
    if (messageElem.dataset.eventsInitialized === 'true') {
      return; // تم تهيئة مستمعات الأحداث بالفعل، لا داعي للتكرار
    }
    
    // زر الرد
    const replyButton = messageElem.querySelector('.reply-btn');
    if (replyButton) {
      // إزالة أي مستمعات سابقة عن طريق استخدام نمط تفويض الأحداث
      replyButton.replaceWith(replyButton.cloneNode(true));
      
      // الحصول على المرجع الجديد بعد الاستبدال
      const newReplyButton = messageElem.querySelector('.reply-btn');
      
      // إضافة مستمع جديد
      newReplyButton.addEventListener('click', function replyHandler(event) {
        const messageId = messageElem.getAttribute('data-message-id');
        const externalId = messageElem.getAttribute('data-external-id');
        window.showReplyForm(messageId, externalId, messageElem);
      });
    }
    
    // زر التفاعل
    const reactionButton = messageElem.querySelector('.reaction-btn');
    if (reactionButton) {
      // إزالة أي مستمعات سابقة عن طريق استخدام نمط تفويض الأحداث
      reactionButton.replaceWith(reactionButton.cloneNode(true));
      
      // الحصول على المرجع الجديد بعد الاستبدال
      const newReactionButton = messageElem.querySelector('.reaction-btn');
      
      // إضافة مستمع جديد
      newReactionButton.addEventListener('click', function reactionHandler(event) {
        const messageId = messageElem.getAttribute('data-message-id');
        const externalId = messageElem.getAttribute('data-external-id');
        window.showReactionPicker(messageId, externalId, event.target);
      });
    }
    
    // تحديث حالة تهيئة مستمعات الأحداث
    messageElem.dataset.eventsInitialized = 'true';
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
    try {
      // الحصول على العناصر المطلوبة
      const fileInput = document.getElementById('mediaFile');
      const filePreview = document.getElementById('filePreview');
      const selectedFileName = document.getElementById('selectedFileName');
      const fileTypeIcon = document.getElementById('fileTypeIcon');
      const uploadMediaType = document.getElementById('uploadMediaType');
      
      // التحقق من وجود العناصر المطلوبة
      if (!fileInput) {
        console.error('handleFileSelection: لم يتم العثور على عنصر mediaFile');
        return;
      }
      
      // التحقق من وجود ملف محدد
      if (!fileInput.files || fileInput.files.length === 0) {
        return;
      }
      
      const file = fileInput.files[0];
      
      // عرض اسم الملف إذا كان العنصر موجوداً
      if (selectedFileName) {
        selectedFileName.textContent = file.name;
      }
      
      // تحديد نوع الوسائط
      let mediaType = 'document';
      let iconClass = 'fa-file';
      
      // تحديد نوع الوسائط والأيقونة بناءً على نوع الملف
      if (file.type.startsWith('image/')) {
        mediaType = 'image';
        iconClass = 'fa-image';
      } else if (file.type.startsWith('video/')) {
        mediaType = 'video';
        iconClass = 'fa-video';
      } else if (file.type.startsWith('audio/')) {
        mediaType = 'audio';
        iconClass = 'fa-music';
      } else if (file.type.includes('pdf')) {
        iconClass = 'fa-file-pdf';
      } else if (file.type.includes('word') || file.type.includes('document')) {
        iconClass = 'fa-file-word';
      } else if (file.type.includes('excel') || file.type.includes('sheet')) {
        iconClass = 'fa-file-excel';
      } else if (file.type.includes('powerpoint') || file.type.includes('presentation')) {
        iconClass = 'fa-file-powerpoint';
      }
      
      // تعيين الأيقونة إذا كان العنصر موجوداً
      if (fileTypeIcon) {
        fileTypeIcon.className = `fas ${iconClass} me-2`;
      }
      
      // تحديث نوع الوسائط إذا كان تلقائيًا وكان العنصر موجوداً
      if (uploadMediaType && uploadMediaType.value === 'auto') {
        uploadMediaType.value = mediaType;
      }
      
      // إظهار معاينة الملف إذا كان العنصر موجوداً
      if (filePreview) {
        filePreview.style.display = 'block';
      }
    } catch (error) {
      console.error('خطأ في معالجة اختيار الملف:', error);
    }
  }

  /**
   * دالة لتحميل الوسائط إلى الخادم
   */
  window.uploadMedia = async function() {
    try {
      // الحصول على العناصر المطلوبة
      const fileInput = document.getElementById('mediaFile');
      const uploadMediaType = document.getElementById('uploadMediaType');
      const uploadConversationId = document.getElementById('uploadConversationId');
      const uploadBtn = document.getElementById('uploadMediaBtn');
      const progressElement = document.querySelector('.upload-progress');
      
      // التحقق من وجود العناصر المطلوبة
      if (!fileInput) {
        console.error('uploadMedia: لم يتم العثور على عنصر mediaFile');
        return;
      }
      
      if (!uploadMediaType) {
        console.error('uploadMedia: لم يتم العثور على عنصر uploadMediaType');
        return;
      }
      
      if (!uploadConversationId) {
        console.error('uploadMedia: لم يتم العثور على عنصر uploadConversationId');
        return;
      }
      
      if (!progressElement) {
        console.error('uploadMedia: لم يتم العثور على عنصر progressElement');
        return;
      }
      
      const mediaType = uploadMediaType.value;
      const conversationId = uploadConversationId.value;
      const progressBar = progressElement.querySelector('.progress-bar');
      
      if (!progressBar) {
        console.error('uploadMedia: لم يتم العثور على عنصر progressBar');
        return;
      }
      
      // التحقق من اختيار ملف أو وجود تسجيل صوتي
      if ((!fileInput.files || fileInput.files.length === 0) && !window.recordedAudioData) {
        window.showToast && window.showToast('يرجى اختيار ملف للتحميل أو تسجيل صوت', 'warning');
        return;
      }
      
      // استخدام الدالة المساعدة لإدارة حالة واجهة المستخدم
      await window.withUIState(
        async () => {
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
            
            // استخدام الدالة الجديدة لتحميل الملف
            const response = await window.httpClient.uploadFile(
              '/whatsapp/media/upload', 
              formData, 
              (percentComplete) => {
                // تحديث شريط التقدم
                if (progressBar) {
                  progressBar.style.width = percentComplete + '%';
                  progressBar.textContent = percentComplete + '%';
                  progressBar.setAttribute('aria-valuenow', percentComplete);
                }
              }
            );
            
            if (response.success) {
              // إخفاء النموذج
              const mediaUploadModal = document.getElementById('mediaUploadModal');
              if (mediaUploadModal) {
                const modal = bootstrap.Modal.getInstance(mediaUploadModal);
                if (modal) modal.hide();
              }
              
              // عرض معاينة الملف المرفق
              const mediaPreview = document.getElementById('mediaPreview');
              const mediaFileName = document.getElementById('mediaFileName');
              const mediaId = document.getElementById('mediaId');
              const mediaTypeElem = document.getElementById('mediaType');
              
              if (mediaPreview) mediaPreview.style.display = 'block';
              if (mediaFileName) mediaFileName.textContent = response.media.fileName || 'تسجيل صوتي';
              if (mediaId) mediaId.value = response.media._id;
              if (mediaTypeElem) mediaTypeElem.value = response.media.mediaType;
              
              // تنظيف نموذج التحميل
              if (typeof resetAudioRecorder === 'function') {
                resetAudioRecorder();
              }
              
              return response;
            } else {
              throw new Error(response.error || 'حدث خطأ أثناء تحميل التسجيل الصوتي');
            }
          }
          
          // تحميل ملف عادي
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
              'text/csv'
            ]
          };
          
          // التحقق من نوع الملف
          let actualMediaType = mediaType;
          if (mediaType === 'auto') {
            // تحديد نوع الوسائط تلقائياً بناءً على نوع الملف
            if (file.type.startsWith('image/')) {
              actualMediaType = 'image';
            } else if (file.type.startsWith('video/')) {
              actualMediaType = 'video';
            } else if (file.type.startsWith('audio/')) {
              actualMediaType = 'audio';
            } else {
              actualMediaType = 'document';
            }
          }
          
          // التحقق من دعم نوع الملف في واتساب
          if (supportedTypes[actualMediaType] && !supportedTypes[actualMediaType].includes(file.type)) {
            throw new Error(`نوع الملف ${file.type} غير مدعوم في واتساب لنوع الوسائط ${actualMediaType}`);
          }
          
          // إنشاء FormData
          const formData = new FormData();
          formData.append('mediaFile', file);
          formData.append('mediaType', actualMediaType);
          formData.append('conversationId', conversationId);
          
          // استخدام الدالة الجديدة لتحميل الملف
          const response = await window.httpClient.uploadFile(
            '/whatsapp/media/upload', 
            formData, 
            (percentComplete) => {
              // تحديث شريط التقدم
              if (progressBar) {
                progressBar.style.width = percentComplete + '%';
                progressBar.textContent = percentComplete + '%';
                progressBar.setAttribute('aria-valuenow', percentComplete);
              }
            }
          );
          
          if (response.success) {
            // إخفاء النموذج
            const mediaUploadModal = document.getElementById('mediaUploadModal');
            if (mediaUploadModal) {
              const modal = bootstrap.Modal.getInstance(mediaUploadModal);
              if (modal) modal.hide();
            }
            
            // عرض معاينة الملف المرفق
            const mediaPreview = document.getElementById('mediaPreview');
            const mediaFileName = document.getElementById('mediaFileName');
            const mediaId = document.getElementById('mediaId');
            const mediaTypeElem = document.getElementById('mediaType');
            
            if (mediaPreview) mediaPreview.style.display = 'block';
            if (mediaFileName) mediaFileName.textContent = response.media.fileName || file.name;
            if (mediaId) mediaId.value = response.media._id;
            if (mediaTypeElem) mediaTypeElem.value = response.media.mediaType;
            
            // تنظيف نموذج التحميل
            if (fileInput) fileInput.value = '';
            
            const filePreview = document.getElementById('filePreview');
            if (filePreview) filePreview.style.display = 'none';
            
            return response;
          } else {
            throw new Error(response.error || 'حدث خطأ أثناء تحميل الملف');
          }
        },
        {
          button: uploadBtn,
          loadingText: '<i class="fas fa-spinner fa-spin"></i> جاري التحميل...',
          progressElement: progressElement,
          successMessage: 'تم تحميل الملف بنجاح',
          errorMessage: 'حدث خطأ أثناء تحميل الملف',
          onError: (error) => {
            console.error('خطأ في تحميل الملف:', error);
          }
        }
      );
    } catch (error) {
      console.error('خطأ في تحميل الوسائط:', error);
      window.showToast && window.showToast('حدث خطأ أثناء تحميل الملف: ' + error.message, 'error');
    }
  };
  
  /**
   * دالة لإزالة ملف مرفق من الرسالة
   */
  window.clearMediaAttachment = function() {
    try {
      const mediaPreview = document.getElementById('mediaPreview');
      const mediaFileName = document.getElementById('mediaFileName');
      const mediaId = document.getElementById('mediaId');
      const mediaType = document.getElementById('mediaType');
      
      // التحقق من وجود العناصر قبل استخدامها
      if (mediaPreview) mediaPreview.style.display = 'none';
      if (mediaFileName) mediaFileName.textContent = '';
      if (mediaId) mediaId.value = '';
      if (mediaType) mediaType.value = '';
    } catch (error) {
      console.error('خطأ في إزالة الملف المرفق:', error);
    }
  };

  /**
   * دالة لفتح معاينة الوسائط
   * @param {string} url - رابط الوسائط
   * @param {string} type - نوع الوسائط
   */
  window.openMediaPreview = function(url, type) {
    try {
      // التحقق من صحة المعلمات
      if (!url) {
        console.error('openMediaPreview: مطلوب عنوان URL للوسائط');
        return;
      }
      
      if (!type) {
        // محاولة استنتاج النوع من URL إذا لم يتم تحديده
        if (url.match(/\.(jpeg|jpg|gif|png)$/i)) {
          type = 'image';
        } else if (url.match(/\.(mp4|webm|ogg)$/i)) {
          type = 'video';
        } else if (url.match(/\.(mp3|wav|ogg|m4a)$/i)) {
          type = 'audio';
        } else {
          type = 'document';
        }
      }
      
      // تفعيل النموذج
      const mediaModal = document.getElementById('mediaPreviewModal');
      if (!mediaModal) {
        console.error('openMediaPreview: لم يتم العثور على عنصر mediaPreviewModal');
        return;
      }
      
      const mediaContent = document.getElementById('mediaPreviewContent');
      const downloadButton = document.getElementById('downloadMediaBtn');
      
      if (!mediaContent) {
        console.error('openMediaPreview: لم يتم العثور على عنصر mediaPreviewContent');
        return;
      }
      
      // تنظيف المحتوى الحالي
      mediaContent.innerHTML = '';
      
      // تعيين الرابط للتحميل إذا كان زر التحميل موجوداً
      if (downloadButton) {
        downloadButton.href = url;
      }
      
      // إنشاء العنصر المناسب حسب النوع
      if (type === 'image') {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'img-fluid';
        img.alt = 'صورة';
        img.onerror = function() {
          img.src = '/images/broken-image.png'; // استبدال بصورة بديلة في حالة الخطأ
          img.alt = 'صورة غير متوفرة';
        };
        mediaContent.appendChild(img);
      } else if (type === 'video') {
        const video = document.createElement('video');
        video.controls = true;
        video.className = 'w-100';
        video.onerror = function() {
          mediaContent.innerHTML = '<div class="alert alert-warning">لا يمكن تشغيل الفيديو</div>';
        };
        
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
        audio.onerror = function() {
          mediaContent.innerHTML = '<div class="alert alert-warning">لا يمكن تشغيل الملف الصوتي</div>';
        };
        
        const source = document.createElement('source');
        source.src = url;
        source.type = 'audio/ogg';
        
        audio.appendChild(source);
        mediaContent.appendChild(audio);
      } else {
        // في حالة المستندات أو الأنواع غير المعروفة، عرض رابط للتحميل
        const docLink = document.createElement('div');
        docLink.className = 'text-center p-4';
        docLink.innerHTML = `
          <i class="fas fa-file-alt fa-4x mb-3 text-primary"></i>
          <p>لا يمكن معاينة هذا النوع من الملفات مباشرة.</p>
          <a href="${url}" class="btn btn-primary" target="_blank">فتح الملف</a>
        `;
        mediaContent.appendChild(docLink);
      }
      
      // تفعيل النموذج (تحتاج إلى Bootstrap JS)
      try {
        const bsModal = new bootstrap.Modal(mediaModal);
        bsModal.show();
      } catch (modalError) {
        console.error('خطأ في تفعيل النموذج:', modalError);
        // محاولة بديلة لعرض النموذج
        mediaModal.style.display = 'block';
        mediaModal.classList.add('show');
      }
    } catch (error) {
      console.error('خطأ في فتح معاينة الوسائط:', error);
    }
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

/**
 * دالة مساعدة للحصول على نص مختصر من عنصر الرسالة أو نص
 * @param {HTMLElement|string} messageElemOrText - عنصر الرسالة أو النص المراد اختصاره
 * @param {number} maxLength - الحد الأقصى لطول النص (افتراضياً 50 حرف)
 * @param {boolean} addEllipsis - إضافة علامة الحذف (...) إذا تم اختصار النص (افتراضياً true)
 * @returns {string} - النص المختصر
 */
window.getShortMessageText = function(messageElemOrText, maxLength = 50, addEllipsis = true) {
  let text = '';
  
  // التحقق من نوع المدخلات
  if (typeof messageElemOrText === 'string') {
    // إذا كان المدخل نصاً
    text = messageElemOrText.trim();
  } else if (messageElemOrText instanceof HTMLElement) {
    // إذا كان المدخل عنصر HTML
    const messageBubble = messageElemOrText.querySelector('.message-bubble');
    if (messageBubble) {
      text = messageBubble.textContent.trim();
    } else {
      text = messageElemOrText.textContent.trim();
    }
  } else if (messageElemOrText && messageElemOrText.querySelector) {
    // إذا كان المدخل كائناً يحتوي على دالة querySelector (مثل عناصر DOM)
    const messageBubble = messageElemOrText.querySelector('.message-bubble');
    if (messageBubble) {
      text = messageBubble.textContent.trim();
    } else {
      text = '';
    }
  } else {
    // إذا كان المدخل غير صالح
    return '';
  }
  
  // اختصار النص إذا تجاوز الحد الأقصى
  if (text.length > maxLength) {
    text = text.substring(0, maxLength);
    
    // إضافة علامة الحذف إذا كان مطلوباً
    if (addEllipsis) {
      text += '...';
    }
  }
  
  return text;
};

/**
 * دالة لمسح الملف المحدد
 */
window.clearSelectedFile = function() {
  try {
    const fileInput = document.getElementById('mediaFile');
    const filePreview = document.getElementById('filePreview');
    
    // التحقق من وجود العناصر قبل استخدامها
    if (fileInput) fileInput.value = '';
    if (filePreview) filePreview.style.display = 'none';
  } catch (error) {
    console.error('خطأ في مسح الملف المحدد:', error);
  }
};

/**
 * دالة لتحميل الوسائط إلى الخادم
 */
window.uploadMedia = async function() {
  const form = document.getElementById('mediaUploadForm');
  const fileInput = document.getElementById('mediaFile');
  const mediaType = document.getElementById('uploadMediaType').value;
  const conversationId = document.getElementById('uploadConversationId').value;
  const uploadBtn = document.getElementById('uploadMediaBtn');
  const progressElement = document.querySelector('.upload-progress');
  const progressBar = progressElement.querySelector('.progress-bar');
  
  // التحقق من اختيار ملف أو وجود تسجيل صوتي
  if ((!fileInput.files || fileInput.files.length === 0) && !window.recordedAudioData) {
    window.showToast && window.showToast('يرجى اختيار ملف للتحميل أو تسجيل صوت', 'warning');
    return;
  }
  
  // استخدام الدالة المساعدة لإدارة حالة واجهة المستخدم
  await window.withUIState(
    async () => {
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
        
        // استخدام الدالة الجديدة لتحميل الملف
        const response = await window.httpClient.uploadFile(
          '/whatsapp/media/upload', 
          formData, 
          (percentComplete) => {
            // تحديث شريط التقدم
            if (progressBar) {
              progressBar.style.width = percentComplete + '%';
              progressBar.textContent = percentComplete + '%';
              progressBar.setAttribute('aria-valuenow', percentComplete);
            }
          }
        );
        
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
          if (typeof resetAudioRecorder === 'function') {
            resetAudioRecorder();
          }
          
          return response;
        } else {
          throw new Error(response.error || 'حدث خطأ أثناء تحميل التسجيل الصوتي');
        }
      }
      
      // تحميل ملف عادي
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
          'text/csv'
        ]
      };
      
      // التحقق من نوع الملف
      let actualMediaType = mediaType;
      if (mediaType === 'auto') {
        // تحديد نوع الوسائط تلقائياً بناءً على نوع الملف
        if (file.type.startsWith('image/')) {
          actualMediaType = 'image';
        } else if (file.type.startsWith('video/')) {
          actualMediaType = 'video';
        } else if (file.type.startsWith('audio/')) {
          actualMediaType = 'audio';
        } else {
          actualMediaType = 'document';
        }
      }
      
      // التحقق من دعم نوع الملف في واتساب
      if (supportedTypes[actualMediaType] && !supportedTypes[actualMediaType].includes(file.type)) {
        throw new Error(`نوع الملف ${file.type} غير مدعوم في واتساب لنوع الوسائط ${actualMediaType}`);
      }
      
      // إنشاء FormData
      const formData = new FormData();
      formData.append('mediaFile', file);
      formData.append('mediaType', actualMediaType);
      formData.append('conversationId', conversationId);
      
      // استخدام الدالة الجديدة لتحميل الملف
      const response = await window.httpClient.uploadFile(
        '/whatsapp/media/upload', 
        formData, 
        (percentComplete) => {
          // تحديث شريط التقدم
          if (progressBar) {
            progressBar.style.width = percentComplete + '%';
            progressBar.textContent = percentComplete + '%';
            progressBar.setAttribute('aria-valuenow', percentComplete);
          }
        }
      );
      
      if (response.success) {
        // إخفاء النموذج
        const modal = bootstrap.Modal.getInstance(document.getElementById('mediaUploadModal'));
        modal.hide();
        
        // عرض معاينة الملف المرفق
        document.getElementById('mediaPreview').style.display = 'block';
        document.getElementById('mediaFileName').textContent = response.media.fileName || file.name;
        document.getElementById('mediaId').value = response.media._id;
        document.getElementById('mediaType').value = response.media.mediaType;
        
        // تنظيف نموذج التحميل
        document.getElementById('mediaFile').value = '';
        document.getElementById('filePreview').style.display = 'none';
        
        return response;
      } else {
        throw new Error(response.error || 'حدث خطأ أثناء تحميل الملف');
      }
    },
    {
      button: uploadBtn,
      loadingText: '<i class="fas fa-spinner fa-spin"></i> جاري التحميل...',
      progressElement: progressElement,
      successMessage: 'تم تحميل الملف بنجاح',
      errorMessage: 'حدث خطأ أثناء تحميل الملف',
      onError: (error) => {
        console.error('خطأ في تحميل الملف:', error);
      }
    }
  );
};
