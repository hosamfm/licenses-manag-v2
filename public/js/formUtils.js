async function fetchRegistrationCodes(inputElement, dataListElement) {
    const query = inputElement.value.trim();
    if (!query) {
        dataListElement.innerHTML = '';
        return [];
    }

    try {
        const response = await fetch(`/licenses/registration-codes?query=${query}`);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        dataListElement.innerHTML = '';
        data.forEach(item => {
            const option = document.createElement('option');
            option.value = item.registrationCode;
            dataListElement.appendChild(option);
        });
        return data;
    } catch (error) {
        console.error('Error fetching registration codes:', error);
        dataListElement.innerHTML = '';
        return [];
    }
}

async function fetchLicenseDetails(registrationCode, licenseeNameInput, oldFeaturesCodeInput, featuresCheckboxes = [], modelType = '') {
    try {
        const response = await fetch(`/licenses/license-details?registrationCode=${registrationCode}`);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        
        // تعيين اسم المرخص له إذا كان موجوداً
        if (licenseeNameInput && data.licenseeName) {
            licenseeNameInput.value = data.licenseeName;
        }

        // تعيين كود الميزات القديم وتحديث حالة مربعات الاختيار
        if (oldFeaturesCodeInput && data.featuresCode && featuresCheckboxes.length) {
            oldFeaturesCodeInput.value = data.featuresCode;
            featuresCheckboxes.forEach(checkbox => {
                checkbox.checked = (data.featuresCode & (1 << parseInt(checkbox.value))) !== 0;
                if (modelType === 're-license' || modelType === 'additional-feature-request') {
                    checkbox.disabled = checkbox.checked;
                }
            });
        }

        return data;
    } catch (error) {
        console.error('Error fetching license details:', error);
        return { exists: false };
    }
}

// حساب كود الميزات والسعر
function calculateFeaturesAndPrice(featuresCheckboxes, featuresCodeInput, requestPriceText, requestPriceInput, oldFeatureCode = 0) {
    if (!featuresCheckboxes || !featuresCodeInput || !requestPriceInput) {
        console.error('Missing required elements for calculateFeaturesAndPrice');
        return;
    }

    let featureCode = oldFeatureCode;
    let totalPrice = 0;

    featuresCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
            featureCode |= (1 << parseInt(checkbox.value));
            const price = parseFloat(checkbox.dataset.price || 0);
            if (!checkbox.disabled) {
                totalPrice += price;
            }
        }
    });

    // تحديث الحقول المخفية
    featuresCodeInput.value = featureCode;
    requestPriceInput.value = totalPrice.toFixed(2);
    
    // تحديث النص المعروض للسعر
    if (requestPriceText) {
        requestPriceText.textContent = `${totalPrice.toFixed(2)} دينار`;
    }

    // تحديث حقول العرض إذا كانت موجودة
    const featuresCodeDisplay = document.getElementById('featuresCodeDisplay');
    const requestPriceDisplay = document.getElementById('requestPriceDisplay');
    
    if (featuresCodeDisplay) {
        featuresCodeDisplay.value = featureCode;
    }
    
    if (requestPriceDisplay) {
        requestPriceDisplay.value = `${totalPrice.toFixed(2)}`;
    }
}

// تحديث قائمة الميزات المحددة
function updateSelectedFeatures(featuresCheckboxes, selectedFeaturesList) {
    if (!selectedFeaturesList) return;

    selectedFeaturesList.innerHTML = '';
    featuresCheckboxes.forEach(checkbox => {
        if (checkbox.checked) {
            const listItem = document.createElement('li');
            listItem.classList.add('list-group-item');
            listItem.textContent = checkbox.nextElementSibling.textContent;
            selectedFeaturesList.appendChild(listItem);
        }
    });
}

async function checkRegistrationCode(registrationCode, requestType = 'New License') {
    try {
        const response = await fetch(`/licenses/check-registration-code?registrationCode=${registrationCode}&requestType=${requestType}`);
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const result = await response.json();
        
        if (result.exists) {
            // تخصيص الرسالة حسب نوع الطلب وحالته
            let message = result.message;
            if (result.status === 'Approved') {
                message += ' (تم الموافقة على الطلب)';
            } else if (result.status === 'Pending') {
                message += ' (الطلب قيد المراجعة)';
            }
            result.message = message;
        }
        
        return result;
    } catch (error) {
        console.error('Error checking registration code:', error);
        return { 
            error: true, 
            message: 'حدث خطأ أثناء التحقق من الكود. يرجى المحاولة مرة أخرى.' 
        };
    }
}

// تعيين الدوال على كائن window
window.fetchRegistrationCodes = fetchRegistrationCodes;
window.fetchLicenseDetails = fetchLicenseDetails;
window.calculateFeaturesAndPrice = calculateFeaturesAndPrice;
window.updateSelectedFeatures = updateSelectedFeatures;
window.checkRegistrationCode = checkRegistrationCode;
