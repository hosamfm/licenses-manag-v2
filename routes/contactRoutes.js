/**
 * مسارات جهات الاتصال
 */
const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');

// عرض قائمة جهات الاتصال
router.get('/', contactController.listContacts);

// عرض نموذج إنشاء جهة اتصال جديدة
router.get('/new', contactController.showCreateForm);

// إنشاء جهة اتصال جديدة
router.post('/', contactController.createContact);

// عرض تفاصيل جهة اتصال
router.get('/:id', contactController.showContact);

// عرض نموذج تعديل جهة اتصال
router.get('/:id/edit', contactController.showEditForm);

// تحديث جهة اتصال
router.post('/:id', contactController.updateContact);

// حذف جهة اتصال
router.post('/:id/delete', contactController.deleteContact);

module.exports = router;
