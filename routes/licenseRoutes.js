const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const mongoose = require('mongoose');
const LicenseRequest = require('../models/LicenseRequest');
const bcrypt = require('bcrypt');
const { isAuthenticated, checkRole } = require('../middleware/authMiddleware');
const User = require('../models/User');
const { sendLicenseRequest } = require('../services/telegramService');
const { fetchLicenseRequests } = require('../services/licenseRequestService');
const Feature = require('../models/Feature');
const License = require('../models/License');

const fetchFeatures = async () => {
    return await Feature.find({ value: { $nin: [23, 24] } });
};

const renderForm = async (req, res, view) => {
    try {
        const features = await fetchFeatures();
        res.render(view, { features });
    } catch (error) {
        console.error(`Error fetching features for ${view}:`, error.message, error.stack);
        req.flash('error', `Error navigating to ${view} page`);
        res.redirect('/');
    }
};

router.post('/create', [
    isAuthenticated,
    checkRole(['representative', 'supervisor', 'admin', 'supplier']),
    body('licenseeName').notEmpty().withMessage('Licensee Name is required'),
    body('registrationCode').notEmpty().withMessage('Registration Code is required').matches(/^[XR][A-Za-z0-9]{16,17}$/).withMessage('Invalid Registration Code'),
    body('featuresCode').notEmpty().withMessage('Features Code is required'),
    body('requestType').notEmpty().withMessage('Request Type is required'),
    body('requestPrice').isFloat({ min: 0 }).withMessage('Request Price must be a non-negative number'),
    body('branchName').custom((value, { req }) => {
        const featuresCode = parseInt(req.body.featuresCode);
        const hasSyncFeature = (featuresCode & (1 << 8)) !== 0;
        if (hasSyncFeature && !value) {
            throw new Error('Branch Name is required when Sync Feature is selected');
        }
        return true;
    })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
        const { licenseeName, registrationCode, featuresCode, requestType, requestPrice, baseRegistrationCode, branchName } = req.body;
        const userId = req.session.userId;

        const newLicenseRequest = {
            licenseeName,
            registrationCode,
            featuresCode,
            requestPrice,
            requestType,
            status: 'Pending',
            userId,
            baseRegistrationCode: requestType === 'Additional License' ? baseRegistrationCode : undefined,
            branchName: branchName || undefined
        };

        const createdLicenseRequest = await LicenseRequest.create(newLicenseRequest);

        await sendLicenseRequest(createdLicenseRequest);

        return res.status(200).json({ success: true, message: 'تم تقديم طلب الترخيص بنجاح! سوف تصلك رسالة بالترخيص قريبًا.', redirectUrl: '/licenses/success' });
    } catch (error) {
        console.error('Error creating license request:', error.message, error.stack);
        return res.status(500).json({ success: false, message: 'حدث خطأ أثناء تقديم الطلب. حاول مرة أخرى.' });
    }
});
// تحديث معرف الدردشة في تيليجرام
router.post('/admin/user-management/update-telegram-chat-id', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
    try {
        const { userId, telegramChatId } = req.body;

        if (!userId || !telegramChatId) {
            return res.status(400).send('User ID and Telegram Chat ID are required.');
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send('User not found.');
        }

        user.telegram_chat_id = telegramChatId;
        await user.save();

        req.flash('success', 'Telegram Chat ID updated successfully.');
        res.redirect('/user-management');
    } catch (error) {
        console.error('Error updating Telegram Chat ID:', error.message, error.stack);
        req.flash('error', 'Failed to update Telegram Chat ID.');
        res.redirect('/user-management');
    }
});

// التحقق من وجود كود التسجيل
router.get('/check-registration-code', [isAuthenticated], async (req, res) => {
    try {
        const { registrationCode, requestType } = req.query;
        
        // البحث عن الكود في جدول الطلبات
        const existingRequest = await LicenseRequest.findOne({ 
            registrationCode: registrationCode.toUpperCase(),
            status: { $in: ['Pending', 'Approved'] }
        });

        if (existingRequest) {
            let message = '';
            switch (requestType) {
                case 'Additional License':
                    message = 'هذا الكود مستخدم بالفعل في طلب آخر. الرجاء استخدام كود تسجيل مختلف.';
                    break;
                case 'New License':
                    message = 'هذا الكود مستخدم بالفعل في طلب جديد.';
                    break;
                case 'Re-License':
                    message = 'يوجد طلب إعادة ترخيص لهذا الكود.';
                    break;
                default:
                    message = 'هذا الكود مستخدم بالفعل في طلب آخر.';
            }
            return res.json({
                exists: true,
                message: message,
                requestType: existingRequest.requestType,
                status: existingRequest.status
            });
        }

        return res.json({
            exists: false,
            message: 'الكود متاح للاستخدام'
        });
    } catch (error) {
        console.error('Error checking registration code:', error.message, error.stack);
        return res.status(500).json({ 
            error: true, 
            message: 'حدث خطأ أثناء التحقق من الكود' 
        });
    }
});

