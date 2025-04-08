document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.delete-license-request').forEach(button => {
        button.addEventListener('click', async function () {
            const licenseRequestId = this.getAttribute('data-id');
            try {
                const response = await fetch('/licenses/delete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ id: licenseRequestId })
                });

                const result = await response.json();
                if (result.success) {
                    document.getElementById(`license-request-${licenseRequestId}`).remove();
                } else {
                    console.error('Failed to delete license request:', result.message);
                }
            } catch (error) {
                console.error('Error deleting license request:', error.message, error.stack);
            }
        });
    });

    document.querySelectorAll('[data-view-license-id]').forEach(button => {
        button.addEventListener('click', function(event) {
            const licenseId = event.target.getAttribute('data-view-license-id');
            fetch(`/licenses/details/${licenseId}`, {
                method: 'GET'
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const license = data.license;
                    document.getElementById('modalLicenseeName').textContent = license.licenseeName;
                    document.getElementById('modalSerialNumber').textContent = license.serialNumber;
                    document.getElementById('modalRegistrationCode').textContent = license.registrationCode;
                    document.getElementById('modalActivationCode').textContent = license.activationCode;
                    document.getElementById('modalFeaturesCode').textContent = license.featuresCode;
                    document.getElementById('modalExpirationDate').textContent = license.expirationDate ? new Date(license.expirationDate).toLocaleDateString() : 'N/A';
                    new bootstrap.Modal(document.getElementById('licenseInfoModal')).show();
                } else {
                    alert(data.message);
                }
            })
            .catch(error => {
                console.error('Error fetching license details:', error);
                alert('An error occurred while fetching the license details. Please try again.');
            });
        });
    });

    function addAutoCompleteListener(inputElement, dataListId) {
        const dataListElement = document.getElementById(dataListId);
        if (!dataListElement) {
            console.error(`Data list element not found for inputId: ${inputElement.id}, dataListId: ${dataListId}`);
            return;
        }

        inputElement.addEventListener('input', async function() {
            const query = this.value.trim(); // Trim any whitespace
            if (!query) {
                dataListElement.innerHTML = ''; // Clear datalist
                return;
            }
            try {
                const data = await window.fetchRegistrationCodes(this, dataListElement);
                if (data.length === 0) {
                }
            } catch (error) {
                console.error('Error fetching registration codes:', error);
            }
        });
    }

    const registrationCodeInput = document.getElementById('registrationCode');
    const baseRegistrationCodeInput = document.getElementById('baseRegistrationCode');
    const oldRegistrationCodeInput = document.getElementById('oldRegistrationCode');

    // إزالة أي مستمعات لحقل registrationCode لمنع التداخل
    if (registrationCodeInput) {
        registrationCodeInput.removeEventListener('input', async function() {
            const query = this.value.trim(); // Trim any whitespace
            if (!query) {
                document.getElementById('registrationCodeList').innerHTML = ''; // Clear datalist
                return;
            }
            try {
                const data = await window.fetchRegistrationCodes(this, document.getElementById('registrationCodeList'));
                if (data.length === 0) {
                    console.log('No registration codes found for query:', query);
                }
            } catch (error) {
                console.error('Error fetching registration codes:', error);
            }
        });
    }

    if (baseRegistrationCodeInput) {
        addAutoCompleteListener(baseRegistrationCodeInput, 'baseRegistrationCodeList');
    }

    if (oldRegistrationCodeInput) {
        addAutoCompleteListener(oldRegistrationCodeInput, 'oldRegistrationCodeList');
    }

    document.querySelectorAll('.feature-button').forEach(button => {
        button.addEventListener('click', function() {
            this.classList.toggle('active');
            const featuresCheckboxes = document.querySelectorAll('.feature-checkbox');
            const featuresCodeInput = document.getElementById('newFeaturesCode');
            const requestPriceText = document.getElementById('requestPriceText');
            const requestPriceInput = document.getElementById('requestPrice');

            if (featuresCheckboxes && featuresCodeInput && requestPriceText && requestPriceInput) {
                window.calculateFeaturesAndPrice(featuresCheckboxes, featuresCodeInput, requestPriceText, requestPriceInput);
            }
        });
    });

    window.addEventListener('load', function() {
        const defaultFeatureValues = [13, 14];
        const buttons = document.querySelectorAll('.feature-button');
        buttons.forEach(button => {
            const featureValue = parseInt(button.getAttribute('data-feature-value'));
            if (defaultFeatureValues.includes(featureValue)) {
                button.classList.add('active');
                button.classList.add('btn-danger'); // Mark default features in red
            }
        });
        const featuresCheckboxes = document.querySelectorAll('.feature-checkbox');
        const featuresCodeInput = document.getElementById('newFeaturesCode');
        const requestPriceText = document.getElementById('requestPriceText');
        const requestPriceInput = document.getElementById('requestPrice');

        if (featuresCheckboxes && featuresCodeInput && requestPriceText && requestPriceInput) {
            window.calculateFeaturesAndPrice(featuresCheckboxes, featuresCodeInput, requestPriceText, requestPriceInput);
        }
    });
});
