// Service Worker للإشعارات
self.addEventListener('push', function(event) {
  if (event.data) {
    try {
      const data = event.data.json();
      const options = {
        body: data.content || 'رسالة جديدة',
        icon: '/images/logo.png',
        badge: '/images/logo.png',
        dir: 'rtl',
        vibrate: [100, 50, 100], // نمط الاهتزاز
        data: {
          url: data.link || '/'
        }
      };

      event.waitUntil(
        self.registration.showNotification(data.title || 'إشعار جديد', options)
      );
    } catch (error) {
      console.error('خطأ في معالجة إشعار الدفع:', error);
    }
  }
});

// عند النقر على الإشعار
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  
  if (event.notification.data && event.notification.data.url) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(function(clientList) {
        // فحص ما إذا كانت النافذة مفتوحة بالفعل
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url === event.notification.data.url && 'focus' in client) {
            return client.focus();
          }
        }
        
        // إذا لم تكن النافذة مفتوحة، افتح نافذة جديدة
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data.url);
        }
      })
    );
  }
}); 