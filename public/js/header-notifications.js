/**
 * نظام الإشعارات في الهيدر
 * يتعامل مع عرض وتحديث وإدارة الإشعارات في الواجهة
 */

// تعريف متغير socket في النطاق العام للملف
let socket = null;

// دالة لتهيئة اتصال Socket.IO
function initializeSocketIO() {
    // التأكد من تحميل مكتبة io
    if (typeof io === 'undefined') {
        console.error('مكتبة Socket.IO غير محملة!');
        return;
    }
    
    // إنشاء الاتصال إذا لم يكن موجودًا
    if (!socket) {
        socket = io(); // افتراض الاتصال بنفس الخادم

        socket.on('connect', () => {
            // بعد الاتصال، انضم لغرفة الإشعارات
            joinNotificationsRoom(); 
            // إضافة مستمعي الأحداث من Socket.IO
            attachSocketListeners();
        });

        socket.on('disconnect', () => {
            // يمكن محاولة إعادة الاتصال هنا إذا لزم الأمر
        });

        socket.on('connect_error', (error) => {
            console.error('خطأ في الاتصال بـ Socket.IO:', error);
        });
    }
}

// دالة للانضمام لغرفة الإشعارات
function joinNotificationsRoom() {
    if (socket && socket.connected) { // التأكد من أن السوكت متصل
        socket.emit('join-notifications');
    } else {
        console.warn('محاولة الانضمام لغرفة الإشعارات قبل الاتصال.');
    }
}

// دالة لإرفاق مستمعي أحداث Socket.IO
function attachSocketListeners() {
    if (!socket) return;

    // إزالة المستمعين القدامى لتجنب التكرار عند إعادة الاتصال
    socket.off('new-notification');
    socket.off('unread-notifications-count');
    socket.off('userId-set'); // إزالة المستمع القديم للحدث الجديد

    // معالج لاستقبال الإشعارات الجديدة
    socket.on('new-notification', (notification) => {
        playNotificationSound();
        if (window.notificationSystem) {
            window.notificationSystem.addNewNotification(notification);
        } else {
            console.warn('[Client Socket Received] window.notificationSystem is not available.');
        }
    });

    // معالج لعدد الإشعارات غير المقروءة
    socket.on('unread-notifications-count', (data) => {
        if (window.notificationSystem) {
            window.notificationSystem.updateUnreadCount(data.count);
        }
    });
    
    // --- إضافة مستمع للحدث الجديد userId-set ---
    socket.on('userId-set', (data) => {
        // تخزين userId في كائن النافذة للاستخدام لاحقًا إذا لم يكن موجودًا
        if (data.userId && (!window.currentUserId || window.currentUserId === 'guest')) {
            window.currentUserId = data.userId;
        }
        
        // إذا كان shouldJoinNotifications صحيح، انضم لغرفة الإشعارات
        if (data.shouldJoinNotifications) {
            joinNotificationsRoom();
        }
    });
}

document.addEventListener('DOMContentLoaded', function() {
    // التأكد من وجود سيشن المستخدم
    if (!window.currentUserId) {
        console.warn('لم يتم العثور على معرف المستخدم الحالي. لن يتم تهيئة الإشعارات الفورية.');
        return;
    }

    // تهيئة اتصال Socket.IO أولاً
    initializeSocketIO();

    // تهيئة نظام الإشعارات في الواجهة
    const notificationSystem = new NotificationSystem();
    notificationSystem.initialize();
    
    // ملاحظة: تم نقل الانضمام للغرفة ومستمعي الأحداث إلى داخل معالج 'connect' في initializeSocketIO
});

/**
 * تشغيل صوت الإشعار
 */
function playNotificationSound() {
    try {
        const audio = new Audio('/sounds/notification.wav');
        audio.volume = 0.5;
        audio.play().catch(e => {
            // تجاهل أخطاء تشغيل الصوت التي قد تحدث بسبب سياسات المتصفح
        });
    } catch (error) {
        console.error('خطأ في تشغيل صوت الإشعار:', error);
    }
}

