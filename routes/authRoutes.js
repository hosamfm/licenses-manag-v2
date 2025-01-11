const express = require('express');
const User = require('../models/User');
const bcrypt = require('bcrypt');
const router = express.Router();
const { isAuthenticated, checkRole } = require('../middleware/authMiddleware');

router.get('/auth/register', (req, res) => {
  res.render('register');
});

// المسار الجديد لإنشاء المستخدمين من قبل admin, supervisor, supplier
// المسار الجديد لإنشاء المستخدمين من قبل admin, supervisor, supplier
router.post('/auth/admin/register', isAuthenticated, checkRole(['admin', 'supervisor', 'supplier']), async (req, res) => {
  try {
    const { username, password, confirmPassword, fullName, companyName, phoneNumber, userRole } = req.body;

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const temp_code = Math.floor(1000 + Math.random() * 9000).toString();
    let supervisor = null;

    // غير المسؤولين يمكنهم فقط تعيين دور "representative"
    let roleToAssign = req.session.userRole === 'admin' ? userRole : 'representative';

    if (req.session.userRole === 'supplier') {
      supervisor = req.session.userId;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await User.create({ 
      username: username.toLowerCase(), 
      password: hashedPassword, 
      full_name: fullName, 
      company_name: companyName, 
      phone_number: phoneNumber, 
      temp_code, 
      user_role: roleToAssign, 
      account_status: 'inactive', 
      supervisor 
    });

    return res.status(200).json({ success: 'تم إنشاء الحساب بنجاح.' });
  } catch (error) {
    console.error('Admin registration error:', error.message, error.stack);
    return res.status(500).json({ error: 'لم تنجح عملية إنشاء الحساب' });
  }
});

// المسارات الحالية
router.post('/auth/register', async (req, res) => {
  try {
    const { username, password, confirmPassword, fullName, companyName, phoneNumber } = req.body;

    if (password !== confirmPassword) {
      req.flash('error', 'Passwords do not match.');
      return res.redirect('/auth/register');
    }

    const temp_code = Math.floor(1000 + Math.random() * 9000).toString();
    let userRole = 'no_permissions';
    let accountStatus = 'inactive';
    let supervisor = null;

    if (req.session.userRole === 'supervisor') {
      userRole = 'representative';
      supervisor = req.session.userId;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await User.create({ 
      username: username.toLowerCase(), 
      password: hashedPassword, 
      full_name: fullName, 
      company_name: companyName, 
      phone_number: phoneNumber, 
      temp_code, 
      user_role: userRole, 
      account_status: accountStatus, 
      supervisor 
    });

    req.session.userId = user._id;
    req.session.userRole = user.user_role;
    req.session.temp_code = temp_code;
    req.flash('success', 'تم إنشاء حسابك بنجاح.');
    res.redirect('/auth/verify-telegram');

  } catch (error) {
    console.error('Registration error:', error.message, error.stack);
    req.flash('error', 'لم تنجح عملية تسجيل الحساب');
    res.redirect('/auth/register');
  }
});

router.get('/auth/login', (req, res) => {
  res.render('login');
});

router.get('/auth/verify-telegram', async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const temp_code = req.session.temp_code;
    res.render('verify_telegram', { temp_code, user });
  } catch (error) {
    console.error('Error retrieving user for telegram verification:', error.message, error.stack);
    req.flash('error', 'Error retrieving user. Please try again.');
    res.status(500).redirect('/auth/login');
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) {
      req.flash('error', 'User not found');
      console.log(`Login failed for user: ${username} - User not found`);
      return res.status(400).redirect('/auth/login');
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (isMatch) {
      req.session.userId = user._id;
      req.session.userRole = user.user_role;
      req.flash('success', 'Logged in successfully.');
      return res.redirect('/');
    } else {
      req.flash('error', 'Password is incorrect');
      console.log(`Login failed for user: ${username} - Incorrect password`);
      return res.status(400).redirect('/auth/login');
    }
  } catch (error) {
    console.error('Login error:', error.message, error.stack);
    req.flash('error', 'Login failed. Please try again.');
    return res.status(500).redirect('/auth/login');
  }
});

router.post('/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Error during session destruction:', err.message, err.stack);
      if (req.session) {
        req.flash('error', 'Error logging out');
      }
      return res.status(500).redirect('/');
    }
    res.clearCookie('connect.sid', { path: '/' });
    req.flash('success', 'Logged out successfully.');
    res.redirect('/auth/login');
  });
});

router.post('/auth/verify-telegram', async (req, res) => {
  try {
    const { temp_code } = req.body;
    const user = await User.findOne({ temp_code });
    if (!user) {
      req.flash('error', 'The 4-digit code you entered is incorrect. Please try again.');
      console.log(`Verification failed - Invalid code: ${temp_code}`);
      return res.status(400).redirect('/auth/verify-telegram');
    }

    if (user.telegram_chat_id) {
      req.flash('success', 'Account already verified.');
      return res.redirect('/auth/login');
    }

    user.account_status = 'active';
    user.temp_code = undefined;
    await user.save();
    req.session.userRole = user.user_role;
    req.flash('success', 'Account verified successfully. Please log in.');
    res.redirect('/auth/login');
  } catch (error) {
    console.error('Verification error:', error.message, error.stack);
    req.flash('error', 'Verification failed. Please try again.');
    res.status(500).redirect('/auth/verify-telegram');
  }
});

