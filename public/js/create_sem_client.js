document.addEventListener('DOMContentLoaded', function() {
    // الحصول على نموذج إنشاء العميل
    const createClientForm = document.getElementById('createClientForm');
    
    // استماع لحدث إرسال النموذج
    createClientForm.addEventListener('submit', function(event) {
        event.preventDefault();
        createNewClient();
    });
    
    // زر إضافة عميل آخر
    document.getElementById('addAnotherClientBtn').addEventListener('click', function() {
        $('#newClientKeysModal').modal('hide');
        createClientForm.reset();
    });
    
    // نسخ مفتاح API
    document.getElementById('copyApiKeyBtn').addEventListener('click', function() {
        copyToClipboard(document.getElementById('client-api-key').value);
        showToast('تم نسخ مفتاح API بنجاح');
    });
    
    /**
     * إنشاء عميل جديد
     */
    function createNewClient() {
        // جمع بيانات النموذج
        const formData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            company: document.getElementById('company').value
        };
        
        // الحدود - قد تكون غير متاحة للمستخدمين العاديين
        const dailyLimitElement = document.getElementById('dailyLimit');
        const monthlyLimitElement = document.getElementById('monthlyLimit');
        
        if (dailyLimitElement) {
            formData.dailyLimit = dailyLimitElement.value;
        }
        
        if (monthlyLimitElement) {
            formData.monthlyLimit = monthlyLimitElement.value;
        }
        
        // إرسال الطلب إلى الخادم
        fetch('/api/sem-clients', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => { throw err; });
            }
            return response.json();
        })
        .then(data => {
            // إظهار مفتاح API الجديد
            document.getElementById('client-api-key').value = data.client.apiKey;
            
            // عرض النافذة المنبثقة
            $('#newClientKeysModal').modal('show');
        })
        .catch(error => {
            console.error('Error creating client:', error);
            let errorMessage = 'حدث خطأ أثناء إنشاء العميل';
            
            if (error.message) {
                errorMessage = error.message;
            } else if (error.error) {
                errorMessage = error.error;
            }
            
            showToast(errorMessage, 'error');
        });
    }
    
    /**
     * نسخ نص إلى الحافظة
     */
    function copyToClipboard(text) {
        const tempInput = document.createElement('input');
        tempInput.value = text;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
    }
    
    /**
     * عرض رسالة تنبيه
     */
    function showToast(message, type = 'success') {
        const toastClasses = {
            'success': 'bg-success',
            'error': 'bg-danger',
            'warning': 'bg-warning',
            'info': 'bg-info'
        };
        
        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center text-white ${toastClasses[type]} border-0`;
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');
        
        toastEl.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;
        
        const toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) {
            const container = document.createElement('div');
            container.className = 'toast-container position-fixed top-0 end-0 p-3';
            document.body.appendChild(container);
            container.appendChild(toastEl);
        } else {
            toastContainer.appendChild(toastEl);
        }
        
        const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
        toast.show();
    }
});
