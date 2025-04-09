/**
 * وحدة معالجة رسائل الموقع الجغرافي
 * تخصص في عرض رسائل الموقع باستخدام خرائط Google
 */

// مجموعة لتخزين الخرائط النشطة
window.locationMaps = new Map();

// إضافة وظيفة اختبار لمحاكاة رسالة موقع جديدة - للاختبار فقط
window.testLocationMessage = function() {
    // التأكد من وجود محادثة نشطة
    if (!window.currentConversationId) {
        alert('يرجى فتح محادثة أولا لاختبار رسالة الموقع');
        return;
    }
    
    // إنشاء رسالة اختبار
    const testMessage = {
        _id: 'test_location_' + Date.now(),
        conversationId: window.currentConversationId,
        direction: 'incoming',
        content: 'الموقع: موقع اختبار - عرض: 32.8435156, طول: 13.2939663',
        mediaType: 'location',
        timestamp: new Date().toISOString(),
        status: 'delivered'
    };
    
    // محاكاة استلام رسالة جديدة
    if (typeof window.addMessageToConversation === 'function') {
        window.addMessageToConversation(testMessage);
    } else {
        console.error('وظيفة addMessageToConversation غير متاحة');
    }
};

// إضافة وظيفة لإضافة زر اختبار للمطورين
function addTestButton() {
    // التحقق إذا كان زر الاختبار موجودًا بالفعل
    if (document.getElementById('testLocationButton')) {
        return;
    }
    
    // إنشاء زر الاختبار
    const testButton = document.createElement('button');
    testButton.id = 'testLocationButton';
    testButton.className = 'btn btn-sm btn-outline-secondary mt-2';
    testButton.innerHTML = '<i class="fas fa-map-marker-alt mr-1"></i> اختبار رسالة موقع';
    testButton.style.position = 'fixed';
    testButton.style.bottom = '10px';
    testButton.style.left = '10px';
    testButton.style.zIndex = '1000';
    testButton.style.opacity = '0.7';
    testButton.onclick = window.testLocationMessage;
    
    // إضافة الزر إلى الصفحة
    document.body.appendChild(testButton);
}

// تهيئة وظيفة استدعاء خرائط Google
window.initMaps = function() {
    // تعيين حالة تحميل خرائط Google
    window.googleMapsLoaded = true;
    
    // البحث عن جميع عناصر الخرائط في الصفحة وتهيئتها
    initializeAllMaps();
};

/**
 * تهيئة جميع عناصر الخرائط في الصفحة
 */
function initializeAllMaps() {
    // التحقق من تحميل خرائط Google
    if (!window.googleMapsLoaded || typeof google === 'undefined' || !google.maps) {
        setTimeout(initializeAllMaps, 1000); // إعادة المحاولة بعد ثانية
        return;
    }
    
    // البحث عن جميع عناصر الخرائط في الصفحة
    const mapContainers = document.querySelectorAll('.google-map-container');
    
    // تهيئة كل خريطة
    mapContainers.forEach(container => {
        const messageId = container.getAttribute('data-message-id');
        const locationContent = container.getAttribute('data-content');
        
        // التحقق إذا كانت الخريطة موجودة مسبقًا لتجنب التكرار
        if (!window.locationMaps.has(messageId)) {
            initializeMapFromContent(messageId, locationContent, container);
        }
    });
    
    // إضافة دالة استدعاء لتهيئة الخرائط الجديدة عند إضافة رسائل
    if (typeof window.addMessageToConversationCallbacks !== 'object') {
        window.addMessageToConversationCallbacks = [];
    }
    
    // التحقق إذا كانت الدالة موجودة مسبقًا لتجنب التكرار
    const callbackExists = window.addMessageToConversationCallbacks.some(
        cb => cb.name === 'initializeNewLocationMap'
    );
    
    if (!callbackExists) {
        window.addMessageToConversationCallbacks.push({
            name: 'initializeNewLocationMap',
            callback: function(message) {
                if (message.mediaType === 'location') {
                    // إتاحة وقت للعنصر ليتم إضافته إلى DOM
                    setTimeout(() => {
                        const container = document.getElementById(`map-${message._id}`);
                        if (container) {
                            initializeMapFromContent(message._id, message.content, container);
                        } else {
                            console.warn(`لم يتم العثور على حاوية الخريطة للرسالة: ${message._id}`);
                        }
                    }, 100);
                }
            }
        });
    }
}

/**
 * تهيئة خريطة من محتوى رسالة الموقع
 * @param {string} messageId - معرف الرسالة
 * @param {string} content - محتوى رسالة الموقع (النص الذي يحتوي على إحداثيات)
 * @param {HTMLElement} container - عنصر DOM الذي سيحتوي على الخريطة
 */
