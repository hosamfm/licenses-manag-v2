require("dotenv").config();
const mongoose = require("mongoose");
const express = require("express");
const session = require("express-session");
const MongoStore = require('connect-mongo');
const flash = require('connect-flash');
const authRoutes = require("./routes/authRoutes");
const licenseRoutes = require('./routes/licenseRoutes');
const licensesApiRoutes = require('./routes/licenses'); // إضافة الاستيراد الجديد
const { isAuthenticated } = require('./middleware/authMiddleware');
const User = require('./models/User');
const chatIdRoutes = require('./routes/chatIdRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const { startTelegramBot } = require('./services/telegramService'); // استيراد دالة startTelegramBot
const telegramMessagesRoutes = require('./routes/telegramMessages');
const priceReaderLicenseRoutes = require('./routes/priceReaderLicense');
const ocrRoutes = require('./routes/ocrRoutes'); // إضافة استيراد مسارات OCR
const semClientRoutes = require('./routes/semClientRoutes'); // استيراد مسارات إدارة عملاء SEM
const messageRoutes = require('./routes/messageRoutes'); // استيراد مسارات إرسال الرسائل
const balanceRoutes = require('./routes/balanceRoutes'); // إضافة مسارات الرصيد

if (!process.env.DATABASE_URL || !process.env.SESSION_SECRET) {
  console.error("Error: config environment variables not set. Please create/edit .env configuration file.");
  process.exit(-1);
}

const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
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

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.DATABASE_URL }),
  }),
);

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
app.use(licensesApiRoutes); // نقل هذا قبل licenseRoutes
app.use('/licenses', licenseRoutes);
app.use('/admin', chatIdRoutes);
app.use('/program-details', require('./routes/programDetails'));
app.use(settingsRoutes);
app.use('/telegram', telegramMessagesRoutes);
app.use(priceReaderLicenseRoutes);
app.use(ocrRoutes);
app.use(semClientRoutes); // إضافة مسارات عملاء SEM
app.use(messageRoutes); // إضافة مسارات إرسال الرسائل
app.use('/', balanceRoutes); // إضافة مسارات الرصيد

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

createDefaultAdmin().then(() => {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
  }).on('error', (err) => {
    console.error('Failed to start server:', err.message);
  });
});

module.exports = app;
