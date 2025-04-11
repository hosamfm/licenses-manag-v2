/**
 * خدمة قاعدة المعرفة للذكاء الاصطناعي
 * مسؤولة عن تكامل قاعدة المعرفة مع خدمة الذكاء الاصطناعي
 */
const AIKnowledgeBase = require('../models/AIKnowledgeBase');
const logger = require('./loggerService');
const axios = require('axios');

/**
 * البحث في قاعدة المعرفة عن معلومات ذات صلة بالسؤال
 * @param {String} query نص الاستعلام (سؤال المستخدم)
 * @returns {Promise<Array>} مصفوفة بالمعلومات ذات الصلة
 */
exports.searchKnowledgeBase = async (query) => {
  try {
    if (!query || typeof query !== 'string') {
      return [];
    }
    
    // تنظيف الاستعلام وإعداده للبحث
    const cleanQuery = query.trim();
    
    // البحث في العناصر النشطة فقط
    const results = await AIKnowledgeBase.find({
      $text: { $search: cleanQuery },
      isActive: true
    })
    .sort({ score: { $meta: 'textScore' }, priority: -1 })
    .limit(5)
    .select('title content category priority');
    
    logger.debug('aiKnowledgeService', 'نتائج البحث في قاعدة المعرفة', {
      query: cleanQuery,
      resultsCount: results.length
    });
    
    return results;
  } catch (error) {
    logger.error('aiKnowledgeService', 'خطأ في البحث في قاعدة المعرفة:', error);
    return [];
  }
};

/**
 * البحث الذكي في قاعدة المعرفة باستخدام الذكاء الاصطناعي
 * يستخدم OpenAI لفهم السؤال وإنشاء استعلامات بحث أفضل
 * @param {String} userQuery سؤال المستخدم الأصلي
 * @param {String} apiKey مفتاح API للذكاء الاصطناعي
 * @param {String} model نموذج الذكاء الاصطناعي المستخدم
 * @returns {Promise<Array>} مصفوفة بالمعلومات ذات الصلة
 */
exports.smartSearchKnowledgeBase = async (userQuery, apiKey, model = 'gpt-3.5-turbo') => {
  try {
    if (!userQuery || typeof userQuery !== 'string' || !apiKey) {
      return [];
    }

    logger.debug('aiKnowledgeService', 'بدء البحث الذكي في قاعدة المعرفة', {
      originalQuery: userQuery
    });

    // 1. جلب جميع التصنيفات والكلمات المفتاحية المتاحة لمساعدة الذكاء الاصطناعي
    const categories = await AIKnowledgeBase.distinct('category');
    const sampleKeywords = await AIKnowledgeBase.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$keywords' },
      { $group: { _id: '$keywords' } },
      { $sample: { size: 30 } }, // أخذ عينة من الكلمات المفتاحية
      { $project: { _id: 0, keyword: '$_id' } }
    ]);
    
    const keywordsList = sampleKeywords.map(k => k.keyword);

    // 2. استخدام OpenAI لتحليل السؤال وإنشاء استعلامات بحث متعددة
    const requestData = {
      model: model,
      messages: [
        {
          role: "system",
          content: `أنت مساعد لتحليل الأسئلة وإنشاء استعلامات بحث فعالة. مهمتك هي فهم سؤال العميل وتحويله إلى استعلامات بحث أكثر فعالية للبحث في قاعدة المعرفة.
          
فيما يلي أنواع المعلومات المتاحة في قاعدة المعرفة:
- التصنيفات المتاحة: ${categories.join(', ')}
- بعض الكلمات المفتاحية النموذجية: ${keywordsList.join(', ')}

مهمتك: تحليل سؤال العميل وإنشاء:
1. إعادة صياغة السؤال باللغة العربية الفصحى
2. قائمة بالكلمات المفتاحية الرئيسية التي يجب البحث عنها (4-6 كلمات)
3. تحديد التصنيف الأكثر صلة

قدم استجابتك كـ JSON بالتنسيق التالي فقط:
{
  "refinedQuery": "نسخة معدلة من السؤال باللغة العربية الفصحى",
  "keywords": ["كلمة1", "كلمة2", "كلمة3", "كلمة4"],
  "possibleCategory": "التصنيف المقترح"
}`
        },
        {
          role: "user",
          content: userQuery
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    };

    // إرسال الطلب إلى OpenAI
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      requestData,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const aiAnalysis = JSON.parse(response.data.choices[0].message.content);
    
    logger.debug('aiKnowledgeService', 'تحليل الذكاء الاصطناعي للسؤال', {
      refinedQuery: aiAnalysis.refinedQuery,
      keywords: aiAnalysis.keywords,
      possibleCategory: aiAnalysis.possibleCategory
    });

    // 3. إجراء بحث متعدد الاستراتيجيات باستخدام المعلومات المستخرجة
    const keywordsSearch = await AIKnowledgeBase.find({
      $text: { $search: aiAnalysis.keywords.join(' ') },
      isActive: true
    })
    .sort({ score: { $meta: 'textScore' }, priority: -1 })
    .limit(3);

    const refinedSearch = await AIKnowledgeBase.find({
      $text: { $search: aiAnalysis.refinedQuery },
      isActive: true
    })
    .sort({ score: { $meta: 'textScore' }, priority: -1 })
    .limit(3);

    const categorySearch = await AIKnowledgeBase.find({
      category: aiAnalysis.possibleCategory,
      isActive: true
    })
    .sort({ priority: -1 })
    .limit(2);

    // 4. دمج النتائج وإزالة التكرارات
    const mergedResults = [...keywordsSearch, ...refinedSearch, ...categorySearch];
    const uniqueResults = [];
    const uniqueIds = new Set();

    for (const result of mergedResults) {
      if (!uniqueIds.has(result._id.toString())) {
        uniqueIds.add(result._id.toString());
        uniqueResults.push(result);
      }
    }

    // 5. إعادة الترتيب حسب الأولوية
    uniqueResults.sort((a, b) => b.priority - a.priority);
    
    logger.debug('aiKnowledgeService', 'نتائج البحث الذكي', {
      totalResults: uniqueResults.length,
      topResultTitle: uniqueResults[0]?.title || 'لا توجد نتائج'
    });

    return uniqueResults;
  } catch (error) {
    logger.error('aiKnowledgeService', 'خطأ في البحث الذكي في قاعدة المعرفة:', error);
    // في حالة فشل البحث الذكي، نرجع إلى البحث التقليدي
    return exports.searchKnowledgeBase(userQuery);
  }
};

