document.addEventListener('DOMContentLoaded', function() {
    // تعريف المتغيرات العامة
    const registrationCodeInput = document.getElementById('registrationCode');
    const registrationCodeStatus = document.getElementById('registrationCodeStatus');
    const registrationCodeFeedback = document.getElementById('registrationCodeFeedback');
    const form = document.getElementById('newLicenseForm');
    const submitButton = document.getElementById('submitButton');
    const modalTotalPrice = document.getElementById('modalTotalPrice');
    let isSubmitting = false;
    let isValidCode = false;

    // تحديث قائمة الميزات المحددة
    function updateSelectedFeaturesList() {
        const selectedFeaturesContainer = document.getElementById('selectedFeatures');
        if (!selectedFeaturesContainer) return;

        const selectedFeatures = Array.from(document.querySelectorAll('input[name="features"]:checked'))
            .map(checkbox => checkbox.nextElementSibling.textContent.trim());

        if (selectedFeatures.length > 0) {
            selectedFeaturesContainer.innerHTML = selectedFeatures.join(', ');
        } else {
            selectedFeaturesContainer.innerHTML = 'لم يتم اختيار أي ميزات';
        }
    }

    // تحديث كود الميزات
    function updateFeaturesCode() {
        const selectedFeatures = Array.from(document.querySelectorAll('input[name="features"]:checked'))
            .map(checkbox => parseInt(checkbox.value))
            .sort((a, b) => a - b);

        const featuresCodeInput = document.getElementById('featuresCode');
        if (featuresCodeInput) {
            featuresCodeInput.value = selectedFeatures.join(',');
        }
    }

    // تحديث سعر الطلب
    function updateRequestPrice() {
        const selectedFeatures = document.querySelectorAll('input[name="features"]:checked');
        let totalPrice = 0;

        selectedFeatures.forEach(feature => {
            const price = parseFloat(feature.getAttribute('data-price') || 0);
            totalPrice += price;
        });

        const requestPriceInput = document.getElementById('requestPrice');
        if (requestPriceInput) {
            requestPriceInput.value = totalPrice.toFixed(2);
        }
    }

    // تفعيل الميزات الافتراضية
    function initializeDefaultFeatures() {
        const defaultFeatures = [13, 14]; // الميزات الافتراضية
        const featureCheckboxes = document.querySelectorAll('input[name="features"]');
        
        featureCheckboxes.forEach(checkbox => {
            const value = parseInt(checkbox.value);
            if (defaultFeatures.includes(value)) {
                checkbox.checked = true;
            }
        });

        // تحديث الواجهة بعد تفعيل الميزات الافتراضية
        updateFormElements();
    }

    // تحديث عناصر النموذج
    function updateFormElements() {
        const featureCheckboxes = document.querySelectorAll('input[name="features"]');
        const featuresCodeInput = document.getElementById('featuresCode');
        const requestPriceInput = document.getElementById('requestPrice');
        const selectedFeaturesList = document.getElementById('selectedFeatures');

        // حساب كود الميزات والسعر باستخدام العمليات الثنائية
        window.calculateFeaturesAndPrice(
            featureCheckboxes,
            featuresCodeInput,
            null,
            requestPriceInput
        );

        // تحديث قائمة الميزات المحددة
        window.updateSelectedFeatures(featureCheckboxes, selectedFeaturesList);

        // تحديث السعر في النافذة المنبثقة
        if (modalTotalPrice) {
            modalTotalPrice.textContent = `${requestPriceInput.value} دينار`;
        }
    }

    // البحث في الميزات
    const featureSearch = document.getElementById('featureSearch');
    if (featureSearch) {
        featureSearch.addEventListener('input', function() {
            const searchText = this.value.toLowerCase();
            const featureItems = document.querySelectorAll('.feature-item');
            
            featureItems.forEach(item => {
                const label = item.querySelector('label');
                const text = label.textContent.toLowerCase();
                item.style.display = text.includes(searchText) ? '' : 'none';
            });
        });
    }

    // التحقق من صحة كود التسجيل
    async function validateRegistrationCode(registrationCode, requestType = 'New License') {
        try {
            const submitButton = document.querySelector('button[type="submit"]');
            if (!submitButton) {
                console.debug('Submit button not found in this page');
                return;
            }

            const result = await window.checkRegistrationCode(registrationCode, requestType);
            if (result.error || result.exists) {
                submitButton.disabled = true;
                return false;
            }
            
            submitButton.disabled = false;
            return true;
        } catch (error) {
            console.error('Error in validateRegistrationCode:', error);
            return false;
        }
    }

    // تعيين مستمعي الأحداث
    if (registrationCodeInput) {
        registrationCodeInput.addEventListener('input', function() {
            this.value = this.value.toUpperCase();
            validateRegistrationCode(this.value);
        });
    }

    // مستمع لتغيير الميزات
    const featureCheckboxes = document.querySelectorAll('input[name="features"]');
    featureCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            updateSelectedFeaturesList();
            updateFeaturesCode();
            updateRequestPrice();
            updateFormElements();
        });
    });

    // مستمع لتقديم النموذج
    if (form) {
        form.addEventListener('submit', async function(event) {
            // التحقق فقط إذا كان هناك حقل لكود التسجيل
            if (registrationCodeInput) {
                event.preventDefault();
                const isValid = await validateRegistrationCode(registrationCodeInput.value);
                if (!isValid) {
                    alert('الرجاء التحقق من صحة كود التسجيل');
                    return;
                }
            }

            if (isSubmitting) {
                return;
            }

            isSubmitting = true;
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>جاري المعالجة...';

            try {
                const formData = new FormData(form);
                const formObject = {};
                formData.forEach((value, key) => {
                    formObject[key] = value === '' ? null : value;
                });

                const response = await fetch(form.action, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formObject)
                });

                const result = await response.json();

                if (result.success) {
                    if (result.redirectUrl) {
                        window.location.href = result.redirectUrl;
                    } else {
                        console.error('Redirect URL is not provided in the response.');
                    }
                } else {
                    throw new Error(result.message || 'حدث خطأ أثناء تقديم الطلب');
                }
            } catch (error) {
                console.error('Error submitting the form:', error);
                registrationCodeFeedback.textContent = error.message || 'حدث خطأ أثناء تقديم الطلب. يرجى المحاولة مرة أخرى.';
                registrationCodeFeedback.classList.remove('d-none');
                submitButton.disabled = false;
                submitButton.innerHTML = '<i class="fas fa-check-circle me-2"></i>إرسال الطلب';
            } finally {
                isSubmitting = false;
            }
        });
    }

    const modalDoneButton = document.querySelector('#featuresModal .btn-primary');
    if (modalDoneButton) {
        modalDoneButton.addEventListener('click', function() {
            updateSelectedFeaturesList();
            updateRequestPrice();
        });
    }

    // تفعيل الميزات الافتراضية عند تحميل الصفحة
    initializeDefaultFeatures();
});