router.get('/create-license-request', [isAuthenticated, checkRole(['representative', 'supervisor', 'admin', 'supplier'])], async (req, res) => {
    try {
        const features = await Feature.find({ value: { $nin: [23, 24] } });
        res.render('create_license_request', { features });
    } catch (error) {
        console.error('Error fetching features:', error.message, error.stack);
        req.flash('error', 'Error navigating to create license request page');
        res.redirect('/');
    }
});

router.get('/manage', [isAuthenticated, checkRole(['representative', 'supervisor', 'admin', 'supplier'])], async (req, res) => {
    try {
        const { searchQuery, filterUserName, filterStartDate, filterEndDate } = req.query;

        const filters = {
            searchQuery,
            userName: filterUserName,
            startDate: filterStartDate,
            endDate: filterEndDate,
        };

        const licenseRequests = await LicenseRequest.find()
            .populate('userId')
            .select('licenseeName registrationCode featuresCode status userId requestType requestPrice createdAt updatedAt finalLicense')
            .exec();

        res.render('manage_licenses', { licenseRequests, session: req.session, filters });
    } catch (error) {
        console.error('Error fetching license requests:', error.message, error.stack);
        req.flash('error', 'Error fetching license requests');
        res.redirect('/');
    }
});

router.post('/delete', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ success: false, message: 'License ID is required' });
        }

        const licenseRequest = await LicenseRequest.findById(id);
        if (!licenseRequest) {
            return res.status(404).json({ success: false, message: 'License request not found' });
        }

        if (licenseRequest.finalLicense) {
            await License.findByIdAndDelete(licenseRequest.finalLicense);
        }

        await LicenseRequest.findByIdAndDelete(id);

        res.json({ success: true, message: 'License request and related license deleted successfully.' });
    } catch (error) {
        console.error('Error deleting license request and related license:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Failed to delete license request and related license' });
    }
});

router.get('/success', isAuthenticated, (req, res) => {
    try {
        res.render('success');
    } catch (error) {
        console.error('Error navigating to success page:', error.message, error.stack);
        req.flash('error', 'Error navigating to success page');
        res.redirect('/');
    }
});

router.get('/no_permissions', (req, res) => {
    try {
        res.render('no_permissions');
    } catch (error) {
        console.error('Error navigating to no_permissions page:', error.message, error.stack);
        req.flash('error', 'Error navigating to no_permissions page');
        res.redirect('/');
    }
});

router.post('/admin/user-management', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
    try {
        const { action, userId, username, password, userRole, newPassword, telegramChatId } = req.body;

        const validRoles = ['no_permissions', 'representative', 'supervisor', 'admin', 'supplier'];
        switch (action) {
            case 'add':
                const hashedPassword = await bcrypt.hash(password, 10);
                await User.create({ username, password: hashedPassword });
                req.flash('success', 'User added successfully.');
                break;
            case 'delete':
                await User.findByIdAndDelete(userId);
                req.flash('success', 'User deleted successfully.');
                break;
            case 'update-role':
                if (!validRoles.includes(userRole)) {
                    req.flash('error', 'Invalid role specified');
                    return res.redirect('/admin/user-management');
                }
                await User.findByIdAndUpdate(userId, { user_role: userRole });
                req.flash('success', 'User role updated successfully.');
                break;
            case 'change-password':
                const newHashedPassword = await bcrypt.hash(newPassword, 10);
                await User.findByIdAndUpdate(userId, { password: newHashedPassword });
                req.flash('success', 'User password changed successfully.');
                break;
            case 'update-telegram-chat-id':
                await User.findByIdAndUpdate(userId, { telegram_chat_id: telegramChatId });
                req.flash('success', 'Telegram Chat ID updated successfully.');
                break;
            default:
                req.flash('error', 'Invalid action specified');
        }
        res.redirect('/admin/user-management');
    } catch (error) {
        console.error(`Error performing user management action (${req.body.action}):`, error.message, error.stack);
        req.flash('error', `Failed to perform action: ${req.body.action}`);
        res.redirect('/admin/user-management');
    }
});

