/**
 * متحكم جهات الاتصال
 * يوفر وظائف إدارة جهات الاتصال (عرض، إنشاء، تحديث، حذف)
 */
const Contact = require('../models/Contact');
const Conversation = require('../models/Conversation');
const logger = require('../services/loggerService');

/**
 * عرض قائمة جهات الاتصال
 */
exports.listContacts = async (req, res) => {
  try {
    // استرجاع معلمات الصفحة والحد
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // البحث عن كلمة معينة
    let filter = {};
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter = {
        $or: [
          { name: searchRegex },
          { phoneNumber: searchRegex },
          { email: searchRegex },
          { company: searchRegex }
        ]
      };
    }
    
    // استرجاع عدد جهات الاتصال الكلي
    const totalContacts = await Contact.countDocuments(filter);
    
    // استرجاع جهات الاتصال مع ترقيم الصفحات
    const contacts = await Contact.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    // إعداد معلومات الترقيم
    const totalPages = Math.ceil(totalContacts / limit);
    const pagination = {
      current: page,
      prev: page > 1 ? page - 1 : null,
      next: page < totalPages ? page + 1 : null,
      total: totalPages,
      limit
    };
    
    // عرض صفحة جهات الاتصال
    res.render('crm/contacts', {
      title: 'جهات الاتصال',
      contacts,
      pagination,
      query: req.query.search || '',
      totalContacts,
      flashMessages: req.flash(),
      isContactsPage: true,
      layout: 'crm/layout'
    });
  } catch (error) {
    logger.error('contactController', 'خطأ في عرض جهات الاتصال', { error: error.message });
    req.flash('error', 'حدث خطأ أثناء تحميل جهات الاتصال');
    res.redirect('/crm');
  }
};

/**
 * عرض نموذج إنشاء جهة اتصال جديدة
 */
exports.showCreateForm = async (req, res) => {
  try {
    // استرجاع phoneNumber من الاستعلام إذا كان موجودًا (لإنشاء جهة اتصال من رقم معين)
    const phoneNumber = req.query.phoneNumber || '';
    
    res.render('crm/contact_new', {
      title: 'إضافة جهة اتصال جديدة',
      phoneNumber,
      flashMessages: req.flash(),
      isContactsPage: true,
      layout: 'crm/layout'
    });
  } catch (error) {
    logger.error('contactController', 'خطأ في عرض نموذج إنشاء جهة اتصال', { error: error.message });
    req.flash('error', 'حدث خطأ أثناء تحميل النموذج');
    res.redirect('/crm/contacts');
  }
};

/**
 * إنشاء جهة اتصال جديدة
 */
exports.createContact = async (req, res) => {
  try {
    let { name, phoneNumber, email, company, notes } = req.body;
    
    // تطبيع رقم الهاتف (إضافة + إذا لم يكن موجودًا)
    if (phoneNumber && !phoneNumber.startsWith('+')) {
      phoneNumber = '+' + phoneNumber;
    }
    
    // التحقق من وجود جهة اتصال بنفس الرقم
    const existingContact = await Contact.findOne({ phoneNumber });
    if (existingContact) {
      req.flash('error', 'توجد جهة اتصال بهذا الرقم بالفعل');
      return res.redirect('/crm/contacts/new');
    }
    
    // إنشاء جهة اتصال جديدة
    const newContact = new Contact({
      name,
      phoneNumber,
      email: email || null,
      company: company || null,
      notes: notes || null,
      createdBy: req.session.userId
    });
    
    // حفظ جهة الاتصال الجديدة
    await newContact.save();
    
    // التوجيه حسب الاستعلام (redirect)
    const redirectTo = req.query.redirect || '/crm/contacts';
    
    // إذا كان هناك طلب لبدء محادثة بعد الإنشاء
    if (req.query.startConversation === 'true') {
      return res.redirect(`/crm/conversations/start?contactId=${newContact._id}`);
    }
    
    // التوجيه العادي
    req.flash('success', 'تم إنشاء جهة الاتصال بنجاح');
    res.redirect(redirectTo);
  } catch (error) {
    logger.error('contactController', 'خطأ في إنشاء جهة اتصال', { error: error.message });
    req.flash('error', 'حدث خطأ أثناء إنشاء جهة الاتصال');
    res.redirect('/crm/contacts/new');
  }
};

/**
 * عرض تفاصيل جهة اتصال
 */
