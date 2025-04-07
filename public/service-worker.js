// تسجيل كل الأحداث لاكتشاف المشكلة
self.addEventListener('message', event => {
  console.log('[Service Worker] رسالة مستلمة:', event.data);
});

// سجل بداية تشغيل الـ service worker في ملف سجل
console.log('[Service Worker] تم تحميل ملف Service Worker');

// Service Worker للإشعارات
self.addEventListener('install', function(event) {
  console.log('[Service Worker] تم تثبيت Service Worker');
  // تنشيط Service Worker الجديد مباشرة
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('[Service Worker] تم تنشيط Service Worker');
  // المطالبة بالسيطرة على عملاء التطبيق بدون تحميل صفحة جديدة
  event.waitUntil(clients.claim());
});

// التأكد من استمرار Service Worker نشطاً حتى بعد إغلاق الصفحة
self.addEventListener('pushsubscriptionchange', function(event) {
  console.log('[Service Worker] تغير اشتراك الإشعارات في الخلفية');
  event.waitUntil(
    // يجب استدعاء دالة إعادة الاشتراك هنا بدلاً من إعادة إرسال الاشتراك مباشرة
    // على سبيل المثال، يمكن إرسال رسالة إلى الواجهة لإعادة الاشتراك
    // أو محاولة إعادة الاشتراك من هنا إذا كان ذلك ممكنًا
    console.log('[Service Worker] يجب تنفيذ إعادة الاشتراك بعد تغيير الاشتراك')
    /*
    // مثال على محاولة إعادة الاشتراك (قد يتطلب تعديلات حسب نظامك)
    fetch('/api/notifications/resubscribe', { // تأكد من وجود هذا المسار
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldEndpoint: event.oldSubscription ? event.oldSubscription.endpoint : null, newSubscription: event.newSubscription })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('فشل إعادة الاشتراك');
      }
      return response.json();
    })
    .then(data => {
      console.log('[Service Worker] تمت إعادة الاشتراك بنجاح', data);
    })
    .catch(error => {
      console.error('[Service Worker] خطأ في إعادة الاشتراك:', error);
    })
    */
  );
});

// إضافة استراتيجية حفظ مفتوحة لاستلام الإشعارات
self.addEventListener('push', function(event) {
  console.log('[Service Worker] تم استلام إشعار دفع');
  
  // استراتيجية حفظ مفتوحة لضمان استمرار Service Worker
  const promiseChain = self.registration.pushManager.getSubscription()
    .then(subscription => {
      if (!subscription) {
        console.warn('[Service Worker] لا يوجد اشتراك فعال، لا يمكن عرض الإشعار');
        return;
      }
      
      if (event.data) {
        try {
          const data = event.data.json();
          console.log('[Service Worker] بيانات الإشعار:', data);

          const options = {
            body: data.content || 'رسالة جديدة',
            icon: '/images/logo.png',
            badge: '/images/logo.png',
            dir: 'rtl',
            vibrate: [100, 50, 100], // نمط الاهتزاز
            data: {
              url: data.link || '/'
            },
            tag: data.tag || 'default', // لتجميع الإشعارات المتشابهة
            renotify: data.renotify || true, // إعادة التنبيه افتراضيًا
            requireInteraction: data.requireInteraction !== undefined ? data.requireInteraction : true // إبقاء الإشعار مرئيًا افتراضيًا
          };

          return self.registration.showNotification(data.title || 'إشعار جديد', options)
            .then(() => {
              console.log('[Service Worker] تم عرض الإشعار بنجاح');
            })
            .catch(error => {
              console.error('[Service Worker] خطأ في عرض الإشعار:', error);
            });
        } catch (error) {
          console.error('[Service Worker] خطأ في معالجة إشعار الدفع JSON:', error);
          // محاولة قراءة النص إذا فشل JSON
          try {
            const textData = event.data.text();
            console.log('[Service Worker] نص الإشعار (فشل JSON):', textData);
            return self.registration.showNotification('إشعار جديد', {
              body: textData || 'لديك إشعار جديد',
              icon: '/images/logo.png'
            });
          } catch (textError) {
            console.error('[Service Worker] خطأ في قراءة نص إشعار الدفع:', textError);
            // عرض إشعار بسيط جدًا في حالة فشل كل شيء
            return self.registration.showNotification('إشعار', {
              body: 'تم استلام إشعار جديد',
              icon: '/images/logo.png'
            });
          }
        }
      } else {
        console.warn('[Service Worker] تم استلام إشعار دفع فارغ');
        return self.registration.showNotification('إشعار', {
          body: 'تم استلام إشعار جديد',
          icon: '/images/logo.png'
        });
      }
    });

  event.waitUntil(promiseChain);
});

// عند النقر على الإشعار
self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] تم النقر على الإشعار', event.notification.tag, event.notification.data);
  
  // إغلاق الإشعار
  event.notification.close();
  
  // استخراج URL الهدف من الإشعار
  const targetUrl = event.notification.data && event.notification.data.url 
    ? event.notification.data.url 
    : '/';
  
  console.log('[Service Worker] فتح الرابط:', targetUrl);
  
  // فتح الرابط المستهدف أو التركيز على نافذة موجودة
  const promiseChain = clients.matchAll({
    type: "window",
    includeUncontrolled: true
   })
   .then(function(clientList) {
      // فحص ما إذا كانت النافذة مفتوحة بالفعل
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        // محاولة المطابقة مع URL بعد إزالة / من النهاية إن وجدت
        let clientUrl = client.url;
        if (clientUrl.endsWith('/')) {
          clientUrl = clientUrl.slice(0, -1);
        }
        let targetUrlNormalized = targetUrl;
        if (targetUrlNormalized.endsWith('/')) {
          targetUrlNormalized = targetUrlNormalized.slice(0, -1);
        }
        
        if (clientUrl === targetUrlNormalized && 'focus' in client) {
          console.log('[Service Worker] العودة إلى نافذة موجودة');
          return client.focus();
        }
      }
      
      // إذا لم تكن النافذة مفتوحة، افتح نافذة جديدة
      if (clients.openWindow) {
        console.log('[Service Worker] فتح نافذة جديدة');
        return clients.openWindow(targetUrl);
      }
    })
    .catch(function(error) {
      console.error('[Service Worker] خطأ في فتح الرابط:', error);
    });

  event.waitUntil(promiseChain);
}); 