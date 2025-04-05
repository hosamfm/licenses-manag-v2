/**
 * وسيط مصادقة المستخدمين
 * يستخدم للتحقق من حالة تسجيل الدخول وصلاحيات المستخدم
 */

// التحقق من تسجيل الدخول
exports.ensureAuthenticated = async (req, res, next) => {
  if (req.session && req.session.userId) {
    return next();
  }
  
  // إذا كان الطلب من نوع AJAX أو API، نرجع رد خطأ بصيغة JSON
  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    return res.status(401).json({ 
      success: false, 
      error: 'يجب تسجيل الدخول للوصول لهذه الصفحة'
    });
  }
  
  // إذا كان طلب عادي، نقوم بإعادة التوجيه لصفحة تسجيل الدخول
  if (req.flash) {
    req.flash('error', 'يجب تسجيل الدخول للوصول لهذه الصفحة');
  }
  res.redirect('/auth/login');
};

// التحقق من صلاحيات المشرف
exports.ensureAdmin = async (req, res, next) => {
  if (req.session && req.session.userId && req.session.userRole === 'admin') {
    return next();
  }
  
  // إذا كان الطلب من نوع AJAX أو API، نرجع رد خطأ بصيغة JSON
  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    return res.status(403).json({ 
      success: false, 
      error: 'غير مصرح لك بالوصول لهذه الصفحة'
    });
  }
  
  // إذا كان طلب عادي، نقوم بعرض رسالة خطأ
  if (req.flash) {
    req.flash('error', 'غير مصرح لك بالوصول لهذه الصفحة');
  }
  res.redirect('/');
};

// التحقق من صلاحيات الوصول للمحادثات
exports.ensureCanAccessConversations = async (req, res, next) => {
  try {
    // إذا كان المستخدم مديراً، لديه صلاحية تلقائية للوصول
    if (req.session && req.session.userRole === 'admin') {
      return next();
    }
    
    // التأكد من وجود المستخدم وتحميل بياناته
    if (!req.user) {
      const User = require('../models/User');
      req.user = await User.findById(req.session.userId);
    }
    
    // التحقق من وجود صلاحية الوصول للمحادثات
    if (req.user && req.user.can_access_conversations === true) {
      return next();
    } 
    
    // إذا كان الطلب من نوع AJAX أو API، نرجع رد خطأ بصيغة JSON
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
      return res.status(403).json({ 
        success: false, 
        error: 'ليس لديك صلاحية للوصول إلى المحادثات'
      });
    }
    
    // إذا كان طلب عادي، نقوم بعرض رسالة خطأ
    if (req.flash) {
      req.flash('error', 'ليس لديك صلاحية للوصول إلى المحادثات');
    }
    return res.redirect('/');
  } catch (error) {
    console.error('خطأ في التحقق من صلاحية الوصول للمحادثات:', error);
    
    // إذا كان الطلب من نوع AJAX أو API، نرجع رد خطأ بصيغة JSON
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
      return res.status(500).json({ 
        success: false, 
        error: 'حدث خطأ أثناء التحقق من الصلاحيات'
      });
    }
    
    // إذا كان طلب عادي، نقوم بعرض رسالة خطأ
    if (req.flash) {
      req.flash('error', 'حدث خطأ أثناء التحقق من الصلاحيات');
    }
    return res.redirect('/');
  }
};
