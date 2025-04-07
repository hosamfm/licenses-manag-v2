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