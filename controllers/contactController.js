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
    let { name, phoneNumber, email, company, notes } = req.body;
    
    // تطبيع رقم الهاتف (إضافة + إذا لم يكن موجودًا)
    if (phoneNumber && !phoneNumber.startsWith('+')) {
      phoneNumber = '+' + phoneNumber;
    }
    
    // استرجاع جهة الاتصال
    const contact = await Contact.findById(contactId);
    
    if (!contact) {
      req.flash('error', 'جهة الاتصال غير موجودة');
      return res.redirect('/crm/contacts');
    }
    
    // التحقق من أن رقم الهاتف الجديد غير مستخدم من قبل جهة اتصال أخرى
    if (phoneNumber !== contact.phoneNumber) {
      const existingContact = await Contact.findOne({ phoneNumber });
      if (existingContact) {
        req.flash('error', 'توجد جهة اتصال أخرى بهذا الرقم');
        return res.redirect(`/crm/contacts/${contactId}/edit`);
      }
    }
    
    // تحديث معلومات جهة الاتصال
    contact.name = name;
    contact.phoneNumber = phoneNumber;
    contact.email = email || null;
    contact.company = company || null;
    contact.notes = notes || null;
    contact.updatedAt = new Date();
    
    // حفظ التغييرات
    await contact.save();
    
    req.flash('success', 'تم تحديث جهة الاتصال بنجاح');
    res.redirect(`/crm/contacts/${contactId}`);
  } catch (error) {
    logger.error('contactController', 'خطأ في تحديث جهة اتصال', { error: error.message });
    req.flash('error', 'حدث خطأ أثناء تحديث جهة الاتصال');
    res.redirect(`/crm/contacts/${req.params.id}/edit`);
  }
};

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

/**
 * تحديث أو إنشاء جهات اتصال من المحادثات الموجودة
 * هذه الوظيفة يمكن استخدامها في لوحة التحكم لترحيل البيانات
 */
exports.syncContactsFromConversations = async (req, res) => {
  try {
    // عدد جهات الاتصال التي تم تحديثها وإنشاؤها
    let updatedCount = 0;
    let createdCount = 0;
    
    // الحصول على جميع المحادثات التي ليس لها جهة اتصال مرتبطة
    const conversations = await Conversation.find({
      $or: [
        { contactId: null },
        { contactId: { $exists: false } }
      ]
    }).limit(1000); // تحديد العدد لتجنب استخدام الذاكرة بشكل مفرط
    
    for (const conversation of conversations) {
      // البحث عن جهة اتصال موجودة بواسطة رقم الهاتف
      let contact = await Contact.findByPhoneNumber(conversation.phoneNumber);
      
      // تحضير معلومات جهة الاتصال من بيانات المحادثة
      let name = conversation.customerName || 'غير معروف';
      let email = null;
      
      // استخراج البريد الإلكتروني من بيانات العميل إذا كانت موجودة
      if (conversation.customerData && conversation.customerData.emails && conversation.customerData.emails.length > 0) {
        email = conversation.customerData.emails[0].email;
      }
      
      if (contact) {
        // تحديث جهة الاتصال الموجودة إذا كانت البيانات أفضل
        let isUpdated = false;
        
        // تحديث الاسم إذا كان فارغاً أو مجهولاً
        if ((!contact.name || contact.name === 'غير معروف') && name !== 'غير معروف') {
          contact.name = name;
          isUpdated = true;
        }
        
        // تحديث البريد الإلكتروني إذا كان فارغاً
        if (!contact.email && email) {
          contact.email = email;
          isUpdated = true;
        }
        
        // حفظ التغييرات إذا كان هناك تحديث
        if (isUpdated) {
          contact.updatedAt = new Date();
          await contact.save();
          updatedCount++;
        }
        
      } else {
        // إنشاء جهة اتصال جديدة
        contact = await Contact.create({
          name: name,
          phoneNumber: conversation.phoneNumber,
          email: email,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        createdCount++;
      }
      
      // ربط المحادثة بجهة الاتصال
      conversation.contactId = contact._id;
      await conversation.save();
    }
    
    req.flash('success', `تم مزامنة جهات الاتصال: تم إنشاء ${createdCount} وتحديث ${updatedCount} وربطها بالمحادثات`);
    res.redirect('/crm/contacts');
  } catch (error) {
    logger.error('contactController', 'خطأ في مزامنة جهات الاتصال', { error: error.message });
    req.flash('error', 'حدث خطأ أثناء مزامنة جهات الاتصال');
    res.redirect('/crm/contacts');
  }
};
