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
   * تحديث حالة التعيين في قائمة المحادثات
   * @param {Object} data - بيانات تحديث المحادثة
   */
  function updateConversationListAssignment(data) {
    if (!data || (!data._id && !data.conversationId)) return;
    
    const conversationId = data._id || data.conversationId;
    const conversationItem = document.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
    
    if (!conversationItem) return;
    
    // تحديث حالة المحادثة (مفتوحة/مغلقة)
    if (data.status === 'closed') {
      // تحديث حالة المحادثة إلى مغلقة
      conversationItem.setAttribute('data-status', 'closed');
      
      // تحديث مؤشر الحالة
      const statusIndicator = conversationItem.querySelector('.status-indicator');
      if (statusIndicator) {
        statusIndicator.className = 'status-indicator closed';
        statusIndicator.title = 'محادثة مغلقة';
        statusIndicator.innerHTML = '<i class="fas fa-lock"></i>';
      }
    } 
    else if (data.status === 'open') {
      // تحديث حالة المحادثة إلى مفتوحة
      conversationItem.setAttribute('data-status', 'open');
      
      // تحديث مؤشر الحالة
      const statusIndicator = conversationItem.querySelector('.status-indicator');
      if (statusIndicator) {
        statusIndicator.className = 'status-indicator open';
        statusIndicator.title = 'محادثة مفتوحة';
        statusIndicator.innerHTML = '<i class="fas fa-door-open"></i>';
      }
    }
    
    // تحديث بيانات التعيين
    if (data.assignee) {
      // تحديث حالة التعيين في عنصر المحادثة
      conversationItem.setAttribute('data-status', 'assigned');
      
      // تحديث مؤشر الحالة
      const statusIndicator = conversationItem.querySelector('.status-indicator');
      if (statusIndicator) {
        statusIndicator.className = 'status-indicator assigned';
        statusIndicator.title = 'محادثة مسندة';
        statusIndicator.innerHTML = '<i class="fas fa-user-check"></i>';
      }
      
      // إضافة اسم المسؤول - التحقق من وجود عنصر .conversation-assignee
      let assigneeElem = conversationItem.querySelector('.conversation-assignee');
      
      // إذا لم يكن عنصر المسؤول موجودًا، أنشئه
      if (!assigneeElem) {
        // ابحث عن المكان المناسب لإضافته
        const conversationMeta = conversationItem.querySelector('.conversation-meta');
        const conversationInfo = conversationItem.querySelector('.conversation-info');
        
        if (conversationMeta) {
          // إنشاء العنصر
          assigneeElem = document.createElement('div');
          assigneeElem.className = 'conversation-assignee small text-primary mb-1';
          
          // إضافته إلى بداية conversationMeta
          conversationMeta.insertBefore(assigneeElem, conversationMeta.firstChild);
        } else if (conversationInfo) {
          // إنشاء العنصر
          assigneeElem = document.createElement('div');
          assigneeElem.className = 'conversation-assignee small text-primary';
          
          // إضافته إلى نهاية conversationInfo
          conversationInfo.appendChild(assigneeElem);
        }
      }
      
      // تحديث محتوى عنصر المسؤول إذا وجد
      if (assigneeElem) {
        assigneeElem.innerHTML = `<i class="fas fa-user-check me-1"></i> ${data.assignee.full_name || data.assignee.username || 'مستخدم'}`;
        assigneeElem.style.display = 'block';
      }
      
      // إضافة فئة "assigned"
      conversationItem.classList.add('assigned');
      
      // إذا كان المستخدم الحالي هو المعين، أضف فئة "assigned-to-me"
      if (data.assignee._id === window.currentUserId) {
        conversationItem.classList.add('assigned-to-me');
      } else {
        conversationItem.classList.remove('assigned-to-me');
      }
    } else {
      // تحديث حالة المحادثة إلى مفتوحة (إذا لم تكن مغلقة)
      if (data.status !== 'closed') {
        conversationItem.setAttribute('data-status', 'open');
        
        // تحديث مؤشر الحالة
        const statusIndicator = conversationItem.querySelector('.status-indicator');
        if (statusIndicator) {
          statusIndicator.className = 'status-indicator open';
          statusIndicator.title = 'محادثة مفتوحة';
          statusIndicator.innerHTML = '<i class="fas fa-door-open"></i>';
        }
      }
      
      // إزالة معلومات التعيين
      const assigneeElem = conversationItem.querySelector('.conversation-assignee');
      if (assigneeElem) {
        assigneeElem.innerHTML = '';
        assigneeElem.style.display = 'none';
      }
      
      // إزالة فئات التعيين
      conversationItem.classList.remove('assigned', 'assigned-to-me');
    }
    
    // تحريك المحادثة المحدثة إلى أعلى القائمة
    const conversationList = document.getElementById('conversationList');
    if (conversationList && conversationList.firstChild && conversationList.firstChild !== conversationItem) {
      conversationList.insertBefore(conversationItem, conversationList.firstChild);
    }
  }

  /**
   * إعداد معالجات أحداث المرتبطة بتعيين المحادثات
   * @param {Object} socket - كائن اتصال Socket.io
   */
  window.setupAssignmentListeners = function(socket) {
    if (!socket) return;
    
    // الاستماع لأحداث تحديث المحادثة (بما في ذلك التعيين)
    socket.on('conversation-update', function(data) {
      // التأكد من أن التحديث يتعلق بالتعيين
      if (data && data.type === 'assigned') {
        // إذا كانت المحادثة المفتوحة حالياً
        if (window.currentConversationId === data._id || 
            window.currentConversationId === data.conversationId) {
            
          // تحديث عرض المسؤول في الواجهة
          const assigneeInfo = document.getElementById('assigneeInfo');
          const assignToMeBtn = document.getElementById('assignToMeBtn');
          
          if (assigneeInfo) {
            if (data.assignee) {
              // استخدام بيانات المستخدم المعين الكاملة من الإشعار
              const assigneeName = data.assignee.full_name || data.assignee.username || 'مستخدم';
              assigneeInfo.innerHTML = `<i class="fas fa-user-check me-1"></i> ${assigneeName}`;
              
              // إخفاء زر التعيين الشخصي إذا كان المستخدم الحالي هو المعين
              if (assignToMeBtn && data.assignee._id === window.currentUserId) {
                assignToMeBtn.style.display = 'none';
              }
            } else {
              assigneeInfo.innerHTML = '<i class="fas fa-exclamation-circle me-1"></i> غير معين';
              
              // إظهار زر التعيين الشخصي
              if (assignToMeBtn) {
                assignToMeBtn.style.display = 'inline-block';
              }
            }
          }
          
          // تحديث حالة المحادثة في البطاقة الرئيسية
          const statusBadge = document.querySelector('.conversation-status-badge');
          if (statusBadge) {
            if (data.assignee) {
              statusBadge.className = 'badge bg-info ms-2 conversation-status-badge';
              statusBadge.innerHTML = '<i class="fas fa-user-check me-1"></i> مسندة';
            } else {
              statusBadge.className = 'badge bg-success ms-2 conversation-status-badge';
              statusBadge.innerHTML = '<i class="fas fa-door-open me-1"></i> مفتوحة';
            }
          }
        }
        
        // تحديث قائمة المحادثات
        updateConversationListAssignment(data);
      }
    });
    
    // الاستماع لأحداث تحديث قائمة المحادثات (حدث جديد خاص بالقائمة)
    socket.on('conversation-list-update', function(updatedConversation) {
      if (!updatedConversation || !updatedConversation._id) {
        return;
      }
      
      // قم بتحديث عنصر المحادثة في القائمة
      if (typeof window.updateConversationInList === 'function') {
        window.updateConversationInList(updatedConversation);
      } else {
        // استخدم آلية التحديث البديلة للتعيين
        updateConversationListAssignment({
          _id: updatedConversation._id,
          assignee: updatedConversation.assignee,
          status: updatedConversation.status
        });
      }
    });
  };

})(window); 