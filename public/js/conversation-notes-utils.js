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
      // معالجة أي أخطاء أثناء عملية الإرسال
      console.error('خطأ في إرسال الملاحظة:', error);
      if (window.showToast) {
        window.showToast('حدث خطأ أثناء إرسال الملاحظة', 'error');
      } else {
        alert('حدث خطأ أثناء إرسال الملاحظة');
      }
    } finally {
      // إعادة حالة الزر
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-check me-1"></i> إضافة ملاحظة';
    }
  };

  /**
   * إضافة زر التعليق الداخلي إلى واجهة الرسائل
   */
  window.addInternalNoteButton = function() {
    // البحث عن نموذج الرد والتأكد من وجوده
    const replyForm = document.querySelector('form#replyForm');

    if (!replyForm) {
      return;
    }

    // البحث عن مجموعة الأزرار
    let actionButtons = replyForm.querySelector('.d-flex.justify-content-between.align-items-center');

    // في حالة عدم وجود العنصر بالضبط، نحاول البحث عن عناصر مشابهة
    if (!actionButtons) {
      actionButtons = replyForm.querySelector('.d-flex.justify-content-between') || 
                      replyForm.querySelector('.action-buttons') || 
                      replyForm.querySelector('.message-actions');

      if (!actionButtons) {
        return;
      }
    }

    // التحقق من عدم وجود الزر مسبقاً
    if (actionButtons.querySelector('.internal-note-btn')) {
      return;
    }

    // إنشاء زر التعليق الداخلي
    const noteButton = document.createElement('button');
    noteButton.type = 'button';
    noteButton.className = 'btn btn-outline-warning internal-note-btn';
    noteButton.innerHTML = '<i class="fas fa-sticky-note me-1"></i> إضافة ملاحظة داخلية';
    noteButton.onclick = function() {
      // نقل معرف المحادثة إلى النموذج وفتح النافذة المنبثقة
      const conversationId = document.getElementById('conversationId').value;
      document.querySelector('#internalNoteModal #conversationId').value = conversationId;

      // فتح النافذة المنبثقة
      const modal = new bootstrap.Modal(document.getElementById('internalNoteModal'));
      modal.show();
    };

    // إدراج الزر قبل زر الإرسال (آخر زر)
    const lastButton = actionButtons.lastElementChild;
    actionButtons.insertBefore(noteButton, lastButton);
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
                    placeholder="اكتب ملاحظة داخلية للفريق (لن يراها العميل)"></textarea>
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
