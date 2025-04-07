// هذا الملف مسؤول عن تهيئة وإدارة إشعارات Web Push

// مفتاح VAPID العام
const VAPID_PUBLIC_KEY = 'BPlvi9-mzQCzmn_ulHu2CWzKXAHIh870bPnCwyYl36JBtfCA10KoSM-hY9y56RIiBvNC4U1-7NLODP_JRDNPRNM';

/**
 * تحويل سلسلة base64 إلى Uint8Array (مطلوب للاشتراك)
 * @param {string} base64String
 * @returns {Uint8Array}
 */
function urlBase64ToUint8Array(base64String) {
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

/**
 * التحقق مما إذا كان المتصفح يدعم Service Workers و Push Notifications
 * @returns {boolean}
 */
function checkSupport() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers غير مدعومة');
    return false;
  }
  if (!('PushManager' in window)) {
    console.warn('Push notifications غير مدعومة');
    return false;
  }
  return true;
}

/**
 * تسجيل الـ Service Worker
 */
async function registerServiceWorker() {
  try {
    const registration = await navigator.serviceWorker.register('/js/service-worker.js');
    console.log('Service Worker تم تسجيله بنجاح:', registration);
    return registration;
  } catch (error) {
    console.error('فشل تسجيل Service Worker:', error);
    throw error;
  }
}

/**
 * طلب إذن الإشعارات من المستخدم
 */
async function requestNotificationPermission() {
  try {
    const permission = await Notification.requestPermission();
    console.log('حالة إذن الإشعارات:', permission);
    if (permission !== 'granted') {
      console.warn('لم يتم منح إذن الإشعارات.');
      // يمكنك عرض رسالة للمستخدم هنا لتوضيح أهمية الإشعارات
    }
    return permission === 'granted';
  } catch (error) {
    console.error('خطأ في طلب إذن الإشعارات:', error);
    return false;
  }
}

/**
 * الاشتراك في إشعارات Push
 * @param {ServiceWorkerRegistration} registration
 * @returns {Promise<PushSubscription|null>}
 */
async function subscribeUserToPush(registration) {
  try {
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey
    });
    console.log('تم الاشتراك بنجاح:', subscription);
    return subscription;
  } catch (error) {
    if (Notification.permission === 'denied') {
      console.warn('تم رفض إذن الإشعارات.');
    } else {
      console.error('فشل الاشتراك في Push:', error);
    }
    return null;
  }
}

/**
 * إرسال بيانات الاشتراك إلى الخادم
 * @param {PushSubscription} subscription
 */
async function sendSubscriptionToServer(subscription) {
  try {
    const response = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(subscription)
    });

    if (!response.ok) {
      throw new Error('فشل إرسال الاشتراك للخادم');
    }

    const data = await response.json();
    console.log('تم إرسال الاشتراك بنجاح:', data);
  } catch (error) {
    console.error('خطأ في إرسال الاشتراك للخادم:', error);
  }
}

/**
 * دالة التهيئة الرئيسية لإشعارات Push
 */
async function initializePushNotifications() {
  if (!checkSupport()) {
    return;
  }

  try {
    const registration = await registerServiceWorker();
    const permissionGranted = await requestNotificationPermission();

    if (!permissionGranted) {
      return;
    }

    // التحقق مما إذا كان المستخدم مشتركًا بالفعل
    let currentSubscription = await registration.pushManager.getSubscription();

    if (!currentSubscription) {
      // إذا لم يكن مشتركًا، قم بالاشتراك
      currentSubscription = await subscribeUserToPush(registration);
    }

    if (currentSubscription) {
      // إرسال الاشتراك إلى الخادم (أو إعادة إرساله للتأكيد)
      await sendSubscriptionToServer(currentSubscription);
    } else {
      console.warn('لم يتمكن من الحصول على اشتراك Push.');
    }

  } catch (error) {
    console.error('خطأ في تهيئة إشعارات Push:', error);
  }
}

// استدعاء دالة التهيئة عند تحميل الصفحة أو عند حدث معين (مثل تسجيل الدخول)
document.addEventListener('DOMContentLoaded', () => {
  // --- تسجيل إضافي للتحقق ---
  console.log('[Push Init] DOMContentLoaded event fired.');
  console.log('[Push Init] Checking VAPID Key:', VAPID_PUBLIC_KEY);
  // --- نهاية التسجيل ---
  
  // تأكد من وجود VAPID_PUBLIC_KEY قبل المتابعة
  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY') {
    console.error('خطأ: لم يتم تعيين VAPID_PUBLIC_KEY في public/js/push-notifications.js');
    // قد ترغب في عرض رسالة للمستخدم أو المطور هنا
    return; 
  }
  
  // --- تسجيل إضافي للتحقق ---
  console.log('[Push Init] Checking window.currentUserId:', window.currentUserId);
  // --- نهاية التسجيل ---
  
  // يمكنك تأخير الاستدعاء حتى يتأكد المستخدم من تسجيل الدخول
  // أو ربطه بزر لتفعيل الإشعارات
  // على سبيل المثال, يمكنك استدعاؤه بعد التحقق من وجود window.currentUserId
  if (window.currentUserId && window.currentUserId !== 'guest') { 
    console.log('[Push Init] User ID found, calling initializePushNotifications()...');
    initializePushNotifications();
  } else {
    console.log('[Push Init] User ID not found or is guest. Postponing initialization.');
    // يمكنك إضافة مستمع لحدث تسجيل الدخول لاستدعاء initializePushNotifications()
  }
}); 