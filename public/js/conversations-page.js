/**
 * وحدة إدارة صفحة المحادثات - Conversations Page Management Module
 * مخصص لإدارة قائمة المحادثات والفلترة وتحميل التفاصيل
 */

// تعريف وظيفة loadConversationDetails مبكرًا للتأكد من وجودها قبل الاستخدام في دوال أخرى
if (typeof window.loadConversationDetails !== 'function') {
    /**
     * تحميل تفاصيل المحادثة في الجزء الأيمن باستخدام AJAX
     * تعريف موحد للدالة
     */
    window.loadConversationDetails = function(conversationId, skipCache = false) {
        console.log('استدعاء للـ loadConversationDetails مع المعرف:', conversationId);
        
        // سيتم استبدال هذه الدالة لاحقًا بالتنفيذ الكامل بعد تحميل DOM
        // حفظ للتنفيذ عندما تصبح جاهزة
        if (!window._pendingConversationLoads) {
            window._pendingConversationLoads = [];
        }
        window._pendingConversationLoads.push({ id: conversationId, skipCache });
        console.log(`تم حفظ طلب تحميل المحادثة للمعرف: ${conversationId} للتنفيذ لاحقًا`);
    };
}

/**
 * دالة لتنسيق الوقت النسبي (مثل "منذ دقيقة" أو "منذ ساعة")
 * @param {string|Date} timestamp - طابع زمني
 * @returns {string} - الوقت المنسق
 */
