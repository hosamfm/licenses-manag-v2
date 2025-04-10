/**
 * مسارات واجهة برمجة التطبيقات API
 */
const express = require('express');
const router = express.Router();
const { isAuthenticated, checkCanAccessConversations } = require('../middleware/authMiddleware');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const logger = require('../services/loggerService');
const balanceRoutes = require('./balanceRoutes');
const quickReplyRoutes = require('./quickReplyRoutes');

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
    const { timeRange } = req.query;
    
    // التحقق من وجود المستخدم
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'المستخدم غير موجود' });
    }
    
    // تحديد فترة البحث بناءً على المدى الزمني المحدد
    let startDate = new Date();
    switch(timeRange) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        // بداية الأسبوع الحالي (الأحد)
        const dayOfWeek = startDate.getDay();
        startDate.setDate(startDate.getDate() - dayOfWeek);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        // بداية الشهر الحالي
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'year':
        // بداية السنة الحالية
        startDate = new Date(startDate.getFullYear(), 0, 1);
        break;
      default:
        // الافتراضي: آخر 7 أيام
        startDate.setDate(startDate.getDate() - 7);
        break;
    }
    
    // البحث عن المحادثات المسندة لهذا المستخدم خلال الفترة المحددة
    const conversations = await Conversation.find({
      assignedTo: userId,
      updatedAt: { $gte: startDate }
    });
    
    // البحث عن المحادثات المغلقة بواسطة هذا المستخدم خلال الفترة المحددة
    const closedConversations = await Conversation.find({
      assignedTo: userId,
      status: 'closed',
      closedAt: { $gte: startDate }
    });
    
    // حساب متوسط وقت الاستجابة
    let totalResponseTime = 0;
    let messageCount = 0;
    
    for (const conversation of conversations) {
      // يمكننا هنا حساب وقت الاستجابة بناءً على وقت الرسائل
      // هذا مجرد مثال بسيط، قد تحتاج لتعديله حسب هيكل البيانات الخاص بك
      if (conversation.messages && conversation.messages.length > 1) {
        for (let i = 1; i < conversation.messages.length; i++) {
          const prevMessage = conversation.messages[i-1];
          const currMessage = conversation.messages[i];
          
          // إذا كانت الرسالة السابقة من العميل والرسالة الحالية من الموظف
          if (prevMessage.sender === 'client' && currMessage.sender === 'staff') {
            const responseTime = (new Date(currMessage.timestamp) - new Date(prevMessage.timestamp)) / 60000; // بالدقائق
            totalResponseTime += responseTime;
            messageCount++;
          }
        }
      }
    }
    
    const averageResponseTime = messageCount > 0 ? Math.round(totalResponseTime / messageCount) : 0;
    
    // إنشاء نسبة رضا وهمية لأغراض العرض (يمكن استبدالها بحسابات حقيقية لاحقًا)
    // للحصول على قيمة متسقة نستخدم معرف المستخدم كبذرة لمولد الأرقام العشوائية
    const userIdSum = userId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const satisfactionSeed = userIdSum % 100; // قيمة بين 0 و 99
    const satisfactionRate = 75 + (satisfactionSeed % 25); // قيمة بين 75 و 99
    
    // إعداد بيانات الإحصائيات
    const stats = {
      assignedCount: conversations.length,
      closedCount: closedConversations.length,
      averageResponseTime,
      satisfactionRate,
      totalMessages: conversations.reduce((sum, convo) => sum + (convo.messages ? convo.messages.length : 0), 0)
    };
    
    res.json({ success: true, stats });
  } catch (error) {
    logger.error('apiRoutes', 'خطأ في جلب إحصائيات المستخدم', error);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء جلب إحصائيات المستخدم' });
  }
});

// مسارات الرصيد
router.use('/balance', balanceRoutes);

// إضافة استخدام مسارات الردود السريعة
router.use('/quick-replies', quickReplyRoutes);

// مسارات واجهة برمجة التطبيقات لجهات الاتصال
const contactApiRoutes = require('./api/contactRoutes');
router.use('/contacts', contactApiRoutes);

module.exports = router;
