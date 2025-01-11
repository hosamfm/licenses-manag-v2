// Debounce function to limit the rate at which a function can fire
const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

$(document).ready(function() {
    const userRole = $('#licenseRequestsTable').data('user-role');
    const userId = $('#licenseRequestsTable').data('user-id');
    const licenseRequestsTable = $('#licenseRequestsTable');
    let currentPage = 1;
    const limit = 50;
    const loading = $('#loading');
    const totalPagesElement = $('#totalPages');
    const currentPageElement = $('#currentPage');
    let isLoading = false;

    const fetchLicenseDetails = (licenseId) => {
        return fetch(`/licenses/details/${licenseId}`)
            .then(response => {
                if (!response.ok) {
                    return response.text().then(errorText => { 
                        try {
                            const errorJson = JSON.parse(errorText);
                            throw new Error(errorJson.message || 'Failed to process request');
                        } catch (e) {
                            throw new Error(errorText || 'Failed to process request');
                        }
                    });
                }
                return response.json();
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Failed to process request: ' + error.message);
            });
    };

    const fetchFeatureDetails = (featureCode) => {
        return fetch(`/api/features/${featureCode}`)
            .then(response => response.json())
            .catch(error => {
                console.error('Error fetching feature details:', error);
                return [];
            });
    };

    // دالة لتنسيق التاريخ للعرض
    const formatDate = (date) => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    };

    // دالة لتنسيق التاريخ لحقل التاريخ في النموذج
    const formatDateForInput = (date) => {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    };

    const updateModalWithLicenseDetails = async (license) => {
        // تحديث معلومات الترخيص الأساسية
        $('#modalLicenseeName').text(license.licenseeName);
        $('#modalSerialNumber').text(license.serialNumber || 'N/A');
        $('#modalRegistrationCode').text(license.registrationCode);
        $('#modalActivationCode').text(license.activationCode || 'N/A');
        $('#modalFeaturesCode').text(license.featuresCode);
        $('#modalExpirationDate').text(formatDate(license.expirationDate));

        // تحديث معلومات الفواتير - فقط للمدير
        const customerInvoiceInfo = $('#customerInvoiceInfo');
        const supplierInvoiceInfo = $('#supplierInvoiceInfo');

        if (userRole === 'admin') {
            // فاتورة العميل
            if (license.customerInvoice && license.customerInvoice.number) {
                $('#modalCustomerInvoiceNumber').text(license.customerInvoice.number);
                $('#modalCustomerInvoiceDate').text(formatDate(license.customerInvoice.date));
                customerInvoiceInfo.show();
            } else {
                customerInvoiceInfo.hide();
            }

            // فاتورة المورد
            if (license.supplierInvoice && license.supplierInvoice.number) {
                $('#modalSupplierInvoiceNumber').text(license.supplierInvoice.number);
                $('#modalSupplierInvoiceDate').text(formatDate(license.supplierInvoice.date));
                supplierInvoiceInfo.show();
            } else {
                supplierInvoiceInfo.hide();
            }
        } else {
            // إخفاء معلومات الفواتير لغير المدير
            customerInvoiceInfo.hide();
            supplierInvoiceInfo.hide();
        }

        // عرض الميزات
        fetchFeatureDetails(license.featuresCode).then(data => {
            const featuresList = $('#modalFeaturesList');
            featuresList.empty();
            if (data.features && data.features.length > 0) {
                data.features.forEach(feature => {
                    const listItem = $('<li>').text(feature.name);
                    featuresList.append(listItem);
                });
            } else {
                featuresList.append($('<li>').text('لا توجد ميزات'));
            }
        });
    };

    const fetchLicenseRequests = (page, searchQuery = '', selectedUserId = '', startDate = '', endDate = '') => {
        if (isLoading) return;
        isLoading = true;
        loading.show();

        const queryParams = new URLSearchParams({
            page,
            limit,
            searchQuery,
            selectedUserId,
            startDate,
            endDate
        });

        return fetch(`/api/license-requests?${queryParams.toString()}`)
            .then(response => response.json())
            .then(data => {
                const { requests, total, totalPages, approved, pending } = data;

                if (page === 1) {
                    licenseRequestsTable.empty();
                }

                requests.forEach(licenseRequest => {
                    const row = $('<tr>', {
                        id: `license-request-${licenseRequest._id}`,
                        'data-created-by': licenseRequest.userId._id,
                        'data-supervisor': licenseRequest.userId.supervisor
                    });

                    // تلوين الصف بناءً على حالة الفواتير
                    if (licenseRequest.status === 'Approved') {
                        if (licenseRequest.customerInvoice && licenseRequest.supplierInvoice) {
                            row.addClass('table-success');
                        } else if (licenseRequest.customerInvoice || licenseRequest.supplierInvoice) {
                            row.addClass('table-warning');
                        } else {
                            row.addClass('table-danger');
                        }
                    }

                    $('<td>', {
                        class: 'text-center',
                        text: (page - 1) * limit + requests.indexOf(licenseRequest) + 1
                    }).appendTo(row);

                    if (['admin', 'supervisor', 'supplier'].includes(userRole)) {
                        $('<td>', {
                            class: 'text-center username',
                            text: licenseRequest.userId && (licenseRequest.userId.username || licenseRequest.userId.full_name || licenseRequest.userId.company_name) 
                                  ? (licenseRequest.userId.username || licenseRequest.userId.full_name || licenseRequest.userId.company_name) 
                                  : 'Unknown'
                        }).appendTo(row);
                    }

                    $('<td>', {
                        class: 'text-center request-date',
                        html: `<div>${new Date(licenseRequest.createdAt).toLocaleDateString('en-GB')}</div><div>${new Date(licenseRequest.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>`
                    }).appendTo(row);

                    $('<td>', {
                        class: 'text-center',
                        text: licenseRequest.requestType
                    }).appendTo(row);

                    $('<td>', {
                        class: 'text-center licensee-name',
                        text: licenseRequest.licenseeName
                    }).appendTo(row);

                    $('<td>', {
                        class: 'text-center registration-code',
                        text: licenseRequest.registrationCode
                    }).appendTo(row);

                    $('<td>', {
                        class: 'text-center',
                        html: `<button class="btn btn-info feature-code-btn" data-feature-code="${licenseRequest.featuresCode}">${licenseRequest.featuresCode}</button>`
                    }).appendTo(row);

                    const statusCell = $('<td>', {
                        class: 'text-center',
                        html: `${licenseRequest.status}`
                    });
                    if (licenseRequest.status === 'Approved') {
                        statusCell.append(`<br><div>${new Date(licenseRequest.updatedAt).toLocaleDateString('en-GB')}</div><div>${new Date(licenseRequest.updatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>`);
                    }
                    statusCell.appendTo(row);

                    const actionsCell = $('<td>', {
                        class: 'text-center'
                    });

                    if (licenseRequest.status === 'Approved') {
                        // زر عرض معلومات الترخيص
                        $('<button>', {
                            class: 'btn btn-success btn-sm mb-1 view-license-info',
                            'data-id': licenseRequest.finalLicense || licenseRequest._id,
                            text: 'عرض معلومات الترخيص'
                        }).appendTo(actionsCell);

                        // أزرار الفواتير - تظهر فقط للمدير
                        if (userRole === 'admin') {
                            // إذا لم يتم إصدار فاتورة العميل
                            if (!licenseRequest.customerInvoice) {
                                $('<button>', {
                                    class: 'btn btn-primary btn-sm mb-1 ms-1 customer-invoice-btn',
                                    'data-id': licenseRequest._id,
                                    text: 'فاتورة العميل'
                                }).appendTo(actionsCell);
                            }

                            // إذا لم يتم إصدار فاتورة المورد
                            if (!licenseRequest.supplierInvoice) {
                                $('<button>', {
                                    class: 'btn btn-info btn-sm mb-1 ms-1 supplier-invoice-btn',
                                    'data-id': licenseRequest._id,
                                    text: 'فاتورة المورد'
                                }).appendTo(actionsCell);
                            }
                        }
                    }

                    // زر الحذف للمدير
                    if (userRole === 'admin' && licenseRequest.status === 'Pending') {
                        $('<button>', {
                            class: 'btn btn-danger btn-sm mb-1 delete-license-request',
                            'data-id': licenseRequest._id,
                            text: 'حذف'
                        }).appendTo(actionsCell);
                    }

                    actionsCell.appendTo(row);

                    licenseRequestsTable.append(row);
                });

                // إظهار الجدول بعد تحميل البيانات
                $('#licenseRequestsTable').show();

                // Update summary
                $('#totalRequests').text(total);
                $('#approvedRequests').text(approved);
                $('#pendingRequests').text(pending);

                // Update pagination
                totalPagesElement.text(totalPages);
                currentPageElement.text(page);
                $('#prevPage').prop('disabled', page === 1);
                $('#nextPage').prop('disabled', page === totalPages);

                attachEventListeners(); // إعادة إرفاق المستمعات بعد تحميل البيانات
                isLoading = false;
                loading.hide();
            })
            .catch(error => {
                console.error('Error fetching license requests:', error);
                isLoading = false;
                loading.hide();
            });
    };

    const handleScroll = () => {
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 50 && !isLoading) {
            currentPage++;
            const searchQuery = $('#searchQuery').val();
            const selectedUserId = $('#filterUserName').val();
            const startDate = $('#filterStartDate').val();
            const endDate = $('#filterEndDate').val();
            fetchLicenseRequests(currentPage, searchQuery, selectedUserId, startDate, endDate);
        }
    };

    const attachEventListeners = () => {
        $('.delete-license-request').off('click').on('click', async function () {
            const licenseId = $(this).data('id');
            const row = $(this).closest('tr');
            const userId = row.data('created-by'); // الحصول على معرف المستخدم من الصف
            const registrationCode = row.find('.registration-code').text(); // الحصول على رمز التسجيل من الصف

            if (confirm('Are you sure you want to delete this license request?')) {
                try {
                    const response = await fetch('/licenses/delete', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ id: licenseId })
                    });

                    const result = await response.json();

                    if (result.success) {
                        // Remove the corresponding row from the table
                        $(`#license-request-${licenseId}`).remove();
                        
                        // إرسال رسالة إلى المستخدم عبر تليجرام
                        fetch('/licenses/notify-deletion', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ userId, registrationCode, message: 'تم حذف طلب الترخيص لكود التسجيل التالي:\n' + registrationCode })
                        });

                        alert(result.message);
                    } else {
                        alert(`Failed to delete license request: ${result.message}`);
                    }
                } catch (error) {
                    console.error('Error deleting license request:', error);
                    alert('An error occurred while trying to delete the license request.');
                }
            }
        });

        $('.view-license-info').off('click').on('click', function () {
            const licenseId = $(this).data('id');

            fetchLicenseDetails(licenseId).then(data => {
                if (data) {
                    updateModalWithLicenseDetails(data);
    
                    const modal = new bootstrap.Modal(document.getElementById('licenseInfoModal'));
                    modal.show();
                } else {
                    alert('No license details found.');
                }
            });
        });

        // إضافة مستمع لزر عرض كود الميزات
        $('.feature-code-btn').off('click').on('click', function () {
            const featureCode = $(this).data('feature-code');
            
            // جلب تفاصيل الميزات باستخدام كود الميزات
            fetch(`/api/features/${featureCode}`)
                .then(response => response.json())
                .then(data => {
                    const featureList = $('#featureList');
                    featureList.empty();
                    
                    data.features.forEach(feature => {
                        const listItem = $('<li>').text(feature.name);  // عرض اسم الميزة فقط
                        featureList.append(listItem);
                    });
                    
                    // عرض النافذة المنبثقة
                    const featureCodeModal = new bootstrap.Modal(document.getElementById('featureCodeModal'));
                    featureCodeModal.show();
                })
                .catch(error => {
                    console.error('Error fetching feature details:', error);
                });
        });

        $('#prevPage').off('click').on('click', function () {
            if (currentPage > 1) {
                currentPage--;
                const searchQuery = $('#searchQuery').val();
                const selectedUserId = $('#filterUserName').val();
                const startDate = $('#filterStartDate').val();
                const endDate = $('#filterEndDate').val();
                fetchLicenseRequests(currentPage, searchQuery, selectedUserId, startDate, endDate);
            }
        });

        $('#nextPage').off('click').on('click', function () {
            const totalPages = parseInt(totalPagesElement.text());
            if (currentPage < totalPages) {
                currentPage++;
                const searchQuery = $('#searchQuery').val();
                const selectedUserId = $('#filterUserName').val();
                const startDate = $('#filterStartDate').val();
                const endDate = $('#filterEndDate').val();
                fetchLicenseRequests(currentPage, searchQuery, selectedUserId, startDate, endDate);
            }
        });

        // معالجة فاتورة العميل
        $(document).on('click', '.customer-invoice-btn', async function() {
            const licenseId = $(this).data('id');
            $('#customerInvoiceLicenseId').val(licenseId);
            
            try {
                // أولاً نحصل على بيانات الطلب للحصول على معرف الترخيص المصروف
                const requestResponse = await fetch(`/licenses/details/${licenseId}`);
                const requestData = await requestResponse.json();
                
                if (!requestData.finalLicense) {
                    throw new Error('لم يتم العثور على ترخيص مصروف لهذا الطلب');
                }

                // ثم نحصل على بيانات الترخيص المصروف
                const licenseResponse = await fetch(`/licenses/details/${requestData.finalLicense}`);
                const licenseData = await licenseResponse.json();
                
                // عرض تفاصيل الترخيص
                $('#customerInvoiceLicenseeName').text(licenseData.licenseeName);
                $('#customerInvoiceSerialNumber').text(licenseData.serialNumber || 'N/A');
                $('#customerInvoiceRegistrationCode').text(licenseData.registrationCode);
                $('#customerInvoiceActivationCode').text(licenseData.activationCode || 'N/A');
                $('#customerInvoiceFeaturesCode').text(licenseData.featuresCode);
                $('#customerInvoiceExpirationDate').text(formatDate(licenseData.expirationDate));

                // عرض الميزات
                fetchFeatureDetails(licenseData.featuresCode).then(featureData => {
                    const featuresList = $('#customerInvoiceFeaturesList');
                    featuresList.empty();
                    if (featureData.features && featureData.features.length > 0) {
                        featureData.features.forEach(feature => {
                            const listItem = $('<li>').text(feature.name);
                            featuresList.append(listItem);
                        });
                    } else {
                        featuresList.append($('<li>').text('لا توجد ميزات'));
                    }
                });
                
                // عرض بيانات الفاتورة إن وجدت
                if (requestData.customerInvoice) {
                    $('#customerInvoiceNumber').val(requestData.customerInvoice.number);
                    $('#customerInvoiceDate').val(formatDateForInput(requestData.customerInvoice.date));
                } else {
                    $('#customerInvoiceNumber').val('');
                    $('#customerInvoiceDate').val('');
                }
                
                $('#customerInvoiceModal').modal('show');
            } catch (error) {
                console.error('Error:', error);
                alert(error.message || 'حدث خطأ أثناء جلب بيانات الترخيص');
            }
        });

        // معالجة فاتورة المورد
        $(document).on('click', '.supplier-invoice-btn', async function() {
            const licenseId = $(this).data('id');
            $('#supplierInvoiceLicenseId').val(licenseId);
            
            try {
                // أولاً نحصل على بيانات الطلب للحصول على معرف الترخيص المصروف
                const requestResponse = await fetch(`/licenses/details/${licenseId}`);
                const requestData = await requestResponse.json();
                
                if (!requestData.finalLicense) {
                    throw new Error('لم يتم العثور على ترخيص مصروف لهذا الطلب');
                }

                // ثم نحصل على بيانات الترخيص المصروف
                const licenseResponse = await fetch(`/licenses/details/${requestData.finalLicense}`);
                const licenseData = await licenseResponse.json();
                
                // عرض تفاصيل الترخيص
                $('#supplierInvoiceLicenseeName').text(licenseData.licenseeName);
                $('#supplierInvoiceSerialNumber').text(licenseData.serialNumber || 'N/A');
                $('#supplierInvoiceRegistrationCode').text(licenseData.registrationCode);
                $('#supplierInvoiceActivationCode').text(licenseData.activationCode || 'N/A');
                $('#supplierInvoiceFeaturesCode').text(licenseData.featuresCode);
                $('#supplierInvoiceExpirationDate').text(formatDate(licenseData.expirationDate));

                // عرض الميزات
                fetchFeatureDetails(licenseData.featuresCode).then(featureData => {
                    const featuresList = $('#supplierInvoiceFeaturesList');
                    featuresList.empty();
                    if (featureData.features && featureData.features.length > 0) {
                        featureData.features.forEach(feature => {
                            const listItem = $('<li>').text(feature.name);
                            featuresList.append(listItem);
                        });
                    } else {
                        featuresList.append($('<li>').text('لا توجد ميزات'));
                    }
                });
                
                // عرض بيانات الفاتورة إن وجدت
                if (requestData.supplierInvoice) {
                    $('#supplierInvoiceNumber').val(requestData.supplierInvoice.number);
                    $('#supplierInvoiceDate').val(formatDateForInput(requestData.supplierInvoice.date));
                } else {
                    $('#supplierInvoiceNumber').val('');
                    $('#supplierInvoiceDate').val('');
                }
                
                $('#supplierInvoiceModal').modal('show');
            } catch (error) {
                console.error('Error:', error);
                alert(error.message || 'حدث خطأ أثناء جلب بيانات الترخيص');
            }
        });

        // تحديث معلومات الترخيص في نوافذ الفواتير
        const updateInvoiceModalWithLicenseDetails = async (licenseId) => {
            try {
                // استخدام نفس المسار المستخدم في نافذة عرض معلومات الترخيص
                const response = await fetch(`/licenses/details/${licenseId}`);
                if (!response.ok) {
                    throw new Error('فشل في جلب معلومات الترخيص');
                }
                const license = await response.json();

                // تحديث العناصر المشتركة في كلا النافذتين
                $('.invoice-licensee-name').text(license.licenseeName || 'غير متوفر');
                $('.invoice-serial-number').text(license.serialNumber || 'غير متوفر');
                $('.invoice-registration-code').text(license.registrationCode || 'غير متوفر');
                $('.invoice-activation-code').text(license.activationCode || 'غير متوفر');
                $('.invoice-features-code').text(license.featuresCode || 'غير متوفر');
                $('.invoice-expiration-date').text(formatDate(license.expirationDate) || 'غير متوفر');

                // تحديث قائمة المزايا
                const featuresList = $('.invoice-features-list');
                featuresList.empty();
                
                // جلب تفاصيل الميزات
                const featuresResponse = await fetch(`/api/features/${license.featuresCode}`);
                if (featuresResponse.ok) {
                    const featuresData = await featuresResponse.json();
                    if (featuresData.features && featuresData.features.length > 0) {
                        featuresData.features.forEach(feature => {
                            featuresList.append(`<li>${feature.name}</li>`);
                        });
                    } else {
                        featuresList.append('<li>لا توجد مزايا</li>');
                    }
                }

                return license;
            } catch (error) {
                console.error('Error:', error);
                alert('حدث خطأ أثناء جلب معلومات الترخيص');
                return null;
            }
        };

        // تحديث معالجات أحداث أزرار الفواتير
        $(document).on('click', '.customer-invoice-btn', async function() {
            const licenseId = $(this).data('id');
            const license = await updateInvoiceModalWithLicenseDetails(licenseId);
            if (license) {
                $('#customerInvoiceLicenseId').val(licenseId);
                if (license.customerInvoice) {
                    $('#customerInvoiceNumber').val(license.customerInvoice.number);
                    $('#customerInvoiceDate').val(formatDateForInput(license.customerInvoice.date));
                }
                $('#customerInvoiceModal').modal('show');
            }
        });

        $(document).on('click', '.supplier-invoice-btn', async function() {
            const licenseId = $(this).data('id');
            const license = await updateInvoiceModalWithLicenseDetails(licenseId);
            if (license) {
                $('#supplierInvoiceLicenseId').val(licenseId);
                if (license.supplierInvoice) {
                    $('#supplierInvoiceNumber').val(license.supplierInvoice.number);
                    $('#supplierInvoiceDate').val(formatDateForInput(license.supplierInvoice.date));
                }
                $('#supplierInvoiceModal').modal('show');
            }
        });

        // حفظ فاتورة العميل
        $('#customerInvoiceForm').on('submit', async function(e) {
            e.preventDefault();
            const licenseId = $('#customerInvoiceLicenseId').val();
            const invoiceNumber = $('#customerInvoiceNumber').val();
            const invoiceDate = $('#customerInvoiceDate').val();

            try {
                const response = await fetch('/licenses/customer-invoice', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        licenseId,
                        invoiceNumber,
                        invoiceDate
                    })
                });

                if (!response.ok) {
                    throw new Error('فشل في حفظ فاتورة العميل');
                }

                // إخفاء النافذة المنبثقة
                $('#customerInvoiceModal').modal('hide');

                // إزالة زر فاتورة العميل من الصف
                const row = $(`#license-request-${licenseId}`);
                row.find('.customer-invoice-btn').remove();

                // تحديث لون الصف
                updateRowInvoiceStatus(row);

                // عرض رسالة نجاح
                showAlert('success', 'تم حفظ فاتورة العميل بنجاح');
            } catch (error) {
                console.error('Error:', error);
                showAlert('danger', 'حدث خطأ أثناء حفظ فاتورة العميل');
            }
        });

        // حفظ فاتورة المورد
        $('#supplierInvoiceForm').on('submit', async function(e) {
            e.preventDefault();
            const licenseId = $('#supplierInvoiceLicenseId').val();
            const invoiceNumber = $('#supplierInvoiceNumber').val();
            const invoiceDate = $('#supplierInvoiceDate').val();

            try {
                const response = await fetch('/licenses/supplier-invoice', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        licenseId,
                        invoiceNumber,
                        invoiceDate
                    })
                });

                if (!response.ok) {
                    throw new Error('فشل في حفظ فاتورة المورد');
                }

                // إخفاء النافذة المنبثقة
                $('#supplierInvoiceModal').modal('hide');

                // إزالة زر فاتورة المورد من الصف
                const row = $(`#license-request-${licenseId}`);
                row.find('.supplier-invoice-btn').remove();

                // تحديث لون الصف
                updateRowInvoiceStatus(row);

                // عرض رسالة نجاح
                showAlert('success', 'تم حفظ فاتورة المورد بنجاح');
            } catch (error) {
                console.error('Error:', error);
                showAlert('danger', 'حدث خطأ أثناء حفظ فاتورة المورد');
            }
        });
    };

    // Flatpickr setup
    flatpickr('#dateFilterBtn', {
        mode: 'range',
        dateFormat: 'Y-m-d',
        onChange: function(selectedDates, dateStr, instance) {
            if (selectedDates.length === 2) {
                $('#filterStartDate').val(selectedDates[0].toISOString().split('T')[0]);
                $('#filterEndDate').val(selectedDates[1].toISOString().split('T')[0]);
                currentPage = 1; // Reset to the first page
                const searchQuery = $('#searchQuery').val();
                const selectedUserId = $('#filterUserName').val();
                fetchLicenseRequests(currentPage, searchQuery, selectedUserId, selectedDates[0].toISOString().split('T')[0], selectedDates[1].toISOString().split('T')[0]);
            }
        }
    });

    // Dynamic search and filter functionality
    const searchQueryInput = $('#searchQuery');
    const filterUserNameSelect = $('#filterUserName');
    const filterStartDateInput = $('#filterStartDate');
    const filterEndDateInput = $('#filterEndDate');

    const loadUsers = async (searchTerm = '') => {
        try {
            const response = await fetch(`/api/users/list${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ''}`);
            if (!response.ok) throw new Error('Failed to fetch users');
            const users = await response.json();
            
            const select = $('#filterUserName');
            select.find('option:not(:first)').remove();
            
            users.forEach(user => {
                const displayName = user.full_name || user.username;
                const companyInfo = user.company_name ? ` (${user.company_name})` : '';
                select.append($('<option>', {
                    value: user._id,
                    text: displayName + companyInfo
                }));
            });
        } catch (error) {
            console.error('Error loading users:', error);
        }
    };

    // تحميل المستخدمين عند تحميل الصفحة
    if ($('#filterUserName').length) {
        loadUsers();
    }

    // إضافة خاصية البحث في القائمة المنسدلة
    let searchTimeout;
    $('#filterUserName').on('keyup', function() {
        clearTimeout(searchTimeout);
        const searchTerm = $(this).val();
        searchTimeout = setTimeout(() => loadUsers(searchTerm), 300);
    });

    const performSearch = () => {
        currentPage = 1;
        const searchQuery = searchQueryInput.val();
        const selectedUserId = filterUserNameSelect.val();
        const startDate = $('#filterStartDate').val();
        const endDate = $('#filterEndDate').val();

        fetchLicenseRequests(currentPage, searchQuery, selectedUserId, startDate, endDate)
            .then(updateUI)
            .catch(error => {
                console.error('Error performing search:', error);
                alert('حدث خطأ أثناء البحث');
            });
    };

    // Event listeners for search inputs
    searchQueryInput.on('input', debounce(performSearch, 500));
    filterUserNameSelect.on('change', performSearch);

    // Initial load
    fetchLicenseRequests(currentPage);
    $(window).on('scroll', handleScroll);

    // تلوين الصفوف بناءً على حالة الفواتير
    const updateRowColor = (row, license) => {
        // نتحقق أولاً من أن الطلب معتمد
        if (license.status === 'Approved') {
            if (license.customerInvoice && license.supplierInvoice) {
                row.classList.add('table-success'); // تم إصدار جميع الفواتير
            } else if (license.customerInvoice || license.supplierInvoice) {
                row.classList.add('table-warning'); // تم إصدار فاتورة واحدة فقط
            } else {
                row.classList.add('table-danger'); // لم يتم إصدار أي فاتورة
            }
        }
    };

    const displayLicenseDetails = (details, containerId) => {
        const container = document.getElementById(containerId);
        container.innerHTML = `
            <div class="mb-4">
                <p><strong>اسم المرخص له:</strong> ${details.licenseeName}</p>
                <p><strong>كود التسجيل:</strong> ${details.registrationCode}</p>
                <p><strong>كود الميزات:</strong> ${details.featuresCode}</p>
            </div>
        `;
    };

    $(document).on('click', '.view-customer-invoice', function() {
        const invoice = JSON.parse($(this).data('invoice'));
        $('#customerInvoiceNumber').val(invoice.number);
        $('#customerInvoiceDate').val(formatDateForInput(invoice.date));
        $('#customerInvoiceModal').modal('show');
    });

    $(document).on('click', '.view-supplier-invoice', function() {
        const invoice = JSON.parse($(this).data('invoice'));
        $('#supplierInvoiceNumber').val(invoice.number);
        $('#supplierInvoiceDate').val(formatDateForInput(invoice.date));
        $('#supplierInvoiceModal').modal('show');
    });

    // تعيين التاريخ الافتراضي عند فتح نوافذ الفواتير
    $('#customerInvoiceModal').on('show.bs.modal', function (event) {
        const today = new Date().toISOString().split('T')[0];
        $('#customerInvoiceDate').val(today);
    });

    $('#supplierInvoiceModal').on('show.bs.modal', function (event) {
        const today = new Date().toISOString().split('T')[0];
        $('#supplierInvoiceDate').val(today);
    });
});
