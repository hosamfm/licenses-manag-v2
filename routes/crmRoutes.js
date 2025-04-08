/**
 * مسارات إدارة العملاء (CRM)
 * يجمع كل مسارات إدارة جهات الاتصال والمحادثات والإحصائيات
 */
const express = require('express');
const router = express.Router();
const { isAuthenticated, checkCanAccessConversations } = require('../middleware/authMiddleware');

// تطبيق وسطيات المصادقة والصلاحية على جميع مسارات CRM
router.use(isAuthenticated, checkCanAccessConversations);

// استيراد المسارات الفرعية
const contactRoutes = require('./contactRoutes');
const conversationRoutes = require('./conversationRoutes');

/**
 * عرض لوحة التحكم الرئيسية
 */
router.get('/', async (req, res) => {
  const Contact = require('../models/Contact');
  const Conversation = require('../models/Conversation');
  
  try {
    // إحصائيات سريعة
    const stats = {
      contacts: await Contact.countDocuments(),
      conversations: {
        total: await Conversation.countDocuments(),
        open: await Conversation.countDocuments({ status: 'open' }),
        assigned: await Conversation.countDocuments({ status: 'assigned' }),
        closed: await Conversation.countDocuments({ status: 'closed' })
      }
    };
    
    // استرجاع أحدث 5 جهات اتصال
    const latestContacts = await Contact.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    
    // استرجاع أحدث 5 محادثات
    const latestConversations = await Conversation.find()
      .sort({ lastMessageAt: -1 })
      .limit(5)
      .populate('assignedTo', 'username full_name')
      .populate('contactId', 'name phoneNumber')
      .lean();
    
    res.render('crm/dashboard', {
      title: 'لوحة تحكم CRM',
      stats,
      latestContacts,
      latestConversations,
      isDashboardPage: true,
      flashMessages: req.flash(),
      layout: 'crm/layout'
    });
  } catch (error) {
    console.error('خطأ في عرض لوحة التحكم الرئيسية:', error);
    req.flash('error', 'حدث خطأ أثناء تحميل لوحة التحكم');
    res.render('crm/dashboard', { 
      title: 'لوحة تحكم CRM',
      stats: { contacts: 0, conversations: { total: 0, open: 0, assigned: 0, closed: 0 } },
      latestContacts: [],
      latestConversations: [],
      isDashboardPage: true,
      flashMessages: req.flash(),
      layout: 'crm/layout'
    });
  }
});

// تعديل conversationController لإضافة دالة بدء محادثة جديدة
router.post('/conversations/start', async (req, res) => {
  try {
    const Conversation = require('../models/Conversation');
    const Contact = require('../models/Contact');
    
    // يمكن أن تبدأ المحادثة من جهة اتصال (contactId) أو من رقم هاتف مباشرة
    const { contactId, phoneNumber } = req.body;
    
    let normalizedPhoneNumber;
    let contactName = null;
    
    // إذا كان هناك contactId، استخدم رقم الهاتف من جهة الاتصال
    if (contactId) {
      const contact = await Contact.findById(contactId);
      if (!contact) {
        req.flash('error', 'جهة الاتصال غير موجودة');
        return res.redirect('/crm/contacts');
      }
      normalizedPhoneNumber = contact.phoneNumber;
      contactName = contact.name;
    } 
    // وإلا استخدم رقم الهاتف المباشر
    else if (phoneNumber) {
      // تطبيع الرقم (إضافة + إذا لم يكن موجوداً)
      normalizedPhoneNumber = !phoneNumber.startsWith('+') ? '+' + phoneNumber : phoneNumber;
      
      // البحث عن جهة اتصال بهذا الرقم
      const contact = await Contact.findOne({ phoneNumber: normalizedPhoneNumber });
      if (contact) {
        contactName = contact.name;
      }
    } else {
      req.flash('error', 'يجب تحديد جهة اتصال أو رقم هاتف');
      return res.redirect('/crm/contacts');
    }
    
    // البحث عن محادثة سابقة بنفس رقم الهاتف
    let conversation = await Conversation.findOne({ phoneNumber: normalizedPhoneNumber });
    
    // إذا لم توجد محادثة سابقة، قم بإنشاء واحدة جديدة
    if (!conversation) {
      conversation = await Conversation.create({
        phoneNumber: normalizedPhoneNumber,
        customerName: contactName,
        status: 'open',
        lastMessageAt: new Date()
      });
    }
    
    // توجيه المستخدم إلى صفحة المحادثة
    res.redirect(`/crm/conversations/${conversation._id}`);
  } catch (error) {
    console.error('خطأ في بدء محادثة:', error);
    req.flash('error', 'حدث خطأ أثناء بدء المحادثة');
    return res.redirect('/crm/contacts');
  }
});

// إضافة مسار إلى صفحة الإحصائيات
router.get('/stats', async (req, res) => {
  const Contact = require('../models/Contact');
  const Conversation = require('../models/Conversation');
  const User = require('../models/User');
  
  try {
    // جمع الإحصائيات الأساسية
    const stats = {
      contacts: await Contact.countDocuments(),
      conversations: {
        total: await Conversation.countDocuments(),
        open: await Conversation.countDocuments({ status: 'open' }),
        assigned: await Conversation.countDocuments({ status: 'assigned' }),
        closed: await Conversation.countDocuments({ status: 'closed' })
      }
    };
    
    // استخراج أفضل الموظفين (بيانات وهمية للعرض)
    // ملاحظة: في التطبيق الفعلي، هذه البيانات ستأتي من قواعد البيانات
    const users = await User.find({ role: { $in: ['admin', 'support'] } })
      .limit(5)
      .select('username full_name')
      .lean();
      
    const topAgents = users.map((user, index) => {
      return {
        name: user.full_name || user.username,
        assignedCount: Math.floor(Math.random() * 30) + 10,
        closedCount: Math.floor(Math.random() * 20) + 5,
        avgResponseTime: Math.floor(Math.random() * 10) + 2,
        satisfactionRate: Math.floor(Math.random() * 30) + 70
      };
    });
    
    // ترتيب حسب عدد المحادثات المغلقة
    topAgents.sort((a, b) => b.closedCount - a.closedCount);
    
    res.render('crm/stats', {
      title: 'إحصائيات CRM',
      stats,
      topAgents,
      flashMessages: req.flash()
    });
  } catch (error) {
    console.error('خطأ في عرض صفحة الإحصائيات:', error);
    req.flash('error', 'حدث خطأ أثناء تحميل صفحة الإحصائيات');
    res.render('crm/stats', { 
      title: 'إحصائيات CRM',
      stats: { contacts: 0, conversations: { total: 0, open: 0, assigned: 0, closed: 0 } },
      topAgents: [],
      flashMessages: req.flash()
    });
  }
});

// إضافة مسارات جهات الاتصال تحت /crm/contacts
router.use('/contacts', contactRoutes);

// إضافة مسارات المحادثات تحت /crm/conversations
router.use('/conversations', conversationRoutes);

module.exports = router;
