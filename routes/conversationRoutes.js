/**
 * مسارات المحادثات
 */
const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const { isAuthenticated, checkCanAccessConversations } = require('../middleware/authMiddleware');
const logger = require('../services/loggerService');

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

// مسار إغلاق المحادثة
router.post('/:conversationId/close', ensureCanAccessConversations, conversationController.toggleConversationStatus);

// مسار إعادة فتح المحادثة
router.post('/:conversationId/reopen', ensureCanAccessConversations, conversationController.toggleConversationStatus);

// مسار وضع علامة "مقروء" على محادثة (بدون التحقق من صلاحية الوصول)
router.post('/:conversationId/mark-as-read', ensureCanAccessConversations, async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // تحديث حالة قراءة الرسائل (تنفيذ بسيط)
    // في التطبيق الحقيقي، يمكنك تحديث نموذج الرسائل لتسجيل قراءة المستخدم
    logger.info('conversationRoutes', 'تحديث حالة قراءة المحادثة', { 
      conversationId, 
      userId: req.user?._id 
    });
    
    res.json({ success: true, message: 'تم تحديث حالة القراءة' });
  } catch (error) {
    logger.error('conversationRoutes', 'خطأ في تحديث حالة قراءة المحادثة', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء تحديث حالة قراءة المحادثة' });
  }
});

module.exports = router;
