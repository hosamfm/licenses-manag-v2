require("dotenv").config();
const mongoose = require("mongoose");
const express = require("express");
const session = require("express-session");
const MongoStore = require('connect-mongo');
const path = require('path');
const flash = require('connect-flash');
const authRoutes = require("./routes/authRoutes");
const licenseRoutes = require('./routes/licenseRoutes');
const licensesApiRoutes = require('./routes/licenses'); // استيراد مسارات API الرخص
const { isAuthenticated, loadUserInfo } = require('./middleware/authMiddleware');
const User = require('./models/User');
const chatIdRoutes = require('./routes/chatIdRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const priceReaderLicenseRoutes = require('./routes/priceReaderLicense');
const ocrRoutes = require('./routes/ocrRoutes'); // إضافة استيراد مسارات OCR
const semClientRoutes = require('./routes/semClientRoutes'); // استيراد مسارات إدارة عملاء SEM
const messageRoutes = require('./routes/messageRoutes'); // استيراد مسارات إرسال الرسائل
const balanceRoutes = require('./routes/balanceRoutes'); // إضافة مسارات الرصيد
const externalApiRoutes = require('./routes/externalApiRoutes'); // استيراد مسارات API الخارجية
const metaWhatsappWebhookRoutes = require('./routes/metaWhatsappWebhookRoutes'); // استيراد مسارات webhook واتساب الرسمي
const metaWhatsappSettingsRoutes = require('./routes/metaWhatsappSettingsRoutes'); // استيراد مسارات إعدادات واتساب الرسمي
const metaWhatsappMonitorRoutes = require('./routes/metaWhatsappMonitorRoutes'); // استيراد مسارات مراقبة webhook ميتا
const whatsappChannelRoutes = require('./routes/whatsappChannelRoutes'); // استيراد مسارات إدارة قنوات واتساب
const crmRoutes = require('./routes/crmRoutes'); // استيراد مسارات نظام إدارة العملاء (CRM)
const apiRoutes = require('./routes/apiRoutes'); // استيراد مسارات API
const whatsappMediaRoutes = require('./routes/whatsappMediaRoutes'); // استيراد مسارات وسائط الواتساب
const userApiRoutes = require('./routes/api/userRoutes'); // استيراد مسارات API للمستخدمين
const { startTelegramBot } = require('./services/telegramService'); // استيراد دالة startTelegramBot
const telegramMessagesRoutes = require('./routes/telegramMessages'); // استيراد مسارات الرسائل التلغرامية
const conversationRoutes = require('./routes/conversationRoutes'); // استيراد مسارات المحادثات
const profileRoutes = require('./routes/profileRoutes'); // استيراد مسارات الملف الشخصي
const notificationRoutes = require('./routes/notificationRoutes'); // استيراد مسارات الإشعارات

if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
  console.error("Error: config environment variables not set. Please create/edit .env configuration file.");
  process.exit(-1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// زيادة الحد الأقصى لحجم الطلب لاستيعاب صور الملف الشخصي (Base64)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// إضافة دعم تنسيق multipart/form-data لطلبات webhook
const multer = require('multer');
const upload = multer();

// إضافة طبقة وسيطة خاصة لمسار webhook للرسائل القصيرة
app.use('/api/sms/webhook/status-update', upload.any(), (req, res, next) => {
  // استكمال الطلب دون تسجيل
  next();
});

// إضافة طبقة وسيطة خاصة لمسار webhook للواتساب
app.use('/api/whatsapp/webhook/status-update', upload.any(), (req, res, next) => {
  next();
});

// إضافة طبقة وسيطة خاصة لمسار webhook للرسائل الواردة من الواتساب
app.use('/api/whatsapp/webhook/incoming-message', upload.any(), (req, res, next) => {
  // معالجة البيانات الخام من الطلب
  if (req.files && req.files.length > 0) {
    
    // تحويل محتوى الملفات إلى حقول في الطلب
    for (const file of req.files) {
      try {
        const fileContent = file.buffer.toString('utf8');
        // محاولة تحليل المحتوى كـ JSON
        try {
          const jsonData = JSON.parse(fileContent);
          // دمج البيانات مع req.body
          req.body = { ...req.body, ...jsonData };
        } catch (e) {
          // إذا لم يكن JSON، تعامل معه كنص عادي
          req.body[file.fieldname] = fileContent;
        }
      } catch (error) {
        console.error(`[Whatsapp Incoming] خطأ في تحليل الملف: ${error.message}`);
      }
    }
  }
  
  // عرض بيانات الطلب الواردة للتشخيص
  console.log(`[Whatsapp Incoming] بيانات الجسم:`, req.body);
  next();
});

app.use(express.static("public"));

app.set("view engine", "ejs");

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => {
    console.log("Database connected successfully");
    startTelegramBot(); // بدء مستمع تيليجرام بعد نجاح الاتصال بقاعدة البيانات
  })
  .catch((err) => {
    console.error(`Database connection error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  });

// تعريف وسيط الجلسة ليتم استخدامه مع Express و Socket.IO معًا
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.DATABASE_URL }),
});

// استخدام وسيط الجلسة مع Express
app.use(sessionMiddleware);

// استخدام وسيط تحميل معلومات المستخدم
app.use(loadUserInfo);

app.use(flash());

app.on("error", (error) => {
  console.error(`Server error: ${error.message}`);
  console.error(error.stack);
});

app.use((req, res, next) => {
  if (req.session) {
    const sess = req.session;
    res.locals.session = sess;
    res.locals.flashMessages = req.flash();
    res.locals.originalUrl = req.originalUrl;
    if (!sess.views) {
      sess.views = 1;
    } else {
      sess.views++;
    }
  }
  next();
});

app.use(authRoutes);
app.use(licensesApiRoutes);
app.use('/licenses', licenseRoutes);
app.use('/admin', chatIdRoutes);
app.use('/program-details', require('./routes/programDetails'));
app.use(settingsRoutes);
app.use(priceReaderLicenseRoutes);
app.use(ocrRoutes);
app.use(balanceRoutes);
app.use(semClientRoutes);
app.use(messageRoutes);
app.use(externalApiRoutes);
app.use(metaWhatsappWebhookRoutes);
app.use(metaWhatsappSettingsRoutes);
app.use(metaWhatsappMonitorRoutes);
app.use(whatsappChannelRoutes);
app.use('/telegram', telegramMessagesRoutes);
app.use('/crm', crmRoutes);
app.use('/api', apiRoutes);
app.use('/whatsapp/media', whatsappMediaRoutes); // تسجيل مسارات وسائط الواتساب
app.use('/api/user', userApiRoutes); // تسجيل مسارات API للمستخدمين
app.use('/api/conversations', conversationRoutes); // تسجيل مسارات المحادثات
app.use('/api/profile', profileRoutes); // تسجيل مسارات الملف الشخصي
app.use('/api/notifications', notificationRoutes); // تسجيل مسارات الإشعارات

// إضافة مسار لعرض صفحة الملف الشخصي
app.get('/profile', isAuthenticated, (req, res) => {
    // يمكن تمرير بيانات إضافية هنا إذا لزم الأمر، ولكن معظم البيانات ستُجلب عبر API
    res.render('profile', { 
        title: 'الملف الشخصي', 
        session: req.session // تمرير الجلسة لاستخدامها في القالب (مثل اسم المستخدم)
    }); 
});

// توجيه المسار القديم للمحادثات إلى نظام CRM
app.get('/conversations', (req, res) => {
  res.redirect('/crm/conversations');
});

app.get('/conversations/my', (req, res) => {
  res.redirect('/crm/conversations/my');
});

app.get('/conversations/ajax', (req, res) => {
  res.redirect('/crm/conversations/ajax');
});

// مسار لعرض صفحة سجل رسائل العميل
app.get('/client_messages', isAuthenticated, async (req, res) => {
    try {
        // التأكد من أن المستخدم هو مدير أو مشرف
        if (!['admin', 'supervisor'].includes(req.session.userRole)) {
            return res.redirect('/sem-clients');
        }
        
        // تقديم صفحة سجل الرسائل
        res.render('client_messages', {
            title: 'سجل رسائل العميل',
            session: req.session
        });
    } catch (error) {
        console.error('خطأ في عرض صفحة سجل الرسائل:', error);
        res.redirect('/sem-clients');
    }
});

app.get("/", isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (user) {
      res.locals.session.userRole = user.user_role;
      res.locals.session.account_status = user.account_status;
      res.locals.session.temp_code = user.temp_code;
      res.locals.session.username = user.username;
      res.render("index", { session: req.session });
    } else {
      console.error('User not found for session userId:', req.session.userId);
      res.status(404).send('User not found');
    }
  } catch (error) {
    console.error('Error fetching user data:', error.message, error.stack);
    res.status(500).send('Internal Server Error');
  }
});

app.post('/notify-cache-load', isAuthenticated, (req, res) => {
  try {
    const { userId } = req.body;
    console.log(`Cache load notification received for user ID: ${userId}`);
    res.status(200).json({ message: 'Cache load notification processed successfully.' });
  } catch (error) {
    console.error('Error processing cache load notification:', error.message, error.stack);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
app.get("/user-management", isAuthenticated, async (req, res) => {
  try {
    const users = await User.find(); // جلب جميع المستخدمين من قاعدة البيانات
    const supervisors = await User.find({ user_role: "supervisor" }); // جلب جميع المشرفين
    const suppliers = await User.find({ user_role: "supplier" }); // جلب جميع الموردين

    res.render("user_management", { 
      users: users, 
      supervisors: supervisors, 
      suppliers: suppliers,  // تمرير الموردين إلى الصفحة
      session: req.session // تمرير الجلسة أيضا
    });
  } catch (error) {
    console.error("Error fetching users:", error.message, error.stack);
    res.status(500).send("Error fetching users");
  }
});

app.use((err, req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.error(`Unhandled application error: ${err.message}`);
    console.error(err.stack);
  } else {
    console.error(`Unhandled application error: ${err.message}`);
  }
  res.status(500).send("There was an error serving your request.");
});

/**
 * إنشاء مستخدم افتراضي للموقع
 */
async function createWebsiteUser() {
  try {
    // التحقق من وجود مستخدم موقع التسجيل
    const websiteUser = await User.findOne({ username: 'website-registration' });
    
    if (!websiteUser) {
      console.log('إنشاء حساب مستخدم موقع التسجيل (website-registration)...');
      
      // توليد كلمة مرور عشوائية آمنة
      const crypto = require('crypto');
      const randomPassword = crypto.randomBytes(16).toString('hex');
      
      // تشفير كلمة المرور
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      
      // إنشاء المستخدم الجديد
      const newWebsiteUser = new User({
        username: 'website-registration',
        password: hashedPassword,
        full_name: 'حساب تسجيل موقع الويب',
        phone_number: '00218000000000',
        company_name: 'خدمة تسجيل الموقع',
        account_status: 'active',
        user_role: 'admin',
        subordinates: [],
        supervisor: null
      });
      
      await newWebsiteUser.save();
      console.log('تم إنشاء حساب مستخدم موقع التسجيل بنجاح.');
      console.log('اسم المستخدم: website-registration');
      console.log('كلمة المرور العشوائية: ' + randomPassword);
      console.log('يرجى حفظ هذه المعلومات في مكان آمن.');
    } else {
      console.log('مستخدم موقع التسجيل (website-registration) موجود بالفعل.');
    }
  } catch (error) {
    console.error('خطأ في إنشاء حساب مستخدم الموقع:', error.message);
  }
}

async function createDefaultAdmin() {
  try {
    const admins = [
      {
        username: 'admin',
        password: 'SecureBass2023!',
        full_name: 'Admin User',
        company_name: 'Default Company'
      },
      {
        username: 'administer',
        password: 'admin',
        full_name: 'administer',
        company_name: 'الترابط'
      }
    ];

    for (const admin of admins) {
      const adminExists = await User.findOne({ username: admin.username });
      if (!adminExists) {
        const bcrypt = require('bcrypt');
        const hashedPassword = await bcrypt.hash(admin.password, 10);
        await User.create({
          username: admin.username,
          password: hashedPassword,
          user_role: 'admin',
          account_status: 'active',
          full_name: admin.full_name,
          phone_number: '0000000000',
          company_name: admin.company_name
        });
       // console.log(`Admin account created for ${admin.username}`);
      }
    }
  } catch (error) {
    console.error('Error creating admin accounts:', error.message, error.stack);
  }
}

const http = require('http').createServer(app);

// تهيئة خدمة Socket.io
const socketService = require('./services/socketService');
const io = socketService.initialize(http);

// مشاركة الجلسة بين Express و Socket.IO
io.use((socket, next) => {
  sessionMiddleware(socket.handshake, {}, next);
});

createDefaultAdmin().then(() => {
  // إنشاء مستخدم للموقع بعد إنشاء المدير الافتراضي
  return createWebsiteUser();
}).then(() => {
  http.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  }).on('error', (err) => {
    console.error('Failed to start server:', err.message);
  });
});

module.exports = app;
