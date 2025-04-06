document.addEventListener('DOMContentLoaded', function() {
    // المتغيرات الأساسية
    let currentPage = 1;
    let totalPages = 1;
    const limit = 10;

    // تحميل البيانات الأولية
    loadClients();
    loadTransactions(currentPage);
    loadStats();

    // إضافة مستمعي الأحداث
    const addBalanceForm = document.getElementById('addBalanceForm');
    if (addBalanceForm) {
        addBalanceForm.addEventListener('submit', handleAddBalance);
    }

    const searchInput = document.getElementById('searchTransactions');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(function() {
            currentPage = 1;
            loadTransactions(currentPage);
        }, 500));
    }

    /**
     * تحميل قائمة العملاء
     */
    async function loadClients() {
        try {
            const response = await fetch('/api/balance/clients');
            if (!response.ok) {
                throw new Error('فشل في تحميل بيانات العملاء');
            }
            
            const data = await response.json();
            const clientSelect = document.getElementById('clientSelect');
            
            if (data.success && data.clients && clientSelect) {
                // إفراغ القائمة أولاً باستثناء الخيار الافتراضي
                while (clientSelect.options.length > 1) {
                    clientSelect.remove(1);
                }
                
                // إضافة العملاء إلى القائمة
                data.clients.forEach(client => {
                    const option = document.createElement('option');
                    option.value = client._id;
                    option.textContent = `${client.name} (${client.balance} نقطة)`;
                    clientSelect.appendChild(option);
                });
                
                // إذا كانت القائمة فارغة (لا يوجد عملاء)
                if (data.clients.length === 0) {
                    const option = document.createElement('option');
                    option.disabled = true;
                    option.textContent = '-- لا يوجد عملاء --';
                    clientSelect.appendChild(option);
                }
            }
        } catch (error) {
            console.error('خطأ:', error);
            showAlert('danger', 'حدث خطأ أثناء تحميل بيانات العملاء');
        }
    }

    /**
     * تحميل إحصائيات الرصيد
     */
    async function loadStats() {
        try {
            const response = await fetch('/api/sem-clients-stats');
            if (!response.ok) {
                throw new Error('فشل في تحميل الإحصائيات');
            }
            
            const data = await response.json();
            
            if (data.success) {
                // عرض إجمالي الرصيد والرسائل
                document.getElementById('totalDeposits').textContent = data.stats.totalBalance || 0;
                document.getElementById('totalUsage').textContent = data.stats.totalMessages || 0;
            }
        } catch (error) {
            console.error('خطأ:', error);
            showAlert('danger', 'حدث خطأ أثناء تحميل الإحصائيات');
        }
    }

    /**
     * تحميل سجل عمليات الرصيد
     */
    async function loadTransactions(page) {
        try {
            const searchQuery = document.getElementById('searchTransactions').value;
            const url = `/balance/all?page=${page}&limit=${limit}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ''}`;
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('فشل في تحميل سجل العمليات');
            }
            
            const data = await response.json();
            
            if (data.success) {
                renderTransactionsTable(data.transactions);
                updatePagination(data);
            }
        } catch (error) {
            console.error('خطأ:', error);
            showAlert('danger', 'حدث خطأ أثناء تحميل سجل العمليات');
        }
    }

    /**
     * معالجة إضافة رصيد
     */
    async function handleAddBalance(event) {
        event.preventDefault();
        
        const clientId = document.getElementById('clientSelect').value;
        const amount = document.getElementById('amountInput').value;
        const notes = document.getElementById('notesInput').value;
        
        if (!clientId || !amount) {
            showAlert('warning', 'يرجى ملء جميع الحقول المطلوبة');
            return;
        }
        
        try {
            const response = await fetch('/balance/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    clientId,
                    amount,
                    notes
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                showAlert('success', 'تم إضافة الرصيد بنجاح');
                document.getElementById('addBalanceForm').reset();
                loadTransactions(1);
                loadStats();
            } else {
                showAlert('danger', data.message || 'حدث خطأ أثناء إضافة الرصيد');
            }
        } catch (error) {
            console.error('خطأ:', error);
            showAlert('danger', 'حدث خطأ أثناء إضافة الرصيد');
        }
    }

    /**
     * عرض سجل العمليات في الجدول
     */
    function renderTransactionsTable(transactions) {
        const tableBody = document.getElementById('transactionsTableBody');
        tableBody.innerHTML = '';
        
        if (!transactions || transactions.length === 0) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 7;
            cell.textContent = 'لا توجد عمليات';
            cell.className = 'text-center';
            row.appendChild(cell);
            tableBody.appendChild(row);
            return;
        }
        
        transactions.forEach((transaction, index) => {
            const row = document.createElement('tr');
            
            // رقم العملية
            const indexCell = document.createElement('td');
            indexCell.textContent = (currentPage - 1) * limit + index + 1;
            row.appendChild(indexCell);
            
            // اسم العميل
            const clientCell = document.createElement('td');
            clientCell.textContent = transaction.clientId ? transaction.clientId.name : 'غير معروف';
            row.appendChild(clientCell);
            
            // نوع العملية
            const typeCell = document.createElement('td');
            if (transaction.type === 'deposit') {
                typeCell.innerHTML = '<span class="badge bg-success">إضافة</span>';
            } else {
                typeCell.innerHTML = '<span class="badge bg-warning">استخدام</span>';
            }
            row.appendChild(typeCell);
            
            // قيمة الرصيد
            const amountCell = document.createElement('td');
            amountCell.textContent = transaction.amount;
            row.appendChild(amountCell);
            
            // تاريخ العملية
            const dateCell = document.createElement('td');
            const date = new Date(transaction.createdAt);
            dateCell.textContent = date.toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
            row.appendChild(dateCell);
            
            // المستخدم
            const userCell = document.createElement('td');
            userCell.textContent = transaction.performedBy ? transaction.performedBy.name || transaction.performedBy.username : 'غير معروف';
            row.appendChild(userCell);
            
            // ملاحظات
            const notesCell = document.createElement('td');
            notesCell.textContent = transaction.notes || '-';
            row.appendChild(notesCell);
            
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
        
        // إذا كان هناك صفحة واحدة فقط، لا داعي لعرض أزرار التنقل
        if (totalPages <= 1) {
            return;
        }
        
        // زر الصفحة السابقة
        const prevItem = document.createElement('li');
        prevItem.className = `page-item${currentPage === 1 ? ' disabled' : ''}`;
        const prevLink = document.createElement('a');
        prevLink.className = 'page-link';
        prevLink.href = '#';
        prevLink.textContent = 'السابق';
        prevLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage > 1) {
                currentPage--;
                loadTransactions(currentPage);
            }
        });
        prevItem.appendChild(prevLink);
        paginationControls.appendChild(prevItem);
        
        // أزرار الصفحات
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, startPage + 4);
        
        for (let i = startPage; i <= endPage; i++) {
            const pageItem = document.createElement('li');
            pageItem.className = `page-item${i === currentPage ? ' active' : ''}`;
            const pageLink = document.createElement('a');
            pageLink.className = 'page-link';
            pageLink.href = '#';
            pageLink.textContent = i;
            pageLink.addEventListener('click', (e) => {
                e.preventDefault();
                currentPage = i;
                loadTransactions(currentPage);
            });
            pageItem.appendChild(pageLink);
            paginationControls.appendChild(pageItem);
        }
        
        // زر الصفحة التالية
        const nextItem = document.createElement('li');
        nextItem.className = `page-item${currentPage === totalPages ? ' disabled' : ''}`;
        const nextLink = document.createElement('a');
        nextLink.className = 'page-link';
        nextLink.href = '#';
        nextLink.textContent = 'التالي';
        nextLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentPage < totalPages) {
                currentPage++;
                loadTransactions(currentPage);
            }
        });
        nextItem.appendChild(nextLink);
        paginationControls.appendChild(nextItem);
    }

    /**
     * عرض تنبيه للمستخدم
     */
    function showAlert(type, message) {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.setAttribute('role', 'alert');
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="إغلاق"></button>
        `;
        
        // إضافة التنبيه في أعلى الصفحة
        const container = document.querySelector('.container');
        if (container) {
            const pageHeader = container.querySelector('.page-header');
            if (pageHeader) {
                container.insertBefore(alertDiv, pageHeader.nextSibling);
            } else {
                container.insertBefore(alertDiv, container.firstChild);
            }
        } else {
            // كخطة بديلة، نضيف التنبيه إلى body
            document.body.insertBefore(alertDiv, document.body.firstChild);
        }
        
        // إخفاء التنبيه تلقائيًا بعد 5 ثوانٍ
        setTimeout(() => {
            alertDiv.classList.remove('show');
            setTimeout(() => alertDiv.remove(), 150);
        }, 5000);
    }

    /**
     * وظيفة لتأخير تنفيذ الوظائف بعد إدخال المستخدم
     */
    function debounce(func, wait) {
        let timeout;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
});