/**
 * فئة نظام الإشعارات
 * تدير تفاعلات المستخدم مع الإشعارات وتحديثها
 */
class NotificationSystem {
    constructor() {
        // العناصر في الـDOM
        this.notificationMenu = document.querySelector('.notifications-menu');
        this.unreadBadge = document.querySelector('.unread-badge');
        this.notificationsList = document.querySelector('.notifications-list');
        this.emptyState = document.querySelector('.empty-state');
        this.spinner = document.querySelector('.spinner-container');
        this.markAllReadBtn = document.querySelector('.mark-all-read');
        this.viewAllNotificationsLink = document.querySelector('.view-all-notifications');
        
        // حالة النظام
        this.isLoading = false;
        this.isInitialized = false;
        this.unreadCount = 0;
        this.notifications = [];
        this.currentPage = 0;
        this.hasMoreNotifications = true;
        
        // الإعدادات
        this.refreshInterval = 30000; // 30 ثانية
        this.notificationsPerPage = 10;
    }
    
    /**
     * تهيئة نظام الإشعارات
     */
    initialize() {
        if (this.isInitialized) {
            return;
        }
        
        // تخزين مرجع النظام في النافذة للوصول السهل
        window.notificationSystem = this;
        
        // تحميل الإشعارات الأولية
        this.loadNotifications();
        
        // تحديث عدد الإشعارات غير المقروءة بشكل دوري
        this.startPeriodicRefresh();
        
        // تفعيل مستمع النقر على الإشعارات
        this.attachEventListeners();
        
        this.isInitialized = true;
    }
    