router.post('/update-license-data', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
    try {
        const { licenseeName, serialNumber, registrationCode, activationCode, featuresCode, expirationDate } = req.body;
        await processLicenseData(licenseeName, serialNumber, registrationCode, activationCode, featuresCode, expirationDate); // Use processLicenseData from telegramService.js
        res.status(200).json({ message: 'License data updated successfully' });
    } catch (error) {
        console.error('Error updating license data:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to update license data' });
    }
});

router.get('/details/:id', async (req, res) => {
    try {
        let licenseData;
        let invoiceData = {};

        // البحث في جدول التراخيص
        const license = await License.findById(req.params.id)
            .populate('supplierId', 'name');

        if (license) {
            // إذا وجدنا الترخيص، نبحث عن طلب الترخيص المرتبط به
            const licenseRequest = await LicenseRequest.findOne({ finalLicense: license._id });
            if (licenseRequest) {
                // نأخذ معلومات الفواتير من الطلب
                invoiceData = {
                    customerInvoice: licenseRequest.customerInvoice,
                    supplierInvoice: licenseRequest.supplierInvoice
                };
            }
            licenseData = license;
        } else {
            // إذا لم نجد الترخيص، نبحث في الطلبات
            const licenseRequest = await LicenseRequest.findById(req.params.id)
                .populate('userId', 'name email');

            if (!licenseRequest) {
                return res.status(404).json({ message: 'لم يتم العثور على الترخيص' });
            }

            licenseData = licenseRequest;
            // نأخذ معلومات الفواتير من الطلب مباشرة
            invoiceData = {
                customerInvoice: licenseRequest.customerInvoice,
                supplierInvoice: licenseRequest.supplierInvoice
            };
        }

        // دمج بيانات الترخيص مع بيانات الفواتير
        const responseData = {
            ...licenseData.toObject(),
            ...invoiceData
        };

        res.json(responseData);
    } catch (error) {
        console.error('Error fetching license details:', error);
        res.status(500).json({ message: 'حدث خطأ أثناء جلب تفاصيل الترخيص' });
    }
});

router.post('/customer-invoice', [
    isAuthenticated,
    body('licenseId').notEmpty().withMessage('License ID is required'),
    body('invoiceNumber').notEmpty().withMessage('Invoice Number is required'),
    body('invoiceDate').notEmpty().withMessage('Invoice Date is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
        const { licenseId, invoiceNumber, invoiceDate } = req.body;
        const userId = req.session.userId;
        
        const licenseRequest = await LicenseRequest.findById(licenseId);
        
        if (!licenseRequest) {
            return res.status(404).json({ success: false, message: 'License request not found' });
        }

        // التحقق من وجود فاتورة مسبقًا
        const isExistingInvoice = licenseRequest.customerInvoice && licenseRequest.customerInvoice.number;

        // تحديث معلومات الفاتورة
        licenseRequest.customerInvoice = {
            number: invoiceNumber,
            date: new Date(invoiceDate),
            addedBy: isExistingInvoice ? licenseRequest.customerInvoice.addedBy : userId,
            lastModifiedBy: userId,
            addedAt: isExistingInvoice ? licenseRequest.customerInvoice.addedAt : new Date(),
            lastModifiedAt: new Date()
        };

        await licenseRequest.save();

        return res.status(200).json({ 
            success: true, 
            message: 'تم إضافة فاتورة العميل بنجاح',
            invoice: licenseRequest.customerInvoice 
        });
    } catch (error) {
        console.error('Error adding customer invoice:', error);
        return res.status(500).json({ success: false, message: 'حدث خطأ أثناء إضافة الفاتورة' });
    }
});

