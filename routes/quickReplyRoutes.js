const express = require('express');
const router = express.Router();
const quickReplyController = require('../controllers/quickReplyController');
const { isAuthenticated } = require('../middleware/authMiddleware'); // افتراض وجود middleware للمصادقة

// جلب جميع الردود السريعة للمستخدم الحالي (أو العامة)
// GET /api/quick-replies
router.get('/', isAuthenticated, quickReplyController.getQuickReplies);

// إنشاء رد سريع جديد
// POST /api/quick-replies
router.post('/', isAuthenticated, quickReplyController.createQuickReply);

// تحديث رد سريع موجود
// PUT /api/quick-replies/:id
router.put('/:id', isAuthenticated, quickReplyController.updateQuickReply);

// حذف رد سريع
// DELETE /api/quick-replies/:id
router.delete('/:id', isAuthenticated, quickReplyController.deleteQuickReply);

module.exports = router; 