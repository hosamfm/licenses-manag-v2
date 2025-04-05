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
router.get('/', ensureCanAccessConversations, conversationController.listConversations);

// مسار عرض المحادثات المسندة للمستخدم الحالي
router.get('/my', ensureCanAccessConversations, conversationController.listMyConversations);

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

// مسار تعليم رسالة محددة كمقروءة من قبل المستخدم الحالي
router.post('/messages/:messageId/mark-as-read', ensureCanAccessConversations, async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'غير مصرح' });
    }

    // استدعاء دالة تعليم الرسالة كمقروءة
    const WhatsappMessage = require('../models/WhatsappMessageModel');
    const message = await WhatsappMessage.markAsReadByUser(messageId, userId);

    if (!message) {
      return res.status(404).json({ success: false, error: 'الرسالة غير موجودة' });
    }

    // تحقق من وجود معرف المحادثة في الرسالة
    const conversationId = message.conversationId;

    if (conversationId) {
      // إرسال إشعار عبر Socket.io بقراءة الرسالة
      const socketService = require('../services/socketService');
      const User = require('../models/User');
      const user = await User.findById(userId, 'username full_name profile_image');
      
      socketService.notifyMessageReadByUser(conversationId.toString(), messageId, {
        _id: userId,
        username: user.username,
        fullName: user.full_name || user.username,
        profileImage: user.profile_image || '/images/default-avatar.png'
      });
    }

    logger.info('conversationRoutes', 'تم تعليم الرسالة كمقروءة', { messageId, userId });
    return res.json({ success: true, message: 'تم تعليم الرسالة كمقروءة' });
  } catch (error) {
    logger.error('conversationRoutes', 'خطأ في تعليم الرسالة كمقروءة', error);
    return res.status(500).json({ success: false, error: 'حدث خطأ أثناء تعليم الرسالة كمقروءة' });
  }
});

// مسار جلب قائمة المستخدمين الذين قرؤوا رسالة محددة
router.get('/messages/:messageId/read-by', ensureCanAccessConversations, async (req, res) => {
  try {
    const { messageId } = req.params;
    
    // جلب الرسالة مع بيانات المستخدمين
    const WhatsappMessage = require('../models/WhatsappMessageModel');
    const message = await WhatsappMessage.findById(messageId)
      .populate('readBy.user', 'username full_name profile_image');
    
    if (!message) {
      return res.status(404).json({ success: false, error: 'الرسالة غير موجودة' });
    }
    
    // تنسيق البيانات للواجهة
    const readByList = message.readBy?.map(item => ({
      user: {
        _id: item.user._id,
        username: item.user.username,
        fullName: item.user.full_name || item.user.username,
        profileImage: item.user.profile_image || '/images/default-avatar.png'
      },
      timestamp: item.timestamp
    })) || [];
    
    logger.info('conversationRoutes', 'تم جلب قائمة من قرؤوا الرسالة', { 
      messageId, 
      count: readByList.length 
    });
    
    return res.json({ 
      success: true, 
      readBy: readByList,
      total: readByList.length,
      messageId
    });
  } catch (error) {
    logger.error('conversationRoutes', 'خطأ في جلب قائمة من قرؤوا الرسالة', error);
    return res.status(500).json({ success: false, error: 'حدث خطأ أثناء جلب قائمة من قرؤوا الرسالة' });
  }
});

module.exports = router;