router.post('/supplier-invoice', [
    isAuthenticated,
    body('licenseId').notEmpty().withMessage('License ID is required'),
    body('invoiceNumber').notEmpty().withMessage('Invoice Number is required'),
    body('invoiceDate').notEmpty().withMessage('Invoice Date is required')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
        const { licenseId, invoiceNumber, invoiceDate } = req.body;
        const userId = req.session.userId;
        
        const licenseRequest = await LicenseRequest.findById(licenseId);
        
        if (!licenseRequest) {
            return res.status(404).json({ success: false, message: 'License request not found' });
        }

        // التحقق من وجود فاتورة مسبقًا
        const isExistingInvoice = licenseRequest.supplierInvoice && licenseRequest.supplierInvoice.number;

        // تحديث معلومات الفاتورة
        licenseRequest.supplierInvoice = {
            number: invoiceNumber,
            date: new Date(invoiceDate),
            addedBy: isExistingInvoice ? licenseRequest.supplierInvoice.addedBy : userId,
            lastModifiedBy: userId,
            addedAt: isExistingInvoice ? licenseRequest.supplierInvoice.addedAt : new Date(),
            lastModifiedAt: new Date()
        };

        await licenseRequest.save();

        return res.status(200).json({ 
            success: true, 
            message: 'تم إضافة فاتورة المورد بنجاح',
            invoice: licenseRequest.supplierInvoice 
        });
    } catch (error) {
        console.error('Error adding supplier invoice:', error);
        return res.status(500).json({ success: false, message: 'حدث خطأ أثناء إضافة الفاتورة' });
    }
});

router.get('/registration-codes', isAuthenticated, async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        const regex = new RegExp('^' + query.toUpperCase(), 'i');
        // البحث في جدول الطلبات
        const requests = await LicenseRequest.find({ 
            registrationCode: regex,
            requestType: 'New License',
            status: { $in: ['Pending', 'Approved'] }
        }).select('registrationCode -_id');

        if (requests.length === 0) {
            return res.status(404).json({ error: 'No registration codes found' });
        }

        res.json(requests);
    } catch (error) {
        console.error('Error fetching registration codes:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to fetch registration codes' });
    }
});

