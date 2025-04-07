/**
 * إدارة إشعارات الويب
 */

// مفتاح VAPID العام - يجب توليده وتخزينه على الخادم
const applicationServerPublicKey = 'BIL3UXcQDBrxkqZ3cjnJLqrSJgT3lKwDrRVVAB_-oyHnUGUkuuZ85rEPQmG1xwHpGQbwtcEZFJ8NRmk0RD8LKSA';

// المتغيرات العامة
let swRegistration = null;
let isSubscribed = false;

/**
 * تهيئة إشعارات الويب
 */
function initializeWebPush() {
  // التحقق من دعم المتصفح لإشعارات الويب
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('إشعارات الويب غير مدعومة في هذا المتصفح.');
    return;
  }

  // تسجيل Service Worker
  navigator.serviceWorker.register('/service-worker.js')
    .then(function(registration) {
      console.log('تم تسجيل Service Worker بنجاح:', registration);
      swRegistration = registration;
      
      // التحقق من حالة الاشتراك
      initializeUi();
    })
    .catch(function(error) {
      console.error('فشل تسجيل Service Worker:', error);
    });
}

/**
 * تهيئة واجهة المستخدم بناءً على حالة الاشتراك
 */
function initializeUi() {
  // التحقق من حالة الاشتراك
  swRegistration.pushManager.getSubscription()
    .then(function(subscription) {
      isSubscribed = !(subscription === null);
      console.log('حالة الاشتراك في الإشعارات:', isSubscribed);
      
      if (isSubscribed) {
        console.log('المستخدم مشترك بالفعل في إشعارات الويب');
      } else {
        // طلب إذن الإشعارات تلقائيًا إذا كان المستخدم قد سجل الدخول
        if (window.currentUserId && window.currentUserId !== 'guest') {
          requestNotificationPermission();
        }
      }
    });
}

/**
 * طلب إذن الإشعارات من المستخدم
 */
function requestNotificationPermission() {
  Notification.requestPermission()
    .then(function(permission) {
      if (permission === 'granted') {
        console.log('تم منح إذن الإشعارات');
        subscribeUserToPush();
      } else {
        console.warn('تم رفض إذن الإشعارات:', permission);
      }
    });
}

/**
 * اشتراك المستخدم في إشعارات الويب
 */
function subscribeUserToPush() {
  const applicationServerKey = urlB64ToUint8Array(applicationServerPublicKey);
  
  swRegistration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey
  })
  .then(function(subscription) {
    console.log('تم الاشتراك بنجاح:', subscription);
    saveSubscriptionOnServer(subscription);
    isSubscribed = true;
  })
  .catch(function(error) {
    console.error('فشل الاشتراك:', error);
  });
}

/**
 * حفظ اشتراك المستخدم على الخادم
 * @param {PushSubscription} subscription - كائن الاشتراك
 */
function saveSubscriptionOnServer(subscription) {
  // تحويل الاشتراك إلى JSON
  const subscriptionJson = subscription.toJSON();
  
  // إرسال الاشتراك إلى الخادم
  fetch('/api/notifications/subscription', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subscription: subscriptionJson
    })
  })
  .then(function(response) {
    if (!response.ok) {
      throw new Error('فشل في حفظ الاشتراك على الخادم');
    }
    return response.json();
  })
  .then(function(data) {
    console.log('تم حفظ الاشتراك على الخادم:', data);
  })
  .catch(function(error) {
    console.error('خطأ في حفظ الاشتراك:', error);
  });
}

/**
 * تحويل المفتاح العام من Base64 إلى Uint8Array
 * @param {string} base64String - المفتاح بصيغة Base64
 * @returns {Uint8Array} - المفتاح بصيغة Uint8Array
 */
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// تهيئة إشعارات الويب عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
  // عندما يتم تعيين userId عبر السوكت، أو إذا كان موجودًا بالفعل
  if (window.currentUserId && window.currentUserId !== 'guest') {
    initializeWebPush();
  } else {
    // الاستماع لحدث userId-set لتهيئة الإشعارات بعد تسجيل الدخول
    if (window.socket) {
      window.socket.on('userId-set', function(data) {
        if (data.userId && data.userId !== 'guest') {
          window.currentUserId = data.userId;
          initializeWebPush();
        }
      });
    }
  }
}); 