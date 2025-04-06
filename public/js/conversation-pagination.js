/**
 * وظائف تحميل رسائل المحادثة القديمة بشكل تصاعدي
 * يدعم التحميل التلقائي عند الاقتراب من أعلى المحادثة وتحميل المزيد بشكل تدريجي
 */

(function() {
  // متغيرات عامة
  const state = {
    loading: false,
    currentPage: 1,
    totalPages: 0,
    loadedAllMessages: false,
    batchSizes: [10, 20, 40, 80], // أحجام الدفعات المتزايدة
    batchIndex: 0, // مؤشر الدفعة الحالية
    scrollThreshold: 150, // المسافة بالبكسل من الأعلى التي سنبدأ عندها تحميل المزيد
    conversationId: null, // معرف المحادثة الحالية
    messageContainerId: 'messageContainer', // معرف حاوية الرسائل
    loadButtonId: 'loadMoreMessagesBtn' // معرف زر التحميل
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
    
    // إضافة مستمع لأحداث التمرير
    setupScrollListener();
    
    // إعداد زر تحميل المزيد من الرسائل
    setupLoadMoreButton();
    
    // تحديث حالة زر التحميل
    updateLoadMoreButton();
    
    console.log('تم تهيئة نظام تحميل الرسائل القديمة:', {
      conversationId: state.conversationId,
      currentPage: state.currentPage,
      totalPages: state.totalPages,
      loadedAllMessages: state.loadedAllMessages
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
      const nextBatchSize = getCurrentBatchSize();
      loadMoreBtn.innerHTML = state.loading ? 
        '<i class="fas fa-spinner fa-spin"></i> جاري التحميل...' : 
        `<i class="fas fa-chevron-up"></i> تحميل ${nextBatchSize} رسائل أقدم`;
      
      // تعطيل/تفعيل الزر
      loadMoreBtn.disabled = state.loading;
    }
  }

  /**
   * الحصول على حجم الدفعة الحالية
   * @returns {number} حجم الدفعة
   */
  function getCurrentBatchSize() {
    return state.batchSizes[state.batchIndex];
  }

  /**
   * زيادة حجم الدفعة للدفعة التالية
   */
  function incrementBatchSize() {
    if (state.batchIndex < state.batchSizes.length - 1) {
      state.batchIndex++;
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
    
    // الحصول على حجم الدفعة الحالية
    const limit = getCurrentBatchSize();
    
    console.log(`تحميل المزيد من الرسائل: الصفحة ${nextPage}، الحجم ${limit}`);
    
    // إرسال طلب AJAX
    fetch(`/crm/conversations/ajax/details/${state.conversationId}?page=${nextPage}&limit=${limit}`, {
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
        console.log('لا توجد رسائل قديمة إضافية للتحميل');
      } else {
        // الحصول على حاوية الرسائل
        const messageContainer = document.getElementById(state.messageContainerId);
        const messageWrapper = messageContainer.querySelector('.message-container-wrapper');
        
        // حفظ ارتفاع المحتوى الحالي للحفاظ على موضع التمرير
        const oldScrollHeight = messageContainer.scrollHeight;
        const oldScrollTop = messageContainer.scrollTop;
        
        // معرفة أول رسالة موجودة حالياً
        const firstExistingMessage = messageWrapper.querySelector('.message');
        
        // إضافة الرسائل الجديدة في بداية القائمة (لأنها أقدم)
        newMessages.forEach(message => {
          // التحقق من عدم وجود الرسالة بالفعل (لتجنب التكرار)
          const messageId = message.getAttribute('data-message-id');
          const existingMessage = messageWrapper.querySelector(`.message[data-message-id="${messageId}"]`);
          if (!existingMessage) {
            // إضافة الرسالة في بداية القائمة (قبل أول رسالة)
            if (firstExistingMessage) {
              messageWrapper.insertBefore(message, firstExistingMessage);
            } else {
              messageWrapper.appendChild(message);
            }
          }
        });
        
        // تحديث موضع التمرير للحفاظ على الموضع النسبي
        const newScrollHeight = messageContainer.scrollHeight;
        messageContainer.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
        
        // تحديث حالة الصفحة
        state.currentPage = nextPage;
        
        // زيادة حجم الدفعة للمرة القادمة
        incrementBatchSize();
        
        console.log(`تم تحميل ${newMessages.length} رسائل جديدة، الصفحة الحالية: ${state.currentPage}`);
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

  // إضافة الوظائف إلى window
  window.conversationPagination = {
    initialize,
    loadMoreMessages
  };
})(); 