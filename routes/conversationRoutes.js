/**
 * مسارات المحادثات
 */
const express = require('express');
const router = express.Router();
const conversationController = require('../controllers/conversationController');
const { isAuthenticated, checkCanAccessConversations } = require('../middleware/authMiddleware');
const logger = require('../services/loggerService');
const WhatsappMessage = require('../models/WhatsappMessageModel');
const socketService = require('../services/socketService');

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
    const { messageIds } = req.body; // استلام قائمة الرسائل المرئية حالياً
    
    logger.info('conversationRoutes', 'تحديث حالة قراءة الرسائل', { 
      conversationId, 
      userId: req.user?._id,
      messageCount: messageIds?.length || 0
    });
    
    // إذا لم يتم تقديم معرفات الرسائل، إرجاع خطأ
    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'يجب تقديم قائمة معرفات الرسائل المراد وضع علامة قراءة عليها' 
      });
    }
    
    const results = [];
    
    // تحديث حالة قراءة كل رسالة واردة
    for (const messageId of messageIds) {
      // إضافة المستخدم الحالي كقارئ للرسالة
      const updatedMessage = await WhatsappMessage.addMessageReader(
        messageId, 
        req.user, 
        messageId.length > 20 ? '_id' : 'externalMessageId'
      );
      
      if (updatedMessage) {
        results.push({
          messageId: updatedMessage._id,
          externalMessageId: updatedMessage.externalMessageId,
          readBy: updatedMessage.readBy.map(reader => ({ 
            userId: reader.userId,
            username: reader.username,
            readAt: reader.readAt
          }))
        });
        
        // إرسال إشعار بتحديث حالة الرسالة عبر سوكيت
        if (updatedMessage.externalMessageId) {
          socketService.notifyMessageStatusUpdate(
            conversationId,
            updatedMessage.externalMessageId,
            'read',
            updatedMessage.readBy
          );
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: 'تم تحديث حالة القراءة', 
      updatedMessages: results
    });
  } catch (error) {
    logger.error('conversationRoutes', 'خطأ في تحديث حالة قراءة المحادثة', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء تحديث حالة قراءة المحادثة' });
  }
});

module.exports = router;