/**
 * استخراج المعلومات ذات الصلة بسياق المحادثة وتنسيقها للذكاء الاصطناعي
 * @param {String} messageContent محتوى رسالة المستخدم
 * @param {String} apiKey مفتاح API للذكاء الاصطناعي
 * @param {String} model نموذج الذكاء الاصطناعي المستخدم
 * @returns {Promise<String>} معلومات منسقة للذكاء الاصطناعي أو سلسلة فارغة إذا لم يتم العثور على شيء
 */
exports.getRelevantKnowledge = async (messageContent, apiKey, model) => {
  try {
    if (!messageContent || typeof messageContent !== 'string') {
      return '';
    }
    
    // استخدام البحث الذكي إذا كان مفتاح API متوفرًا، وإلا البحث العادي
    let relevantInfo;
    if (apiKey) {
      relevantInfo = await exports.smartSearchKnowledgeBase(messageContent, apiKey, model);
    } else {
      relevantInfo = await exports.searchKnowledgeBase(messageContent);
    }
    
    // إذا لم يتم العثور على معلومات، أرجع سلسلة فارغة
    if (!relevantInfo || relevantInfo.length === 0) {
      return '';
    }
    
    // تنسيق المعلومات لاستخدامها مع الذكاء الاصطناعي
    let formattedKnowledge = 'معلومات ذات صلة من قاعدة المعرفة:';
    
    relevantInfo.forEach((item, index) => {
      formattedKnowledge += `\n\n--- معلومة #${index + 1}: ${item.title} ---\n`;
      formattedKnowledge += item.content;
    });
    
    formattedKnowledge += '\n\nاستخدم هذه المعلومات للإجابة على استفسار العميل إذا كانت ذات صلة.';
    
    return formattedKnowledge;
  } catch (error) {
    logger.error('aiKnowledgeService', 'خطأ في استخراج المعلومات ذات الصلة:', error);
    return '';
  }
};

/**
 * إضافة معلومات من قاعدة المعرفة إلى رسالة النظام
 * @param {String} systemMessage رسالة النظام الأصلية
 * @param {String} userMessage رسالة المستخدم
 * @param {String} apiKey مفتاح API للذكاء الاصطناعي (اختياري)
 * @param {String} model نموذج الذكاء الاصطناعي (اختياري)
 * @returns {Promise<String>} رسالة النظام محدثة مع المعلومات ذات الصلة
 */
exports.enhanceSystemMessageWithKnowledge = async (systemMessage, userMessage, apiKey, model) => {
  try {
    // الحصول على المعلومات ذات الصلة باستخدام البحث الذكي إذا توفر apiKey
    const relevantKnowledge = await exports.getRelevantKnowledge(userMessage, apiKey, model);
    
    // إذا لم يتم العثور على معلومات، أرجع رسالة النظام كما هي
    if (!relevantKnowledge) {
      return systemMessage;
    }
    
    // دمج المعلومات مع رسالة النظام
    return `${systemMessage}\n\n${relevantKnowledge}`;
  } catch (error) {
    logger.error('aiKnowledgeService', 'خطأ في تحسين رسالة النظام بالمعلومات من قاعدة المعرفة:', error);
    return systemMessage;
  }
}; 