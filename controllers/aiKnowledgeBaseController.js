/**
 * متحكم قاعدة المعرفة للذكاء الاصطناعي
 * مسؤول عن إدارة قاعدة المعرفة التي يستخدمها الذكاء الاصطناعي
 */
const AIKnowledgeBase = require('../models/AIKnowledgeBase');
const logger = require('../services/loggerService');

/**
 * عرض صفحة إدارة قاعدة المعرفة
 * @param {Object} req كائن الطلب
 * @param {Object} res كائن الاستجابة
 */
exports.showKnowledgeBasePage = async (req, res) => {
  try {
    // جلب جميع عناصر قاعدة المعرفة
    const knowledgeItems = await AIKnowledgeBase.find().sort({ priority: -1, updatedAt: -1 });
    
    // جلب جميع التصنيفات المتاحة
    const categories = await AIKnowledgeBase.distinct('category');
    
    // عرض الصفحة مع البيانات
    res.render('ai_knowledge_base', {
      title: 'إدارة قاعدة المعرفة للذكاء الاصطناعي',
      knowledgeItems,
      categories
    });
  } catch (error) {
    logger.error('aiKnowledgeBaseController', 'خطأ في عرض صفحة قاعدة المعرفة:', error);
    req.flash('error', 'حدث خطأ أثناء تحميل بيانات قاعدة المعرفة');
    res.redirect('/settings/ai-detailed-settings');
  }
};

/**
 * إضافة أو تحديث عنصر في قاعدة المعرفة
 * @param {Object} req كائن الطلب
 * @param {Object} res كائن الاستجابة
 */
exports.saveKnowledgeItem = async (req, res) => {
  try {
    // استخراج البيانات من النموذج
    const { _id, title, content, keywords, category, priority } = req.body;
    
    // تحويل خانة الكلمات المفتاحية إلى مصفوفة
    const keywordsArray = keywords 
      ? keywords.split('\n').map(k => k.trim()).filter(k => k.length > 0)
      : [];
    
    // تحديد ما إذا كان العنصر نشطاً
    const isActive = req.body.isActive === 'on' || req.body.isActive === true;
    
    // حفظ العنصر (إضافة جديد أو تحديث موجود)
    if (_id) {
      // تحديث عنصر موجود
      await AIKnowledgeBase.findByIdAndUpdate(_id, {
        title,
        content,
        keywords: keywordsArray,
        category: category || 'عام',
        priority: priority || 5,
        isActive,
        updatedAt: Date.now()
      });
      
      req.flash('success', 'تم تحديث المعلومة بنجاح');
      logger.info('aiKnowledgeBaseController', 'تم تحديث عنصر في قاعدة المعرفة', { id: _id });
    } else {
      // إضافة عنصر جديد
      const newItem = new AIKnowledgeBase({
        title,
        content,
        keywords: keywordsArray,
        category: category || 'عام',
        priority: priority || 5,
        isActive,
        createdBy: req.user ? req.user._id : null
      });
      
      await newItem.save();
      
      req.flash('success', 'تمت إضافة المعلومة بنجاح');
      logger.info('aiKnowledgeBaseController', 'تم إضافة عنصر جديد إلى قاعدة المعرفة', { id: newItem._id });
    }
    
    res.redirect('/settings/ai-knowledge-base');
  } catch (error) {
    logger.error('aiKnowledgeBaseController', 'خطأ في حفظ عنصر قاعدة المعرفة:', error);
    req.flash('error', 'حدث خطأ أثناء حفظ المعلومة');
    res.redirect('/settings/ai-knowledge-base');
  }
};

/**
 * الحصول على تفاصيل عنصر في قاعدة المعرفة بواسطة المعرف
 * @param {Object} req كائن الطلب
 * @param {Object} res كائن الاستجابة
 */
exports.getKnowledgeItem = async (req, res) => {
  try {
    const item = await AIKnowledgeBase.findById(req.params.id);
    
    if (!item) {
      return res.status(404).json({ success: false, message: 'لم يتم العثور على المعلومة المطلوبة' });
    }
    
    // تحويل الكلمات المفتاحية إلى نص مفصول بأسطر جديدة
    const keywordsText = item.keywords ? item.keywords.join('\n') : '';
    
    res.json({
      success: true,
      item: {
        ...item.toObject(),
        keywords: keywordsText
      }
    });
  } catch (error) {
    logger.error('aiKnowledgeBaseController', 'خطأ في الحصول على تفاصيل عنصر قاعدة المعرفة:', error);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحميل بيانات المعلومة' });
  }
};