    /**
     * تفعيل مستمعي الأحداث
     */
    attachEventListeners() {
        // تحديد جميع الإشعارات كمقروءة
        if (this.markAllReadBtn) {
            this.markAllReadBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.markAllAsRead();
            });
        }
        
        // مستمع لتحميل المزيد من الإشعارات عند التمرير
        if (this.notificationsList) {
            const container = this.notificationsList.closest('.notifications-container');
            if (container) {
                container.addEventListener('scroll', () => {
                    if (this.hasMoreNotifications && !this.isLoading && this.isNearBottom(container)) {
                        this.loadMoreNotifications();
                    }
                });
            }
        }
        
        // مستمع لفتح قائمة الإشعارات
        if (this.notificationMenu) {
            const dropdownToggle = this.notificationMenu.querySelector('.dropdown-toggle');
            if (dropdownToggle) {
                dropdownToggle.addEventListener('click', () => {
                    // تحميل الإشعارات الجديدة عند فتح القائمة إذا مر وقت كافٍ
                    const now = new Date().getTime();
                    const lastUpdated = this.lastUpdated || 0;
                    if (now - lastUpdated > this.refreshInterval / 2) {
                        this.loadNotifications();
                    }
                });
            }
        }
        
        // مستمع لعرض كل الإشعارات
        if (this.viewAllNotificationsLink) {
            this.viewAllNotificationsLink.addEventListener('click', (e) => {
                e.preventDefault();
                // يمكن هنا تنفيذ انتقال إلى صفحة مخصصة للإشعارات أو فتح مودال
            });
        }
    }
    
    /**
     * التحقق إذا كان التمرير قريبًا من أسفل الحاوية
     * @param {HTMLElement} container - عنصر الحاوية
     * @returns {boolean} هل نحن قريبون من الأسفل
     */
    isNearBottom(container) {
        const threshold = 100; // عتبة 100 بكسل من الأسفل
        return container.scrollHeight - (container.scrollTop + container.clientHeight) < threshold;
    }
    
    /**
     * بدء التحديث الدوري للإشعارات
     */
    startPeriodicRefresh() {
        // تحديث عدد الإشعارات غير المقروءة كل فترة زمنية
        this.refreshInterval = setInterval(() => {
            this.updateUnreadCount();
        }, this.refreshInterval);
    }
    
    /**
     * تحميل الإشعارات من الخادم
     */
    async loadNotifications() {
        try {
            if (this.isLoading) {
                return;
            }
            
            this.isLoading = true;
            this.showLoading();
            
            // إرسال طلب للحصول على الإشعارات
            const response = await fetch(`/api/notifications/user?limit=${this.notificationsPerPage}&skip=0`);
            const data = await response.json();
            
            if (data.success) {
                this.notifications = data.notifications || [];
                this.unreadCount = data.unreadCount || 0;
                
                // تحديث الواجهة
                this.updateUI();
                
                // تحديث وقت آخر تحديث
                this.lastUpdated = new Date().getTime();
                
                // إعادة تعيين حالة التصفح
                this.currentPage = 1;
                this.hasMoreNotifications = this.notifications.length >= this.notificationsPerPage;
            } else {
                console.error('فشل في جلب الإشعارات:', data.message);
            }
        } catch (error) {
            console.error('خطأ في تحميل الإشعارات:', error);
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }
    
    /**
     * تحميل المزيد من الإشعارات عند التمرير
     */
    async loadMoreNotifications() {
        try {
            if (this.isLoading || !this.hasMoreNotifications) {
                return;
            }
            
            this.isLoading = true;
            this.showLoading();
            
            const skip = this.currentPage * this.notificationsPerPage;
            
            // إرسال طلب للحصول على الإشعارات التالية
            const response = await fetch(`/api/notifications/user?limit=${this.notificationsPerPage}&skip=${skip}`);
            const data = await response.json();
            
            if (data.success && data.notifications) {
                // إضافة الإشعارات الجديدة إلى القائمة الحالية
                this.notifications = [...this.notifications, ...data.notifications];
                
                // تحديث الواجهة بالإشعارات الجديدة فقط
                this.appendNotifications(data.notifications);
                
                // تحديث حالة التصفح
                this.currentPage++;
                this.hasMoreNotifications = data.notifications.length >= this.notificationsPerPage;
            } else {
                console.error('فشل في جلب المزيد من الإشعارات:', data.message);
                this.hasMoreNotifications = false;
            }
        } catch (error) {
            console.error('خطأ في تحميل المزيد من الإشعارات:', error);
            this.hasMoreNotifications = false;
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }
    
    /**
     * تحديث عدد الإشعارات غير المقروءة
     */
    async updateUnreadCount() {
        try {
            const response = await fetch('/api/notifications/unread-count');
            const data = await response.json();
            
            if (data.success) {
                const newUnreadCount = data.unreadCount || 0;
                
                // تحديث العداد فقط إذا تغير العدد
                if (newUnreadCount !== this.unreadCount) {
                    this.unreadCount = newUnreadCount;
                    this.updateUnreadBadge();
                    
                    // إذا وصلت إشعارات جديدة، قم بتحديث القائمة في المرة القادمة التي يفتح فيها المستخدم القائمة
                    this.lastUpdated = 0; // تعيين وقت التحديث إلى 0 لضمان التحديث عند فتح القائمة القادم
                }
            }
        } catch (error) {
            console.error('خطأ في تحديث عدد الإشعارات غير المقروءة:', error);
        }
    }
    
    /**
     * تعيين جميع الإشعارات كمقروءة
     */
    async markAllAsRead() {
        // التحقق إذا كان هناك شيء لتحديثه
        if (this.unreadCount === 0 || this.isLoading) {
            return;
        }

        // 1. تحديث الواجهة فوراً للاستجابة السريعة
        const previousUnreadCount = this.unreadCount;
        const previouslyUnreadElements = this.notificationsList.querySelectorAll('.notification-item.unread');
        
        this.unreadCount = 0;
        this.updateUnreadBadge();
        previouslyUnreadElements.forEach(el => el.classList.remove('unread'));
        
        // تعطيل الزر مؤقتًا وإظهار مؤشر العمل
        if (this.markAllReadBtn) {
            this.markAllReadBtn.disabled = true;
            this.markAllReadBtn.textContent = 'جاري المعالجة...'; // تغيير نص الزر
        }
        this.showLoading(); // إظهار المؤشر العام إذا لزم الأمر
        this.isLoading = true;

        try {
            // 2. إرسال الطلب إلى الخادم في الخلفية
            const response = await fetch('/api/notifications/mark-all-read', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (!response.ok || !data.success) {
                // 3. في حالة الفشل، إعادة الحالة السابقة
                console.error('فشل في تعيين جميع الإشعارات كمقروءة:', data.message || 'خطأ غير معروف');
                this.unreadCount = previousUnreadCount; // استعادة العدد
                this.updateUnreadBadge();
                previouslyUnreadElements.forEach(el => el.classList.add('unread')); // استعادة حالة عدم القراءة للعناصر
                // عرض رسالة خطأ للمستخدم
                if (window.showToast) {
                    window.showToast('حدث خطأ أثناء تحديث الإشعارات', 'error');
                }
            }
            // في حالة النجاح، لا يلزم فعل شيء إضافي لأن الواجهة تم تحديثها بالفعل
            
        } catch (error) {
            // 3. في حالة حدوث خطأ في الشبكة، إعادة الحالة السابقة
            console.error('خطأ في الشبكة أثناء تعيين جميع الإشعارات كمقروءة:', error);
            this.unreadCount = previousUnreadCount;
            this.updateUnreadBadge();
            previouslyUnreadElements.forEach(el => el.classList.add('unread'));
            if (window.showToast) {
                window.showToast('خطأ في الشبكة، يرجى المحاولة مرة أخرى', 'error');
            }
        } finally {
            // 4. إعادة تفعيل الزر وإخفاء المؤشر دائماً
            this.isLoading = false;
            this.hideLoading();
            if (this.markAllReadBtn) {
                this.markAllReadBtn.disabled = false;
                this.markAllReadBtn.textContent = 'تعيين الكل كمقروء'; // استعادة النص الأصلي للزر
            }
        }
    }
    
    /**
     * تعيين إشعار واحد كمقروء
     * @param {string} notificationId - معرف الإشعار
     */
    async markAsRead(notificationId) {
        try {
            if (!notificationId) {
                return;
            }
            
            // العثور على الإشعار في الذاكرة
            const notification = this.notifications.find(n => n._id === notificationId);
            if (!notification || notification.isRead) {
                return;
            }
            
            const response = await fetch(`/api/notifications/${notificationId}/read`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ isRead: true })
            });
            
            const data = await response.json();
            
            if (data.success && data.notification) {
                // تحديث الإشعار في الذاكرة
                notification.isRead = true;
                
                // تحديث عداد غير المقروءة
                this.unreadCount = Math.max(0, this.unreadCount - 1);
                
                // تحديث واجهة المستخدم
                this.updateUnreadBadge();
                
                // تحديث تصميم العنصر
                const notificationElement = document.querySelector(`[data-notification-id="${notificationId}"]`);
                if (notificationElement) {
                    notificationElement.classList.remove('unread');
                }
            }
        } catch (error) {
            console.error('خطأ في تعيين الإشعار كمقروء:', error);
        }
    }
    
    /**
     * تحديث واجهة المستخدم
     */
    updateUI() {
        // تحديث شارة الإشعارات غير المقروءة
        this.updateUnreadBadge();
        
        // تحديث قائمة الإشعارات (تحسين محتمل هنا)
        // بدلاً من renderNotifications الكامل، يمكننا تحديث العناصر الموجودة أو إضافة/إزالة حسب الحاجة
        this.renderNotifications(); 
    }
    
    /**
     * تحديث شارة الإشعارات غير المقروءة
     */
    updateUnreadBadge() {
        if (this.unreadBadge) {
            if (this.unreadCount > 0) {
                this.unreadBadge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
                this.unreadBadge.classList.remove('d-none');
            } else {
                this.unreadBadge.classList.add('d-none');
            }
        }
    }
    
    /**
     * عرض جميع الإشعارات
     */
    renderNotifications() {
        if (!this.notificationsList) {
            return;
        }
        
        // حذف المحتوى الموجود
        this.notificationsList.innerHTML = '';
        
        if (this.notifications.length === 0) {
            // عرض حالة الفراغ
            this.notificationsList.appendChild(this.createEmptyState());
            return;
        }
        
        // إضافة كل إشعار إلى القائمة
        this.notifications.forEach(notification => {
            const notificationElement = this.createNotificationElement(notification);
            this.notificationsList.appendChild(notificationElement);
        });
    }
    
    /**
     * إضافة إشعارات جديدة إلى القائمة الحالية
     * @param {Array} newNotifications - الإشعارات الجديدة
     */
    appendNotifications(newNotifications) {
        if (!this.notificationsList || newNotifications.length === 0) {
            return;
        }
        
        // إزالة حالة الفراغ إذا كانت موجودة
        const emptyState = this.notificationsList.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }
        
        // إضافة الإشعارات الجديدة
        newNotifications.forEach(notification => {
            const notificationElement = this.createNotificationElement(notification);
            this.notificationsList.appendChild(notificationElement);
        });
    }
    
    /**
     * إنشاء عنصر إشعار
     * @param {Object} notification - بيانات الإشعار
     * @returns {HTMLElement} عنصر الإشعار
     */
    createNotificationElement(notification) {
        const notificationElement = document.createElement('div');
        notificationElement.className = `dropdown-item notification-item ${notification.isRead ? '' : 'unread'}`;
        notificationElement.setAttribute('data-notification-id', notification._id);
        
        // تنسيق الوقت
        const date = new Date(notification.createdAt);
        const timeString = this.formatTime(date);
        
        // إنشاء الأيقونة بناءً على نوع الإشعار
        let icon = 'fas fa-bell';
        switch (notification.type) {
            case 'message':
                icon = 'fas fa-comment';
                break;
            case 'system':
                icon = 'fas fa-cog';
                break;
            case 'license':
                icon = 'fas fa-file-alt';
                break;
            case 'conversation':
                icon = 'fas fa-comments';
                break;
            case 'user':
                icon = 'fas fa-user';
                break;
        }
        
        // بناء محتوى الإشعار
        notificationElement.innerHTML = `
            <div class="d-flex align-items-start">
                <div class="notification-icon me-2 mt-1">
                    <i class="${icon}"></i>
                </div>
                <div class="notification-content-wrapper">
                    <div class="notification-title">${notification.title}</div>
                    <div class="notification-content">${notification.content}</div>
                    <div class="notification-time">${timeString}</div>
                </div>
            </div>
        `;
        
        // إضافة مستمع النقر
        notificationElement.addEventListener('click', (e) => {
            e.preventDefault();
            
            // تعيين الإشعار كمقروء
            this.markAsRead(notification._id);
            
            // التنقل إلى الرابط إذا كان موجودًا
            if (notification.link) {
                window.location.href = notification.link;
            }
        });
        
        return notificationElement;
    }
    
    /**
     * إنشاء عنصر حالة الفراغ
     * @returns {HTMLElement} عنصر حالة الفراغ
     */
    createEmptyState() {
        const emptyElement = document.createElement('div');
        emptyElement.className = 'dropdown-item empty-state';
        emptyElement.innerHTML = '<p class="text-center text-muted my-3">لا توجد إشعارات جديدة</p>';
        return emptyElement;
    }
    
    /**
     * تنسيق الوقت بطريقة سهلة القراءة
     * @param {Date} date - تاريخ الإشعار
     * @returns {string} الوقت المنسق
     */
    formatTime(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffSeconds < 60) {
            return 'الآن';
        } else if (diffMinutes < 60) {
            return `منذ ${diffMinutes} ${this.pluralize(diffMinutes, 'دقيقة', 'دقائق', 'دقائق')}`;
        } else if (diffHours < 24) {
            return `منذ ${diffHours} ${this.pluralize(diffHours, 'ساعة', 'ساعتين', 'ساعات')}`;
        } else if (diffDays < 7) {
            return `منذ ${diffDays} ${this.pluralize(diffDays, 'يوم', 'يومين', 'أيام')}`;
        } else {
            return date.toLocaleDateString('ar-SA', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }
    
    /**
     * صياغة الكلمات بحسب العدد (للغة العربية)
     * @param {number} count - العدد
     * @param {string} singular - المفرد
     * @param {string} dual - المثنى
     * @param {string} plural - الجمع
     * @returns {string} الصيغة المناسبة
     */
    pluralize(count, singular, dual, plural) {
        if (count === 1) {
            return singular;
        } else if (count === 2) {
            return dual;
        } else if (count >= 3 && count <= 10) {
            return plural;
        } else {
            return singular;
        }
    }
    
    /**
     * إظهار مؤشر التحميل
     */
    showLoading() {
        if (this.spinner) {
            this.spinner.classList.remove('d-none');
        }
    }
    
    /**
     * إخفاء مؤشر التحميل
     */
    hideLoading() {
        if (this.spinner) {
            this.spinner.classList.add('d-none');
        }
    }
    
    /**
     * إضافة إشعار جديد إلى القائمة
     * @param {Object} notification - الإشعار الجديد
     */
    addNewNotification(notification) {
        // إضافة الإشعار في بداية المصفوفة
        this.notifications.unshift(notification);
        
        // التأكد من أن القائمة لا تتجاوز الحد الأقصى المعقول للعرض المباشر
        const maxNotificationsInMemory = 50; // مثال: حد أقصى 50 إشعار في الذاكرة
        if (this.notifications.length > maxNotificationsInMemory) {
            this.notifications.pop(); // إزالة أقدم إشعار من الذاكرة
        }
        
        // تحديث عدد الإشعارات غير المقروءة إذا كان الإشعار الجديد غير مقروء
        if (!notification.isRead) {
            this.unreadCount++;
            this.updateUnreadBadge(); // تحديث الشارة فوراً
        }
        
        // إضافة الإشعار الجديد إلى واجهة المستخدم بطريقة فعالة
        this.prependNotificationElement(notification);
        
        // تحديث حالة الفراغ إذا كانت القائمة فارغة قبل الإضافة
        this.updateEmptyStateVisibility();
    }
    
    /**
     * إضافة عنصر إشعار جديد في بداية القائمة
     * @param {Object} notification - بيانات الإشعار
     */
    prependNotificationElement(notification) {
        if (!this.notificationsList) return;
        
        const notificationElement = this.createNotificationElement(notification);
        this.notificationsList.insertBefore(notificationElement, this.notificationsList.firstChild);
        
        // إزالة عنصر حالة الفراغ إذا كان موجودًا
        const emptyState = this.notificationsList.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }
        
        // إزالة أقدم عنصر إذا تجاوزت القائمة الحد المرئي (اختياري)
        const maxVisibleNotifications = 20; // مثال: حد أقصى 20 عنصر مرئي
        if (this.notificationsList.children.length > maxVisibleNotifications) {
            this.notificationsList.removeChild(this.notificationsList.lastChild);
        }
    }
    
    /**
     * تحديث رؤية حالة الفراغ
     */
    updateEmptyStateVisibility() {
        if (!this.notificationsList) return;
        const hasNotifications = this.notificationsList.querySelector('.notification-item');
        const emptyState = this.notificationsList.querySelector('.empty-state');
        
        if (!hasNotifications && !emptyState) {
            this.notificationsList.appendChild(this.createEmptyState());
        } else if (hasNotifications && emptyState) {
            emptyState.remove();
        }
    }
    
    /**
     * تحديث عدد الإشعارات غير المقروءة
     * @param {Number} count - العدد الجديد
     */
    updateUnreadCount(count) {
        if (typeof count === 'number' && count >= 0) {
            this.unreadCount = count;
            this.updateUnreadBadge();
        }
    }
} 