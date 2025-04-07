/**
 * إدارة إشعارات الويب
 */

// سيتم الحصول على مفتاح VAPID العام من الخادم
let applicationServerPublicKey = null;

// المتغيرات العامة
let swRegistration = null;
let isSubscribed = false;

// إصدار مفاتيح الإشعارات - يستخدم لتتبع تغييرات المفاتيح
const CURRENT_PUSH_VERSION = 'v20230408';

/**
 * تهيئة إشعارات الويب
 */
function initializeWebPush() {
  // التحقق من دعم المتصفح لإشعارات الويب
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('إشعارات الويب غير مدعومة في هذا المتصفح.');
    return;
  }

  // الحصول على المفتاح العام من الخادم
  fetch('/api/notifications/vapid-public-key')
    .then(response => {
      if (!response.ok) {
        throw new Error('فشل في الحصول على مفتاح VAPID العام');
      }
      return response.json();
    })
    .then(data => {
      if (!data.publicKey) {
        throw new Error('المفتاح العام غير موجود في استجابة الخادم');
      }
      
      applicationServerPublicKey = data.publicKey;
      console.log('تم الحصول على مفتاح VAPID العام من الخادم:', applicationServerPublicKey.substring(0, 10) + '...');
      
      // متابعة تسجيل Service Worker بعد الحصول على المفتاح
      return navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    })
    .then(function(registration) {
      console.log('تم تسجيل Service Worker بنجاح:', registration);
      swRegistration = registration;
      
      // التحقق من حالة الاشتراك
      initializeUi();
    })
    .catch(function(error) {
      console.error('فشل في إعداد إشعارات الويب:', error);
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
      
      // التحقق من إصدار الإشعارات المخزن
      const savedVersion = localStorage.getItem('pushVersion');
      
      if (isSubscribed) {
        console.log('المستخدم مشترك بالفعل في إشعارات الويب');
        
        // إذا تغير الإصدار، نحتاج لإعادة الاشتراك
        if (savedVersion !== CURRENT_PUSH_VERSION) {
          console.log('تم اكتشاف إصدار جديد للإشعارات، سيتم إعادة الاشتراك');
          // إلغاء الاشتراك القديم وإعادة الاشتراك
          resetSubscription();
        }
      } else {
        // طلب إذن الإشعارات تلقائيًا إذا كان المستخدم قد سجل الدخول
        if (window.currentUserId && window.currentUserId !== 'guest') {
          requestNotificationPermission();
          // تحديث إصدار الإشعارات المخزن
          localStorage.setItem('pushVersion', CURRENT_PUSH_VERSION);
        }
      }
    });
}

/**
 * إعادة تعيين الاشتراك عند تغيير مفاتيح VAPID
 */
function resetSubscription() {
  if (!swRegistration) return;
  
  swRegistration.pushManager.getSubscription()
    .then(function(subscription) {
      if (subscription) {
        // إلغاء الاشتراك من المتصفح
        return subscription.unsubscribe();
      }
    })
    .then(function() {
      // إلغاء الاشتراك من الخادم
      return fetch('/api/notifications/unsubscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
    })
    .then(function() {
      console.log('تم إلغاء الاشتراك القديم بنجاح، سيتم طلب اشتراك جديد');
      // طلب اشتراك جديد
      requestNotificationPermission();
      // تحديث إصدار الإشعارات المخزن
      localStorage.setItem('pushVersion', CURRENT_PUSH_VERSION);
    })
    .catch(function(error) {
      console.error('خطأ في إعادة تعيين الاشتراك:', error);
      // في حالة الخطأ، نحاول الاشتراك مباشرة
      requestNotificationPermission();
      localStorage.setItem('pushVersion', CURRENT_PUSH_VERSION);
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
  if (!applicationServerPublicKey) {
    console.error('مفتاح VAPID العام غير متوفر، لا يمكن الاشتراك');
    return;
  }
  
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
    console.log('تهيئة إشعارات الويب للمستخدم:', window.currentUserId);
    initializeWebPush();
  } else {
    // الاستماع لحدث userId-set لتهيئة الإشعارات بعد تسجيل الدخول
    console.log('انتظار تعيين معرف المستخدم...');
    if (window.socket) {
      window.socket.on('userId-set', function(data) {
        if (data.userId && data.userId !== 'guest') {
          console.log('تم تعيين معرف المستخدم، تهيئة إشعارات الويب الآن:', data.userId);
          window.currentUserId = data.userId;
          initializeWebPush();
        }
      });
    }
  }
}); 