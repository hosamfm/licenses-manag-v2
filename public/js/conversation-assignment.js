/**
 * وحدة مساعدة لتعيين المحادثات - Conversation Assignment Utilities Module
 * هذا الملف يحتوي على دوال خاصة بتعيين المحادثات في نظام خدمة العملاء
 */

(function(window) {
  // === وظائف تعيين المحادثة ===
   
  /**
   * تعيين معالجي أحداث أزرار التعيين
   */
  window.setupAssignmentButtons = function() {
    // زر التعيين الشخصي
    const assignToMeBtn = document.getElementById('assignToMeBtn');
    
    if (assignToMeBtn) {
      // إزالة معالجات الأحداث القديمة لمنع التكرار
      const oldClickHandler = assignToMeBtn.onclick;
      if (oldClickHandler) {
        assignToMeBtn.removeEventListener('click', oldClickHandler);
      }
      
      // طريقة بديلة باستخدام السمة data-event-attached
      if (assignToMeBtn.getAttribute('data-event-attached') === 'true') {
        const clone = assignToMeBtn.cloneNode(true);
        assignToMeBtn.parentNode.replaceChild(clone, assignToMeBtn);
        assignToMeBtn = clone;
      }
      
      // إضافة معالج جديد
      assignToMeBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const conversationId = this.getAttribute('data-conversation-id');
        if (conversationId) {
          window.assignConversationToMe(conversationId);
        }
      });
      
      // وضع علامة على الزر لتجنب إضافة معالج مرتين
      assignToMeBtn.setAttribute('data-event-attached', 'true');
    }
    
    // زر تغيير التعيين
    const changeAssignmentBtn = document.getElementById('changeAssignmentBtn');
    
    if (changeAssignmentBtn) {
      // إزالة معالجات الأحداث القديمة لمنع التكرار
      const oldClickHandler = changeAssignmentBtn.onclick;
      if (oldClickHandler) {
        changeAssignmentBtn.removeEventListener('click', oldClickHandler);
      }
      
      // طريقة بديلة باستخدام السمة data-event-attached
      if (changeAssignmentBtn.getAttribute('data-event-attached') === 'true') {
        const clone = changeAssignmentBtn.cloneNode(true);
        changeAssignmentBtn.parentNode.replaceChild(clone, changeAssignmentBtn);
        changeAssignmentBtn = clone;
      }
      
      // إضافة معالج جديد
      changeAssignmentBtn.addEventListener('click', function(e) {
        e.preventDefault();
        const conversationId = this.getAttribute('data-conversation-id');
        if (conversationId) {
          window.showAssignmentModal(conversationId);
        }
      });
      
      // وضع علامة على الزر لتجنب إضافة معالج مرتين
      changeAssignmentBtn.setAttribute('data-event-attached', 'true');
    }
  };
  
  /**
   * تعيين المحادثة للمستخدم الحالي
   */
  window.assignConversationToMe = function(conversationId) {
    if (!conversationId) return;
    
    // عرض مؤشر تحميل
    Swal.fire({
      title: 'جاري التعيين...',
      html: 'يتم تعيين المحادثة لك...',
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    // إرسال طلب التعيين
    fetch(`/crm/conversations/${conversationId}/api/assign-to-me`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        Swal.fire({
          title: 'تم!',
          html: 'تم تعيين المحادثة لك بنجاح',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
        
        // تحديث الواجهة باستخدام الوظيفة الجديدة
        if (typeof window.updateConversationHeader === 'function') {
          window.updateConversationHeader({
            _id: conversationId,
            assignee: {
              _id: window.currentUserId,
              username: window.currentUsername,
              full_name: data.conversation.assignee ? data.conversation.assignee.full_name : window.currentUsername
            },
            status: 'assigned'
          });
        } else {
          // الكود القديم احتياطيًا
          // تحديث الواجهة - استخدام بيانات المستخدم من الاستجابة
          const assigneeName = data.conversation.assignee ? 
            (data.conversation.assignee.full_name || data.conversation.assignee.username) : 
            window.currentUsername;
          
          document.getElementById('assigneeInfo').innerHTML = `<i class="fas fa-user-check me-1"></i> ${assigneeName}`;
          
          // إخفاء زر "تعيين لي" بعد التعيين
          if (document.getElementById('assignToMeBtn')) {
            document.getElementById('assignToMeBtn').style.display = 'none';
          }
          
          // تحديث حالة المحادثة
          const statusBadge = document.querySelector('.conversation-status-badge');
          if (statusBadge) {
            statusBadge.className = 'badge bg-info ms-2 conversation-status-badge';
            statusBadge.innerHTML = '<i class="fas fa-user-check me-1"></i> مسندة';
          }
        }
      } else {
        Swal.fire({
          title: 'خطأ!',
          html: data.error || 'حدث خطأ أثناء تعيين المحادثة',
          icon: 'error'
        });
      }
    })
    .catch(error => {
      console.error('خطأ في تعيين المحادثة:', error);
      Swal.fire({
        title: 'خطأ!',
        html: 'حدث خطأ أثناء الاتصال بالخادم',
        icon: 'error'
      });
    });
  };
  
  /**
   * عرض نافذة اختيار المستخدم للتعيين
   */
  window.showAssignmentModal = function(conversationId) {
    if (!conversationId) return;
    
    // عرض مؤشر تحميل مبدئي
    Swal.fire({
      title: 'جاري التحميل...',
      html: 'يتم تحميل قائمة المستخدمين...',
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    // جلب قائمة المستخدمين المخولين
    fetch('/crm/conversations/api/handlers', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
    .then(response => response.json())
    .then(data => {
      if (!data.success || !data.handlers || !data.handlers.length) {
        Swal.fire({
          title: 'خطأ!',
          html: 'لا يوجد مستخدمين مخولين للتعامل مع المحادثات',
          icon: 'error'
        });
        return;
      }
      
      // بناء خيارات المستخدمين
      const options = data.handlers.map(user => 
        `<option value="${user._id}">${user.full_name || user.username}</option>`
      ).join('');
      
      // عرض نافذة اختيار المستخدم
      Swal.fire({
        title: 'تعيين المحادثة',
        html: `
          <div class="mb-3">
            <label for="assigneeSelect" class="form-label">اختر المستخدم المسؤول عن المحادثة:</label>
            <select id="assigneeSelect" class="form-select">
              <option value="">-- إلغاء التعيين --</option>
              ${options}
            </select>
          </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'تعيين',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#3085d6',
        focusConfirm: false,
        preConfirm: () => {
          return document.getElementById('assigneeSelect').value;
        }
      }).then(result => {
        if (result.isConfirmed) {
          // إرسال طلب التعيين
          assignConversation(conversationId, result.value);
        }
      });
    })
    .catch(error => {
      console.error('خطأ في جلب قائمة المستخدمين:', error);
      Swal.fire({
        title: 'خطأ!',
        html: 'حدث خطأ أثناء جلب قائمة المستخدمين',
        icon: 'error'
      });
    });
  };
  
  /**
   * تعيين المحادثة لمستخدم معين
   */
  function assignConversation(conversationId, userId) {
    // عرض مؤشر تحميل
    Swal.fire({
      title: 'جاري التعيين...',
      html: 'يتم تعيين المحادثة...',
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    // إرسال طلب التعيين
    fetch(`/crm/conversations/${conversationId}/api/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({ userId })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        Swal.fire({
          title: 'تم!',
          html: data.message || 'تم تعيين المحادثة بنجاح',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false
        });
        
        // تحديث التعيين في الواجهة
        if (userId) {
          // استخدام الوظيفة الجديدة لتحديث رأس المحادثة إذا كانت متوفرة
          if (typeof window.updateConversationHeader === 'function' && data.conversation) {
            window.updateConversationHeader({
              _id: conversationId,
              assignee: data.conversation.assignee,
              status: 'assigned'
            });
          } else {
            // استخدام البيانات من استجابة الخادم إذا كانت متوفرة
            let assigneeName = 'غير معروف';
            
            if (data.conversation && data.conversation.assignee) {
              assigneeName = data.conversation.assignee.full_name || 
                            data.conversation.assignee.username || 
                            'غير معروف';
            } else {
              // الطريقة القديمة كاحتياطي
              const selectElem = document.getElementById('assigneeSelect');
              const selectedOption = selectElem ? selectElem.options[selectElem.selectedIndex] : null;
              assigneeName = selectedOption ? selectedOption.text : 'غير معروف';
            }
            
            document.getElementById('assigneeInfo').innerHTML = `<i class="fas fa-user-check me-1"></i> ${assigneeName}`;
            
            // إخفاء زر "تعيين لي"
            if (document.getElementById('assignToMeBtn')) {
              document.getElementById('assignToMeBtn').style.display = 'none';
            }
            
            // تحديث حالة المحادثة إلى "مسندة"
            const statusBadge = document.querySelector('.conversation-status-badge');
            if (statusBadge) {
              statusBadge.className = 'badge bg-info ms-2 conversation-status-badge';
              statusBadge.innerHTML = '<i class="fas fa-user-check me-1"></i> مسندة';
            }
          }
        } else {
          // إلغاء التعيين - استخدام الوظيفة الجديدة إذا كانت متوفرة
          if (typeof window.updateConversationHeader === 'function') {
            window.updateConversationHeader({
              _id: conversationId,
              assignee: null,
              status: 'open'
            });
          } else {
            // تحديث المعلومات إلى "غير معين"
            document.getElementById('assigneeInfo').innerHTML = '<i class="fas fa-exclamation-circle me-1"></i> غير معين';
            
            // إظهار زر "تعيين لي"
            if (document.getElementById('assignToMeBtn')) {
              document.getElementById('assignToMeBtn').style.display = 'inline-block';
            }
            
            // تحديث حالة المحادثة إلى "مفتوحة"
            const statusBadge = document.querySelector('.conversation-status-badge');
            if (statusBadge) {
              statusBadge.className = 'badge bg-success ms-2 conversation-status-badge';
              statusBadge.innerHTML = '<i class="fas fa-door-open me-1"></i> مفتوحة';
            }
          }
        }
      } else {
        Swal.fire({
          title: 'خطأ!',
          html: data.error || 'حدث خطأ أثناء تعيين المحادثة',
          icon: 'error'
        });
      }
    })
    .catch(error => {
      console.error('خطأ في تعيين المحادثة:', error);
      Swal.fire({
        title: 'خطأ!',
        html: 'حدث خطأ أثناء الاتصال بالخادم',
        icon: 'error'
      });
    });
  }

  // === مستمعات الأحداث للسوكت ===

  /**
   * إعداد معالجات أحداث المرتبطة بتعيين المحادثات
   * ملاحظة: تم نقل وظيفة مراقبة المحادثات إلى setupSocketListeners الموحدة
   */
  window.setupAssignmentListeners = function(socket) {
    console.log('تم إهمال هذه الوظيفة: setupAssignmentListeners. استخدم setupSocketListeners بدلاً منها');
    // هذه الدالة تم دمجها مع setupSocketListeners في ملف conversations-page.js
  };

})(window); 