const User = require('../models/User');
const bcrypt = require('bcrypt');

// GET /api/profile
exports.getProfile = async (req, res) => {
    try {
        // وسيط isAuthenticated يضمن وجود req.session.userId
        const userId = req.session.userId; 
        // جلب المستخدم مع استثناء كلمة المرور
        const user = await User.findById(userId).select('-password');
        if (!user) {
            // هذا السيناريو غير محتمل إذا كانت الجلسة صالحة، ولكنه جيد للتحقق
            return res.status(404).json({ message: 'لم يتم العثور على المستخدم المرتبط بالجلسة' });
        }
        res.status(200).json(user);
    } catch (error) {
        console.error('خطأ في جلب الملف الشخصي:', error);
        res.status(500).json({ message: 'حدث خطأ أثناء جلب الملف الشخصي' });
    }
};

// PUT /api/profile
exports.updateProfile = async (req, res) => {
    try {
        // وسيط isAuthenticated يضمن وجود req.session.userId
        const userId = req.session.userId; 
        const {
            full_name,
            email,
            phone_number,
            profile_picture, // نتوقع سلسلة Base64
            current_password, // للتحقق عند تغيير كلمة المرور
            new_password,     // كلمة المرور الجديدة
            enable_general_notifications,
            notify_assigned_conversation,
            notify_unassigned_conversation,
            notify_any_message
        } = req.body;

        // من الأفضل جلب المستخدم أولاً لتطبيق الخطافات (hooks) والتحقق من كلمة المرور
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'لم يتم العثور على المستخدم' });
        }

        // تحديث الحقول القابلة للتعديل
        if (full_name) user.full_name = full_name;
        if (email) user.email = email.toLowerCase(); // التأكد من أنها بأحرف صغيرة
        if (phone_number) user.phone_number = phone_number;
        // السماح بتحديث الصورة حتى لو كانت القيمة فارغة (null أو سلسلة فارغة) لحذفها
        if (profile_picture !== undefined) user.profile_picture = profile_picture;
        if (typeof enable_general_notifications === 'boolean') user.enable_general_notifications = enable_general_notifications;
        if (typeof notify_assigned_conversation === 'boolean') user.notify_assigned_conversation = notify_assigned_conversation;
        if (typeof notify_unassigned_conversation === 'boolean') user.notify_unassigned_conversation = notify_unassigned_conversation;
        if (typeof notify_any_message === 'boolean') user.notify_any_message = notify_any_message;

        // التعامل مع تغيير كلمة المرور
        if (new_password) {
            if (!current_password) {
                return res.status(400).json({ message: 'يجب توفير كلمة المرور الحالية لتغييرها' });
            }
            const isMatch = await bcrypt.compare(current_password, user.password);
            if (!isMatch) {
                return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
            }
            // سيتم تجزئة كلمة المرور الجديدة تلقائيًا بواسطة خطاف 'pre-save' في نموذج المستخدم
            user.password = new_password;
        }

        // حفظ التغييرات (سيؤدي هذا إلى تشغيل خطاف pre-save إذا تغيرت كلمة المرور)
        const savedUser = await user.save();

        // إرجاع بيانات المستخدم المحدثة (بدون كلمة المرور)
        const userResponse = savedUser.toObject(); 
        delete userResponse.password;

        // تحديث الجلسة بالقيم الجديدة
        let sessionUpdated = false;
        if (req.body.profile_picture !== undefined) {
            req.session.profile_picture = savedUser.profile_picture;
            sessionUpdated = true;
        }
        if (req.body.full_name && req.session.full_name !== savedUser.full_name) {
            req.session.full_name = savedUser.full_name;
            sessionUpdated = true;
        }
        
        // حفظ الجلسة فقط إذا تم تحديث شيء فيها
        if (sessionUpdated) {
            req.session.save(err => {
                if (err) {
                    console.error('خطأ في حفظ الجلسة بعد تحديث الملف الشخصي:', err);
                }
                // إرسال الاستجابة بعد محاولة حفظ الجلسة
                res.status(200).json({ message: 'تم تحديث الملف الشخصي بنجاح', user: userResponse });
            });
        } else {
            // إذا لم تتغير الجلسة، أرسل الاستجابة مباشرة
            res.status(200).json({ message: 'تم تحديث الملف الشخصي بنجاح', user: userResponse });
        }

    } catch (error) {
        console.error('خطأ في تحديث الملف الشخصي:', error);
        // التعامل مع أخطاء التحقق (مثل البريد الإلكتروني المكرر أو التنسيق غير الصحيح)
        if (error.name === 'ValidationError') {
            // استخراج رسائل الخطأ بشكل أفضل
             const messages = Object.values(error.errors).map(e => e.message);
             return res.status(400).json({ message: `خطأ في التحقق من البيانات: ${messages.join(', ')}`, errors: error.errors });
        }
        // التعامل مع خطأ المفتاح المكرر (مثل البريد الإلكتروني)
        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            const value = error.keyValue[field];
            // رسالة خطأ أوضح
            let friendlyField = field;
            if (field === 'email') friendlyField = 'البريد الإلكتروني';
            else if (field === 'username') friendlyField = 'اسم المستخدم';
            // ... أضف ترجمات أخرى إذا لزم الأمر

            return res.status(400).json({ message: `${friendlyField} '${value}' مستخدم بالفعل.` });
        }
        res.status(500).json({ message: 'حدث خطأ أثناء تحديث الملف الشخصي' });
    }
}; 