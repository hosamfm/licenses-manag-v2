const fs = require('fs');
const path = require('path');
const LicenseRequest = require('../models/LicenseRequest');
const PriceReaderLicenseRequest = require('../models/PriceReaderLicenseRequest'); // استيراد النموذج الجديد
const License = require('../models/License');
const Feature = require('../models/Feature');
const { validationResult } = require('express-validator');
const { sendLicenseRequest, sendMessage, sendPhoto } = require('../services/telegramService'); // اجمع كل الدوال هنا
const { fetchLicenseRequests } = require('../services/licenseRequestService');
const bcrypt = require('bcrypt');
const User = require('../models/User');
const bwipjs = require('bwip-js');

// Helper function to fetch features
const fetchFeatures = async () => {
    return await Feature.find({ value: { $nin: [23, 24] } });
};

// Helper function to render forms
const renderForm = async (res, view) => {
    try {
        const features = await fetchFeatures();
        res.render(view, { features });
    } catch (error) {
        console.error(`Error fetching features for ${view}:`, error.message, error.stack);
        req.flash('error', `Error navigating to ${view} page`);
        res.redirect('/');
    }
};

// Controller to handle new license creation
exports.createLicense = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        req.flash('error', errors.array().map(err => err.msg).join(', '));
        return res.redirect(req.headers.referer || '/licenses/create-license-request');
    }

    try {
        const { licenseeName, registrationCode, featuresCode, reason, requestType, serialNumber, expirationDate, requestPrice, baseRegistrationCode, oldRegistrationCode, newRegistrationCode, oldFeaturesCode } = req.body;
        const userId = req.session.userId; // Get the user ID from the session

        // Check for duplicate requests with the same registration code, except for 'AdditionalFeatureRequest'
        if (requestType === 'New License') {
            const existingLicense = await License.findOne({ registrationCode });
            if (existingLicense) {
                req.flash('error', 'This license already exists, please contact administration.');
                return res.redirect(req.headers.referer || '/licenses/create-license-request');
            }
        }

        // Create a new license request object
        const newLicenseRequest = {
            licenseeName,
            registrationCode,
            featuresCode,
            status: 'Pending',
            userId, // Associate the license request with the user ID
            requestType, // Include the request type
            serialNumber, // Include serialNumber
            expirationDate, // Include expirationDate
            requestPrice, // Include requestPrice
            baseRegistrationCode, // Include base registration code for additional licenses
            oldRegistrationCode, // Include old registration code for re-licenses
            newRegistrationCode, // Include new registration code for re-licenses
            oldFeaturesCode, // Include old features code for additional feature requests
            reason // Include reason for temporary licenses and re-licenses
        };

        // Create the license request in the database
        const createdLicenseRequest = await LicenseRequest.create(newLicenseRequest);

        // Send the license request data to the supplier via Telegram
        await sendLicenseRequest(createdLicenseRequest);

        req.flash('success', 'تم تقديم طلب الترخيص بنجاح! سوف تصلك رسالة بالترخيص قريبًا.');
        res.redirect('/licenses/success');
    } catch (error) {
        console.error('Error creating license request:', error.message, error.stack);
        req.flash('error', 'حدث خطأ أثناء تقديم الطلب. حاول مرة أخرى.');
        res.redirect(req.headers.referer || '/licenses/create-license-request');
    }
};

// Controller to render the new license form
exports.renderNewLicenseForm = async (req, res) => {
    await renderForm(res, 'new_license');
};

// Controller to render the additional license form
exports.renderAdditionalLicenseForm = async (req, res) => {
    await renderForm(res, 'additional_license');
};

// Controller to render the temporary license form
exports.renderTemporaryLicenseForm = async (req, res) => {
    await renderForm(res, 'temporary_license');
};

// Controller to render the additional feature request form
exports.renderAdditionalFeatureRequestForm = async (req, res) => {
    await renderForm(res, 'additional_feature_request');
};

// Controller to render the re-license form
exports.renderReLicenseForm = async (req, res) => {
    await renderForm(res, 're_license');
};

// Controller to handle license request deletion
exports.deleteLicenseRequest = async (req, res) => {
    try {
        const { id } = req.body;
        if (!id) {
            return res.status(400).json({ success: false, message: 'License ID is required' });
        }
        const deletedLicenseRequest = await LicenseRequest.findByIdAndDelete(id);
        if (!deletedLicenseRequest) {
            return res.status(404).json({ success: false, message: 'License request not found' });
        }
        res.json({ success: true, message: 'License request deleted successfully.' });
    } catch (error) {
        console.error('Error deleting license request:', error.message, error.stack);
        res.status(500).json({ success: false, message: 'Failed to delete license request' });
    }
};

// Controller to handle fetching license details by ID
exports.getLicenseDetailsById = async (req, res) => {
    try {
        const license = await License.findById(req.params.id);
        if (!license) {
            return res.status(404).json({ error: 'License not found' });
        }
        res.json(license);
    } catch (error) {
        console.error('Error fetching license details:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to fetch license details' });
    }
};

// Controller to handle fetching registration codes for auto-completion
exports.getRegistrationCodes = async (req, res) => {
    try {
        const { query } = req.query;
        const regex = new RegExp('^' + query.toUpperCase(), 'i'); // Case-insensitive matching
        const licenses = await License.find({ registrationCode: regex }).select('registrationCode -_id');
        res.json(licenses);
    } catch (error) {
        console.error('Error fetching registration codes:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to fetch registration codes' });
    }
};

