const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { isAuthenticated } = require('../middleware/authMiddleware');

// تطبيق وسيط التحقق من المصادقة على جميع مسارات الملف الشخصي
router.use(isAuthenticated);

// GET /api/profile - جلب الملف الشخصي للمستخدم الحالي
router.get('/', profileController.getProfile);

// PUT /api/profile - تحديث الملف الشخصي للمستخدم الحالي
router.put('/', profileController.updateProfile);

module.exports = router; 