function initializeMapFromContent(messageId, content, container) {
    // استخراج الإحداثيات من محتوى الرسالة
    const coordinates = extractCoordinates(content);
    
    if (!coordinates || !coordinates.lat || !coordinates.lng) {
        container.innerHTML = '<div class="map-error">تعذر تحميل الخريطة: إحداثيات غير صالحة</div>';
        return;
    }
    
    // تعيين حجم الحاوية
    container.style.height = '200px';
    container.style.width = '100%';
    container.style.marginTop = '8px';
    container.style.borderRadius = '8px';
    
    // إنشاء خريطة Google
    try {
        const mapOptions = {
            center: coordinates,
            zoom: 15,
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
            zoomControl: true
        };
        
        const map = new google.maps.Map(container, mapOptions);
        
        // إضافة علامة على الخريطة
        const marker = new google.maps.Marker({
            position: coordinates,
            map: map,
            title: 'الموقع',
            animation: google.maps.Animation.DROP
        });
        
        // إضافة مستمع النقر لفتح الموقع في خرائط Google
        container.addEventListener('click', function() {
            window.open(`https://www.google.com/maps?q=${coordinates.lat},${coordinates.lng}`, '_blank');
        });
        
        // تخزين الخريطة للاستخدام لاحقًا
        window.locationMaps.set(messageId, {
            map: map,
            marker: marker,
            coordinates: coordinates
        });
        
        // إضافة أسلوب المؤشر عند التحويل
        container.style.cursor = 'pointer';
        
        // إضافة تلميح عند تحويم المؤشر
        container.title = 'انقر لفتح الموقع في خرائط Google';
    } catch (error) {
        container.innerHTML = '<div class="map-error">تعذر تحميل الخريطة</div>';
    }
}

/**
 * استخراج إحداثيات الموقع من محتوى الرسالة
 * @param {string} content - محتوى رسالة الموقع
 * @returns {object|null} - كائن يحتوي على خط العرض وخط الطول، أو null في حالة الفشل
 */
function extractCoordinates(content) {
    if (!content) return null;
    
    try {
        // البحث عن أنماط مختلفة من الإحداثيات
        
        // النمط 1: "الموقع: اسم_الموقع - عرض: XX.XXXXX, طول: YY.YYYYY"
        const pattern1 = /عرض: ([-+]?\d+\.\d+), طول: ([-+]?\d+\.\d+)/;
        const match1 = content.match(pattern1);
        
        if (match1 && match1.length >= 3) {
            return {
                lat: parseFloat(match1[1]),
                lng: parseFloat(match1[2])
            };
        }
        
        // النمط 2: "XX.XXXXX, YY.YYYYY" (رقمي فقط)
        const pattern2 = /([-+]?\d+\.\d+),\s*([-+]?\d+\.\d+)/;
        const match2 = content.match(pattern2);
        
        if (match2 && match2.length >= 3) {
            return {
                lat: parseFloat(match2[1]),
                lng: parseFloat(match2[2])
            };
        }
        
        // فشل في استخراج الإحداثيات
        return null;
    } catch (error) {
        return null;
    }
}

// إطلاق تهيئة الخرائط عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    // إذا كانت خرائط Google جاهزة، قم بتهيئة الخرائط فورًا
    if (window.googleMapsLoaded) {
        initializeAllMaps();
    }
    
    // إضافة مستمع لتحميل رسائل جديدة (مناسب لصفحة المحادثة)
    document.addEventListener('messages-loaded', function() {
        initializeAllMaps();
    });
});

// إضافة مستمع للرسائل الجديدة المضافة عبر وظيفة addMessageToConversation
if (typeof window.addMessageToConversation === 'function' && !window.locationMapListenerAdded) {
    const originalAddMessage = window.addMessageToConversation;
    
    window.addMessageToConversation = function(message) {
        // استدعاء الدالة الأصلية
        originalAddMessage(message);
        
        // إذا كانت رسالة موقع، تهيئة الخريطة
        if (message && message.mediaType === 'location') {
            setTimeout(() => {
                const container = document.getElementById(`map-${message._id}`);
                if (container) {
                    initializeMapFromContent(message._id, message.content, container);
                } else {
                    console.warn(`لم يتم العثور على حاوية الخريطة للرسالة بعد الإضافة: ${message._id}`);
                }
            }, 300); // زيادة المهلة لضمان إضافة العنصر
        }
        
        // استدعاء أي دوال استرجاع إضافية مسجلة
        if (Array.isArray(window.addMessageToConversationCallbacks)) {
            window.addMessageToConversationCallbacks.forEach(callbackObj => {
                if (typeof callbackObj.callback === 'function') {
                    callbackObj.callback(message);
                }
            });
        }
    };
    
    window.locationMapListenerAdded = true;
} 