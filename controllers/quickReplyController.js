const QuickReply = require('../models/QuickReply');

// جلب جميع الردود السريعة (العامة وتلك الخاصة بالمستخدم الحالي)
exports.getQuickReplies = async (req, res) => {
    try {
        // افتراض أن معرف المستخدم موجود في req.user._id (يجب ضبط middleware للمصادقة)
        const userId = req.user ? req.user._id : null;
        const isAdmin = req.user && req.user.role === 'admin'; // تحقق مما إذا كان المستخدم مسؤولاً
        
        // بناء الاستعلام
        let query = {};
        
        if (isAdmin) {
            // المسؤولون يمكنهم رؤية جميع الردود السريعة
            query = {}; // استعلام فارغ يجلب كل الردود
        } else {
            // المستخدمون العاديون يرون فقط الردود العامة والردود الخاصة بهم
            query = {
                $or: [
                    { userId: null }, // الردود العامة
                ]
            };
            if (userId) {
                query.$or.push({ userId: userId }); // الردود الخاصة بالمستخدم
            }
        }

        const quickReplies = await QuickReply.find(query).sort({ shortcut: 1 }); // ترتيب حسب الاختصار
        
        // إرجاع الردود كـ JSON مباشرة (بدون خاصية quickReplies)
        res.status(200).json(quickReplies);
    } catch (error) {
        console.error('خطأ في جلب الردود السريعة:', error);
        res.status(500).json({ message: 'خطأ في الخادم أثناء جلب الردود السريعة', error: error.message });
    }
};

// إنشاء رد سريع جديد
exports.createQuickReply = async (req, res) => {
    try {
        const { shortcut, text } = req.body;
        // تعيين userId كـ null لجعل الرد عاماً يظهر لجميع المستخدمين
        const userId = null;

        if (!shortcut || !text) {
            return res.status(400).json({ message: 'الاختصار ونص الرد مطلوبان' });
        }

        // التحقق مما إذا كان الاختصار موجودًا بالفعل (إما عام أو خاص بنفس المستخدم)
        const existingQuery = { 
            shortcut: shortcut.toLowerCase(),
            $or: [
                { userId: null }
            ]
         };
         if (userId) {
            existingQuery.$or.push({ userId: userId });
         }
         const existingReply = await QuickReply.findOne(existingQuery);

        if (existingReply) {
            // تحديد ما إذا كان الرد الموجود عامًا أم خاصًا بالمستخدم
            const message = existingReply.userId ? 'لديك بالفعل رد سريع بهذا الاختصار.' : 'الاختصار محجوز لرد سريع عام.';
            return res.status(409).json({ message: message }); // Conflict
        }

        const newQuickReply = new QuickReply({
            shortcut: shortcut.toLowerCase(), // حفظ الاختصار بحروف صغيرة
            text,
            userId // سيكون null لجعل الرد عاماً
        });

        await newQuickReply.save();
        res.status(201).json({ message: 'تم إنشاء الرد السريع بنجاح', quickReply: newQuickReply });
    } catch (error) {
        console.error('خطأ في إنشاء رد سريع:', error);
        // التعامل مع أخطاء Mongoose (مثل تكرار المفتاح إذا لم يتم التعامل معه أعلاه)
        if (error.code === 11000) { 
            return res.status(409).json({ message: 'هذا الاختصار مستخدم بالفعل.' });
        }
        res.status(500).json({ message: 'خطأ في الخادم أثناء إنشاء الرد السريع', error: error.message });
    }
};

// تحديث رد سريع موجود
exports.updateQuickReply = async (req, res) => {
    try {
        const { id } = req.params;
        const { shortcut, text } = req.body;
        const userId = req.user ? req.user._id : null;

        if (!shortcut || !text) {
            return res.status(400).json({ message: 'الاختصار ونص الرد مطلوبان' });
        }

        const quickReply = await QuickReply.findById(id);

        if (!quickReply) {
            return res.status(404).json({ message: 'الرد السريع غير موجود' });
        }

        // التحقق من الملكية: يمكن للمستخدم تعديل ردوده فقط (أو لا يمكن تعديل الردود العامة)
        // ملاحظة: قد ترغب في السماح للمسؤولين بتعديل الردود العامة.
        if (quickReply.userId && (!userId || quickReply.userId.toString() !== userId.toString())) {
             return res.status(403).json({ message: 'غير مصرح لك بتعديل هذا الرد السريع' });
        }
         if (quickReply.userId === null) {
             // هنا يمكنك إضافة منطق للتحقق مما إذا كان المستخدم الحالي هو مسؤول
             // if (!req.user || !req.user.isAdmin) { ... }
             // حاليًا، لن نسمح بتعديل الردود العامة عبر هذا المسار
             return res.status(403).json({ message: 'لا يمكن تعديل الردود السريعة العامة من هنا' });
         }

        // التحقق مما إذا كان الاختصار الجديد يتعارض مع رد آخر لنفس المستخدم أو رد عام
        if (shortcut.toLowerCase() !== quickReply.shortcut) {
            const existingQuery = { 
                shortcut: shortcut.toLowerCase(),
                _id: { $ne: id }, // استبعاد الرد الحالي
                $or: [
                    { userId: null }
                ]
             };
             if (userId) {
                existingQuery.$or.push({ userId: userId });
             }
            const conflictingReply = await QuickReply.findOne(existingQuery);
            if (conflictingReply) {
                const message = conflictingReply.userId ? 'لديك بالفعل رد سريع آخر بهذا الاختصار.' : 'الاختصار محجوز لرد سريع عام.';
                return res.status(409).json({ message: message });
            }
        }

        quickReply.shortcut = shortcut.toLowerCase();
        quickReply.text = text;
        // لا نغير userId هنا

        await quickReply.save();
        res.status(200).json({ message: 'تم تحديث الرد السريع بنجاح', quickReply });
    } catch (error) {
        console.error('خطأ في تحديث رد سريع:', error);
        if (error.code === 11000) { 
            return res.status(409).json({ message: 'هذا الاختصار مستخدم بالفعل لرد آخر.' });
        }
        res.status(500).json({ message: 'خطأ في الخادم أثناء تحديث الرد السريع', error: error.message });
    }
};

// حذف رد سريع
exports.deleteQuickReply = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user ? req.user._id : null;

        const quickReply = await QuickReply.findById(id);

        if (!quickReply) {
            return res.status(404).json({ message: 'الرد السريع غير موجود' });
        }

        // التحقق من الملكية (مثل التحديث)
        if (quickReply.userId && (!userId || quickReply.userId.toString() !== userId.toString())) {
             return res.status(403).json({ message: 'غير مصرح لك بحذف هذا الرد السريع' });
        }
        if (quickReply.userId === null) {
            // السماح للمسؤولين فقط بحذف الردود العامة
            // if (!req.user || !req.user.isAdmin) { ... }
            return res.status(403).json({ message: 'لا يمكن حذف الردود السريعة العامة من هنا' });
        }

        // استخدام deleteOne بدلاً من remove (الأحدث)
        await QuickReply.deleteOne({ _id: id }); 

        res.status(200).json({ message: 'تم حذف الرد السريع بنجاح' });
    } catch (error) {
        console.error('خطأ في حذف رد سريع:', error);
        res.status(500).json({ message: 'خطأ في الخادم أثناء حذف الرد السريع', error: error.message });
    }
}; 