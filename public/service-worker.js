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

self.addEventListener('push', function(event) {
  console.log('[Service Worker] تم استلام إشعار دفع');
  
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
        renotify: data.renotify || false, // إذا كان true سيتم تنبيه المستخدم حتى لو كان هناك إشعار بنفس الـ tag
        requireInteraction: true // إبقاء الإشعار مرئيًا حتى يتفاعل معه المستخدم
      };

      event.waitUntil(
        self.registration.showNotification(data.title || 'إشعار جديد', options)
          .then(() => {
            console.log('[Service Worker] تم عرض الإشعار بنجاح');
          })
          .catch(error => {
            console.error('[Service Worker] خطأ في عرض الإشعار:', error);
          })
      );
    } catch (error) {
      console.error('[Service Worker] خطأ في معالجة إشعار الدفع:', error);
      
      // عرض إشعار بسيط في حالة الخطأ
      event.waitUntil(
        self.registration.showNotification('إشعار جديد', {
          body: 'لديك إشعار جديد',
          icon: '/images/logo.png'
        })
      );
    }
  }
});

// عند النقر على الإشعار
self.addEventListener('notificationclick', function(event) {
  console.log('[Service Worker] تم النقر على الإشعار', event.notification.data);
  
  // إغلاق الإشعار
  event.notification.close();
  
  // استخراج URL الهدف من الإشعار
  const targetUrl = event.notification.data && event.notification.data.url 
    ? event.notification.data.url 
    : '/';
  
  console.log('[Service Worker] فتح الرابط:', targetUrl);
  
  event.waitUntil(
    clients.matchAll({ type: 'window' })
      .then(function(clientList) {
        // فحص ما إذا كانت النافذة مفتوحة بالفعل
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          // إذا كانت النافذة مفتوحة، انتقل إليها وركز عليها
          if (client.url === targetUrl && 'focus' in client) {
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
      })
  );
}); 