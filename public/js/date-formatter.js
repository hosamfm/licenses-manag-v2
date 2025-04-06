/**
 * ملف تنسيق التواريخ والأوقات
 * يتم تحميله مبكرًا في كل صفحة تحتاج إلى عرض تواريخ
 */

// التأكد من تنفيذ الكود فقط عند اكتمال تحميل الصفحة
(function() {
  // منع تنفيذ تنسيق التواريخ أكثر من مرة في مدة قصيرة
  let lastFormatTime = 0;
  const THROTTLE_DELAY = 500; // ملي ثانية بين التنفيذات
  
  // حفظ حالة التحميل لتجنب تعارض الاستدعاءات
  let isFormatting = false;
  
  // دالة تنسيق جميع أوقات الرسائل
  window.formatAllMessageTimes = function() {
    // منع الاستدعاءات المتكررة
    const now = Date.now();
    if (isFormatting || (now - lastFormatTime < THROTTLE_DELAY)) {
      return;
    }
    
    isFormatting = true;
    lastFormatTime = now;
    
    const timeElements = document.querySelectorAll('.message-time');
    
    if (timeElements.length === 0) {
      isFormatting = false;
      return;
    }
    
    let todayCount = 0;
    let yesterdayCount = 0;
    let olderCount = 0;
    let skippedCount = 0;
    
    timeElements.forEach(function(timeElement) {
      // محاولة استخراج الطابع الزمني بطرق متعددة
      let timestamp;
      
      // طريقة 1: استخدام سمة data-timestamp
      timestamp = timeElement.getAttribute('data-timestamp');
      
      // طريقة 2: استخدام سمة data-date
      if (!timestamp) {
        const dateStr = timeElement.getAttribute('data-date');
        if (dateStr) {
          try {
            timestamp = new Date(dateStr).getTime();
          } catch (e) {}
        }
      }
      
      // طريقة 3: استخدام سمة title
      if (!timestamp) {
        const titleDate = timeElement.getAttribute('title');
        if (titleDate) {
          try {
            timestamp = new Date(titleDate).getTime();
          } catch (e) {}
        }
      }
      
      // طريقة 4: استخدام محتوى العنصر نفسه
      if (!timestamp) {
        const textContent = timeElement.textContent.trim();
        if (textContent && !textContent.includes('اليوم') && !textContent.includes('الأمس')) {
          try {
            // محاولة تحليل النص إلى تاريخ
            const parsedDate = new Date(textContent);
            if (!isNaN(parsedDate.getTime())) {
              timestamp = parsedDate.getTime();
            }
          } catch (e) {
            // تجاهل الخطأ - سنستمر في الطرق الأخرى
          }
        }
      }
      
      // إذا لم نتمكن من استخراج الطابع الزمني، قم بتجاهل هذا العنصر
      if (!timestamp) {
        skippedCount++;
        return;
      }
      
      // إضافة سمة data-timestamp إذا لم تكن موجودة
      if (!timeElement.hasAttribute('data-timestamp')) {
        timeElement.setAttribute('data-timestamp', timestamp);
      }
      
      // تحويل من نص إلى رقم
      const timestampNum = parseInt(timestamp, 10);
      
      if (isNaN(timestampNum)) {
        skippedCount++;
        return;
      }
      
      const messageDate = new Date(timestampNum);
      const now = new Date();
      
      // تنسيق الوقت فقط (بتنسيق 12 ساعة)
      const timeStr = messageDate.toLocaleString('ar-LY', { 
        hour: '2-digit', 
        minute: '2-digit'
      });
      
      // تنسيق التاريخ بشكل أكثر وضوحًا (اليوم/الشهر/السنة)
      const dateStr = messageDate.toLocaleString('ar-LY', { 
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'long'
      });
      
      // تحديد إذا كانت الرسالة من اليوم أو الأمس أو أقدم
      const isToday = messageDate.toDateString() === now.toDateString();
      
      // حساب الأمس
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = messageDate.toDateString() === yesterday.toDateString();
      
      let formattedDate;
      
      if (isToday) {
        // رسائل اليوم - نعرض "اليوم" مع الوقت بخط عريض
        formattedDate = `<strong>اليوم</strong> ${timeStr}`;
        todayCount++;
        // إضافة فئة للتنسيق
        timeElement.classList.add('today-message');
        timeElement.classList.remove('yesterday-message', 'old-message');
      } else if (isYesterday) {
        // رسائل الأمس - نعرض "الأمس" مع الوقت
        formattedDate = `<strong>الأمس</strong> ${timeStr}`;
        yesterdayCount++;
        // إضافة فئة للتنسيق
        timeElement.classList.add('yesterday-message');
        timeElement.classList.remove('today-message', 'old-message');
      } else {
        // حساب عدد الأيام للماضي
        const diffMs = now - messageDate;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        // رسائل بين 2-7 أيام - نعرض اسم اليوم والتاريخ
        if (diffDays < 7) {
          const dayName = messageDate.toLocaleString('ar-LY', { weekday: 'long' });
          formattedDate = `<span class="day-name">${dayName}</span> ${messageDate.toLocaleString('ar-LY', { day: '2-digit', month: '2-digit' })} ${timeStr}`;
        } else {
          // رسائل قديمة - نعرض التاريخ كاملاً مع الوقت
          formattedDate = `${messageDate.toLocaleString('ar-LY', { year: 'numeric', month: '2-digit', day: '2-digit' })} ${timeStr}`;
        }
        
        olderCount++;
        // إضافة فئة للتنسيق
        timeElement.classList.add('old-message');
        timeElement.classList.remove('today-message', 'yesterday-message');
      }
      
      // تحديث نص العنصر
      timeElement.innerHTML = formattedDate;
    });
    
    isFormatting = false;
  };

  // مستمع عالمي لتنسيق التواريخ عندما يتم تحميل رسائل جديدة
  document.addEventListener('DOMContentLoaded', function() {
    // تنسيق التواريخ بعد تحميل الصفحة
    setTimeout(window.formatAllMessageTimes, 500);
    
    // تحديث أوقات الرسائل عندما يتم تحميل رسائل جديدة
    window.addEventListener('messages-loaded', function() {
      setTimeout(window.formatAllMessageTimes, 300);
    });
  });

  // إضافة CSS للتنسيق داخل <style> في بداية الصفحة
  const addDateStyles = function() {
    // التحقق من عدم وجود نفس الـ CSS من قبل
    if (document.getElementById('date-formatter-styles')) return;
    
    const styleElement = document.createElement('style');
    styleElement.id = 'date-formatter-styles';
    styleElement.textContent = `
      /* تنسيق عناصر التاريخ */
      .message-time {
        display: inline-block;
        min-width: 95px;
        font-size: 0.85rem;
        padding: 2px 5px;
        border-radius: 4px;
        transition: all 0.2s ease;
        color: #212529 !important; /* لون أسود للنص */
      }
      
      /* تنسيق تواريخ الرسائل القديمة */
      .message-time.old-message {
        font-weight: normal;
        color: #212529 !important;
        background-color: rgba(0, 0, 0, 0.03);
      }
      
      /* تنسيق تواريخ رسائل الأمس */
      .message-time.yesterday-message {
        color: #212529 !important;
      }
      
      /* تنسيق تواريخ رسائل اليوم */
      .message-time.today-message {
        color: #212529 !important;
      }
      
      /* اسم اليوم */
      .message-time .day-name {
        font-weight: bold;
        color: #212529 !important;
      }
      
      /* تنسيق كلمة اليوم/الأمس */
      .message-time strong {
        color: #212529 !important;
        font-weight: bold;
      }
    `;
    document.head.appendChild(styleElement);
  };
  
  // تنفيذ عند تحميل الصفحة
  document.addEventListener('DOMContentLoaded', addDateStyles);
})(); 