router.get('/license-details', isAuthenticated, async (req, res) => {
    try {
        const { registrationCode } = req.query;
        
        // البحث عن الترخيص في جدول الطلبات
        const request = await mongoose.connection.db.collection('licenserequests').findOne({ 
            registrationCode: registrationCode.toUpperCase(),
            requestType: 'New License',
            status: { $in: ['Pending', 'Approved'] }
        }).sort({ createdAt: -1 });

        if (!request) {
            return res.status(404).json({ exists: false });
        }

        res.json({
            exists: true,
            licenseeName: request.licenseeName,
            featuresCode: request.featuresCode
        });
    } catch (error) {
        console.error('Error fetching license details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/new-license', [isAuthenticated, checkRole(['representative', 'supervisor', 'admin', 'supplier'])], async (req, res) => {
    await renderForm(req, res, 'new_license');
});

router.post('/new-license', [
    isAuthenticated,
    checkRole(['representative', 'supervisor', 'admin', 'supplier']),
    body('licenseeName').notEmpty().withMessage('Licensee Name is required'),
    body('registrationCode').notEmpty().withMessage('Registration Code is required').matches(/^[XR][A-Za-z0-9]{16,17}$/).withMessage('Invalid Registration Code'),
    body('featuresCode').notEmpty().withMessage('Features Code is required'),
    body('requestPrice').isFloat({ min: 0 }).withMessage('Request Price must be a non-negative number')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
        const { licenseeName, registrationCode, featuresCode, requestPrice } = req.body;
        const userId = req.session.userId;

        const newLicenseRequest = {
            licenseeName,
            registrationCode,
            featuresCode,
            requestPrice,
            requestType: 'New License',
            status: 'Pending',
            userId
        };

        const createdLicenseRequest = await LicenseRequest.create(newLicenseRequest);

        await sendLicenseRequest(createdLicenseRequest);

        return res.status(200).json({ success: true, message: 'تم تقديم طلب الترخيص بنجاح! سوف تصلك رسالة بالترخيص قريبًا.', redirectUrl: '/licenses/success' });
    } catch (error) {
        console.error('Error creating new license request:', error.message, error.stack);
        return res.status(500).json({ success: false, message: 'حدث خطأ أثناء تقديم الطلب. حاول مرة أخرى.' });
    }
});

router.get('/additional-license', [isAuthenticated, checkRole(['representative', 'supervisor', 'admin', 'supplier'])], async (req, res) => {
    await renderForm(req, res, 'additional_license');
});

router.post('/additional-license', [
    isAuthenticated,
    checkRole(['representative', 'supervisor', 'admin', 'supplier']),
    body('licenseeName').notEmpty().withMessage('Licensee Name is required'),
    body('registrationCode').notEmpty().withMessage('Registration Code is required').matches(/^[XR][A-Za-z0-9]{16,17}$/).withMessage('Invalid Registration Code'),
    body('featuresCode').notEmpty().withMessage('Features Code is required'),
    body('requestPrice').isFloat({ min: 0 }).withMessage('Request Price must be a non-negative number'),
    body('baseRegistrationCode').notEmpty().withMessage('Base Registration Code is required'),
    body('branchName').custom((value, { req }) => {
        const featuresCode = parseInt(req.body.featuresCode);
        const hasSyncFeature = (featuresCode & (1 << 8)) !== 0;
        if (hasSyncFeature && !value) {
            throw new Error('Branch Name is required when Sync Feature is selected');
        }
        return true;
    })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
        const { licenseeName, registrationCode, featuresCode, requestPrice, baseRegistrationCode, branchName } = req.body;
        const userId = req.session.userId;

        const newLicenseRequest = {
            licenseeName,
            registrationCode,
            featuresCode,
            requestPrice,
            requestType: 'Additional License',
            status: 'Pending',
            userId,
            baseRegistrationCode,
            branchName: branchName || undefined
        };

        const createdLicenseRequest = await LicenseRequest.create(newLicenseRequest);

        await sendLicenseRequest(createdLicenseRequest);

        return res.status(200).json({ success: true, message: 'تم تقديم طلب الترخيص بنجاح! سوف تصلك رسالة بالترخيص قريبًا.', redirectUrl: '/licenses/success' });
    } catch (error) {
        console.error('Error creating additional license request:', error.message, error.stack);
        return res.status(500).json({ success: false, message: 'حدث خطأ أثناء تقديم الطلب. حاول مرة أخرى.' });
    }
});

router.get('/temporary-license', [isAuthenticated, checkRole(['representative', 'supervisor', 'admin', 'supplier'])], async (req, res) => {
    await renderForm(req, res, 'temporary_license');
});

router.post('/temporary-license', [
    isAuthenticated,
    checkRole(['representative', 'supervisor', 'admin', 'supplier']),
    body('licenseeName').notEmpty().withMessage('Licensee Name is required'),
    body('registrationCode').notEmpty().withMessage('Registration Code is required').matches(/^[XR][A-Za-z0-9]{16,17}$/).withMessage('Invalid Registration Code'),
    body('featuresCode').notEmpty().withMessage('Features Code is required'),
    body('reason').notEmpty().withMessage('Reason is required'),
    body('expirationDate').notEmpty().withMessage('Expiration Date is required'),
    body('requestPrice').isFloat({ min: 0 }).withMessage('Request Price must be a non-negative number')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
        const { licenseeName, registrationCode, featuresCode, reason, expirationDate, requestPrice } = req.body;
        const userId = req.session.userId;

        const newLicenseRequest = {
            licenseeName,
            registrationCode,
            featuresCode,
            reason,
            expirationDate,
            requestPrice,
            requestType: 'Temporary License',
            status: 'Pending',
            userId
        };

        const createdLicenseRequest = await LicenseRequest.create(newLicenseRequest);

        await sendLicenseRequest(createdLicenseRequest);

        return res.status(200).json({ success: true, message: 'تم تقديم طلب الترخيص المؤقت بنجاح! سوف تصلك رسالة بالترخيص قريبًا.', redirectUrl: '/licenses/success' });
    } catch (error) {
        console.error('Error creating temporary license request:', error.message, error.stack);
        return res.status(500).json({ success: false, message: 'حدث خطأ أثناء تقديم الطلب. حاول مرة أخرى.' });
    }
});

router.get('/additional-feature-request', [isAuthenticated, checkRole(['representative', 'supervisor', 'admin', 'supplier'])], async (req, res) => {
    await renderForm(req, res, 'additional_feature_request');
});

