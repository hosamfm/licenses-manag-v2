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

    const updateModalWithLicenseDetails = (license) => {
        $('#modalLicenseeName').text(license.licenseeName);
        $('#modalSerialNumber').text(license.serialNumber);
        $('#modalRegistrationCode').text(license.registrationCode);
        $('#modalActivationCode').text(license.activationCode || 'N/A');
        $('#modalFeaturesCode').text(license.featuresCode);
        $('#modalExpirationDate').text(license.expirationDate ? new Date(license.expirationDate).toLocaleDateString() : 'N/A');

        // Fetch and display features
        fetchFeatureDetails(license.featuresCode).then(data => {
            const featuresList = $('#modalFeaturesList');
            featuresList.empty();
            if (data.features && data.features.length > 0) {
                data.features.forEach(feature => {
                    const listItem = $('<li>').text(feature.name);
                    featuresList.append(listItem);
                });
            } else {
                featuresList.append($('<li>').text('No features available'));
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

                if (requests.length === 0) {
                    $(window).off('scroll', handleScroll);
                }

                if (!Array.isArray(requests)) {
                    throw new Error('Unexpected response format');
                }

                requests.forEach((licenseRequest, index) => {
                    const row = $('<tr>', {
                        id: `license-request-${licenseRequest._id}`,
                        'data-created-by': licenseRequest.userId._id,
                        'data-supervisor': licenseRequest.userId.supervisor
                    });

                    $('<td>', {
                        class: 'text-center',
                        text: (page - 1) * limit + index + 1
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
                        $('<button>', {
                            class: 'btn btn-success btn-sm mb-1 view-license-info',
                            'data-id': licenseRequest.finalLicense || licenseRequest._id, // تعديل هنا لاستخدام المعرف الصحيح
                            text: 'عرض معلومات الترخيص'
                        }).appendTo(actionsCell);
                    }
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
});
