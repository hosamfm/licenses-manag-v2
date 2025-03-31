/**
 * مسارات واجهة برمجة التطبيقات API
 */
const express = require('express');
const router = express.Router();
const { isAuthenticated, checkCanAccessConversations } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const logger = require('../services/loggerService');

// التحقق من الصلاحيات
const ensureCanAccessAPI = [isAuthenticated, checkCanAccessConversations];

/**
 * الحصول على قائمة المستخدمين المتاحين للإسناد
 * يستخدم في واجهة إسناد المحادثات
 */
router.get('/users/support', ensureCanAccessAPI, async (req, res) => {
  try {
    // جلب المستخدمين الذين لديهم صلاحية الوصول إلى المحادثات
    const users = await User.find({
      can_access_conversations: true
    })
    .select('_id username full_name user_role')
    .sort('full_name')
    .lean();
    
    res.json({ success: true, users });
  } catch (error) {
    logger.error('apiRoutes', 'خطأ في جلب قائمة المستخدمين', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء جلب قائمة المستخدمين' });
  }
});

/**
 * الحصول على معلومات مستخدم محدد
 */
router.get('/users/:userId/info', ensureCanAccessAPI, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // التحقق من وجود المستخدم
    const user = await User.findById(userId)
      .select('_id username full_name role')
      .lean();
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    
    res.json({ success: true, user });
  } catch (error) {
    logger.error('apiRoutes', 'خطأ في جلب معلومات المستخدم', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء جلب معلومات المستخدم' });
  }
});

/**
 * وضع علامة "مقروء" على محادثة
 */
router.post('/conversations/:conversationId/mark-as-read', ensureCanAccessAPI, async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    // التحقق من وجود المستخدم
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, error: 'غير مصرح، يرجى تسجيل الدخول' });
    }
    
    const userId = req.user._id;
    
    // التحقق من وجود المحادثة
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'المحادثة غير موجودة' });
    }
    
    // تحديث حالة قراءة الرسائل (تنفيذ وهمي حاليًا)
    // في التطبيق الحقيقي، يمكنك تحديث نموذج الرسائل لتسجيل قراءة المستخدم
    // على سبيل المثال، يمكن إضافة حقل readBy: [userId] في نموذج الرسالة
    
    // تمثيل عدد الرسائل التي تم تحديدها كمقروءة
    const unreadCount = 5;
    
    res.json({ success: true, unreadCount });
  } catch (error) {
    logger.error('apiRoutes', 'خطأ في تحديث حالة قراءة المحادثة', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء تحديث حالة قراءة المحادثة' });
  }
});

/**
 * الحصول على إحصائيات المستخدم (للاستخدام في صفحة الإحصائيات)
 */
router.get('/users/:userId/stats', ensureCanAccessAPI, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // التحقق من وجود المستخدم
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    
    // سيتم استبدال هذا بإحصائيات حقيقية من قاعدة البيانات لاحقًا
    const stats = {
      assignedCount: 0,
      closedCount: 0,
      averageResponseTime: 0,
      totalMessages: 0
    };
    
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('apiRoutes', 'خطأ في جلب إحصائيات المستخدم', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء جلب إحصائيات المستخدم' });
  }
});

module.exports = router;
