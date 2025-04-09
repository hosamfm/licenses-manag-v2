document.addEventListener('DOMContentLoaded', function() {
    // المتغيرات العامة
    let currentPage = 1;
    let totalPages = 1;
    let searchQuery = '';
    let selectedUserId = '';
    let clientsData = [];
    let selectedClientId = null;

    // استدعاء تحميل البيانات عند تحميل الصفحة
    loadClientsData();

    // البحث عن العملاء
    document.getElementById('searchQuery').addEventListener('input', function() {
        searchQuery = this.value;
        currentPage = 1;
        loadClientsData();
    });

    // تصفية حسب المستخدم (إذا كان متاحًا)
    const filterUserName = document.getElementById('filterUserName');
    if (filterUserName) {
        loadUsersList();
        filterUserName.addEventListener('change', function() {
            selectedUserId = this.value;
            currentPage = 1;
            loadClientsData();
        });
    }

    // معالجة النقر على زر التحرير في النافذة المنبثقة
    document.getElementById('editClientBtn').addEventListener('click', function() {
        const clientId = document.getElementById('modal-client-id').value;
        openEditModal(clientId);
    });

    // حفظ تغييرات تحرير العميل
    document.getElementById('saveClientBtn').addEventListener('click', function() {
        saveClientChanges();
    });

    // تأكيد حذف العميل
    document.getElementById('confirmDeleteBtn').addEventListener('click', function() {
        deleteClient(selectedClientId);
    });

    // نسخ مفتاح API
    document.getElementById('copyApiKeyBtn').addEventListener('click', function() {
        copyToClipboard(document.getElementById('modal-client-api-key').textContent);
        showToast('تم نسخ مفتاح API بنجاح');
    });

    // نسخ مفتاح API الجديد
    document.getElementById('copyNewApiKeyBtn').addEventListener('click', function() {
        copyToClipboard(document.getElementById('new-api-key').value);
        showToast('تم نسخ مفتاح API الجديد بنجاح');
    });

    // فتح مودال تأكيد إعادة توليد المفاتيح
    document.getElementById('regenerateApiKeysBtn').addEventListener('click', function() {
        $('#regenerateKeysModal').modal('show');
    });

    // تأكيد إعادة توليد مفتاح API
    document.getElementById('confirmRegenerateKeysBtn').addEventListener('click', function() {
        regenerateApiKeys(selectedClientId);
    });

    // التعامل مع تغيير خيارات قنوات الإرسال وإظهار قائمة القناة المفضلة في نافذة التعديل
    document.getElementById('edit-sms-channel').addEventListener('change', updateEditPreferredChannelOptions);
    document.getElementById('edit-whatsapp-channel').addEventListener('change', updateEditPreferredChannelOptions);
    document.getElementById('edit-metawhatsapp-channel').addEventListener('change', function() {
        updateEditPreferredChannelOptions();
        toggleEditMetaWhatsappTemplateSettings();
    });

    // معالجة تغيير اختيار الدولة في نموذج التعديل
    document.getElementById('edit-country-select').addEventListener('change', updateEditCountryFields);

    /**
     * تحميل قائمة المستخدمين للفلتر
     */
    function loadUsersList() {
        fetch('/api/users')
            .then(response => {
                if (!response.ok) {
                    throw new Error('فشل في تحميل قائمة المستخدمين');
                }
                return response.json();
            })
            .then(data => {
                const selectElement = document.getElementById('filterUserName');
                selectElement.innerHTML = '<option value="">اختر المستخدم</option>';
                
                data.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user._id;
                    option.textContent = user.name || user.username;
                    selectElement.appendChild(option);
                });
            })
            .catch(error => {
                console.error('Error loading users:', error);
                // No mostrar el toast para evitar mensajes de error innecesarios
                // showToast('حدث خطأ أثناء تحميل قائمة المستخدمين', 'error');
            });
    }

    /**
     * تحميل بيانات العملاء
     */
    function loadClientsData() {
        // إظهار مؤشر التحميل
        document.getElementById('clientsTableBody').innerHTML = '<tr><td colspan="11" class="text-center">جاري التحميل...</td></tr>';
        
        // بناء عنوان URL مع المعلمات
        let url = `/api/sem-clients?page=${currentPage}`;
        if (searchQuery) {
            url += `&searchQuery=${encodeURIComponent(searchQuery)}`;
        }
        if (selectedUserId) {
            url += `&selectedUserId=${encodeURIComponent(selectedUserId)}`;
        }
        
        // استدعاء API
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error('فشل في تحميل بيانات العملاء');
                }
                return response.json();
            })
            .then(data => {
                clientsData = data.docs;
                renderClientsTable(data);
                updatePagination(data);
                updateSummary(data);
            })
            .catch(error => {
                console.error('Error loading clients:', error);
                document.getElementById('clientsTableBody').innerHTML = '<tr><td colspan="11" class="text-center text-danger">حدث خطأ أثناء تحميل البيانات</td></tr>';
                showToast('حدث خطأ أثناء تحميل بيانات العملاء', 'error');
            });
    }

    /**
     * عرض بيانات العملاء في الجدول
     */
    function renderClientsTable(data) {
        const tableBody = document.getElementById('clientsTableBody');
        const showUserColumn = document.getElementById('filterUserName') !== null;
        
        if (data.docs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="11" class="text-center">لا توجد بيانات لعرضها</td></tr>';
            document.getElementById('noDataMessage').style.display = 'block';
            return;
        }
        
        document.getElementById('noDataMessage').style.display = 'none';
        tableBody.innerHTML = '';
        
        data.docs.forEach((client, index) => {
            const row = document.createElement('tr');
            
            // رقم
            const numberCell = document.createElement('td');
            numberCell.className = 'text-center';
            numberCell.textContent = (data.page - 1) * data.limit + index + 1;
            row.appendChild(numberCell);
            
            // منشئ الحساب (فقط للمدير أو المشرف)
            if (showUserColumn) {
                const userCell = document.createElement('td');
                userCell.className = 'text-center';
                userCell.textContent = client.userId ? (client.userId.name || client.userId.username) : 'غير معروف';
                row.appendChild(userCell);
            }
            
            // اسم العميل
            const nameCell = document.createElement('td');
            nameCell.className = 'text-center';
            nameCell.textContent = client.name;
            row.appendChild(nameCell);
            
            // رقم الهاتف
            const phoneCell = document.createElement('td');
            phoneCell.className = 'text-center';
            phoneCell.textContent = client.phone;
            row.appendChild(phoneCell);
            
            // الشركة
            const companyCell = document.createElement('td');
            companyCell.className = 'text-center';
            companyCell.textContent = client.company || '-';
            row.appendChild(companyCell);
            
            // الحالة
            const statusCell = document.createElement('td');
            statusCell.className = 'text-center';
            
            const statusBadge = document.createElement('span');
            statusBadge.className = 'badge';
            
            switch (client.status) {
                case 'active':
                    statusBadge.className += ' bg-success';
                    statusBadge.textContent = 'نشط';
                    break;
                case 'inactive':
                    statusBadge.className += ' bg-secondary';
                    statusBadge.textContent = 'غير نشط';
                    break;
                case 'suspended':
                    statusBadge.className += ' bg-danger';
                    statusBadge.textContent = 'معلق';
                    break;
                default:
                    statusBadge.className += ' bg-secondary';
                    statusBadge.textContent = 'غير معروف';
            }
            
            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);
            
            // الرصيد
            const balanceCell = document.createElement('td');
            balanceCell.className = 'text-center';
            balanceCell.textContent = client.balance ? client.balance.toFixed(2) : '0.00';
            row.appendChild(balanceCell);
            
            // الرسائل المرسلة
            const messagesCell = document.createElement('td');
            messagesCell.className = 'text-center';
            messagesCell.textContent = client.messagesSent || '0';
            row.appendChild(messagesCell);
            
            // الإجراءات
            const actionsCell = document.createElement('td');
            actionsCell.className = 'text-center';
            
            // زر عرض التفاصيل
            const viewBtn = document.createElement('button');
            viewBtn.className = 'btn btn-sm btn-info mx-1';
            viewBtn.innerHTML = '<i class="fas fa-eye"></i>';
            viewBtn.title = 'عرض التفاصيل';
            viewBtn.addEventListener('click', () => openClientDetails(client._id));
            actionsCell.appendChild(viewBtn);
            
            // زر التعديل
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-sm btn-primary mx-1';
            editBtn.innerHTML = '<i class="fas fa-edit"></i>';
            editBtn.title = 'تعديل';
            editBtn.addEventListener('click', () => openEditModal(client._id));
            actionsCell.appendChild(editBtn);
            
            // زر الحذف
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-danger mx-1';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.title = 'حذف';
            deleteBtn.addEventListener('click', () => confirmDelete(client._id));
            actionsCell.appendChild(deleteBtn);
            
            // إضافة زر عرض سجل الرسائل (للأدمن فقط)
            const userRole = document.querySelector('.navbar').dataset.userRole;
            if (userRole === 'admin') {
                const messagesBtn = document.createElement('button');
                messagesBtn.className = 'btn btn-sm btn-success mx-1';
                messagesBtn.innerHTML = '<i class="fas fa-envelope"></i>';
                messagesBtn.title = 'سجل الرسائل';
                messagesBtn.addEventListener('click', () => {
                    window.location.href = `/client_messages?id=${client._id}`;
                });
                actionsCell.appendChild(messagesBtn);
            }
            
            row.appendChild(actionsCell);
            tableBody.appendChild(row);
        });
    }

    /**
     * تحديث أزرار التنقل بين الصفحات
     */
    function updatePagination(data) {
        const paginationControls = document.getElementById('paginationControls');
        paginationControls.innerHTML = '';
        
        totalPages = data.totalPages;
        
        if (totalPages <= 1) {
            return;
        }
        
        const paginationNav = document.createElement('nav');
        const paginationList = document.createElement('ul');
        paginationList.className = 'pagination justify-content-center';
        
        // زر الصفحة السابقة
        const prevItem = document.createElement('li');
        prevItem.className = `page-item ${data.page === 1 ? 'disabled' : ''}`;
        const prevLink = document.createElement('a');
        prevLink.className = 'page-link';
        prevLink.href = '#';
        prevLink.textContent = 'السابق';
        prevLink.addEventListener('click', function(e) {
            e.preventDefault();
            if (data.page > 1) {
                currentPage = data.page - 1;
                loadClientsData();
            }
        });
        prevItem.appendChild(prevLink);
        paginationList.appendChild(prevItem);
        
        // أزرار الصفحات
        const startPage = Math.max(1, data.page - 2);
        const endPage = Math.min(data.totalPages, data.page + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            const pageItem = document.createElement('li');
            pageItem.className = `page-item ${i === data.page ? 'active' : ''}`;
            const pageLink = document.createElement('a');
            pageLink.className = 'page-link';
            pageLink.href = '#';
            pageLink.textContent = i;
            pageLink.addEventListener('click', function(e) {
                e.preventDefault();
                currentPage = i;
                loadClientsData();
            });
            pageItem.appendChild(pageLink);
            paginationList.appendChild(pageItem);
        }
        
        // زر الصفحة التالية
        const nextItem = document.createElement('li');
        nextItem.className = `page-item ${data.page === data.totalPages ? 'disabled' : ''}`;
        const nextLink = document.createElement('a');
        nextLink.className = 'page-link';
        nextLink.href = '#';
        nextLink.textContent = 'التالي';
        nextLink.addEventListener('click', function(e) {
            e.preventDefault();
            if (data.page < data.totalPages) {
                currentPage = data.page + 1;
                loadClientsData();
            }
        });
        nextItem.appendChild(nextLink);
        paginationList.appendChild(nextItem);
        
        paginationNav.appendChild(paginationList);
        paginationControls.appendChild(paginationNav);
    }

    /**
     * تحديث إحصائيات الملخص
     */
    function updateSummary(data) {
        document.getElementById('totalClients').textContent = data.totalDocs || '0';
        
        // حساب العملاء النشطين والمعلقين
        let activeCount = 0;
        let suspendedCount = 0;
        
        data.docs.forEach(client => {
            if (client.status === 'active') {
                activeCount++;
            } else if (client.status === 'suspended') {
                suspendedCount++;
            }
        });
        
        document.getElementById('activeClients').textContent = activeCount;
        document.getElementById('suspendedClients').textContent = suspendedCount;
    }

    /**
     * فتح تفاصيل العميل
     */
    function openClientDetails(clientId) {
        fetch(`/api/sem-clients/${clientId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error('فشل في تحميل بيانات العميل');
                }
                return response.json();
            })
            .then(data => {
                selectedClientId = clientId;
                
                // تعيين معرف العميل
                document.getElementById('modal-client-id').value = clientId;
                
                // تعبئة بيانات المودال
                document.getElementById('modal-client-name').textContent = data.client.name;
                document.getElementById('modal-client-email').textContent = data.client.email;
                document.getElementById('modal-client-phone').textContent = data.client.phone;
                document.getElementById('modal-client-company').textContent = data.client.company || '-';
                document.getElementById('modal-client-api-key').textContent = data.client.apiKey;
                document.getElementById('modal-client-balance').textContent = data.client.balance ? data.client.balance.toFixed(2) : '0.00';
                
                document.getElementById('modal-client-daily-limit').textContent = data.client.dailyLimit;
                document.getElementById('modal-client-monthly-limit').textContent = data.client.monthlyLimit;
                
                // عرض قنوات الإرسال
                if (data.client.messagingChannels) {
                    const smsChannel = document.getElementById('modal-client-sms-channel');
                    const whatsappChannel = document.getElementById('modal-client-whatsapp-channel');
                    const metawhatsappChannel = document.getElementById('modal-client-metawhatsapp-channel');
                    const noChannels = document.getElementById('modal-client-no-channels');
                    
                    smsChannel.style.display = data.client.messagingChannels.sms ? 'inline-block' : 'none';
                    whatsappChannel.style.display = data.client.messagingChannels.whatsapp ? 'inline-block' : 'none';
                    metawhatsappChannel.style.display = data.client.messagingChannels.metaWhatsapp ? 'inline-block' : 'none';
                    
                    if (!data.client.messagingChannels.sms && !data.client.messagingChannels.whatsapp && !data.client.messagingChannels.metaWhatsapp) {
                        noChannels.style.display = 'inline-block';
                    } else {
                        noChannels.style.display = 'none';
                    }
                } else {
                    document.getElementById('modal-client-sms-channel').style.display = 'none';
                    document.getElementById('modal-client-whatsapp-channel').style.display = 'none';
                    document.getElementById('modal-client-metawhatsapp-channel').style.display = 'none';
                    document.getElementById('modal-client-no-channels').style.display = 'inline-block';
                }
                
                // عرض القناة المفضلة
                const preferredChannelElement = document.getElementById('modal-client-preferred-channel');
                if (data.client.preferredChannel && data.client.preferredChannel !== 'none') {
                    if (data.client.preferredChannel === 'sms') {
                        preferredChannelElement.textContent = 'رسائل SMS';
                    } else if (data.client.preferredChannel === 'whatsapp') {
                        preferredChannelElement.textContent = 'رسائل واتساب';
                    } else if (data.client.preferredChannel === 'metawhatsapp') {
                        preferredChannelElement.textContent = 'واتساب ميتا الرسمي';
                    }
                } else {
                    preferredChannelElement.textContent = 'بلا (افتراضي)';
                }
                
                // عرض إحصائيات الرسائل
                renderMessageStats(data.messageStats, data.dailyStats);
                
                // فتح المودال
                $('#clientDetailsModal').modal('show');
            })
            .catch(error => {
                console.error('Error loading client details:', error);
                showToast('حدث خطأ أثناء تحميل بيانات العميل', 'error');
            });
    }

    /**
     * عرض إحصائيات الرسائل
     */
    function renderMessageStats(messageStats, dailyStats) {
        const statsContainer = document.getElementById('messageStatsContainer');
        statsContainer.innerHTML = '';
        
        // إنشاء البطاقات للإحصائيات
        const statsRow = document.createElement('div');
        statsRow.className = 'row mb-4';
        
        // إجمالي الرسائل
        let totalMessages = 0;
        let sentMessages = 0;
        let pendingMessages = 0;
        let failedMessages = 0;
        
        messageStats.forEach(stat => {
            const count = stat.count || 0;
            totalMessages += count;
            
            if (stat._id === 'sent') {
                sentMessages = count;
            } else if (stat._id === 'pending') {
                pendingMessages = count;
            } else if (stat._id === 'failed') {
                failedMessages = count;
            }
        });
        
        // إضافة بطاقات الإحصائيات
        const statCards = [
            { label: 'إجمالي الرسائل', value: totalMessages, color: 'primary' },
            { label: 'الرسائل المرسلة', value: sentMessages, color: 'success' },
            { label: 'الرسائل المعلقة', value: pendingMessages, color: 'warning' },
            { label: 'الرسائل الفاشلة', value: failedMessages, color: 'danger' }
        ];
        
        statCards.forEach(card => {
            const colDiv = document.createElement('div');
            colDiv.className = 'col-md-3 col-sm-6 mb-2';
            
            const cardDiv = document.createElement('div');
            cardDiv.className = `card border-${card.color}`;
            
            const cardBody = document.createElement('div');
            cardBody.className = 'card-body p-2 text-center';
            
            const cardTitle = document.createElement('h6');
            cardTitle.className = 'card-title mb-1';
            cardTitle.textContent = card.label;
            
            const cardValue = document.createElement('p');
            cardValue.className = `card-text text-${card.color} mb-0 fs-4`;
            cardValue.textContent = card.value;
            
            cardBody.appendChild(cardTitle);
            cardBody.appendChild(cardValue);
            cardDiv.appendChild(cardBody);
            colDiv.appendChild(cardDiv);
            statsRow.appendChild(colDiv);
        });
        
        statsContainer.appendChild(statsRow);
        
        // إضافة عنصر الرسم البياني للإحصائيات اليومية إذا كانت متوفرة
        if (dailyStats && dailyStats.length > 0) {
            const chartRow = document.createElement('div');
            chartRow.className = 'row';
            
            const chartCol = document.createElement('div');
            chartCol.className = 'col-12';
            
            const chartContainer = document.createElement('div');
            chartContainer.id = 'messagesDailyChart';
            chartContainer.style.height = '250px';
            
            chartCol.appendChild(chartContainer);
            chartRow.appendChild(chartCol);
            statsContainer.appendChild(chartRow);
            
            // هنا يمكن إضافة كود لرسم الرسوم البيانية باستخدام مكتبة مثل Chart.js
            // لتبسيط المثال، لن نضيف هذا الجزء الآن
        }
    }

    /**
     * تحديث خيارات القناة المفضلة في نافذة التعديل
     */
    function updateEditPreferredChannelOptions() {
        const smsChecked = document.getElementById('edit-sms-channel').checked;
        const whatsappChecked = document.getElementById('edit-whatsapp-channel').checked;
        const metaWhatsappChecked = document.getElementById('edit-metawhatsapp-channel').checked;
        const preferredChannelContainer = document.querySelector('.edit-preferred-channel-container');
        const smsOption = document.querySelector('.edit-sms-option');
        const whatsappOption = document.querySelector('.edit-whatsapp-option');
        const metawhatsappOption = document.querySelector('.edit-metawhatsapp-option');
        const preferredChannelSelect = document.getElementById('edit-preferred-channel');
        
        // إظهار قائمة القناة المفضلة فقط عند اختيار أكثر من قناة
        const enabledChannelsCount = [smsChecked, whatsappChecked, metaWhatsappChecked].filter(Boolean).length;
        
        if (enabledChannelsCount > 1) {
            preferredChannelContainer.style.display = 'block';
            smsOption.style.display = smsChecked ? 'block' : 'none';
            whatsappOption.style.display = whatsappChecked ? 'block' : 'none';
            metawhatsappOption.style.display = metaWhatsappChecked ? 'block' : 'none';
        } else {
            // إخفاء القائمة وإعادة تعيين القيمة إلى 'none'
            preferredChannelContainer.style.display = 'none';
            preferredChannelSelect.value = 'none';
            
            // إخفاء الخيارات غير المتاحة
            smsOption.style.display = smsChecked ? 'block' : 'none';
            whatsappOption.style.display = whatsappChecked ? 'block' : 'none';
            metawhatsappOption.style.display = metaWhatsappChecked ? 'block' : 'none';
        }
    }

    /**
     * إظهار أو إخفاء إعدادات نماذج واتساب ميتا في نافذة التعديل
     */
    function toggleEditMetaWhatsappTemplateSettings() {
        const metaWhatsappChecked = document.getElementById('edit-metawhatsapp-channel').checked;
        const templateSettings = document.getElementById('edit-metawhatsapp-template-settings');
        
        templateSettings.style.display = metaWhatsappChecked ? 'block' : 'none';
    }

    /**
     * تحديث حقول الدولة المخفية عند تغيير اختيار الدولة في نموذج التعديل
     */
    function updateEditCountryFields() {
        const countrySelect = document.getElementById('edit-country-select');
        const selectedOption = countrySelect.value;
        
        if (selectedOption) {
            // تقسيم القيمة المختارة بالصيغة "alpha2|code|name"
            const [alpha2, code, name] = selectedOption.split('|');
            
            // تحديث الحقول المخفية
            document.getElementById('edit-country-code').value = code;
            document.getElementById('edit-country-alpha2').value = alpha2;
            document.getElementById('edit-country-name').value = name;
            
            console.log(`تم تحديث إعدادات الدولة: ${name} (${alpha2}) +${code}`);
        }
    }

    /**
     * فتح مودال تعديل العميل
     */
    function openEditModal(clientId) {
        const client = clientsData.find(c => c._id === clientId);
        
        if (!client) {
            showToast('لم يتم العثور على بيانات العميل', 'error');
            return;
        }
        
        document.getElementById('edit-client-id').value = client._id;
        document.getElementById('edit-client-name').value = client.name;
        document.getElementById('edit-client-email').value = client.email;
        document.getElementById('edit-client-phone').value = client.phone;
        document.getElementById('edit-client-company').value = client.company || '';
        
        // تعبئة خيارات قنوات الإرسال
        const smsChannelCheckbox = document.getElementById('edit-sms-channel');
        const whatsappChannelCheckbox = document.getElementById('edit-whatsapp-channel');
        const metawhatsappChannelCheckbox = document.getElementById('edit-metawhatsapp-channel');
        
        if (client.messagingChannels) {
            smsChannelCheckbox.checked = client.messagingChannels.sms || false;
            whatsappChannelCheckbox.checked = client.messagingChannels.whatsapp || false;
            metawhatsappChannelCheckbox.checked = client.messagingChannels.metaWhatsapp || false;
            
            // إعدادات نماذج واتساب ميتا
            if (client.metaWhatsappTemplates) {
                document.getElementById('edit-metawhatsapp-template-name').value = client.metaWhatsappTemplates.name || 'siraj';
                document.getElementById('edit-metawhatsapp-template-language').value = client.metaWhatsappTemplates.language || 'ar';
                
                // تعبئة معرف رقم هاتف ميتا إذا كان موجودًا
                if (document.getElementById('edit-metawhatsapp-phone-number-id')) {
                    document.getElementById('edit-metawhatsapp-phone-number-id').value = client.metaWhatsappTemplates.phoneNumberId || '';
                }
            } else {
                // تعيين القيم الافتراضية إذا لم تكن موجودة
                document.getElementById('edit-metawhatsapp-template-name').value = 'siraj';
                document.getElementById('edit-metawhatsapp-template-language').value = 'ar';
                if (document.getElementById('edit-metawhatsapp-phone-number-id')) {
                    document.getElementById('edit-metawhatsapp-phone-number-id').value = '';
                }
            }
            
            // إظهار أو إخفاء إعدادات النماذج
            toggleEditMetaWhatsappTemplateSettings();
        } else {
            // إعدادات افتراضية إذا لم تكن متوفرة
            smsChannelCheckbox.checked = true;
            whatsappChannelCheckbox.checked = false;
            metawhatsappChannelCheckbox.checked = false;
        }
        
        // تعبئة إعدادات الدولة الافتراضية
        if (client.defaultCountry) {
            // الحقول المخفية
            document.getElementById('edit-country-code').value = client.defaultCountry.code || '218';
            document.getElementById('edit-country-alpha2').value = client.defaultCountry.alpha2 || 'LY';
            document.getElementById('edit-country-name').value = client.defaultCountry.name || 'ليبيا';
            
            // تحديد الخيار المناسب في القائمة المنسدلة
            const countrySelect = document.getElementById('edit-country-select');
            const countryValue = `${client.defaultCountry.alpha2}|${client.defaultCountry.code}|${client.defaultCountry.name}`;
            
            // محاولة العثور على الخيار المطابق
            let optionFound = false;
            for (let i = 0; i < countrySelect.options.length; i++) {
                if (countrySelect.options[i].value === countryValue) {
                    countrySelect.selectedIndex = i;
                    optionFound = true;
                    break;
                }
            }
            
            // إذا لم يتم العثور على خيار مطابق، ابحث عن خيار برمز الدولة نفسه
            if (!optionFound) {
                for (let i = 0; i < countrySelect.options.length; i++) {
                    if (countrySelect.options[i].value.includes(`|${client.defaultCountry.code}|`)) {
                        countrySelect.selectedIndex = i;
                        break;
                    }
                }
            }
        }
        
        // تعبئة القناة المفضلة
        const preferredChannelSelect = document.getElementById('edit-preferred-channel');
        preferredChannelSelect.value = client.preferredChannel || 'none';
        
        // تحديث ظهور خيار القناة المفضلة
        updateEditPreferredChannelOptions();
        
        // الحقول الخاصة بالمدير أو المشرف
        const statusSelect = document.getElementById('edit-client-status');
        const dailyLimitInput = document.getElementById('edit-client-daily-limit');
        const monthlyLimitInput = document.getElementById('edit-client-monthly-limit');
        
        if (statusSelect) {
            statusSelect.value = client.status;
        }
        
        if (dailyLimitInput) {
            dailyLimitInput.value = client.dailyLimit;
        }
        
        if (monthlyLimitInput) {
            monthlyLimitInput.value = client.monthlyLimit;
        }
        
        $('#editClientModal').modal('show');
    }

    /**
     * حفظ تغييرات العميل
     */
    function saveClientChanges() {
        const clientId = document.getElementById('edit-client-id').value;
        
        const data = {
            name: document.getElementById('edit-client-name').value,
            email: document.getElementById('edit-client-email').value,
            phone: document.getElementById('edit-client-phone').value,
            company: document.getElementById('edit-client-company').value,
            messagingChannels: {
                sms: document.getElementById('edit-sms-channel').checked,
                whatsapp: document.getElementById('edit-whatsapp-channel').checked,
                metaWhatsapp: document.getElementById('edit-metawhatsapp-channel').checked
            },
            preferredChannel: document.getElementById('edit-preferred-channel').value,
            defaultCountry: {
                code: document.getElementById('edit-country-code').value,
                alpha2: document.getElementById('edit-country-alpha2').value,
                name: document.getElementById('edit-country-name').value
            }
        };
        
        // إعدادات نماذج واتساب ميتا إذا كانت مفعلة
        if (document.getElementById('edit-metawhatsapp-channel').checked) {
            data.metaWhatsappTemplates = {
                name: document.getElementById('edit-metawhatsapp-template-name').value,
                language: document.getElementById('edit-metawhatsapp-template-language').value,
                phoneNumberId: document.getElementById('edit-metawhatsapp-phone-number-id').value
            };
        }
        
        // الحقول الخاصة بالمدير أو المشرف
        const statusSelect = document.getElementById('edit-client-status');
        const dailyLimitInput = document.getElementById('edit-client-daily-limit');
        const monthlyLimitInput = document.getElementById('edit-client-monthly-limit');
        
        if (statusSelect) {
            data.status = statusSelect.value;
        }
        
        if (dailyLimitInput) {
            data.dailyLimit = dailyLimitInput.value;
        }
        
        if (monthlyLimitInput) {
            data.monthlyLimit = monthlyLimitInput.value;
        }
        
        fetch(`/api/sem-clients/${clientId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('فشل في تحديث بيانات العميل');
            }
            return response.json();
        })
        .then(result => {
            $('#editClientModal').modal('hide');
            showToast(result.message || 'تم تحديث بيانات العميل بنجاح');
            loadClientsData();
        })
        .catch(error => {
            console.error('Error updating client:', error);
            showToast('حدث خطأ أثناء تحديث بيانات العميل', 'error');
        });
    }

    /**
     * تأكيد حذف العميل
     */
    function confirmDelete(clientId) {
        selectedClientId = clientId;
        $('#deleteClientModal').modal('show');
    }

    /**
     * حذف العميل
     */
    function deleteClient(clientId) {
        fetch(`/api/sem-clients/${clientId}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('فشل في حذف العميل');
            }
            return response.json();
        })
        .then(result => {
            $('#deleteClientModal').modal('hide');
            showToast(result.message || 'تم حذف العميل بنجاح');
            loadClientsData();
        })
        .catch(error => {
            console.error('Error deleting client:', error);
            showToast('حدث خطأ أثناء حذف العميل', 'error');
        });
    }

    /**
     * إعادة توليد مفتاح API
     */
    function regenerateApiKeys(clientId) {
        fetch(`/api/sem-clients/${clientId}/regenerate-keys`, {
            method: 'POST'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('فشل في إعادة توليد مفتاح API');
            }
            return response.json();
        })
        .then(result => {
            $('#regenerateKeysModal').modal('hide');
            
            // عرض المفتاح الجديد
            document.getElementById('new-api-key').value = result.apiKey;
            $('#newKeysModal').modal('show');
            
            // تحديث البيانات في الخلفية
            loadClientsData();
        })
        .catch(error => {
            console.error('Error regenerating API keys:', error);
            $('#regenerateKeysModal').modal('hide');
            showToast('حدث خطأ أثناء إعادة توليد مفتاح API', 'error');
        });
    }

    /**
     * نسخ نص إلى الحافظة
     */
    function copyToClipboard(text) {
        // استخدام Clipboard API الحديثة
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text)
                .then(() => {
                    showToast('تم نسخ النص بنجاح');
                })
                .catch(err => {
                    console.error('فشل في نسخ النص: ', err);
                    showToast('فشل في نسخ النص', 'error');
                    // استخدام الطريقة البديلة القديمة كاحتياط
                    fallbackCopyToClipboard(text);
                });
        } else {
            // استخدام الطريقة القديمة للمتصفحات التي لا تدعم Clipboard API
            fallbackCopyToClipboard(text);
        }
    }

    /**
     * نسخ نص إلى الحافظة باستخدام الطريقة القديمة
     */
    function fallbackCopyToClipboard(text) {
        try {
            const tempInput = document.createElement('input');
            tempInput.style.position = 'fixed';
            tempInput.style.opacity = '0';
            tempInput.value = text;
            document.body.appendChild(tempInput);
            tempInput.focus();
            tempInput.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(tempInput);
            
            if (successful) {
                showToast('تم نسخ النص بنجاح');
            } else {
                showToast('فشل في نسخ النص', 'error');
            }
        } catch (err) {
            console.error('فشل في نسخ النص: ', err);
            showToast('فشل في نسخ النص', 'error');
        }
    }

    /**
     * عرض رسالة منبثقة
     */
    function showToast(message, type = 'success') {
        const toastContainer = document.querySelector('.toast-container');
        
        if (!toastContainer) {
            // إنشاء حاوية للرسائل إذا لم تكن موجودة
            const container = document.createElement('div');
            container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(container);
        }
        
        const toastId = 'toast-' + new Date().getTime();
        const toastHtml = `
            <div id="${toastId}" class="toast align-items-center text-white bg-${type}" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="إغلاق"></button>
                </div>
            </div>
        `;
        
        document.querySelector('.toast-container').insertAdjacentHTML('beforeend', toastHtml);
        
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, { delay: 3000 });
        
        toast.show();
        
        // إزالة العنصر بعد الإخفاء
        toastElement.addEventListener('hidden.bs.toast', function() {
            toastElement.remove();
        });
    }
});
