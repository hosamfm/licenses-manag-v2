/**
 * وظائف تحميل رسائل المحادثة القديمة بشكل تصاعدي
 * يدعم التحميل التلقائي عند الاقتراب من أعلى المحادثة وتحميل ثابت بحجم 20 رسالة
 */

(function() {
  // متغيرات عامة
  const state = {
    loading: false,
    currentPage: 1,
    totalPages: 0,
    loadedAllMessages: false,
    fixedBatchSize: 20, // حجم دفعة ثابت: 20 رسالة في كل مرة
    scrollThreshold: 150, // المسافة بالبكسل من الأعلى التي سنبدأ عندها تحميل المزيد
    conversationId: null, // معرف المحادثة الحالية
    messageContainerId: 'messageContainer', // معرف حاوية الرسائل
    loadButtonId: 'loadMoreMessagesBtn', // معرف زر التحميل
    messageIds: new Set() // مجموعة لتتبع معرفات الرسائل المحملة لتجنب التكرار
  };

  /**
   * تهيئة نظام تحميل الرسائل
   * @param {Object} options خيارات التهيئة
   */
  function initialize(options = {}) {
    // دمج الخيارات المقدمة مع الافتراضية
    Object.assign(state, options);
    
    // إعادة تعيين حالة التحميل
    state.loading = false;
    state.messageIds = new Set(); // إعادة تعيين مجموعة المعرفات
    
    // الحصول على معرف المحادثة الحالية من DOM
    if (!state.conversationId) {
      const conversationIdEl = document.getElementById('conversationId');
      if (conversationIdEl) {
        state.conversationId = conversationIdEl.value;
      }
    }
    
    // الحصول على حاوية الرسائل
    const messageContainer = document.getElementById(state.messageContainerId);
    if (!messageContainer) {
      console.warn('لم يتم العثور على حاوية الرسائل');
      return;
    }
    
    // الحصول على معلومات الصفحات من الـ data-attributes
    const paginationInfo = messageContainer.dataset;
    if (paginationInfo) {
      state.currentPage = parseInt(paginationInfo.currentPage) || 1;
      state.totalPages = parseInt(paginationInfo.totalPages) || 0;
      
      // تحديد ما إذا كنا قد حملنا جميع الرسائل بالفعل
      state.loadedAllMessages = state.currentPage >= state.totalPages;
    }
    
    // جمع معرفات الرسائل الحالية في المجموعة
    collectExistingMessageIds();
    
    // إضافة مستمع لأحداث التمرير
    setupScrollListener();
    
    // إعداد زر تحميل المزيد من الرسائل
    setupLoadMoreButton();
    
    // تحديث حالة زر التحميل
    updateLoadMoreButton();
  }

  /**
   * جمع معرفات الرسائل الموجودة حالياً
   */
  function collectExistingMessageIds() {
    const messageContainer = document.getElementById(state.messageContainerId);
    if (!messageContainer) return;
    
    // جمع جميع معرفات الرسائل الحالية
    const existingMessages = messageContainer.querySelectorAll('.message[data-message-id]');
    existingMessages.forEach(message => {
      const messageId = message.getAttribute('data-message-id');
      if (messageId) {
        state.messageIds.add(messageId);
      }
    });
  }

  /**
   * إعداد مستمع أحداث التمرير
   */
  function setupScrollListener() {
    const messageContainer = document.getElementById(state.messageContainerId);
    if (!messageContainer) return;
    
    messageContainer.addEventListener('scroll', function() {
      // إذا وصلنا بالقرب من أعلى الحاوية، نقوم بتحميل المزيد من الرسائل
      if (messageContainer.scrollTop <= state.scrollThreshold && !state.loading && !state.loadedAllMessages) {
        loadMoreMessages();
      }
    });
  }

  /**
   * إعداد زر تحميل المزيد من الرسائل
   */
  function setupLoadMoreButton() {
    const loadMoreBtn = document.getElementById(state.loadButtonId);
    if (!loadMoreBtn) return;
    
    loadMoreBtn.addEventListener('click', function() {
      if (!state.loading && !state.loadedAllMessages) {
        loadMoreMessages();
      }
    });
  }

  /**
   * تحديث حالة زر تحميل المزيد من الرسائل
   */
  function updateLoadMoreButton() {
    const loadMoreBtn = document.getElementById(state.loadButtonId);
    if (!loadMoreBtn) return;
    
    if (state.loadedAllMessages) {
      loadMoreBtn.classList.add('d-none');
    } else {
      loadMoreBtn.classList.remove('d-none');
      
      // تحديث نص الزر
      loadMoreBtn.innerHTML = state.loading ? 
        '<i class="fas fa-spinner fa-spin"></i> جاري التحميل...' : 
        `<i class="fas fa-chevron-up"></i> تحميل ${state.fixedBatchSize} رسائل أقدم`;
      
      // تعطيل/تفعيل الزر
      loadMoreBtn.disabled = state.loading;
    }
  }

  /**
   * تحميل المزيد من الرسائل
   */
  function loadMoreMessages() {
    if (state.loading || state.loadedAllMessages || !state.conversationId) return;
    
    // تعيين حالة التحميل
    state.loading = true;
    updateLoadMoreButton();
    
    // حساب الصفحة التالية
    const nextPage = state.currentPage + 1;
    
    // إرسال طلب AJAX
    fetch(`/crm/conversations/ajax/details/${state.conversationId}?page=${nextPage}&limit=${state.fixedBatchSize}`, {
      method: 'GET',
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    })
    .then(response => {
      if (!response.ok) throw new Error('HTTP error ' + response.status);
      return response.text();
    })
    .then(html => {
      // إنشاء عنصر مؤقت لاستخراج الرسائل الجديدة
      const tempElement = document.createElement('div');
      tempElement.innerHTML = html;
      
      // استخراج الرسائل من الاستجابة
      const newMessages = tempElement.querySelectorAll('.message');
      
      if (newMessages.length === 0) {
        // لا توجد رسائل جديدة
        state.loadedAllMessages = true;
      } else {
        // الحصول على حاوية الرسائل
        const messageContainer = document.getElementById(state.messageContainerId);
        const messageWrapper = messageContainer.querySelector('.message-container-wrapper');
        
        // حفظ ارتفاع المحتوى الحالي للحفاظ على موضع التمرير
        const oldScrollHeight = messageContainer.scrollHeight;
        const oldScrollTop = messageContainer.scrollTop;
        
        // معرفة أول رسالة موجودة حالياً
        const firstExistingMessage = messageWrapper.querySelector('.message');
        
        // إنشاء مجموعة لتجميع الرسائل الجديدة بشكل مؤقت
        const messagesToAdd = [];
        
        // تجميع الرسائل الجديدة (غير المكررة)
        newMessages.forEach(message => {
          // التحقق من عدم وجود الرسالة بالفعل (لتجنب التكرار)
          const messageId = message.getAttribute('data-message-id');
          if (messageId && !state.messageIds.has(messageId)) {
            // التأكد من أن عنصر التاريخ يحتوي على سمة data-timestamp
            const timeElement = message.querySelector('.message-time');
            if (timeElement && !timeElement.hasAttribute('data-timestamp')) {
              // محاولة استخراج التاريخ من title
              const title = timeElement.getAttribute('title');
              if (title) {
                try {
                  const timestamp = new Date(title).getTime();
                  timeElement.setAttribute('data-timestamp', timestamp);
                } catch(e) {}
              }
              // محاولة استخراج التاريخ من تاريخ العنصر
              const dateAttr = timeElement.getAttribute('data-date');
              if (dateAttr && !timeElement.hasAttribute('data-timestamp')) {
                try {
                  const timestamp = new Date(dateAttr).getTime();
                  timeElement.setAttribute('data-timestamp', timestamp);
                } catch(e) {}
              }
            }
            
            messagesToAdd.push({
              element: message,
              timestamp: getMessageTimestamp(message),
              messageId: messageId
            });
            
            // إضافة المعرف إلى المجموعة
            state.messageIds.add(messageId);
          }
        });
        
        // فرز الرسائل الجديدة بتاريخ الرسالة (من الأقدم للأحدث)
        messagesToAdd.sort((a, b) => a.timestamp - b.timestamp);
        
        // إضافة الرسائل مرتبة
        if (firstExistingMessage) {
          // إضافة الرسائل المرتبة قبل الرسائل الحالية
          messagesToAdd.forEach(message => {
            messageWrapper.insertBefore(message.element, firstExistingMessage);
          });
        } else {
          // إضافة الرسائل للحاوية الفارغة
          messagesToAdd.forEach(message => {
            messageWrapper.appendChild(message.element);
          });
        }
        
        // تحديث موضع التمرير للحفاظ على الموضع النسبي
        const newScrollHeight = messageContainer.scrollHeight;
        messageContainer.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
        
        // تحديث حالة الصفحة
        state.currentPage = nextPage;
      }
      
      // إضافة مستمعات الأحداث للرسائل الجديدة
      if (typeof window.setupMessageActions === 'function') {
        newMessages.forEach(message => {
          window.setupMessageActions(message);
        });
      }
      
      // إضافة الرسائل الجديدة إلى مراقب الرؤية
      if (typeof window.setupMessageReadObserver === 'function') {
        window.setupMessageReadObserver();
      }
      
      // تفعيل أي مشغلات صوتية أو فيديو
      if (typeof window.setupAudioPlayers === 'function') {
        window.setupAudioPlayers();
      }
      
      // إطلاق حدث مخصص للإشارة إلى اكتمال تحميل الرسائل الجديدة
      const event = new CustomEvent('messages-loaded', {
        detail: {
          page: nextPage,
          count: newMessages.length
        }
      });
      window.dispatchEvent(event);
      
      // تنسيق التواريخ بعد تحميل الرسائل مباشرة
      if (typeof window.formatAllMessageTimes === 'function') {
        setTimeout(window.formatAllMessageTimes, 200);
      }
      
      // تعيين حالة التحميل
      state.loading = false;
      updateLoadMoreButton();
    })
    .catch(error => {
      console.error('خطأ أثناء تحميل المزيد من الرسائل:', error);
      
      // تعيين حالة التحميل
      state.loading = false;
      updateLoadMoreButton();
    });
  }

  /**
   * استخراج الطابع الزمني من عنصر الرسالة
   * استخدام الدالة الموحدة من date-formatter.js إذا كانت متاحة
   * @param {Element} messageElement عنصر الرسالة
   * @returns {number} الطابع الزمني كرقم للمقارنة
   */
  function getMessageTimestamp(messageElement) {
    // استخدام الدالة الموحدة إذا كانت متاحة
    if (typeof window.getMessageTimestamp === 'function') {
      return window.getMessageTimestamp(messageElement);
    }
    
    // البحث عن عنصر وقت الرسالة
    const timeElement = messageElement.querySelector('.message-time');
    if (timeElement && timeElement.title) {
      // محاولة استخراج التاريخ من العنوان (title) الذي يحتوي على التاريخ الكامل
      try {
        return new Date(timeElement.title).getTime();
      } catch (e) {
        console.warn('خطأ في تحليل تاريخ الرسالة:', e);
      }
    }
    
    // محاولة استخدام سمة data-timestamp إذا كانت متوفرة
    if (timeElement && timeElement.hasAttribute('data-timestamp')) {
      return parseInt(timeElement.getAttribute('data-timestamp'), 10);
    }
    
    // في حالة الفشل، استخدام تاريخ المعالجة الحالي (أقل دقة)
    return Date.now();
  }

  // إضافة الوظائف إلى window
  window.conversationPagination = {
    initialize,
    loadMoreMessages
  };
})(); 