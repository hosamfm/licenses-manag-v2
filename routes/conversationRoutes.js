/**
 * مسارات المحادثات
 */
const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const { isAuthenticated, checkCanAccessConversations } = require('../middleware/authMiddleware');

// وسيط للتحقق من صلاحية الوصول للمحادثات
const ensureCanAccessConversations = [isAuthenticated, checkCanAccessConversations];

// مسار عرض جميع المحادثات
router.get('/', ensureCanAccessConversations, conversationController.listConversations);

// مسار عرض المحادثات المسندة للمستخدم الحالي
router.get('/my', ensureCanAccessConversations, conversationController.listMyConversations);

// مسار عرض تفاصيل محادثة محددة
router.get('/:conversationId', ensureCanAccessConversations, conversationController.showConversation);

// مسار إسناد محادثة إلى موظف
router.post('/:conversationId/assign', ensureCanAccessConversations, conversationController.assignConversation);

// مسار إضافة ملاحظة داخلية للمحادثة
router.post('/:conversationId/note', ensureCanAccessConversations, conversationController.addInternalNote);

// مسار تغيير حالة المحادثة (إغلاق / فتح)
router.post('/:conversationId/status', ensureCanAccessConversations, conversationController.toggleConversationStatus);

// مسار إرسال رد في المحادثة
router.post('/:conversationId/reply', ensureCanAccessConversations, conversationController.replyToConversation);

module.exports = router;
