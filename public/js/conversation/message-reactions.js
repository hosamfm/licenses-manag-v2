/**
 * وحدة تفاعلات الرسائل - Message Reactions Module
 * تحتوي على الدوال المتعلقة بتفاعلات الرسائل (مثل الإيموجي والإعجابات)
 */

(function(window) {
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
    const picker = reactionPicker;
    
    // الحصول على اتجاه المستند
    const isRTL = document.dir === 'rtl' || getComputedStyle(document.body).direction === 'rtl';
    
    // تقدير أبعاد المنتقي (قد تحتاج إلى ضبطها بناءً على تنسيقك)
    const pickerWidth = 180; 
    const pickerHeight = 40;
    
    // تحديد الموضع الأفقي
    let left, right;
    if (isRTL) {
      // في RTL، نضعه إلى يسار الزر
      right = window.innerWidth - rect.left - (rect.width / 2) + (pickerWidth / 2);
      // التأكد من أنه لا يتجاوز الحدود
      if (right < 10) {
        right = 10;
      }
      if (right + pickerWidth > window.innerWidth) {
        right = window.innerWidth - pickerWidth - 10;
      }
      picker.style.right = `${right}px`;
      picker.style.left = 'auto';
    } else {
      // في LTR، نضعه إلى يمين الزر
      left = rect.right + (rect.width / 2) - (pickerWidth / 2);
      // التأكد من أنه لا يتجاوز الحدود
      if (left < 10) {
        left = 10;
      }
      if (left + pickerWidth > window.innerWidth) {
        left = window.innerWidth - pickerWidth - 10;
      }
      picker.style.left = `${left}px`;
      picker.style.right = 'auto';
    }
    
    // تحديد الموضع الرأسي (فوق الزر)
    const spaceAbove = rect.top;
    let topPosition = rect.top - pickerHeight - 10 + window.scrollY;
    
    // التأكد من أنه لا يتجاوز الحد الأعلى للشاشة
    if (topPosition < window.scrollY + 10) {
      topPosition = rect.bottom + 10 + window.scrollY; // عرضه تحت الزر إذا لم يكن هناك مساحة كافية في الأعلى
    }
    picker.style.top = `${topPosition}px`;
  };
  
  /**
   * دالة لإرسال تفاعل
   * @param {string} messageId - معرف الرسالة
   * @param {string} emoji - رمز التفاعل
   * @param {string} externalId - المعرف الخارجي للرسالة (اختياري)
   */
  window.sendReaction = function(messageId, emoji, externalId) {
    if (!messageId || !emoji) {
      console.error('خطأ: messageId وemoji مطلوبان لإرسال التفاعل');
      return;
    }
    
    const conversationId = document.getElementById('replyFormConversationId')?.value || 
                           document.getElementById('conversationId')?.value;
    if (!conversationId) {
      console.error('خطأ: لم يتم العثور على معرف المحادثة');
      return;
    }
    
    const senderId = window.currentUserId;
    const senderName = window.currentUsername || 'مستخدم';
    
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
      window.updateReactionInUI(messageId, externalId, emoji, senderId, senderName);
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

})(window); 