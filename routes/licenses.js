const express = require('express');
const router = express.Router();
const Feature = require('../models/Feature');
const LicenseRequest = require('../models/LicenseRequest');
const User = require('../models/User');
const Supplier = require('../models/Supplier');
const { isAuthenticated, checkRole } = require('../middleware/authMiddleware');
const telegramService = require('../services/telegramService');

// نقطة النهاية لتحميل طلبات التراخيص بالصفحات
router.get('/api/license-requests', async (req, res) => {
    const { page = 1, limit = 50, searchQuery, userName, startDate, endDate } = req.query;
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

        if (userName) {
            const users = await User.find({
                $or: [
                    { username: { $regex: userName, $options: 'i' } },
                    { full_name: { $regex: userName, $options: 'i' } },
                    { company_name: { $regex: userName, $options: 'i' } }
                ]
            });
            const userIds = users.map(user => user._id);
            query.userId = { $in: userIds };
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
        const features = await Feature.find({});
        const selectedFeatures = features.filter(feature => (featureCode & (1 << feature.value)) !== 0);

        res.json({ features: selectedFeatures });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// نقطة النهاية لإشعار الحذف
router.post('/licenses/notify-deletion', async (req, res) => {
    const { userId, registrationCode } = req.body;
    try {
      await telegramService.notifyUserOfDeletion(userId, registrationCode);
      await telegramService.notifySupplierOfDeletion(registrationCode);
      res.status(200).json({ success: true, message: 'تم إرسال إشعار الحذف بنجاح.' });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
