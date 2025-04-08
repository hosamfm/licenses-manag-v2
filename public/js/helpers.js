document.addEventListener('DOMContentLoaded', function () {
    initializeFeatureSelection();
});

// Initialize feature selection
function initializeFeatureSelection() {
    const featureCheckboxes = document.querySelectorAll('.feature-checkbox');
    const defaultFeatures = [13, 14]; // Default selected features

    // Set default features as checked
    featureCheckboxes.forEach(checkbox => {
        const featureValue = parseInt(checkbox.value);
        if (defaultFeatures.includes(featureValue)) {
            checkbox.checked = true;
        }

        // Add event listener for feature checkboxes
        checkbox.addEventListener('change', function () {
            generateFeatureCodeAndPrice();
        });
    });

    generateFeatureCodeAndPrice();
}

// Generate feature code and price based on selected features
function generateFeatureCodeAndPrice() {
    const featureCheckboxes = document.querySelectorAll('.feature-checkbox:checked');
    let featuresCode = 0;
    let totalPrice = 0;

    featureCheckboxes.forEach(checkbox => {
        const featureValue = parseInt(checkbox.value);
        const featurePrice = parseFloat(checkbox.getAttribute('data-feature-price'));

        // Calculate the feature code using bitwise OR
        featuresCode |= (1 << featureValue);
        totalPrice += featurePrice;
    });

    // Update the feature code and request price in the form
    document.getElementById('newFeaturesCode').value = featuresCode;
    document.getElementById('requestPrice').value = totalPrice.toFixed(2);
}

// Function to fetch registration codes and populate data list
async function fetchAndPopulate(inputElement, dataListElement, url) {
    try {
        const query = inputElement.value;
        if (query.length < 3) return;

        const response = await fetch(`${url}?query=${query}`);
        const data = await response.json();

        if (dataListElement) {
            dataListElement.innerHTML = '';
            data.forEach(item => {
                const option = document.createElement('option');
                option.value = item.registrationCode;
                dataListElement.appendChild(option);
            });
        } else {
            console.error('Error: dataListElement not found.');
        }
    } catch (error) {
        console.error('Error fetching data:', error.message, error.stack);
    }
}

// Function to fetch license details for auto-completion
async function fetchLicenseDetails(registrationCode) {
    try {
        const response = await fetch(`/licenses/previous-license-details?registrationCode=${registrationCode}`);
        const license = await response.json();

        if (license) {
            const licenseeNameElement = document.getElementById('licenseeName');
            const oldFeaturesCodeElement = document.getElementById('oldFeaturesCode');

            if (licenseeNameElement) {
                licenseeNameElement.value = license.licenseeName;
            } else {
                console.error('Error: licenseeName element not found.');
            }

            if (oldFeaturesCodeElement) {
                oldFeaturesCodeElement.value = license.featuresCode;
            } else {
                console.error('Error: oldFeaturesCode element not found.');
            }

            // Set features checkboxes based on previous features code
            const featureCheckboxes = document.querySelectorAll('.feature-checkbox');
            featureCheckboxes.forEach(checkbox => {
                const featureValue = parseInt(checkbox.value);
                if ((license.featuresCode & (1 << featureValue)) !== 0) {
                    checkbox.checked = true;
                } else {
                    checkbox.checked = false;
                }
            });
            generateFeatureCodeAndPrice();
        }
    } catch (error) {
        console.error('Error fetching license details:', error.message, error.stack);
    }
}

// Event listeners for auto-completion inputs
const baseRegistrationCodeInput = document.getElementById('baseRegistrationCode');
if (baseRegistrationCodeInput) {
    baseRegistrationCodeInput.addEventListener('input', function () {
        fetchAndPopulate(this, document.getElementById('baseRegistrationCodeList'), '/licenses/registration-codes');
    });
    baseRegistrationCodeInput.addEventListener('change', function () {
        fetchLicenseDetails(this.value);
    });
}

// Ensure default features (13 and 14) are selected on page load
window.addEventListener('load', function () {
    const defaultFeatureValues = [13, 14];
    const featureCheckboxes = document.querySelectorAll('.feature-checkbox');
    featureCheckboxes.forEach(checkbox => {
        const featureValue = parseInt(checkbox.value);
        if (defaultFeatureValues.includes(featureValue)) {
            checkbox.checked = true;
        }
    });
    generateFeatureCodeAndPrice();
});

// Event listener for form submission to convert registration code to uppercase and validate it
const additionalLicenseForm = document.getElementById('additionalLicenseForm');
if (additionalLicenseForm) {
    additionalLicenseForm.addEventListener('submit', function (event) {
        const registrationCodeInput = document.getElementById('registrationCode');
        const registrationCode = registrationCodeInput.value.toUpperCase();
        registrationCodeInput.value = registrationCode;

        const isValid = /^[XR][A-Z0-9]{16,17}$/.test(registrationCode);
        if (!isValid) {
            event.preventDefault();
            alert('Registration code must start with X or R and be 17 or 18 characters long.');
        }
    });
}

// Event listener for form submission to convert registration code to uppercase and validate it for additional feature request form
const additionalFeatureRequestForm = document.getElementById('additionalFeatureRequestForm');
if (additionalFeatureRequestForm) {
    additionalFeatureRequestForm.addEventListener('submit', function (event) {
        const registrationCodeInput = document.getElementById('registrationCode');
        const registrationCode = registrationCodeInput.value.toUpperCase();
        registrationCodeInput.value = registrationCode;

        const isValid = /^[XR][A-Z0-9]{16,17}$/.test(registrationCode);
        if (!isValid) {
            event.preventDefault();
            alert('Registration code must start with X or R and be 17 or 18 characters long.');
        }
    });

    // Event listener for registration code input to fetch license details
    const registrationCodeInput = document.getElementById('registrationCode');
    if (registrationCodeInput) {
        registrationCodeInput.addEventListener('input', function () {
            fetchAndPopulate(this, document.getElementById('registrationCodeList'), '/licenses/registration-codes');
        });
        registrationCodeInput.addEventListener('change', function () {
            fetchLicenseDetails(this.value);
        });
    }
}
