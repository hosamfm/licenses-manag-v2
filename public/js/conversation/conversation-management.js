/**
 * وحدة إدارة المحادثات - Conversation Management Module
 * تحتوي على الدوال المتعلقة بإدارة المحادثات (مثل فتح/إغلاق المحادثة، وتحديث معلومات الرأس)
 */

(function(window) {
  /**
   * دالة لإغلاق المحادثة
   * @param {string} conversationId - معرف المحادثة
   * @param {string} reason - سبب الإغلاق (اختياري)
   * @param {string} note - ملاحظة حول الإغلاق (اختياري)
   * @returns {Promise} - وعد يحتوي على نتيجة العملية
   */
  window.closeConversation = async function(conversationId, reason, note) {
    if (!conversationId) return Promise.reject('معرف المحادثة مطلوب');

    // إذا لم يتم تمرير سبب الإغلاق، نعرض نافذة استفسار
    if (!reason && !note) {
      try {
        const { value: formValues } = await Swal.fire({
          title: 'إغلاق المحادثة',
          html: `
            <div class="mb-3">
              <label for="closeReason" class="form-label">سبب الإغلاق:</label>
              <select id="closeReason" class="form-select">
                <option value="">-- اختر سبباً --</option>
                <option value="resolved">تم حل المشكلة</option>
                <option value="spam">رسائل غير مرغوب فيها</option>
                <option value="duplicate">محادثة مكررة</option>
                <option value="test">اختبار</option>
                <option value="other">سبب آخر</option>
              </select>
            </div>
            <div class="mb-3">
              <label for="closeNote" class="form-label">ملاحظة (اختياري):</label>
              <textarea id="closeNote" class="form-control" rows="3" placeholder="أدخل ملاحظة حول إغلاق المحادثة..."></textarea>
            </div>
          `,
          focusConfirm: false,
          showCancelButton: true,
          confirmButtonText: 'إغلاق المحادثة',
          cancelButtonText: 'إلغاء',
          preConfirm: () => {
            const reason = document.getElementById('closeReason').value;
            const note = document.getElementById('closeNote').value;
            
            if (!reason) {
              Swal.showValidationMessage('الرجاء اختيار سبب للإغلاق');
              return false;
            }
            
            return { reason, note };
          }
        });
        
        // إذا تم إلغاء النافذة
        if (!formValues) return Promise.reject('تم إلغاء إغلاق المحادثة');
        
        // استخدام القيم المدخلة
        reason = formValues.reason;
        note = formValues.note;
        
      } catch (error) {
        console.error('خطأ في نافذة طلب سبب الإغلاق:', error);
        return Promise.reject('حدث خطأ في نافذة طلب سبب الإغلاق');
      }
    }
    
    // عرض مؤشر تحميل
    const loadingToast = Swal.fire({
      title: 'جاري إغلاق المحادثة...',
      text: 'يرجى الانتظار',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    try {
      // إرسال طلب إغلاق المحادثة إلى الخادم - تصحيح المسار ليتوافق مع reopenConversation
      const response = await fetch(`/crm/conversations/${conversationId}/close`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          reason: reason,
          note: note
        })
      });
      
      const data = await response.json();
      
      // إغلاق مؤشر التحميل
      loadingToast.close();
      
      if (!response.ok || !data.success) {
        const errorMsg = data.error || 'حدث خطأ في إغلاق المحادثة';
        console.error('خطأ في إغلاق المحادثة:', errorMsg);
        
        // إظهار رسالة الخطأ
        Swal.fire({
          icon: 'error',
          title: 'خطأ في إغلاق المحادثة',
          text: errorMsg,
          timer: 3000
        });
        
        return Promise.reject(errorMsg);
      }
      
      // إظهار رسالة النجاح
      Swal.fire({
        icon: 'success',
        title: 'تم إغلاق المحادثة بنجاح',
        timer: 2000,
        showConfirmButton: false
      });
      
      return data;
      
    } catch (error) {
      // إغلاق مؤشر التحميل في حالة الخطأ
      loadingToast.close();
      
      console.error('خطأ في إغلاق المحادثة:', error);
      
      // إظهار رسالة الخطأ
      Swal.fire({
        icon: 'error',
        title: 'خطأ في إغلاق المحادثة',
        text: error.message || 'حدث خطأ غير متوقع',
        timer: 3000
      });
      
      return Promise.reject(error);
    }
  };

  /**
   * دالة لإعادة فتح المحادثة
   * @param {string} conversationId - معرف المحادثة
   * @returns {Promise} - وعد يحتوي على نتيجة العملية
   */
  window.reopenConversation = async function(conversationId) {
    if (!conversationId) return Promise.reject('معرف المحادثة مطلوب');

    // إعادة تعريف مؤقت لمنع النافذة الافتراضية
    const originalConfirm = window.confirm;
    window.confirm = () => true; // افتراض أن التأكيد تم بواسطة SweetAlert2

    const fetchCallImpl = window.fetchCallImpl || window.fetch;

    try {
      const response = await fetchCallImpl(`/crm/conversations/${conversationId}/reopen`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `فشل إعادة فتح المحادثة: ${response.statusText}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'فشل إعادة فتح المحادثة');
      }

      // تحديث الواجهة باستخدام الوظيفة الجديدة
      if (typeof window.updateConversationHeader === 'function') {
        window.updateConversationHeader({
          _id: conversationId,
          status: 'open'
        });
      }
      
      return result;
    } catch (error) {
      console.error('Error reopening conversation:', error);
      return Promise.reject(error.message || 'حدث خطأ غير متوقع');
    } finally {
      // استعادة الدالة الأصلية
      window.confirm = originalConfirm;
    }
  };

  /**
   * تحديث معلومات رأس تفاصيل المحادثة
   * @param {Object} data - بيانات التحديث
   */
  window.updateConversationHeader = function(data) {
    if (!data || (!data._id && !data.conversationId)) return;
    
    // تحديث حالة المحادثة
    const statusBadge = document.querySelector('.conversation-status-badge');
    if (statusBadge) {
      if (data.status === 'closed') {
        statusBadge.className = 'badge bg-secondary ms-2 conversation-status-badge';
        statusBadge.innerHTML = '<i class="fas fa-lock me-1"></i> مغلقة';
        
        // إظهار رسالة المحادثة المغلقة
        const closedAlert = document.querySelector('.alert-info');
        if (!closedAlert) {
          const alertContainer = document.createElement('div');
          alertContainer.className = 'alert alert-info m-3 text-center';
          alertContainer.innerHTML = `
            <i class="fas fa-info-circle me-1"></i> هذه المحادثة مغلقة.
            <br>
            <small>سيتم إعادة فتحها تلقائيًا إذا أرسل العميل رسالة جديدة.</small>
          `;
          
          const messageContainer = document.getElementById('messageContainer');
          if (messageContainer) {
            messageContainer.insertAdjacentElement('afterbegin', alertContainer);
          }
        }
        
        // إخفاء نموذج الرد وإظهار رسالة المحادثة المغلقة
        const replyForm = document.getElementById('replyForm');
        const closedMessage = document.querySelector('.alert-secondary');
        
        if (replyForm) {
          replyForm.style.display = 'none';
        }
        
        if (!closedMessage) {
          const messageElem = document.createElement('div');
          messageElem.className = 'alert alert-secondary mt-3';
          messageElem.innerHTML = '<i class="fas fa-lock me-1"></i> المحادثة مغلقة، لا يمكن الرد.';
          
          // إضافة بعد حاوية الرسائل
          const conversationContainer = document.querySelector('.card.shadow-sm.border-0');
          if (conversationContainer) {
            conversationContainer.insertAdjacentElement('afterend', messageElem);
          }
        }
        
        // تبديل حالة الأزرار
        const closeBtn = document.querySelector('.close-conversation-btn');
        const reopenBtn = document.querySelector('.reopen-conversation-btn');
        
        if (closeBtn) {
          closeBtn.style.display = 'none';
        }
        
        if (reopenBtn) {
          reopenBtn.style.display = 'inline-block';
        } else {
          // إنشاء زر إعادة الفتح إذا لم يكن موجوداً
          const actionsBtns = document.querySelector('.conversation-actions');
          if (actionsBtns) {
            const reopenButton = document.createElement('button');
            reopenButton.className = 'btn btn-success reopen-conversation-btn';
            reopenButton.setAttribute('data-conversation-id', data._id || data.conversationId);
            reopenButton.setAttribute('title', 'إعادة فتح المحادثة');
            reopenButton.innerHTML = '<i class="fas fa-lock-open me-1"></i> إعادة فتح';
            
            actionsBtns.innerHTML = '';
            actionsBtns.appendChild(reopenButton);
            
            // إضافة معالج حدث
            reopenButton.addEventListener('click', function() {
              const conversationId = this.getAttribute('data-conversation-id');
              if (window.reopenConversation) {
                window.reopenConversation(conversationId);
              }
            });
          }
        }
      } else {
        // المحادثة مفتوحة
        if (data.status === 'assigned' || data.assignee) {
          statusBadge.className = 'badge bg-info ms-2 conversation-status-badge';
          statusBadge.innerHTML = '<i class="fas fa-user-check me-1"></i> مسندة';
        } else {
          statusBadge.className = 'badge bg-success ms-2 conversation-status-badge';
          statusBadge.innerHTML = '<i class="fas fa-door-open me-1"></i> مفتوحة';
        }
        
        // إزالة رسالة المحادثة المغلقة
        const closedAlert = document.querySelector('.alert-info');
        if (closedAlert) {
          closedAlert.remove();
        }
        
        // إظهار نموذج الرد وإزالة رسالة المحادثة المغلقة
        const replyForm = document.getElementById('replyForm');
        const closedMessage = document.querySelector('.alert-secondary');
        
        if (replyForm) {
          replyForm.style.display = 'block';
        }
        
        if (closedMessage) {
          closedMessage.remove();
        }
        
        // تبديل حالة الأزرار
        const closeBtn = document.querySelector('.close-conversation-btn');
        const reopenBtn = document.querySelector('.reopen-conversation-btn');
        
        if (reopenBtn) {
          reopenBtn.style.display = 'none';
        }
        
        if (closeBtn) {
          closeBtn.style.display = 'inline-block';
        } else {
          // إنشاء زر الإغلاق إذا لم يكن موجوداً
          const actionsBtns = document.querySelector('.conversation-actions');
          if (actionsBtns) {
            const closeButton = document.createElement('button');
            closeButton.className = 'btn btn-danger close-conversation-btn';
            closeButton.setAttribute('data-conversation-id', data._id || data.conversationId);
            closeButton.setAttribute('title', 'إغلاق المحادثة');
            closeButton.innerHTML = '<i class="fas fa-lock me-1"></i> إغلاق';
            
            actionsBtns.innerHTML = '';
            actionsBtns.appendChild(closeButton);
            
            // إضافة معالج حدث
            closeButton.addEventListener('click', function() {
              const conversationId = this.getAttribute('data-conversation-id');
              if (window.closeConversation) {
                window.closeConversation(conversationId);
              }
            });
          }
        }
      }
    }
    
    // تحديث معلومات المسؤول
    const assigneeInfo = document.getElementById('assigneeInfo');
    const assignToMeBtn = document.getElementById('assignToMeBtn');
    
    if (assigneeInfo) {
      if (data.assignee) {
        // عرض اسم المستخدم المعين
        const assigneeName = data.assignee.full_name || data.assignee.username || 'مستخدم';
        assigneeInfo.className = 'badge bg-info';
        assigneeInfo.innerHTML = `<i class="fas fa-user-check me-1"></i> ${assigneeName}`;
        
        // إخفاء زر "تعيين لي" إذا كان المستخدم الحالي هو المعين
        if (assignToMeBtn) {
          if (data.assignee._id === window.currentUserId) {
            assignToMeBtn.style.display = 'none';
          } else {
            assignToMeBtn.style.display = 'inline-block';
          }
        }
      } else {
        // إظهار "غير معين" في حالة إلغاء التعيين
        assigneeInfo.className = 'badge bg-warning text-dark';
        assigneeInfo.innerHTML = '<i class="fas fa-exclamation-circle me-1"></i> غير معين';
        
        // إظهار زر "تعيين لي"
        if (assignToMeBtn) {
          assignToMeBtn.style.display = 'inline-block';
        }
      }
    }
  };
  
})(window); 