router.post('/additional-feature-request', [
    isAuthenticated,
    checkRole(['representative', 'supervisor', 'admin', 'supplier']),
    body('licenseeName').notEmpty().withMessage('Licensee Name is required'),
    body('registrationCode').notEmpty().withMessage('Registration Code is required').matches(/^[XR][A-Za-z0-9]{16,17}$/).withMessage('Invalid Registration Code'),
    body('featuresCode').notEmpty().withMessage('Features Code is required'),
    body('requestPrice').isFloat({ min: 0 }).withMessage('Request Price must be a non-negative number'),
    body('oldFeaturesCode').notEmpty().withMessage('Old Features Code is required'),
    body('branchName').custom((value, { req }) => {
        const oldFeatures = parseInt(req.body.oldFeaturesCode) || 0;
        const newFeatures = parseInt(req.body.featuresCode) || 0;
        const hasSyncFeature = (newFeatures & (1 << 8)) !== 0 && !(oldFeatures & (1 << 8));
        if (hasSyncFeature && !value) {
            throw new Error('Branch Name is required when adding Sync Feature');
        }
        return true;
    })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
        const { licenseeName, registrationCode, featuresCode, requestPrice, oldFeaturesCode, branchName } = req.body;
        const userId = req.session.userId;

        const newLicenseRequest = {
            licenseeName,
            registrationCode,
            featuresCode,
            requestPrice,
            oldFeaturesCode,
            requestType: 'Additional Feature Request',
            status: 'Pending',
            userId,
            branchName: branchName || undefined
        };

        const createdLicenseRequest = await LicenseRequest.create(newLicenseRequest);

        await sendLicenseRequest(createdLicenseRequest);

        return res.status(200).json({ success: true, message: 'تم تقديم طلب ميزة إضافية بنجاح! سوف تصلك رسالة بالترخيص قريبًا.', redirectUrl: '/licenses/success' });
    } catch (error) {
        console.error('Error creating additional feature request:', error.message, error.stack);
        return res.status(500).json({ success: false, message: 'حدث خطأ أثناء تقديم الطلب. حاول مرة أخرى.' });
    }
});

router.get('/re-license', [isAuthenticated, checkRole(['representative', 'supervisor', 'admin', 'supplier'])], async (req, res) => {
    await renderForm(req, res, 're_license');
});

router.post('/re-license', [
    isAuthenticated,
    checkRole(['representative', 'supervisor', 'admin', 'supplier']),
    body('licenseeName').notEmpty().withMessage('Licensee Name is required'),
    body('oldRegistrationCode').notEmpty().withMessage('Old Registration Code is required').matches(/^[XR][A-Za-z0-9]{16,17}$/).withMessage('Invalid Old Registration Code'),
    body('newRegistrationCode').notEmpty().withMessage('New Registration Code is required').matches(/^[XR][A-Za-z0-9]{16,17}$/).withMessage('Invalid New Registration Code'),
    body('featuresCode').notEmpty().withMessage('Features Code is required'),
    body('reason').notEmpty().withMessage('Reason is required'),
    body('requestPrice').isFloat({ min: 0 }).withMessage('Request Price must be a non-negative number')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
        const { licenseeName, oldRegistrationCode, newRegistrationCode, featuresCode, reason, requestPrice } = req.body;
        const userId = req.session.userId;

        const newLicenseRequest = {
            licenseeName,
            registrationCode: newRegistrationCode,
            oldRegistrationCode,
            featuresCode,
            reason,
            requestPrice,
            status: 'Pending',
            userId,
            requestType: 'Re-License'
        };

        const createdLicenseRequest = await LicenseRequest.create(newLicenseRequest);

        await sendLicenseRequest(createdLicenseRequest);

        return res.status(200).json({ success: true, message: 'تم تقديم طلب إعادة الترخيص بنجاح! سوف تصلك رسالة بالترخيص قريبًا.', redirectUrl: '/licenses/success' });
    } catch (error) {
        console.error('Error creating re-license request:', error.message, error.stack);
        return res.status(500).json({ success: false, message: 'حدث خطأ أثناء تقديم الطلب. حاول مرة أخرى.' });
    }
});

router.get('/license-details', [isAuthenticated], async (req, res) => {
    try {
        const { registrationCode } = req.query;
        if (!registrationCode) {
            return res.status(400).json({ error: 'Registration code is required' });
        }

        // البحث عن الترخيص في جدول الطلبات
        const licenseRequest = await mongoose.connection.db.collection('licenserequests').findOne({ 
            registrationCode: registrationCode.toUpperCase(),
            status: 'Approved'
        });

        if (!licenseRequest) {
            return res.status(404).json({ error: 'License not found' });
        }

        // إرجاع تفاصيل الترخيص
        res.json({
            licenseeName: licenseRequest.licenseeName,
            registrationCode: licenseRequest.registrationCode,
            featuresCode: licenseRequest.featuresCode,
            exists: true
        });
    } catch (error) {
        console.error('Error fetching license details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/registration-codes', [isAuthenticated], async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.json([]);
        }

        // البحث عن أكواد التسجيل المطابقة
        const licenses = await mongoose.connection.db.collection('licenserequests').find({
            registrationCode: { $regex: query.toUpperCase(), $options: 'i' },
            status: 'Approved'
        }).project({ registrationCode: 1, _id: 0 }).limit(10).toArray();

        res.json(licenses);
    } catch (error) {
        console.error('Error searching registration codes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
