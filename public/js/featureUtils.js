document.addEventListener('DOMContentLoaded', function () {
    initializeFeatureSelection();
});

function initializeFeatureSelection() {
    const featureCheckboxes = document.querySelectorAll('.feature-checkbox');
    const defaultFeatures = [13, 14];

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

function generateFeatureCodeAndPrice() {
    const featureCheckboxes = document.querySelectorAll('.feature-checkbox:checked');
    let featuresCode = 0;
    let totalPrice = 0;

    featureCheckboxes.forEach(checkbox => {
        const featureValue = parseInt(checkbox.value);
        const featurePrice = parseFloat(checkbox.getAttribute('data-feature-price'));

        featuresCode |= (1 << featureValue );
        totalPrice += featurePrice;
    });

    const featuresCodeElement = document.getElementById('featuresCode');
    const requestPriceElement = document.getElementById('requestPrice');

    if (featuresCodeElement) {
        featuresCodeElement.value = featuresCode;
    } else {
        console.error('Error: featuresCode element not found.');
    }

    if (requestPriceElement) {
        requestPriceElement.value = totalPrice.toFixed(2);
    } else {
        console.error('Error: requestPrice element not found.');
    }
}