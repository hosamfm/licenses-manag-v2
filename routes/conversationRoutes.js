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

// تطبيق middleware المصادقة على جميع المسارات في هذا الملف
router.use(isAuthenticated);

// مسار عرض جميع المحادثات
router.get('/', ensureCanAccessConversations, (req, res) => {
  // تحويل المستخدم للواجهة الجديدة
  res.redirect(`/crm/conversations/ajax`);
});

// مسار عرض المحادثات المسندة للمستخدم الحالي
router.get('/my', ensureCanAccessConversations, (req, res) => {
  // تحويل المستخدم للواجهة الجديدة مع إضافة معلمة myConversations
  res.redirect(`/crm/conversations/ajax?myConversations=true`);
});

/* -------------------------------------------
 *          مسارات AJAX الجديدة
 * ------------------------------------------- */

// 1) صفحة عرض المحادثات بأسلوب AJAX (صفحة عمودين)
router.get('/ajax', ensureCanAccessConversations, conversationController.listConversationsAjax);

// 2) جلب قائمة المحادثات للتحديث عبر AJAX
router.get('/ajax/list', ensureCanAccessConversations, conversationController.listConversationsAjaxList);

// 3) جلب تفاصيل محادثة (Partial) عبر AJAX
router.get('/ajax/details/:conversationId',
  ensureCanAccessConversations,
  conversationController.getConversationDetailsAjax
);

// مسار عرض تفاصيل محادثة محددة - يقوم بتحويل المستخدم للواجهة الجديدة
router.get('/:conversationId', ensureCanAccessConversations, (req, res) => {
  // تحويل المستخدم للواجهة الجديدة مع الحفاظ على معرف المحادثة
  res.redirect(`/crm/conversations/ajax?selected=${req.params.conversationId}`);
});

// مسار إسناد محادثة إلى موظف
router.post('/:conversationId/assign', ensureCanAccessConversations, conversationController.assignConversation);

// مسار إضافة ملاحظة داخلية للمحادثة
router.post('/:conversationId/note', ensureCanAccessConversations, conversationController.addInternalNote);

// مسار إرسال رد في المحادثة
router.post('/:conversationId/reply', ensureCanAccessConversations, conversationController.replyToConversation);

// مسار التفاعل بالإيموجي على الرسائل
router.post('/:conversationId/reaction', ensureCanAccessConversations, conversationController.reactToMessage);

// مسارات تغيير حالة المحادثة - استخدام الدوال الجديدة
router.post('/:conversationId/close', ensureCanAccessConversations, conversationController.closeConversation);
router.post('/:conversationId/reopen', ensureCanAccessConversations, conversationController.reopenConversation);

// مسار وضع علامة "مقروء" على محادثة
router.post('/:conversationId/mark-as-read', ensureCanAccessConversations, async (req, res) => {
  try {
    const { conversationId } = req.params;
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

// === إضافة مسارات التعيين الجديدة ===

// مسار الحصول على قائمة المستخدمين المخولين للتعامل مع المحادثات
router.get('/api/handlers', ensureCanAccessConversations, conversationController.getConversationHandlers);

// مسار تعيين المحادثة (API)
router.post('/:conversationId/api/assign', ensureCanAccessConversations, conversationController.assignConversationAPI);

// مسار تعيين المحادثة للمستخدم الحالي
router.post('/:conversationId/api/assign-to-me', ensureCanAccessConversations, conversationController.assignToMe);

module.exports = router;