exports.showContact = async (req, res) => {
  try {
    const contactId = req.params.id;
    
    // استرجاع جهة الاتصال مع معلومات المنشئ
    const contact = await Contact.findById(contactId)
      .populate('createdBy', 'username full_name')
      .lean();
    
    if (!contact) {
      req.flash('error', 'جهة الاتصال غير موجودة');
      return res.redirect('/crm/contacts');
    }
    
    // استرجاع المحادثات المرتبطة بجهة الاتصال
    const conversations = await Conversation.find({ phoneNumber: contact.phoneNumber })
      .sort({ lastMessageAt: -1 })
      .limit(5)
      .populate('assignedTo', 'username full_name')
      .lean();
    
    res.render('crm/contact_show', {
      title: `جهة الاتصال: ${contact.name}`,
      contact,
      conversations,
      flashMessages: req.flash(),
      isContactsPage: true,
      layout: 'crm/layout'
    });
  } catch (error) {
    logger.error('contactController', 'خطأ في عرض تفاصيل جهة اتصال', { error: error.message });
    req.flash('error', 'حدث خطأ أثناء تحميل تفاصيل جهة الاتصال');
    res.redirect('/crm/contacts');
  }
};

/**
 * عرض نموذج تعديل جهة اتصال
 */
exports.showEditForm = async (req, res) => {
  try {
    const contactId = req.params.id;
    
    // استرجاع جهة الاتصال
    const contact = await Contact.findById(contactId).lean();
    
    if (!contact) {
      req.flash('error', 'جهة الاتصال غير موجودة');
      return res.redirect('/crm/contacts');
    }
    
    res.render('crm/contact_edit', {
      title: `تعديل جهة الاتصال: ${contact.name}`,
      contact,
      flashMessages: req.flash(),
      isContactsPage: true,
      layout: 'crm/layout'
    });
  } catch (error) {
    logger.error('contactController', 'خطأ في عرض نموذج تعديل جهة اتصال', { error: error.message });
    req.flash('error', 'حدث خطأ أثناء تحميل نموذج التعديل');
    res.redirect('/crm/contacts');
  }
};

/**
 * تحديث جهة اتصال
 */
exports.updateContact = async (req, res) => {
  try {
    const contactId = req.params.id;
    const { name, phoneNumber, email, company, notes } = req.body;
    
    // تطبيع رقم الهاتف
    let normalizedPhone = phoneNumber;
    if (normalizedPhone && !normalizedPhone.startsWith('+')) {
      normalizedPhone = '+' + normalizedPhone;
    }
    
    const contact = await Contact.findById(contactId);
    if (!contact) {
      req.flash('error', 'جهة الاتصال غير موجودة');
      return res.redirect('/crm/contacts');
    }
    
    // تحديث بيانات جهة الاتصال
    contact.name = name;
    contact.phoneNumber = normalizedPhone;
    contact.email = email || null;
    contact.company = company || null;
    contact.notes = notes || null;
    contact.updatedAt = new Date();
    
    await contact.save();
    
    // تحديث المحادثات المرتبطة بجهة الاتصال
    await updateRelatedConversations(contact);
    
    req.flash('success', 'تم تحديث جهة الاتصال بنجاح');
    res.redirect(`/crm/contacts/${contactId}`);
  } catch (error) {
    logger.error('contactController', 'خطأ في تحديث جهة الاتصال', { error: error.message });
    req.flash('error', 'حدث خطأ أثناء تحديث جهة الاتصال');
    res.redirect(`/crm/contacts/${req.params.id}/edit`);
  }
};

/**
 * تحديث المحادثات المرتبطة بجهة الاتصال
 * @param {Object} contact - جهة الاتصال
 */
async function updateRelatedConversations(contact) {
  try {
    // استيراد خدمة سوكت
    const socketService = require('../services/socketService');
    
    // البحث عن المحادثات المرتبطة بجهة الاتصال
    const conversations = await Conversation.find({ 
      contactId: contact._id 
    });
    
    // إرسال تحديثات للمحادثات
    for (const conversation of conversations) {
      // إرسال تحديث عبر سوكت للإعلام بتغيير معلومات جهة الاتصال
      socketService.notifyConversationUpdate(conversation._id.toString(), {
        _id: conversation._id,
        contactId: {
          _id: contact._id,
          name: contact.name,
          phoneNumber: contact.phoneNumber
        }
      });
    }
    
    logger.info('contactController', 'تم تحديث المحادثات المرتبطة بجهة الاتصال', { 
      contactId: contact._id, 
      conversationsCount: conversations.length 
    });
  } catch (error) {
    logger.error('contactController', 'خطأ في تحديث المحادثات المرتبطة', { 
      contactId: contact._id, 
      error: error.message 
    });
  }
}

/**
 * حذف جهة اتصال
 */
exports.deleteContact = async (req, res) => {
  try {
    const contactId = req.params.id;
    
    // استرجاع جهة الاتصال
    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      req.flash('error', 'جهة الاتصال غير موجودة');
      return res.redirect('/crm/contacts');
    }
    
    // حذف جهة الاتصال
    await Contact.deleteOne({ _id: contactId });
    
    req.flash('success', 'تم حذف جهة الاتصال بنجاح');
    res.redirect('/crm/contacts');
  } catch (error) {
    logger.error('contactController', 'خطأ في حذف جهة اتصال', { error: error.message });
    req.flash('error', 'حدث خطأ أثناء حذف جهة الاتصال');
    res.redirect('/crm/contacts');
  }
};
