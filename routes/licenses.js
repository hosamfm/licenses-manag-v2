const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Feature = require('../models/Feature');
const LicenseRequest = require('../models/LicenseRequest');
const { isAuthenticated, checkRole } = require('../middleware/authMiddleware');
const telegramService = require('../services/telegramService');

// نقطة النهاية لتحميل طلبات التراخيص بالصفحات
router.get('/api/license-requests', async (req, res) => {
    const { page = 1, limit = 50, searchQuery, selectedUserId, startDate, endDate } = req.query;
    const { userId, userRole } = req.session;

    try {
        let query = {};

        // تطبيق شروط البحث إذا كانت موجودة
        if (searchQuery) {
            query.$or = [
                { licenseeName: { $regex: searchQuery, $options: 'i' } },
                { registrationCode: { $regex: searchQuery, $options: 'i' } }
            ];
        }

        if (selectedUserId) {
            query.userId = selectedUserId;
        }

        if (startDate && endDate) {
            query.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // تطبيق شروط الصلاحيات
        if (userRole === 'supervisor') {
            const supervisedUsers = await User.find({ supervisor: userId }).select('_id');
            const supervisedUserIds = supervisedUsers.map(user => user._id);
            query.userId = { $in: [...supervisedUserIds, userId] }; // إضافة المستخدم الحالي إلى القائمة
        } else if (userRole === 'representative') {
            query.userId = userId;
        } else if (userRole === 'supplier') {
            const suppliers = await Supplier.find({ users: userId }).select('_id');
            const supplierIds = suppliers.map(supplier => supplier._id);
            if (supplierIds.length > 0) {
                query.supplierId = { $in: supplierIds };
            } else {
                return res.json({
                    requests: [],
                    total: 0,
                    totalPages: 0,
                    approved: 0,
                    pending: 0
                });
            }
        }

        const totalRequests = await LicenseRequest.countDocuments(query);
        const approvedRequests = await LicenseRequest.countDocuments({ ...query, status: 'Approved' });
        const pendingRequests = await LicenseRequest.countDocuments({ ...query, status: 'Pending' });

        const licenseRequests = await LicenseRequest.find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit))
            .populate('userId', 'username');

        const totalPages = Math.ceil(totalRequests / limit);

        res.json({
            requests: licenseRequests,
            total: totalRequests,
            totalPages,
            approved: approvedRequests,
            pending: pendingRequests
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// نقطة النهاية للحصول على تفاصيل الترخيص
router.get('/details/:id', [isAuthenticated, checkRole(['admin', 'supervisor', 'representative', 'supplier'])], async (req, res) => {
    const { userId, userRole } = req.session;

    try {
        const license = await License.findById(req.params.id);

        if (!license) {
            return res.status(404).json({ error: 'License not found' });
        }

        // تحقق من أن المورد يمكنه الوصول إلى هذا الترخيص
        if (userRole === 'supplier') {
            const suppliers = await Supplier.find({ users: userId }).select('_id');
            const supplierIds = suppliers.map(supplier => supplier._id.toString());

            if (!supplierIds.includes(license.supplierId.toString())) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
        }

        const features = await Feature.find({});
        const selectedFeatures = features.filter(feature => (license.featuresCode & (1 << feature.value)) !== 0);

        res.json({
            ...license.toObject(),
            features: selectedFeatures
        });
    } catch (error) {
        console.error('Error fetching license details:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to fetch license details' });
    }
});

// نقطة النهاية لتحميل تفاصيل الميزات
router.get('/api/features/:featureCode', async (req, res) => {
    const { featureCode } = req.params;
    try {
        const numericFeatureCode = parseInt(featureCode);
        if (isNaN(numericFeatureCode)) {
            return res.status(400).json({ error: 'Invalid feature code format' });
        }

        const features = await Feature.find();
        const selectedFeatures = features.filter(feature => 
            (numericFeatureCode & (1 << feature.value)) !== 0
        );

        res.json({ features: selectedFeatures });
    } catch (error) {
        console.error('Error loading features:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// إرسال إشعار حذف الترخيص
router.post('/licenses/notify-deletion', async (req, res) => {
    try {
        const { registrationCode, reason } = req.body;
        const message = `تم حذف الترخيص ${registrationCode}\nالسبب: ${reason}`;
        await telegramService.notifySupplierOfDeletion(registrationCode, reason);
        res.json({ success: true });
    } catch (error) {
        console.error('Error sending deletion notification:', error);
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

// الحصول على تفاصيل الترخيص باستخدام كود التسجيل
router.get('/licenses/license-details', [isAuthenticated], async (req, res) => {
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

// البحث عن أكواد التسجيل
router.get('/licenses/registration-codes', [isAuthenticated], async (req, res) => {
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
