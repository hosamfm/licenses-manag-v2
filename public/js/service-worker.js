self.addEventListener('push', event => {
 
  let notificationData = {};
  try {
    // محاولة قراءة البيانات كـ JSON
    if (event.data) {
      notificationData = event.data.json();
    } else {
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

});

// مستمع للتثبيت - يمكن استخدامه لتخزين الملفات الأساسية مؤقتًا
self.addEventListener('install', event => {
}); 