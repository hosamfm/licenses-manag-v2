/**
 * ملف مساعد لوظائف التعليقات الداخلية في المحادثات
 */

(function() {
  // تأكد من تحميل jQuery
  if (typeof jQuery === 'undefined') {
    console.error('يجب تحميل jQuery أولاً قبل استخدام هذا الملف');
    return;
  }

  // تعريف المتغيرات العالمية
  let replyingToMessage = null;
  let usersList = []; // قائمة المستخدمين للمنشن

  // جلب قائمة المستخدمين الذين يمكن منشنهم
  window.fetchUsersForMention = async function() {
    try {
      const response = await fetch('/api/user/can-access-conversations');
      const data = await response.json();
      if (data.success) {
        usersList = data.users || [];
        return usersList;
      }
    } catch (error) {
      console.error('خطأ في جلب قائمة المستخدمين:', error);
    }
    return [];
  };

  // إضافة تعليق داخلي للمحادثة
  window.addInternalNote = async function(event) {
    event.preventDefault();
    
    const conversationId = document.getElementById('conversationId').value;
    const noteContent = document.getElementById('internalNoteContent').value;
    
    if (!noteContent.trim()) {
      if (window.showToast) {
        window.showToast('لا يمكن إضافة ملاحظة فارغة', 'warning');
      } else {
        alert('لا يمكن إضافة ملاحظة فارغة');
      }
      return;
    }
    
    try {
      // تغيير حالة الزر
      const submitBtn = document.getElementById('submitNoteBtn');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإضافة...';

      // إنشاء معرف مؤقت للملاحظة
      const tempNoteId = 'temp_note_' + Date.now();

      // تتبع الملاحظات المرسلة لمنع التكرار
      if (!window.sentNoteIds) {
        window.sentNoteIds = new Set();
      }
      window.sentNoteIds.add(tempNoteId);

      // إرسال طلب AJAX لإضافة الملاحظة الداخلية
      const response = await fetch(`/crm/conversations/${conversationId}/note`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ noteContent }),
      });

      try {
        // محاولة تحليل البيانات كـ JSON
        const data = await response.json();

        if (data.success) {
          // مسح محتوى النموذج
          document.getElementById('internalNoteContent').value = '';

          // إغلاق النافذة المنبثقة
          $('#internalNoteModal').modal('hide');

          // إظهار رسالة نجاح
          if (window.showToast) {
            window.showToast('تمت إضافة الملاحظة بنجاح', 'success');
          } else {
            alert('تمت إضافة الملاحظة بنجاح');
          }

          // إضافة معرف الملاحظة الحقيقي إلى القائمة لمنع التكرار
          if (data.note && data.note._id) {
            window.sentNoteIds.add(data.note._id);
          }
        } else {
          if (window.showToast) {
            window.showToast(data.error || 'فشل في إضافة الملاحظة', 'error');
          } else {
            alert(data.error || 'فشل في إضافة الملاحظة');
          }
        }
      } catch (parseError) {
        // إذا فشل التحليل كـ JSON، نفحص إذا كانت الاستجابة ناجحة بناءً على حالة الاستجابة
        if (response.status === 200 || response.status === 201) {
          // نفترض نجاح العملية
          console.log('تم إضافة الملاحظة بنجاح (استجابة غير JSON)');

          // مسح محتوى النموذج وإغلاق النافذة
          document.getElementById('internalNoteContent').value = '';
          $('#internalNoteModal').modal('hide');

          // إظهار رسالة نجاح
          if (window.showToast) {
            window.showToast('تمت إضافة الملاحظة بنجاح', 'success');
          } else {
            alert('تمت إضافة الملاحظة بنجاح');
          }
        } else {
          // عرض خطأ عام
          console.error('خطأ في إضافة الملاحظة:', parseError);
          if (window.showToast) {
            window.showToast('حدث خطأ أثناء إضافة الملاحظة', 'error');
          } else {
            alert('حدث خطأ أثناء إضافة الملاحظة');
          }
        }
      }
    } catch (error) {
      console.error('خطأ في إرسال الملاحظة:', error);
      if (window.showToast) {
        window.showToast('حدث خطأ أثناء إرسال الملاحظة', 'error');
      } else {
        alert('حدث خطأ أثناء إرسال الملاحظة');
      }
    } finally {
      // إعادة الزر إلى حالته الطبيعية
      const submitBtn = document.getElementById('submitNoteBtn');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-check me-1"></i> إضافة ملاحظة';
    }
  };

  // إضافة زر التعليق الداخلي إلى واجهة الرسائل
  window.addInternalNoteButton = function() {
    // التحقق من وجود نموذج الرد
    const actionButtons = document.querySelector('.reply-form-actions');
    if (!actionButtons) return;
    
    // التحقق من وجود زر التعليق مسبقاً
    if (actionButtons.querySelector('.internal-note-btn')) return;
    
    // إنشاء زر التعليق الداخلي
    const noteButton = document.createElement('button');
    noteButton.type = 'button';
    noteButton.className = 'btn btn-sm btn-outline-secondary me-2 internal-note-btn';
    noteButton.innerHTML = '<i class="fas fa-sticky-note"></i> ملاحظة داخلية';
    
    // إضافة معالج النقر
    noteButton.onclick = function() {
      // الحصول على معرف المحادثة من النموذج
      const replyForm = document.getElementById('replyForm');
      if (!replyForm) return;
      
      // نستخدم معرف المحادثة من عنوان الطلب
      const conversationId = window.location.pathname.split('/').pop();
      
      // تعيين معرف المحادثة في النافذة المنبثقة
      document.getElementById('conversationId').value = conversationId;
      
      // تحميل قائمة المستخدمين للمنشن
      window.fetchUsersForMention().then(() => {
        // تعيين المنشن تلقائياً للحقل
        window.initializeMentionsInNoteField();
      });

      // فتح النافذة المنبثقة
      const modal = new bootstrap.Modal(document.getElementById('internalNoteModal'));
      modal.show();
    };

    // إدراج الزر قبل زر الإرسال (آخر زر)
    const lastButton = actionButtons.lastElementChild;
    actionButtons.insertBefore(noteButton, lastButton);
  };

  // تهيئة ميزة المنشن في حقل الملاحظة
  window.initializeMentionsInNoteField = function() {
    // التأكد من وجود مكتبة Tribute
    if (typeof Tribute === 'undefined') {
      console.error('يجب تحميل مكتبة Tribute.js لدعم المنشن');
      return;
    }

    // التأكد من وجود المستخدمين
    if (!usersList || usersList.length === 0) {
      console.warn('قائمة المستخدمين فارغة، يتم تحميلها...');
      return;
    }

    // إنشاء كائن المنشن
    window.tributeInstance = new Tribute({
      values: usersList.map(user => ({
        key: user.username,
        value: user.full_name,
        id: user._id
      })),
      trigger: '@',
      menuItemTemplate: function(item) {
        return `<span class="mention-item">${item.original.value} (@${item.original.key})</span>`;
      },
      selectTemplate: function(item) {
        return `@${item.original.key}`;
      },
      noMatchTemplate: function() {
        return '<span style="display:none;"></span>';
      },
      lookup: 'value',
      fillAttr: 'value'
    });

    // إضافة المنشن إلى حقل الملاحظة
    window.tributeInstance.attach(document.getElementById('internalNoteContent'));
  };

  // إضافة زر المنشن للمستخدمين
  window.addMentionButton = function() {
    // إنشاء زر المنشن
    const mentionButton = document.createElement('button');
    mentionButton.type = 'button';
    mentionButton.className = 'btn btn-sm btn-outline-secondary mention-btn';
    mentionButton.innerHTML = '<i class="fas fa-at"></i>';
    mentionButton.title = 'منشن لمستخدم';
    
    // إضافة معالج النقر
    mentionButton.onclick = function() {
      const noteField = document.getElementById('internalNoteContent');
      if (noteField) {
        // إضافة @ في الموقع الحالي للمؤشر
        const cursorPos = noteField.selectionStart;
        const textBefore = noteField.value.substring(0, cursorPos);
        const textAfter = noteField.value.substring(cursorPos);
        noteField.value = textBefore + '@' + textAfter;
        
        // تحريك المؤشر بعد @
        noteField.focus();
        noteField.selectionStart = cursorPos + 1;
        noteField.selectionEnd = cursorPos + 1;
        
        // تشغيل المنشن يدوياً
        const event = new Event('input', { bubbles: true });
        noteField.dispatchEvent(event);
      }
    };
    
    // إضافة إلى النافذة المنبثقة
    const modalFooter = document.querySelector('#internalNoteModal .modal-footer');
    if (modalFooter) {
      // التأكد من عدم وجود الزر مسبقاً
      if (!modalFooter.querySelector('.mention-btn')) {
        const cancelButton = modalFooter.querySelector('button[data-bs-dismiss="modal"]');
        modalFooter.insertBefore(mentionButton, cancelButton);
      }
    }
  };

  // إنشاء نافذة منبثقة للتعليقات الداخلية
  window.initInternalNoteModal = function() {
    // التأكد من عدم وجود النافذة مسبقاً
    if (document.getElementById('internalNoteModal')) {
      return;
    }

    // إنشاء عناصر النافذة المنبثقة
    const modalHtml = `
      <div class="modal fade" id="internalNoteModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">إضافة ملاحظة داخلية</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="إغلاق"></button>
            </div>
            <div class="modal-body">
              <form id="internalNoteForm" onsubmit="window.addInternalNote(event)">
                <input type="hidden" id="conversationId" value="">
                <div class="mb-3">
                  <label for="internalNoteContent" class="form-label">نص الملاحظة</label>
                  <textarea class="form-control" id="internalNoteContent" rows="4" 
                    placeholder="اكتب ملاحظة داخلية للفريق (لن يراها العميل). استخدم @ لمنشن لمستخدم."></textarea>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
              <button type="button" class="btn btn-primary" id="submitNoteBtn" onclick="window.addInternalNote(event)">
                <i class="fas fa-check me-1"></i> إضافة ملاحظة
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // إضافة النافذة إلى الصفحة
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // إضافة ملف CSS لتنسيق المنشن
    const tributeCssLink = document.createElement('link');
    tributeCssLink.rel = 'stylesheet';
    tributeCssLink.href = 'https://cdn.jsdelivr.net/npm/tributejs@5.1.3/dist/tribute.min.css';
    document.head.appendChild(tributeCssLink);

    // التأكد من تحميل مكتبة Tribute.js للمنشن إذا لم تكن موجودة
    if (typeof Tribute === 'undefined') {
      const tributeScript = document.createElement('script');
      tributeScript.src = 'https://cdn.jsdelivr.net/npm/tributejs@5.1.3/dist/tribute.min.js';
      tributeScript.onload = function() {
        // تحميل قائمة المستخدمين بعد تحميل المكتبة
        window.fetchUsersForMention();
        // إضافة زر المنشن بعد تحميل المكتبة
        window.addMentionButton();
      };
      document.body.appendChild(tributeScript);
    } else {
      // إذا كانت المكتبة محملة بالفعل، نضيف زر المنشن مباشرة
      window.fetchUsersForMention();
      window.addMentionButton();
    }

    // إضافة زر التعليق الداخلي
    window.addInternalNoteButton();
  };

  // تهيئة الوظائف عند تحميل المستند
  document.addEventListener('DOMContentLoaded', function() {
    // تهيئة نافذة التعليقات الداخلية
    window.initInternalNoteModal();

    // إضافة مستمع لأحداث التحميل الديناميكي للمحادثة
    document.addEventListener('conversationLoaded', function(e) {
      // إعادة تهيئة النافذة والزر بعد تحميل المحادثة
      window.initInternalNoteModal();
      window.addInternalNoteButton();
    });

    // مراقبة تغييرات DOM لإضافة الزر عند تحميل تفاصيل المحادثة
    const observer = new MutationObserver(function(mutations) {
      mutations.forEach(function(mutation) {
        if (mutation.addedNodes && mutation.addedNodes.length > 0) {
          // البحث عن نموذج الرد في العناصر المضافة
          for (let i = 0; i < mutation.addedNodes.length; i++) {
            const node = mutation.addedNodes[i];
            if (node.id === 'replyForm' || (node.querySelector && node.querySelector('#replyForm'))) {
              // تم العثور على نموذج الرد، أضف زر التعليق
              window.addInternalNoteButton();
              break;
            }
          }
        }
      });
    });

    // بدء مراقبة التغييرات في DOM
    observer.observe(document.body, { childList: true, subtree: true });

    // تنفيذ التهيئة بعد تأخير قصير للتأكد من تحميل جميع العناصر
    setTimeout(function() {
      window.initInternalNoteModal();
      window.addInternalNoteButton();
    }, 1000);
  });
})();
