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
    
    // زر العودة إلى قائمة العملاء
    document.getElementById('goToClientsListBtn').addEventListener('click', function() {
        window.location.href = '/sem-clients/manage';
    });
    
    // نسخ مفتاح API
    document.getElementById('copyApiKeyBtn').addEventListener('click', function() {
        copyToClipboard(document.getElementById('client-api-key').value);
        showToast('تم نسخ مفتاح API بنجاح');
    });
    
    // التعامل مع تغيير خيارات قنوات الإرسال وإظهار قائمة القناة المفضلة
    document.getElementById('smsChannel').addEventListener('change', updatePreferredChannelOptions);
    document.getElementById('whatsappChannel').addEventListener('change', updatePreferredChannelOptions);
    document.getElementById('metaWhatsappChannel').addEventListener('change', function() {
        updatePreferredChannelOptions();
        toggleMetaWhatsappTemplateSettings();
    });
    
    // معالجة تغيير اختيار الدولة
    document.getElementById('country-select').addEventListener('change', updateCountryFields);
    
    // تحديث حقول الدولة المخفية عند تغيير اختيار الدولة
    function updateCountryFields() {
        const countrySelect = document.getElementById('country-select');
        const selectedOption = countrySelect.value;
        
        if (selectedOption) {
            // تقسيم القيمة المختارة بالصيغة "alpha2|code|name"
            const [alpha2, code, name] = selectedOption.split('|');
            
            // تحديث الحقول المخفية
            document.getElementById('countryCode').value = code;
            document.getElementById('countryAlpha2').value = alpha2;
            document.getElementById('countryName').value = name;
            
            console.log(`تم تحديث إعدادات الدولة: ${name} (${alpha2}) +${code}`);
        }
    }
    
    // تحديث خيارات القناة المفضلة بناءً على القنوات المختارة
    function updatePreferredChannelOptions() {
        const smsChecked = document.getElementById('smsChannel').checked;
        const whatsappChecked = document.getElementById('whatsappChannel').checked;
        const metaWhatsappChecked = document.getElementById('metaWhatsappChannel').checked;
        const preferredChannelContainer = document.querySelector('.preferred-channel-container');
        const smsOption = document.querySelector('.sms-option');
        const whatsappOption = document.querySelector('.whatsapp-option');
        const metaWhatsappOption = document.querySelector('.metaWhatsapp-option');
        const preferredChannelSelect = document.getElementById('preferredChannel');
        
        // إظهار قائمة القناة المفضلة فقط عند اختيار أكثر من قناة
        const enabledChannelsCount = [smsChecked, whatsappChecked, metaWhatsappChecked].filter(Boolean).length;
        
        if (enabledChannelsCount > 1) {
            preferredChannelContainer.style.display = 'block';
            smsOption.style.display = smsChecked ? 'block' : 'none';
            whatsappOption.style.display = whatsappChecked ? 'block' : 'none';
            metaWhatsappOption.style.display = metaWhatsappChecked ? 'block' : 'none';
        } else {
            // إخفاء القائمة وإعادة تعيين القيمة إلى 'none'
            preferredChannelContainer.style.display = 'none';
            preferredChannelSelect.value = 'none';
            
            // إخفاء الخيارات غير المتاحة
            smsOption.style.display = smsChecked ? 'block' : 'none';
            whatsappOption.style.display = whatsappChecked ? 'block' : 'none';
            metaWhatsappOption.style.display = metaWhatsappChecked ? 'block' : 'none';
        }
    }
    
    /**
     * إظهار أو إخفاء إعدادات نماذج واتساب ميتا
     */
    function toggleMetaWhatsappTemplateSettings() {
        const metaWhatsappChecked = document.getElementById('metaWhatsappChannel').checked;
        const templateSettings = document.getElementById('metaWhatsappTemplateSettings');
        
        templateSettings.style.display = metaWhatsappChecked ? 'block' : 'none';
    }
    
    /**
     * إنشاء عميل جديد
     */
    function createNewClient() {
        // جمع بيانات النموذج
        const formData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            company: document.getElementById('company').value,
            messagingChannels: {
                sms: document.getElementById('smsChannel').checked,
                whatsapp: document.getElementById('whatsappChannel').checked,
                metaWhatsapp: document.getElementById('metaWhatsappChannel').checked
            },
            preferredChannel: document.getElementById('preferredChannel').value,
            defaultCountry: {
                code: document.getElementById('countryCode').value,
                alpha2: document.getElementById('countryAlpha2').value,
                name: document.getElementById('countryName').value
            }
        };
        
        // إعدادات نماذج واتساب ميتا إذا كانت مفعلة
        if (document.getElementById('metaWhatsappChannel').checked) {
            formData.metaWhatsappTemplates = {
                name: document.getElementById('metaWhatsappTemplateName').value,
                language: document.getElementById('metaWhatsappTemplateLanguage').value
            };
        }
        
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
            
            // عرض قنوات الإرسال في النافذة المنبثقة
            let messagingChannelsText = '';
            if (data.client.messagingChannels) {
                const channels = [];
                if (data.client.messagingChannels.sms) channels.push('SMS');
                if (data.client.messagingChannels.whatsapp) channels.push('واتساب');
                if (data.client.messagingChannels.metaWhatsapp) channels.push('واتساب ميتا الرسمي');
                messagingChannelsText = channels.length > 0 ? 
                    `<div class="mt-2 mb-2">قنوات الإرسال المتاحة: ${channels.join(' و ')}</div>` : 
                    '';
            }
            
            // إضافة معلومات قنوات الإرسال إلى النافذة المنبثقة
            const alertElement = document.querySelector('.modal-body .alert-warning');
            if (alertElement && messagingChannelsText) {
                alertElement.insertAdjacentHTML('afterend', messagingChannelsText);
            }
            
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
