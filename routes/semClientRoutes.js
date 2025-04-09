const express = require('express');
const router = express.Router();
const semClientController = require('../controllers/semClientController');
const { isAuthenticated, checkRole } = require('../middleware/authMiddleware');
const User = require('../models/User');

// صفحة إدارة عملاء SEM (واجهة المستخدم)
router.get('/sem-clients/manage', isAuthenticated, async (req, res) => {
    try {
        // الحصول على إعدادات واتساب ميتا النشطة لعرضها في قائمة الاختيار
        const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
        const metaWhatsappSettings = await MetaWhatsappSettings.find({ isActive: true }).sort({ name: 1 });
        
        res.render('manage_sem_clients', {
            title: 'إدارة عملاء خدمة الرسائل',
            activeLink: 'sem-clients',
            metaWhatsappSettings
        });
    } catch (error) {
        console.error('Error loading meta whatsapp settings:', error.message);
        res.render('manage_sem_clients', {
            title: 'إدارة عملاء خدمة الرسائل',
            activeLink: 'sem-clients',
            metaWhatsappSettings: []
        });
    }
});

// صفحة إنشاء عميل جديد
router.get('/sem-clients/create', isAuthenticated, async (req, res) => {
    try {
        // الحصول على إعدادات واتساب ميتا النشطة لعرضها في قائمة الاختيار
        const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
        const metaWhatsappSettings = await MetaWhatsappSettings.find({ isActive: true }).sort({ name: 1 });
        
        res.render('create_sem_client', {
            title: 'إنشاء عميل جديد',
            activeLink: 'sem-clients',
            metaWhatsappSettings
        });
    } catch (error) {
        console.error('Error loading meta whatsapp settings:', error.message);
        res.render('create_sem_client', {
            title: 'إنشاء عميل جديد',
            activeLink: 'sem-clients',
            metaWhatsappSettings: []
        });
    }
});

// API للحصول على قائمة العملاء
router.get('/api/sem-clients', isAuthenticated, semClientController.getSemClients);

// API للحصول على قائمة المستخدمين (للفلتر)
router.get('/api/users', isAuthenticated, async (req, res) => {
    try {
        // تحديد الأدوار المسموح لها بإنشاء عملاء
        const validRoles = ['user', 'supervisor', 'admin'];
        
        // الحصول على قائمة المستخدمين مع الفلترة حسب الدور
        const users = await User.find({ user_role: { $in: validRoles } })
            .select('_id username name user_role')
            .sort({ name: 1, username: 1 });
        
        return res.status(200).json(users);
    } catch (error) {
        console.error('Error fetching users:', error.message);
        return res.status(500).json({ message: 'حدث خطأ أثناء تحميل قائمة المستخدمين' });
    }
});

// API لإنشاء عميل جديد
router.post('/api/sem-clients', isAuthenticated, semClientController.createSemClient);

// API للحصول على إحصائيات العملاء
router.get('/api/sem-clients-stats', isAuthenticated, semClientController.getClientStats);

// API للحصول على تفاصيل عميل
router.get('/api/sem-clients/:clientId', isAuthenticated, semClientController.getSemClientDetails);

// API لتحديث عميل
router.put('/api/sem-clients/:clientId', isAuthenticated, semClientController.updateSemClient);

// API لإعادة توليد مفاتيح API
router.post('/api/sem-clients/:clientId/regenerate-keys', isAuthenticated, semClientController.regenerateApiKeys);

// API لحذف عميل
router.delete('/api/sem-clients/:clientId', isAuthenticated, semClientController.deleteSemClient);

module.exports = router;
