const express = require('express');
const router = express.Router();
const balanceController = require('../controllers/balanceController');
const authMiddleware = require('../middleware/authMiddleware');

// مسار لصفحة إدارة الرصيد (للمدير فقط)
router.get('/balance/manage', authMiddleware.isAuthenticated, authMiddleware.checkRole(['admin']), (req, res) => {
    res.render('manage_balance', {
        title: 'إدارة الرصيد',
        activeLink: 'balance',
        session: req.session
    });
});

// مسار لإضافة رصيد لعميل معين (يتطلب تسجيل الدخول)
router.post('/balance/add', authMiddleware.isAuthenticated, balanceController.addBalance);

// مسار لعرض عمليات عميل معين (يتطلب تسجيل الدخول)
router.get('/balance/client/:clientId', authMiddleware.isAuthenticated, balanceController.getClientTransactions);

// مسار لعرض جميع عمليات الرصيد (للمدير فقط)
router.get('/balance/all', authMiddleware.isAuthenticated, authMiddleware.checkRole(['admin']), balanceController.getAllTransactions);

// مسار للحصول على العملاء لصفحة إدارة الرصيد
router.get('/api/balance/clients', authMiddleware.isAuthenticated, balanceController.getClientsForBalance);

module.exports = router;
