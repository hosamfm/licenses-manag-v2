// تضمين مسارات التطبيق
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const profileRoutes = require('./routes/profile');
const crmRoutes = require('./routes/crm');
const webhookRoutes = require('./routes/webhook');
const apiRoutes = require('./routes/api'); // إضافة مسارات API

// تعريف مسارات التطبيق
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/profile', profileRoutes);
app.use('/crm', crmRoutes);
app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes); // استخدام مسارات API 