if (typeof window.formatRelativeTime !== 'function') {
    window.formatRelativeTime = function(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        // إذا كان أقل من دقيقة
        if (diffMin < 1) {
            return 'الآن';
        }
        
        // إذا كان أقل من ساعة
        if (diffHour < 1) {
            return `منذ ${diffMin} ${diffMin === 1 ? 'دقيقة' : 'دقائق'}`;
        }
        
        // إذا كان أقل من يوم
        if (diffDay < 1) {
            return `منذ ${diffHour} ${diffHour === 1 ? 'ساعة' : 'ساعات'}`;
        }
        
        // إذا كان خلال الأسبوع
        if (diffDay < 7) {
            return `منذ ${diffDay} ${diffDay === 1 ? 'يوم' : 'أيام'}`;
        }
        
        // غير ذلك، استخدام التاريخ
        return date.toLocaleDateString('ar-LY', { 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };
}

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const conversationListContainer = document.getElementById('conversationList');
    const conversationListLoader = document.getElementById('conversationListLoader');
    const noConversationsMessage = document.getElementById('noConversationsMessage');
    const conversationDetailsContainer = document.getElementById('conversationDetailsContainer');
    const filterStatusSelect = document.getElementById('filterStatus');
    const filterAssignmentSelect = document.getElementById('filterAssignment');
    const searchInput = document.getElementById('conversationSearchInput');

    // --- إشارة إلى أن DOM جاهز ---
    console.log('DOM Content Loaded في conversations-page.js');

    // --- Utility Functions ---

    /**
     * دالة تأخير لتحديد معدل تنفيذ البحث أثناء الكتابة
     * @param {Function} func الدالة المراد تأخيرها
     * @param {number} wait وقت التأخير بالمللي ثانية
     * @returns {Function} دالة مؤخرة
     */
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // --- Core Functions ---

    /**
     * جلب المحادثات من الخادم حسب الفلاتر الحالية وعرضها
     * @param {object} filters - معايير الفلترة {status, assignment, searchTerm}
     */
    async function fetchAndRenderConversations(filters = window.currentFilters) {
        if (!conversationListContainer || !conversationListLoader || !noConversationsMessage) return;

        // إظهار مؤشر التحميل وإخفاء رسالة عدم وجود نتائج
        conversationListLoader.classList.remove('d-none');
        conversationListContainer.innerHTML = '';
        noConversationsMessage.classList.add('d-none');

        // بناء معلمات الاستعلام
        const queryParams = new URLSearchParams();
        if (filters.status) queryParams.append('status', filters.status);
        if (filters.assignment) queryParams.append('assignment', filters.assignment);
        if (filters.searchTerm) queryParams.append('search', filters.searchTerm.trim());

        const apiUrl = `/crm/conversations/ajax/list?${queryParams.toString()}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) {
                throw new Error(`خطأ في الاتصال! الحالة: ${response.status}`);
            }

            const data = await response.json();

            if (data.success && Array.isArray(data.conversations)) {
                renderConversationsList(data.conversations);
            } else {
                console.error("فشل في جلب المحادثات أو تنسيق بيانات غير صالح:", data);
                noConversationsMessage.textContent = 'حدث خطأ أثناء تحميل المحادثات.';
                noConversationsMessage.classList.remove('d-none');
            }

        } catch (error) {
            console.error("خطأ في جلب المحادثات:", error);
            noConversationsMessage.textContent = 'فشل الاتصال بالخادم لتحميل المحادثات.';
            noConversationsMessage.classList.remove('d-none');
        } finally {
            conversationListLoader.classList.add('d-none');
            // إعادة إضافة العناصر الثابتة للحفاظ على الهيكل
            conversationListContainer.appendChild(conversationListLoader);
            conversationListContainer.appendChild(noConversationsMessage);
        }
    }

    /**
     * عرض قائمة المحادثات في الشريط الجانبي
     * @param {Array} conversations - مصفوفة من كائنات المحادثات
     */
    function renderConversationsList(conversations) {
        if (!conversationListContainer || !noConversationsMessage) return;

        // إزالة عناصر المحادثات فقط (الإبقاء على مؤشر التحميل والرسائل)
        const items = conversationListContainer.querySelectorAll('.conversation-item');
        items.forEach(item => item.remove());

        if (conversations.length === 0) {
            noConversationsMessage.textContent = 'لا توجد محادثات تطابق الفلتر الحالي.';
            noConversationsMessage.classList.remove('d-none');
        } else {
            noConversationsMessage.classList.add('d-none');
            conversations.forEach(conv => {
                const conversationItemHTML = createConversationItemHTML(conv);
                conversationListContainer.insertAdjacentHTML('beforeend', conversationItemHTML);
                // إعادة تعليق مستمع الحدث بعد إدراج HTML
                const newItemElement = conversationListContainer.querySelector(`.conversation-item[data-conversation-id="${conv._id}"]`);
                if (newItemElement) {
                    attachSingleConversationItemEvent(newItemElement);
                }
            });
            // التأكد من أن المحادثة المحددة حاليًا تظل نشطة
            if (window.currentConversationId) {
                const activeItem = conversationListContainer.querySelector(`.conversation-item[data-conversation-id="${window.currentConversationId}"]`);
                if (activeItem) {
                    activeItem.classList.add('active');
                }
            }
        }
    }

    /**
     * إنشاء HTML لعنصر محادثة واحد في القائمة
     * @param {object} conv - كائن المحادثة
     * @returns {string} - نص HTML لعنصر المحادثة
     */
    function createConversationItemHTML(conv) {
        const isActive = window.currentConversationId === conv._id;
        const isUnread = conv.unreadCount > 0;
        const isAssigned = conv.assignee;
        const isAssignedToMe = isAssigned && conv.assignee._id === window.currentUserId;

        let statusIcon = '';
        let statusTitle = '';
        let statusClass = '';
        if (conv.status === 'closed') {
            statusIcon = '<i class="fas fa-lock"></i>';
            statusTitle = 'محادثة مغلقة';
            statusClass = 'closed';
        } else if (isAssigned) {
            statusIcon = '<i class="fas fa-user-check"></i>';
            statusTitle = 'محادثة مسندة';
            statusClass = 'assigned';
        } else {
            statusIcon = '<i class="fas fa-door-open"></i>';
            statusTitle = 'محادثة مفتوحة';
            statusClass = 'open';
        }

        let assigneeHtml = '';
        if (isAssigned) {
            const assigneeName = conv.assignee.full_name || conv.assignee.username || 'مستخدم';
            assigneeHtml = `
                <div class="conversation-assignee small text-muted mb-1" title="مسندة إلى ${assigneeName}">
                    <i class="fas fa-user-check me-1 text-primary"></i> ${assigneeName}
                </div>
            `;
        }

        const lastMessageContent = conv.lastMessage
            ? (conv.lastMessage.content
                ? conv.lastMessage.content.substring(0, 35) + (conv.lastMessage.content.length > 35 ? '...' : '')
                : (conv.lastMessage.mediaType ? 'محتوى وسائط' : 'رسالة'))
            : 'محادثة جديدة';

        const lastMessageIcon = conv.lastMessage
            ? (conv.lastMessage.direction === 'incoming'
                ? '<i class="fas fa-reply-all text-muted me-1 fa-flip-horizontal"></i>'
                : '<i class="fas fa-reply text-muted me-1"></i>')
            : '<i class="fas fa-info-circle me-1"></i>';

        // استخدام دالة تنسيق الوقت إذا كانت متاحة
        const formattedTime = typeof window.formatRelativeTime === 'function'
            ? window.formatRelativeTime(conv.lastMessageAt || conv.updatedAt)
            : new Date(conv.lastMessageAt || conv.updatedAt).toLocaleString('ar-LY', { hour: '2-digit', minute: '2-digit' });

        return `
            <button type="button"
                    class="list-group-item list-group-item-action conversation-item d-flex flex-column
                           ${isUnread ? 'has-unread' : ''}
                           ${isActive ? 'active' : ''}
                           ${isAssigned ? 'assigned' : ''}
                           ${isAssignedToMe ? 'assigned-to-me' : ''}"
                    data-conversation-id="${conv._id}"
                    data-status="${conv.status || 'open'}">
                <div class="d-flex justify-content-between align-items-start w-100">
                    <div class="conversation-info flex-grow-1 me-2">
                        <div class="conversation-name mb-1">
                            <i class="${conv.channel === 'whatsapp' ? 'fab fa-whatsapp text-success' : 'fas fa-comments text-primary'} me-1"></i>
                            <strong>${conv.customerName || conv.phoneNumber}</strong>
                        </div>
                        ${assigneeHtml}
                        <div class="conversation-preview">
                            <small class="${isUnread ? 'fw-bold' : 'text-muted'}">
                                ${lastMessageIcon}
                                ${lastMessageContent}
                            </small>
                        </div>
                    </div>
                    <div class="conversation-meta text-end text-nowrap">
                        ${isUnread ? `<span class="badge bg-danger rounded-pill conversation-badge mb-1">${conv.unreadCount}</span><br>` : ''}
                        <div class="conversation-time small text-muted mb-1" title="${new Date(conv.lastMessageAt || conv.updatedAt).toLocaleString()}">
                            ${formattedTime}
                        </div>
                        <span class="status-indicator ${statusClass}" title="${statusTitle}">${statusIcon}</span>
                    </div>
                </div>
            </button>
        `;
    }

    /**
     * تحديث عنصر محادثة واحد في القائمة أو إضافته إذا كان جديدًا
     * لمعالجة التحديثات القادمة من Socket.IO - دالة موحدة
     * @param {object} updatedConv - بيانات المحادثة المحدثة
     * @param {boolean} skipReRender - تخطي التحديث الكامل للقائمة
     */
    window.updateConversationInList = function(updatedConv, skipReRender = false) {
        if (!conversationListContainer || !updatedConv || !updatedConv._id) return;

        console.log('تحديث محادثة في القائمة:', updatedConv._id, updatedConv.status);

        let conversationItem = conversationListContainer.querySelector(`.conversation-item[data-conversation-id="${updatedConv._id}"]`);
        const newHTML = createConversationItemHTML(updatedConv); // إنشاء HTML جديد من البيانات المحدثة

        // التحقق مما إذا كانت المحادثة تطابق الفلاتر الحالية
        const matchesFilters = checkFilters(updatedConv, window.currentFilters);

        if (conversationItem) {
            if (!matchesFilters) {
                // إزالة العنصر إذا لم يعد يطابق الفلاتر
                console.log('إزالة العنصر من القائمة لأنه لم يعد يطابق الفلاتر:', updatedConv._id);
                conversationItem.remove();
            } else {
                // تحديث العنصر الموجود مع الحفاظ على وضعه النشط
                const isActive = conversationItem.classList.contains('active');
                const wasBeforeFirstItem = !conversationItem.previousElementSibling || 
                    conversationItem.previousElementSibling.id === 'conversationListLoader' ||
                    conversationItem.previousElementSibling.id === 'noConversationsMessage';
                    
                // تحديث المحتوى فقط بدلاً من استبدال العنصر بالكامل
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = newHTML;
                const newItem = tempDiv.firstElementChild;
                
                // نقل الخصائص المهمة
                if (isActive) newItem.classList.add('active');
                
                // استبدال العنصر
                conversationItem.replaceWith(newItem);
                conversationItem = newItem;
                
                // تعليق مستمع الحدث على العنصر الجديد
                attachSingleConversationItemEvent(conversationItem);

                // نقل العنصر للأعلى إذا كان مقتضى الحال
                if (!wasBeforeFirstItem) {
                    const firstItem = conversationListContainer.querySelector('.conversation-item:not(#conversationListLoader):not(#noConversationsMessage)');
                    if (firstItem && firstItem !== conversationItem) {
                        // نقل عنصر المحادثة إلى الأعلى فقط إذا كان حدث العملية الأخيرة 
                        // (مثلاً رسالة جديدة أو تغيير حالة حديث)
                        const lastUpdated = updatedConv.lastMessageAt || updatedConv.updatedAt;
                        const firstItemId = firstItem.getAttribute('data-conversation-id');
                        const firstItemData = findConversationInCache(firstItemId);
                        const firstItemLastUpdated = firstItemData ? 
                            (firstItemData.lastMessageAt || firstItemData.updatedAt) : null;
                        
                        // مقارنة تواريخ التحديث إذا كانت متاحة
                        if (lastUpdated && firstItemLastUpdated && new Date(lastUpdated) > new Date(firstItemLastUpdated)) {
                            conversationListContainer.insertBefore(conversationItem, firstItem);
                        }
                    }
                }
            }
        } else if (matchesFilters) {
            // إضافة عنصر جديد إذا كان يطابق الفلاتر ولم يكن موجودًا
            console.log('إضافة عنصر جديد إلى القائمة:', updatedConv._id);
            conversationListContainer.insertAdjacentHTML('afterbegin', newHTML); // إضافة في الأعلى
            conversationItem = conversationListContainer.querySelector(`.conversation-item[data-conversation-id="${updatedConv._id}"]`);
            if (conversationItem) {
                attachSingleConversationItemEvent(conversationItem); // تعليق المستمع
            }
        }

        // إعادة تقييم رسالة "لا توجد نتائج" بعد التحديث/الإضافة/الإزالة
        const visibleItems = conversationListContainer.querySelectorAll('.conversation-item:not(#conversationListLoader):not(#noConversationsMessage)').length;
        if (visibleItems === 0) {
            noConversationsMessage.textContent = 'لا توجد محادثات تطابق الفلتر الحالي.';
            noConversationsMessage.classList.remove('d-none');
        } else {
            noConversationsMessage.classList.add('d-none');
        }
        
        // تحديث ذاكرة التخزين المؤقت للمحادثات
        updateConversationCache(updatedConv);
    };
    
    /**
     * ذاكرة تخزين مؤقت للمحادثات (كاش)
     * لتجنب الطلبات المتكررة وتحسين الأداء
     */
    const conversationsCache = new Map();
    
    /**
     * تحديث ذاكرة التخزين المؤقت للمحادثات
     * @param {object} conversation - كائن المحادثة
     */
    function updateConversationCache(conversation) {
        if (conversation && conversation._id) {
            conversationsCache.set(conversation._id, {
                ...conversation,
                _cachedAt: new Date()
            });
        }
    }
    
    /**
     * البحث عن محادثة في ذاكرة التخزين المؤقت
     * @param {string} conversationId - معرف المحادثة
     * @returns {object|null} - كائن المحادثة أو null
     */
    function findConversationInCache(conversationId) {
        return conversationsCache.get(conversationId) || null;
    }

    /**
     * التحقق مما إذا كانت محادثة تطابق معايير الفلترة الحالية
     * @param {object} conv - كائن المحادثة
     * @param {object} filters - إعدادات الفلتر الحالية {status, assignment, searchTerm}
     * @returns {boolean} - صحيح إذا كانت المحادثة تطابق، خطأ خلاف ذلك
     */
    function checkFilters(conv, filters) {
        if (!conv) return false;

        // فلتر الحالة
        const statusMatch = !filters.status || 
                            filters.status === conv.status || 
                            (filters.status === 'open' && conv.status !== 'closed');

        // فلتر التعيين
        let assignmentMatch = true;
        if (filters.assignment === 'mine') {
            assignmentMatch = conv.assignee && conv.assignee._id === window.currentUserId;
        } else if (filters.assignment === 'unassigned') {
            assignmentMatch = !conv.assignee;
        } // 'all' يطابق كل شيء

        // فلتر البحث (فحص بسيط للاسم/الهاتف)
        const searchTerm = filters.searchTerm ? filters.searchTerm.trim().toLowerCase() : '';
        const searchMatch = !searchTerm ||
                            (conv.customerName && conv.customerName.toLowerCase().includes(searchTerm)) ||
                            (conv.phoneNumber && conv.phoneNumber.toLowerCase().includes(searchTerm));

        return statusMatch && assignmentMatch && searchMatch;
    }

    /**
     * تحديث حالة المحادثة في واجهة المستخدم
     * @param {string} status - الحالة الجديدة ('open' أو 'closed')
     * @param {boolean} skipReRender - تخطي إعادة تحميل القائمة
     */
    function updateConversationStatus(status, skipReRender = false) {
        console.log('تحديث حالة المحادثة إلى:', status);
        
        // 1. محاولة العثور على مؤشر الحالة بعدة طرق ممكنة
        const statusIndicator = 
            document.querySelector('.conversation-status-indicator') || // محدد النمط المحدد
            document.querySelector('.badge[title*="محادثة"]') || // البحث بالعنوان التوضيحي
            document.querySelector('.status-indicator'); // نمط بديل
            
        // 2. الأزرار
        const reopenButton = document.querySelector('.reopen-conversation-btn');
        const closeButton = document.querySelector('.close-conversation-btn');
        
        console.log('الأزرار:', { reopenButton, closeButton });
        
        // 3. نموذج الرد وتنبيه المحادثة المغلقة
        const replyForm = document.getElementById('replyForm');
        
        // استخدام طريقة آمنة للعثور على تنبيه المحادثة المغلقة
        let closedAlert = null;
        const alerts = document.querySelectorAll('.alert, .alert-info, .alert-secondary');
        closedAlert = Array.from(alerts).find(el => 
            el.textContent.includes('هذه المحادثة مغلقة') || 
            el.textContent.includes('المحادثة مغلقة') || 
            el.textContent.includes('محادثة مغلقة')
        );
        
        console.log('مؤشرات واجهة المستخدم:', { 
            statusIndicator: statusIndicator ? statusIndicator.outerHTML : 'غير موجود', 
            replyForm: replyForm ? true : false,
            closedAlert: closedAlert ? closedAlert.outerHTML : 'غير موجود'
        });
        
        if (status === 'open') {
            // تحديث مؤشر الحالة
            if (statusIndicator) {
                statusIndicator.innerHTML = '<i class="fas fa-door-open text-success"></i> مفتوحة';
                if (statusIndicator.classList.contains('badge')) {
                    statusIndicator.className = 'badge bg-success'; // للطبقات الحالية
                } else {
                    statusIndicator.className = 'status-indicator open'; // للطبقات القديمة
                }
            }
            
            // إخفاء زر إعادة الفتح وإظهار زر الإغلاق
            if (reopenButton) reopenButton.style.display = 'none';
            if (closeButton) closeButton.style.display = 'inline-block';
            
            // إظهار نموذج الرد وإخفاء تنبيه الإغلاق
            if (replyForm) replyForm.style.display = 'block';
            if (closedAlert) closedAlert.style.display = 'none';
            
            // تحديث قائمة المحادثات (إلا إذا طلب التخطي)
            if (!skipReRender) {
                fetchAndRenderConversations(window.currentFilters);
            }
        } else if (status === 'closed') {
            // تحديث مؤشر الحالة
            if (statusIndicator) {
                statusIndicator.innerHTML = '<i class="fas fa-lock text-danger"></i> مغلقة';
                if (statusIndicator.classList.contains('badge')) {
                    statusIndicator.className = 'badge bg-danger'; // للطبقات الحالية
                } else {
                    statusIndicator.className = 'status-indicator closed'; // للطبقات القديمة
                }
            }
            
            // إخفاء زر الإغلاق وإظهار زر إعادة الفتح
            if (reopenButton) reopenButton.style.display = 'inline-block';
            if (closeButton) closeButton.style.display = 'none';
            
            // إخفاء نموذج الرد وإظهار تنبيه الإغلاق
            if (replyForm) replyForm.style.display = 'none';
            if (!closedAlert) {
                // إنشاء التنبيه إذا لم يكن موجودًا
                const alert = document.createElement('div');
                alert.className = 'alert alert-secondary mt-3';
                alert.innerHTML = '<i class="fas fa-lock me-1"></i> المحادثة مغلقة، لا يمكن الرد.';
                
                // إضافة التنبيه إلى الصفحة
                const container = document.querySelector('.conversation-details-container') || document.body;
                container.appendChild(alert);
            } else {
                closedAlert.style.display = 'block';
            }
            
            // تحديث قائمة المحادثات (إلا إذا طلب التخطي)
            if (!skipReRender) {
                fetchAndRenderConversations(window.currentFilters);
            }
        }
        
        // تحديث العنصر في القائمة أيضًا
        if (window.currentConversationId) {
            const listItem = document.querySelector(`.conversation-item[data-conversation-id="${window.currentConversationId}"]`);
            if (listItem) {
                listItem.setAttribute('data-status', status === 'open' ? 'open' : 'closed');
                
                // تحديث مؤشر الحالة في القائمة
                const listItemStatus = listItem.querySelector('.status-indicator');
                if (listItemStatus) {
                    if (status === 'open') {
                        listItemStatus.className = 'status-indicator open';
                        listItemStatus.innerHTML = '<i class="fas fa-door-open"></i>';
                        listItemStatus.title = 'محادثة مفتوحة';
                    } else {
                        listItemStatus.className = 'status-indicator closed';
                        listItemStatus.innerHTML = '<i class="fas fa-lock"></i>';
                        listItemStatus.title = 'محادثة مغلقة';
                    }
                }
            }
        }
    }

    /**
     * تعليق مستمع حدث النقر على عنصر محادثة واحد
     * @param {HTMLElement} itemElement - عنصر زر المحادثة
     */
    function attachSingleConversationItemEvent(itemElement) {
        if (!itemElement) return;
        // نسخ واستبدال لإزالة المستمعات القديمة بأمان
        const newItem = itemElement.cloneNode(true);
        itemElement.parentNode.replaceChild(newItem, itemElement);

        newItem.addEventListener('click', function() {
            const conversationId = this.getAttribute('data-conversation-id');
            if (conversationId) {
                window.loadConversationDetails(conversationId);
            }
        });
    }
    
    /**
     * تحميل تفاصيل المحادثة في الجزء الأيمن باستخدام AJAX (تعريف موحد)
     * @param {string} conversationId - معرف المحادثة المراد تحميلها
     * @param {boolean} skipCache - ما إذا كان يجب فرض تحديث ذاكرة التخزين المؤقت
     */
    window.loadConversationDetails = function(conversationId, skipCache = false) {
        if (!conversationId || !conversationDetailsContainer) return;

        console.log('تحميل تفاصيل المحادثة:', conversationId);

        // تحديث اختيار القائمة
        const allItems = conversationListContainer.querySelectorAll('.conversation-item');
        allItems.forEach(item => item.classList.remove('active'));
        const selectedItem = conversationListContainer.querySelector(`.conversation-item[data-conversation-id="${conversationId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('active');
            // تحديد كمقروء مرئيًا فورًا (إزالة أنماط غير المقروء) - سيؤكد الخادم لاحقًا
            selectedItem.classList.remove('has-unread');
            const badge = selectedItem.querySelector('.conversation-badge');
            if (badge) badge.remove();
            const preview = selectedItem.querySelector('.conversation-preview small');
            if (preview) preview.classList.remove('fw-bold');
        }

        // تحديث الحالة العامة
        window.currentConversationId = conversationId;

        // الانضمام إلى غرفة Socket.IO
        if (window.socketConnection && window.socketConnected) {
            console.log(`الانضمام للغرفة: conversation-${conversationId}`);
            window.socketConnection.emit('join', { room: `conversation-${conversationId}` });
            // مغادرة الغرفة السابقة إذا كانت مُتتبعة
            if (window.previousConversationId && window.previousConversationId !== conversationId) {
                console.log(`مغادرة الغرفة: conversation-${window.previousConversationId}`);
                window.socketConnection.emit('leave', { room: `conversation-${window.previousConversationId}` });
            }
            window.previousConversationId = conversationId; // تتبع الغرفة الحالية
        } else {
            console.warn("Socket غير متصل أو وظيفة joinConversationRoom غير متاحة.");
        }

        // جلب وعرض التفاصيل
        conversationDetailsContainer.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100">
                <div class="text-center p-5">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">جاري التحميل...</span>
                    </div>
                    <p class="mt-2 text-muted">جاري تحميل المحادثة...</p>
                </div>
            </div>
        `;

        const url = new URL(`/crm/conversations/ajax/details/${conversationId}`, window.location.origin);
        if (skipCache) {
            url.searchParams.append('t', Date.now());
        }

        fetch(url.toString(), {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Cache-Control': skipCache ? 'no-cache' : 'default'
            }
        }).then(response => {
            if (!response.ok) {
                throw new Error(`خطأ HTTP ${response.status}`);
            }
            return response.text();
        }).then(html => {
            conversationDetailsContainer.innerHTML = html;

            // إجراءات ما بعد التحميل
            // 1. التمرير إلى الأسفل (بعد تأخير قصير للعرض)
            setTimeout(() => {
                const msgContainer = document.getElementById('messageContainer');
                if (msgContainer) {
                    msgContainer.scrollTop = msgContainer.scrollHeight;
                }
            }, 100);

            // 2. تعليق المستمعات العامة للأحداث (الرد، التفاعلات، إلخ)
            if (typeof window.attachConversationEventListeners === 'function') {
                window.attachConversationEventListeners();
            }

            // 3. تهيئة ترقيم الرسائل
            if (window.conversationPagination && typeof window.conversationPagination.initialize === 'function') {
                window.conversationPagination.initialize({ conversationId: conversationId });
            }

            // 4. إعداد أزرار التعيين
            if (typeof window.setupAssignmentButtons === 'function') {
                window.setupAssignmentButtons();
            }

            // 5. تنسيق التواريخ/الأوقات
            if (typeof window.formatAllMessageTimes === 'function') {
                setTimeout(window.formatAllMessageTimes, 200);
            }

            // 6. تهيئة وظائف الملاحظات
            if (typeof window.initializeNotes === 'function') {
                window.initializeNotes(conversationId);
            }
            
            // 7. ربط معالجات الأحداث لأزرار إغلاق وإعادة فتح المحادثة
            attachButtonEventHandlers();
        }).catch(error => {
            console.error("خطأ في تحميل تفاصيل المحادثة:", error);
            conversationDetailsContainer.innerHTML = `
                <div class="alert alert-danger m-3">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    حدث خطأ أثناء جلب تفاصيل المحادثة: ${error.message}
                </div>
            `;
            window.currentConversationId = null; // إعادة تعيين إذا فشل التحميل
        });
    };
    
    /**
     * ربط معالجات الأحداث لأزرار إغلاق وإعادة فتح المحادثة
     * تستخدم الوظائف الموجودة في conversation-utils.js
     */
    function attachButtonEventHandlers() {
        // 1. زر إعادة فتح المحادثة
        const reopenButtons = document.querySelectorAll('.reopen-conversation-btn');
        reopenButtons.forEach(btn => {
            if (!btn.dataset.listenerAttached) {
                btn.addEventListener('click', handleReopenClick);
                btn.dataset.listenerAttached = 'true';
            }
        });

        // 2. زر إغلاق المحادثة
        const closeButtons = document.querySelectorAll('.close-conversation-btn');
        closeButtons.forEach(btn => {
            if (!btn.dataset.listenerAttached) {
                btn.addEventListener('click', handleCloseClick);
                btn.dataset.listenerAttached = 'true';
            }
        });
    }

    /**
     * معالج حدث النقر على زر إعادة فتح المحادثة
     * @param {Event} e - حدث النقر
     */
    function handleReopenClick(e) {
        e.preventDefault();
        const conversationId = this.getAttribute('data-conversation-id');
        if (!conversationId) {
            console.error('معرف المحادثة غير موجود في زر إعادة الفتح');
            return;
        }

        // تعطيل الزر وعرض حالة التحميل
        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إعادة الفتح...';

        // استخدام الوظيفة الموجودة في conversation-utils.js
        if (typeof window.reopenConversation === 'function') {
            window.reopenConversation(conversationId)
                .then(result => {
                    console.log('تم إعادة فتح المحادثة بنجاح:', result);
                    
                    // إظهار رسالة نجاح
                    if (typeof window.showToast === 'function') {
                        window.showToast('success', 'تم إعادة فتح المحادثة بنجاح');
                    }

                    // تحديث واجهة المستخدم
                    updateConversationStatus('open', true);
                    
                    // تحديث القائمة
                    fetchAndRenderConversations(window.currentFilters);
                })
                .catch(error => {
                    // إظهار رسالة خطأ
                    console.error('فشل إعادة فتح المحادثة:', error);
                    if (typeof window.showToast === 'function') {
                        window.showToast('error', `فشل إعادة فتح المحادثة: ${error}`);
                    }
                    
                    // إعادة الزر إلى حالته الأصلية
                    this.disabled = false;
                    this.innerHTML = '<i class="fas fa-lock-open"></i> إعادة فتح';
                });
        } else {
            console.error('وظيفة reopenConversation غير موجودة في conversation-utils.js');
            // إعادة الزر إلى حالته الأصلية
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-lock-open"></i> إعادة فتح';
        }
    }

    /**
     * معالج حدث النقر على زر إغلاق المحادثة
     * @param {Event} e - حدث النقر
     */
    function handleCloseClick(e) {
        e.preventDefault();
        const conversationId = this.getAttribute('data-conversation-id');
        if (!conversationId) {
            console.error('معرف المحادثة غير موجود في زر الإغلاق');
            return;
        }

        // تعطيل الزر وعرض حالة التحميل
        this.disabled = true;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإغلاق...';

        // استخدام الوظيفة الموجودة في conversation-utils.js
        if (typeof window.closeConversation === 'function') {
            window.closeConversation(conversationId)
                .then(result => {
                    console.log('تم إغلاق المحادثة بنجاح:', result);
                    
                    // إظهار رسالة نجاح
                    if (typeof window.showToast === 'function') {
                        window.showToast('success', 'تم إغلاق المحادثة بنجاح');
                    }

                    // تحديث واجهة المستخدم
                    updateConversationStatus('closed', true);
                    
                    // تحديث القائمة
                    fetchAndRenderConversations(window.currentFilters);
                })
                .catch(error => {
                    // إظهار رسالة خطأ
                    console.error('فشل إغلاق المحادثة:', error);
                    if (typeof window.showToast === 'function') {
                        window.showToast('error', `فشل إغلاق المحادثة: ${error}`);
                    }
                    
                    // إعادة الزر إلى حالته الأصلية
                    this.disabled = false;
                    this.innerHTML = '<i class="fas fa-lock"></i> إغلاق';
                });
        } else {
            console.error('وظيفة closeConversation غير موجودة في conversation-utils.js');
            // إعادة الزر إلى حالته الأصلية
            this.disabled = false;
            this.innerHTML = '<i class="fas fa-lock"></i> إغلاق';
        }
    }
    
    // --- معالجات أحداث Socket.IO ---
    /**
     * إعداد مستمعي Socket.IO الموحدين للمحادثات
     */
    window.setupSocketListeners = function() {
        if (!window.socketConnection) {
            console.error("اتصال Socket غير متاح لإعداد المستمعين.");
            return;
        }

        console.log("إعداد مستمعي Socket.IO لقائمة المحادثات...");

        // إزالة جميع المستمعين السابقة لتجنب التكرار
        window.socketConnection.off('conversation-list-update');
        window.socketConnection.off('conversation-update');
        window.socketConnection.off('new-message');

        // مستمع تحديثات المحادثة في القائمة - استخدام لمعالجة تغييرات القائمة
        window.socketConnection.on('conversation-list-update', (updatedConversation) => {
            console.log('Socket تلقى conversation-list-update:', updatedConversation);
            
            // تخزين الحدث ومعالجته بعد فترة زمنية لتجنب التكرار
            handleSocketUpdateDebounced('list-update', updatedConversation);
        });

        // مستمع لتحديثات المحادثة العامة - استخدام لتحديث تفاصيل المحادثة
        window.socketConnection.on('conversation-update', (data) => {
            console.log('Socket تلقى conversation-update:', data);
            
            // تحديث الواجهة المحلية إذا كانت المحادثة مفتوحة حاليًا
            if (data && data._id && window.currentConversationId === data._id) {
                if (data.type === 'status') {
                    // تحديث حالة المحادثة في الواجهة المحلية
                    updateConversationStatus(data.status, true); // تمرير true لتجنب إعادة تحميل القائمة
                }
                
                // تحديث تفاصيل المحادثة إذا كان الحدث يخص معلومات أخرى مهمة
                if (data.type === 'assignment' || data.type === 'info') {
                    if (typeof window.updateConversationHeader === 'function') {
                        window.updateConversationHeader(data);
                    }
                }
                
                // معالجة تحديثات التعيين
                if (data.type === 'assigned') {
                    if (data.assignee) {
                        // استخدام بيانات المستخدم المعين الكاملة من الإشعار
                        const assigneeInfo = document.getElementById('assigneeInfo');
                        const assignToMeBtn = document.getElementById('assignToMeBtn');
                        
                        if (assigneeInfo) {
                            const assigneeName = data.assignee.full_name || data.assignee.username || 'مستخدم';
                            assigneeInfo.innerHTML = `<i class="fas fa-user-check me-1"></i> ${assigneeName}`;
                        }
                        
                        // إخفاء زر التعيين الشخصي إذا كان المستخدم الحالي هو المعين
                        if (assignToMeBtn && data.assignee._id === window.currentUserId) {
                            assignToMeBtn.style.display = 'none';
                        }
                    } else {
                        const assigneeInfo = document.getElementById('assigneeInfo');
                        const assignToMeBtn = document.getElementById('assignToMeBtn');
                        
                        if (assigneeInfo) {
                            assigneeInfo.innerHTML = '<i class="fas fa-exclamation-circle me-1"></i> غير معين';
                        }
                        
                        // إظهار زر التعيين الشخصي
                        if (assignToMeBtn) {
                            assignToMeBtn.style.display = 'inline-block';
                        }
                    }
                    
                    // تحديث حالة المحادثة في البطاقة الرئيسية
                    const statusBadge = document.querySelector('.conversation-status-badge');
                    if (statusBadge) {
                        if (data.assignee) {
                            statusBadge.className = 'badge bg-info ms-2 conversation-status-badge';
                            statusBadge.innerHTML = '<i class="fas fa-user-check me-1"></i> مسندة';
                        } else {
                            statusBadge.className = 'badge bg-success ms-2 conversation-status-badge';
                            statusBadge.innerHTML = '<i class="fas fa-door-open me-1"></i> مفتوحة';
                        }
                    }
                }
            }
            
            // تخزين الحدث ومعالجته بعد فترة زمنية لتجنب التكرار
            handleSocketUpdateDebounced('update', data);
        });

        // مستمع للرسائل الجديدة (قد تؤثر على ترتيب القائمة أو المعاينة)
        window.socketConnection.on('new-message', (messageData) => {
            console.log('Socket تلقى new-message:', messageData);
            
            if (messageData && messageData.conversation) {
                // تخزين الحدث ومعالجته بعد فترة زمنية لتجنب التكرار
                handleSocketUpdateDebounced('message', messageData.conversation);
            } else if (messageData && messageData.conversationId) {
                // احتياطي: جلب المحادثة المحدثة لتحديث عنصرها في القائمة
                fetch(`/crm/conversations/ajax/single/${messageData.conversationId}`)
                    .then(res => res.ok ? res.json() : Promise.reject('فشل الجلب'))
                    .then(data => {
                        if (data.success && data.conversation) {
                            handleSocketUpdateDebounced('message', data.conversation);
                        }
                    })
                    .catch(err => console.error("خطأ في جلب محادثة واحدة للتحديث:", err));
            }

            // تشغيل الصوت فقط إذا كانت رسالة واردة لدردشة مختلفة
            if (messageData.direction === 'incoming' && messageData.conversationId !== window.currentConversationId && typeof window.playNotificationSound === 'function') {
                window.playNotificationSound();
            }
        });

        // --- معالجة الاتصال/الانقطاع ---
        window.socketConnection.on('connect', () => {
            console.log('إعادة اتصال Socket (conversations-page.js).');
            // إعادة الانضمام للغرفة إذا كانت هناك محادثة مفتوحة
            if (window.currentConversationId) {
                window.socketConnection.emit('join', { room: `conversation-${window.currentConversationId}` });
            }
        });

        window.socketConnection.on('disconnect', () => {
            console.log('انقطاع اتصال Socket (conversations-page.js).');
        });
    };
    
    /**
     * مخزن مؤقت للأحداث
     * لمعالجة مشكلة الأحداث المتكررة/المتداخلة
     */
    const socketUpdateStore = {
        pendingUpdates: new Map(),
        processing: false,
        timeout: null
    };
    
    /**
     * معالجة تحديثات Socket.IO بتأخير لتجنب التكرار
     * @param {string} type - نوع الحدث (update, list-update, message)
     * @param {object} data - بيانات المحادثة
     */
    function handleSocketUpdateDebounced(type, data) {
        if (!data || !data._id) return;
        
        // تخزين آخر تحديث لكل محادثة
        socketUpdateStore.pendingUpdates.set(data._id, {
            type,
            data,
            timestamp: Date.now()
        });
        
        // تأخير المعالجة لتجميع التحديثات
        clearTimeout(socketUpdateStore.timeout);
        socketUpdateStore.timeout = setTimeout(() => {
            if (!socketUpdateStore.processing) {
                processSocketUpdates();
            }
        }, 300); // انتظار 300 مللي ثانية لتجميع الأحداث
    }
    
    /**
     * معالجة التحديثات المجمعة من Socket.IO
     */
    function processSocketUpdates() {
        socketUpdateStore.processing = true;
        
        try {
            if (socketUpdateStore.pendingUpdates.size === 0) {
                socketUpdateStore.processing = false;
                return;
            }
            
            console.log(`معالجة ${socketUpdateStore.pendingUpdates.size} تحديثات معلقة من Socket.IO`);
            
            // معالجة كل تحديث على حدة
            socketUpdateStore.pendingUpdates.forEach((update, id) => {
                updateConversationInList(update.data, true); // تمرير true لتجنب إعادة التحميل
            });
            
            // تفريغ المخزن المؤقت
            socketUpdateStore.pendingUpdates.clear();
        } catch (error) {
            console.error('خطأ في معالجة تحديثات Socket:', error);
        } finally {
            socketUpdateStore.processing = false;
        }
    }

    /**
     * تهيئة الصفحة
     */
    function initializePage() {
        if (window.socketConnected) {
            console.log("Socket متصل بالفعل، تهيئة الصفحة.");
            setupSocketListeners();
            fetchAndRenderConversations(window.currentFilters); // التحميل الأولي للبيانات
        } else {
            // انتظار الاتصال المنشأ في ملف EJS
            console.log("انتظار اتصال Socket...");
            window.socketConnection.once('connect', () => {
                console.log("تم استلام حدث اتصال Socket، تهيئة الصفحة.");
                setupSocketListeners();
                fetchAndRenderConversations(window.currentFilters); // التحميل الأولي للبيانات
            });
            // إضافة وقت انتظار احتياطي في حالة تفويت حدث الاتصال أو استغراقه وقتًا طويلاً
            setTimeout(() => {
                if (!window.socketConnected) {
                    console.warn("انتهت مهلة اتصال Socket، محاولة التهيئة على أي حال.");
                    if (window.socketConnection && window.socketConnection.io && !window.socketConnection.connected) {
                        window.socketConnection.connect(); // محاولة إعادة الاتصال صراحة
                    }
                    setupSocketListeners(); // محاولة إعداد المستمعين حتى لو منقطع
                    fetchAndRenderConversations(window.currentFilters); // محاولة التحميل الأولي
                }
            }, 5000); // انتظار 5 ثوان
        }
    }

    initializePage();

}); // نهاية DOMContentLoaded 