/**
 * تغيير حالة عنصر (تفعيل/تعطيل)
 * @param {Object} req كائن الطلب
 * @param {Object} res كائن الاستجابة
 */
exports.toggleItemStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await AIKnowledgeBase.findById(id);
    
    if (!item) {
      req.flash('error', 'لم يتم العثور على المعلومة المطلوبة');
      return res.redirect('/settings/ai-knowledge-base');
    }
    
    // تبديل الحالة
    item.isActive = !item.isActive;
    item.updatedAt = Date.now();
    await item.save();
    
    req.flash('success', `تم ${item.isActive ? 'تفعيل' : 'تعطيل'} المعلومة بنجاح`);
    logger.info('aiKnowledgeBaseController', `تم ${item.isActive ? 'تفعيل' : 'تعطيل'} عنصر في قاعدة المعرفة`, { id });
    
    res.redirect('/settings/ai-knowledge-base');
  } catch (error) {
    logger.error('aiKnowledgeBaseController', 'خطأ في تغيير حالة عنصر قاعدة المعرفة:', error);
    req.flash('error', 'حدث خطأ أثناء تغيير حالة المعلومة');
    res.redirect('/settings/ai-knowledge-base');
  }
};

/**
 * حذف عنصر من قاعدة المعرفة
 * @param {Object} req كائن الطلب
 * @param {Object} res كائن الاستجابة
 */
exports.deleteKnowledgeItem = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await AIKnowledgeBase.findByIdAndDelete(id);
    
    if (!result) {
      req.flash('error', 'لم يتم العثور على المعلومة المطلوبة');
      return res.redirect('/settings/ai-knowledge-base');
    }
    
    req.flash('success', 'تم حذف المعلومة بنجاح');
    logger.info('aiKnowledgeBaseController', 'تم حذف عنصر من قاعدة المعرفة', { id });
    
    res.redirect('/settings/ai-knowledge-base');
  } catch (error) {
    logger.error('aiKnowledgeBaseController', 'خطأ في حذف عنصر قاعدة المعرفة:', error);
    req.flash('error', 'حدث خطأ أثناء حذف المعلومة');
    res.redirect('/settings/ai-knowledge-base');
  }
};

/**
 * البحث في قاعدة المعرفة
 * @param {Object} req كائن الطلب
 * @param {Object} res كائن الاستجابة
 */
exports.searchKnowledgeBase = async (req, res) => {
  try {
    const { query, category, priority, active } = req.query;
    
    // بناء استعلام البحث
    const searchQuery = {};
    
    // البحث النصي
    if (query && query.trim()) {
      searchQuery.$text = { $search: query };
    }
    
    // تصفية حسب التصنيف
    if (category && category !== 'all') {
      searchQuery.category = category;
    }
    
    // تصفية حسب الأهمية
    if (priority) {
      if (priority === 'high') {
        searchQuery.priority = { $gte: 8 };
      } else if (priority === 'medium') {
        searchQuery.priority = { $gte: 4, $lt: 8 };
      } else if (priority === 'low') {
        searchQuery.priority = { $lt: 4 };
      }
    }
    
    // تصفية حسب الحالة (نشط أو غير نشط)
    if (active === 'true') {
      searchQuery.isActive = true;
    } else if (active === 'false') {
      searchQuery.isActive = false;
    }
    
    // تنفيذ البحث
    const results = await AIKnowledgeBase.find(searchQuery)
      .sort({ priority: -1, updatedAt: -1 });
    
    res.json({
      success: true,
      results,
      count: results.length
    });
  } catch (error) {
    logger.error('aiKnowledgeBaseController', 'خطأ في البحث في قاعدة المعرفة:', error);
    res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ أثناء البحث في قاعدة المعرفة',
      error: error.message
    });
  }
};

/**
 * البحث في قاعدة المعرفة للذكاء الاصطناعي
 * هذه الدالة تُستخدم من قبل chatGPTService للبحث في قاعدة المعرفة
 * @param {String} query نص الاستعلام للبحث
 * @returns {Promise<Array>} مصفوفة بالنتائج المطابقة
 */
exports.searchForAI = async (query) => {
  try {
    if (!query || typeof query !== 'string') {
      return [];
    }
    
    // البحث في العناصر النشطة فقط
    const results = await AIKnowledgeBase.find({
      $text: { $search: query },
      isActive: true
    })
    .sort({ score: { $meta: 'textScore' }, priority: -1 })
    .limit(5)
    .select('title content category priority');
    
    return results;
  } catch (error) {
    logger.error('aiKnowledgeBaseController', 'خطأ في البحث في قاعدة المعرفة للذكاء الاصطناعي:', error);
    return [];
  }
}; 