// Controller to handle fetching license details by registration code for auto-completion
exports.getLicenseDetailsByRegistrationCode = async (req, res) => {
    try {
        const { registrationCode } = req.query;
        
        // البحث في جدول الطلبات
        const licenseRequest = await LicenseRequest.findOne({
            registrationCode: registrationCode.toUpperCase(),
            requestType: 'New License',
            status: { $in: ['Pending', 'Approved'] }
        }).sort({ createdAt: -1 });

        if (!licenseRequest) {
            return res.status(404).json({ exists: false });
        }

        res.json({
            exists: true,
            licenseeName: licenseRequest.licenseeName,
            featuresCode: licenseRequest.featuresCode
        });
    } catch (error) {
        console.error('Error fetching license details:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to fetch license details' });
    }
};

// Controller to handle fetching previous license details by registration code for auto-completion
exports.getPreviousLicenseDetailsByRegistrationCode = async (req, res) => {
    try {
        const { registrationCode } = req.query;
        const license = await License.findOne({ registrationCode: registrationCode.toUpperCase() });
        if (!license) {
            return res.status(404).json({ error: 'License not found' });
        }
        res.json({
            licenseeName: license.licenseeName,
            featuresCode: license.featuresCode
        });
    } catch (error) {
        console.error('Error fetching previous license details:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to fetch previous license details' });
    }
};

// Controller to handle user management actions
exports.userManagement = async (req, res) => {
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
};

// Controller to handle updating license data from the supplier
exports.updateLicenseData = async (req, res) => {
    try {
        const { licenseeName, serialNumber, registrationCode, activationCode, featuresCode, expirationDate } = req.body;
        await processLicenseData(licenseeName, serialNumber, registrationCode, activationCode, featuresCode, expirationDate); // Use processLicenseData from telegramService.js
        res.status(200).json({ message: 'License data updated successfully' });
    } catch (error) {
        console.error('Error updating license data:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to update license data' });
    }
};

// Controller to fetch license requests based on role and filters
exports.fetchLicenseRequests = async (req, res) => {
    try {
        const { searchQuery, filterUserName, filterStartDate, filterEndDate } = req.query;

        const filters = {
            searchQuery,
            userName: filterUserName,
            startDate: filterStartDate,
            endDate: filterEndDate,
        };

        const licenseRequests = await fetchLicenseRequests(req.session.userId, req.session.userRole, filters);

        res.render('manage_licenses', { licenseRequests, session: req.session, filters });
    } catch (error) {
        console.error('Error fetching license requests:', error.message, error.stack);
        req.flash('error', 'Error fetching license requests');
        res.redirect('/');
    }
};

// دالة للتعامل مع طلبات ترخيص قارئ الأسعار
exports.handlePriceReaderLicenseRequest = async (req, res) => {
    const { licenseeName, deviceCode } = req.body;

    // تحقق من أن كود الجهاز يتكون من أرقام فقط
    if (!/^\d+$/.test(deviceCode)) {
        req.flash('error', 'كود الجهاز يجب أن يكون مكوناً من أرقام فقط.');
        return res.redirect('/price-reader-license');
    }

    try {
        // توليد كود التفعيل
        const activationCode = Math.floor((deviceCode * 5) / 10) + 8;

        // الحصول على userId من الجلسة
        const userId = req.session.userId;

        // البحث عن المستخدم في قاعدة البيانات
        const user = await User.findById(userId);
        if (!user || !user.telegram_chat_id) {
            req.flash('error', 'لم يتم العثور على معرف دردشة تليجرام.');
            return res.redirect('/price-reader-license');
        }

        // حفظ الطلب في قاعدة البيانات
        const newRequest = new PriceReaderLicenseRequest({
            licenseeName,
            deviceCode,
            activationCode,
            userId
        });
        await newRequest.save();

        // التأكد من وجود المجلد أو إنشاؤه إذا لم يكن موجودًا
        const barcodeDir = path.join(__dirname, '..', 'public', 'barcodes');
        if (!fs.existsSync(barcodeDir)) {
            fs.mkdirSync(barcodeDir, { recursive: true });
        }

        // إنشاء باركود من الرقم المولد
        bwipjs.toBuffer({
            bcid: 'code128',           // نوع الباركود (Code-128)
            text: activationCode.toString(),  // النص الذي سيتم تحويله إلى باركود
            scale: 3,                  // حجم الباركود
            height: 10,                // ارتفاع الباركود
            includetext: true,         // تضمين النص أسفل الباركود
            textxalign: 'center',      // محاذاة النص أسفل الباركود
            paddingwidth: 20,          // إضافة هامش على اليمين واليسار (20 بكسل)
            paddingheight: 0,          // لا حاجة لإضافة هامش أعلى وأسفل
        }, async (err, png) => {
            if (err) {
                console.error('Error generating barcode:', err);
                req.flash('error', 'حدث خطأ أثناء إنشاء الباركود.');
                return res.redirect('/price-reader-license');
            } else {
                // حفظ الصورة مؤقتاً
                const barcodePath = path.join(barcodeDir, `${activationCode}.png`);
                fs.writeFileSync(barcodePath, png);
        
                // إرسال الباركود عبر تليجرام
                const chatId = user.telegram_chat_id;
                const message = `اسم المرخص له: ${licenseeName}\nكود الجهاز: ${deviceCode}\nكود التفعيل: ${activationCode}`;
                
                // إرسال الرسالة النصية
                await sendMessage(chatId, message);
        
                // إرسال صورة الباركود
                await sendPhoto(chatId, barcodePath);
        
                // حذف الصورة بعد الإرسال
                fs.unlinkSync(barcodePath);

                // توجيه المستخدم إلى صفحة النجاح
                res.redirect('/price-reader-license/success');
            }
        });
        
    } catch (error) {
        console.error('Error sending message or barcode to Telegram:', error.message);
        req.flash('error', 'حدث خطأ أثناء إرسال البيانات عبر تليجرام.');
        res.redirect('/price-reader-license');
    }
};
