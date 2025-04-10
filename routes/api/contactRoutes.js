const express = require('express');
const router = express.Router();
const Contact = require('../../models/Contact');
const { isAuthenticated } = require('../../middleware/authMiddleware');

/**
 * الحصول على معلومات جهة اتصال محددة
 * GET /api/contacts/:id
 */
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const contactId = req.params.id;
    
    // جلب جهة الاتصال من قاعدة البيانات
    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'جهة الاتصال غير موجودة'
      });
    }
    
    // إرجاع معلومات جهة الاتصال
    return res.json({
      success: true,
      contact: {
        _id: contact._id,
        name: contact.name,
        phoneNumber: contact.phoneNumber,
        email: contact.email || '',
        company: contact.company || '',
        notes: contact.notes || '',
        createdAt: contact.createdAt
      }
    });
  } catch (error) {
    console.error('خطأ في جلب معلومات جهة الاتصال:', error);
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب معلومات جهة الاتصال'
    });
  }
});

module.exports = router; 