router.get('/licenses/admin/user-management', [isAuthenticated, checkRole(['admin', 'supervisor', 'supplier'])], async (req, res) => {
  try {
    let users;
    if (req.session.userRole === 'admin') {
      users = await User.find({});
    } else if (req.session.userRole === 'supervisor') {
      users = await User.find({ supervisor: req.session.userId });
    } else if (req.session.userRole === 'supplier') {
      users = await User.find({ supervisor: req.session.userId });
    }
    const supervisors = await User.find({ user_role: 'supervisor' });
    const suppliers = await User.find({ user_role: 'supplier' });
    res.render('user_management', { users, supervisors, suppliers, req });
  } catch (error) {
    console.error('Error navigating to user management page:', error.message, error.stack);
    req.flash('error', 'Error navigating to user management page');
    res.redirect('/');
  }
});

router.post('/licenses/admin/user-management/update-role', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
  try {
    const { userId, userRole } = req.body;
    const validRoles = ['no_permissions', 'representative', 'supervisor', 'admin', 'supplier'];
    if (!validRoles.includes(userRole)) {
      req.flash('error', 'Invalid role specified');
      console.log(`Invalid role specified: ${userRole}`);
      return res.redirect('/licenses/admin/user-management');
    }
    await User.findByIdAndUpdate(userId, { user_role: userRole });

    req.flash('success', 'User role updated successfully.');
    res.redirect('/licenses/admin/user-management');
  } catch (error) {
    console.error('Error updating user role:', error.message, error.stack);
    req.flash('error', 'Error updating user role');
    res.redirect('/licenses/admin/user-management');
  }
});

router.post('/licenses/admin/user-management/update-supervisor', [isAuthenticated, checkRole(['admin', 'supervisor', 'supplier'])], async (req, res) => {
  try {
    const { userId, supervisorId } = req.body;
    const supervisor = await User.findById(supervisorId);
    if (!supervisor || (supervisor.user_role !== 'supervisor' && supervisor.user_role !== 'supplier')) {
      req.flash('error', 'Invalid supervisor or supplier specified');
      return res.redirect('/licenses/admin/user-management');
    }
    await User.findByIdAndUpdate(userId, { supervisor: supervisorId });
    req.flash('success', 'Supervisor or supplier updated successfully.');
    res.redirect('/licenses/admin/user-management');
  } catch (error) {
    console.error('Error updating supervisor:', error.message, error.stack);
    req.flash('error', 'Error updating supervisor');
    res.redirect('/licenses/admin/user-management');
  }
});

router.post('/licenses/admin/user-management/delete', [isAuthenticated, checkRole(['admin'])], async (req, res) => {
  try {
    const { userId } = req.body;
    await User.findByIdAndDelete(userId);
    req.flash('success', 'User deleted successfully.');
    res.redirect('/licenses/admin/user-management');
  } catch (error) {
    console.error('Error deleting user:', error.message, error.stack);
    req.flash('error', 'Error deleting user');
    res.redirect('/licenses/admin/user-management');
  }
});

router.post('/licenses/admin/user-management/change-password', [isAuthenticated, checkRole(['admin', 'supervisor', 'supplier'])], async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      req.flash('error', 'User not found');
      return res.status(404).redirect('/licenses/admin/user-management');
    }

    user.password = newPassword; // تعيين كلمة المرور الجديدة
    await user.save(); // سيتم تشفير كلمة المرور هنا بواسطة الـ pre('save') hook في نموذج المستخدم

    req.flash('success', 'Password updated successfully');
    res.redirect('/licenses/admin/user-management');
  } catch (error) {
    console.error('Error updating password:', error.message, error.stack);
    req.flash('error', 'Error updating password. Please try again.');
    res.status(500).redirect('/licenses/admin/user-management');
  }
});

// الحصول على قائمة المستخدمين للقائمة المنسدلة
router.get('/api/users/list', isAuthenticated, checkRole(['admin', 'supervisor', 'supplier']), async (req, res) => {
  try {
    let query = {};
    const { search } = req.query;

    // تحديد المستخدمين بناءً على دور المستخدم الحالي
    if (req.session.userRole === 'supervisor') {
      query.$or = [
        { _id: req.session.userId }, // إضافة المشرف نفسه
        { supervisor: req.session.userId } // إضافة المرؤوسين
      ];
    } else if (req.session.userRole === 'supplier') {
      query.supervisor = req.session.userId;
    }

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { full_name: { $regex: search, $options: 'i' } },
        { company_name: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('username full_name company_name _id')
      .sort({ username: 1 });

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'حدث خطأ أثناء جلب قائمة المستخدمين' });
  }
});

module.exports = router;
