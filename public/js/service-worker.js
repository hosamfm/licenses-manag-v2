self.addEventListener('push', event => {
  console.log('[Service Worker] Push Received.');
  
  let notificationData = {};
  try {
    // محاولة قراءة البيانات كـ JSON
    if (event.data) {
      notificationData = event.data.json();
      console.log('[Service Worker] Push data:', notificationData);
    } else {
      console.log('[Service Worker] Push event but no data');
      // إعداد بيانات افتراضية إذا لم تكن هناك بيانات
      notificationData = {
        title: 'إشعار جديد',
        body: 'وصلك إشعار جديد من التطبيق.',
      };
    }
  } catch (e) {
    console.error('[Service Worker] Error parsing push data:', e);
    // إعداد بيانات افتراضية عند حدوث خطأ
    notificationData = {
        title: 'إشعار جديد',
        body: 'وصلك إشعار جديد.'
    };
  }

  // تحضير الخيارات النهائية للإشعار
  const options = {
    body: notificationData.body || 'رسالة جديدة',
    // إضافة بيانات إضافية هنا إذا لزم الأمر
    data: {
      url: notificationData.url || '/' // الرابط الذي سيتم فتحه عند النقر
    }
  };

  const title = notificationData.title || 'النظام';

  // عرض الإشعار
  // waitUntil يضمن بقاء الـ Service Worker نشطًا حتى يتم عرض الإشعار
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// التعامل مع نقر المستخدم على الإشعار
self.addEventListener('notificationclick', event => {
  console.log('[Service Worker] Notification click Received.');

  // إغلاق الإشعار
  event.notification.close();

  // فتح الرابط المرتبط بالإشعار
  const urlToOpen = event.notification.data.url || '/';
  
  // فتح نافذة جديدة أو الانتقال إلى نافذة موجودة
  event.waitUntil(
    clients.matchAll({
      type: "window"
    }).then(clientList => {
      // التحقق مما إذا كان هناك نافذة مفتوحة للتطبيق بنفس الرابط
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        // إذا وجدنا نافذة بنفس الرابط، نقوم بتركيزها
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // إذا لم نجد نافذة مفتوحة، نفتح نافذة جديدة
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// مستمع للتفعيل - يمكن استخدامه لتنظيف الكاش القديم مثلاً
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activate');
  // هنا يمكنك إضافة منطق لتنظيف الكاشات القديمة إذا لزم الأمر
  // event.waitUntil(caches.keys().then(...));
});

// مستمع للتثبيت - يمكن استخدامه لتخزين الملفات الأساسية مؤقتًا
self.addEventListener('install', event => {
  console.log('[Service Worker] Install');
  // يمكن إضافة منطق لتخزين بعض الملفات الأساسية مؤقتًا هنا
  // event.waitUntil(caches.open(CACHE_NAME).then(...));
}); 