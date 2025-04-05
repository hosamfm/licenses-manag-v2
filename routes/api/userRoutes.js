/**
 * مسارات API للمستخدمين
 */
const express = require('express');
const router = express.Router();
const User = require('../../models/User');
const { isAuthenticated } = require('../../middleware/authMiddleware');

/**
 * جلب المستخدمين الذين لديهم صلاحية الوصول للمحادثات
 * يستخدم للمنشن في الملاحظات الداخلية
 */
router.get('/can-access-conversations', isAuthenticated, async (req, res) => {
  try {
    // جلب المستخدمين النشطين فقط مع صلاحية الوصول للمحادثات
    const users = await User.find({
      account_status: 'active',
      can_access_conversations: true
    })
    .select('_id username full_name') // نختار فقط الحقول المطلوبة
    .sort('full_name'); // ترتيب حسب الاسم الكامل
    
    res.json({ success: true, users });
  } catch (error) {
    console.error('خطأ في جلب المستخدمين:', error);
    res.status(500).json({ success: false, error: 'خطأ في جلب قائمة المستخدمين' });
  }
});

module.exports = router;
