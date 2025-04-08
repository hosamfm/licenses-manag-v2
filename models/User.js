const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    unique: true, 
    required: true,
    match: /^[a-zA-Z0-9.-]+$/ // Allow only English letters, numbers, dots, and hyphens
  },
  password: { type: String, required: true },
  full_name: { type: String, required: true },
  email: {
    type: String,
    unique: true,
    lowercase: true,
    match: /^\S+@\S+\.\S+$/
  },
  phone_number: { 
    type: String, 
    required: true,
    match: /^(0|\+)[0-9]+$/ // Allow only numbers starting with 0 or +
  },
  company_name: { type: String, required: true, default: 'Default Company' },
  telegram_chat_id: { type: String },
  profile_picture: {
    type: String,
    default: null 
  },
  account_status: { 
    type: String, 
    enum: ['active', 'inactive'], 
    default: 'inactive' 
  },
  user_role: { 
    type: String, 
    enum: ['no_permissions', 'representative', 'supervisor', 'admin', 'supplier'], // Added 'supplier'
    default: 'no_permissions' 
  },
  can_access_conversations: {
    type: Boolean,
    default: false
  },
  enable_general_notifications: {
    type: Boolean,
    default: true
  },
  notify_assigned_conversation: {
    type: Boolean,
    default: true
  },
  notify_unassigned_conversation: {
    type: Boolean,
    default: true
  },
  notify_any_message: {
    type: Boolean,
    default: true
  },
  temp_code: { type: String },
  subordinates: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  webPushSubscriptions: [{
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true }
    }
  }]
});

userSchema.pre('save', async function(next) {
  const user = this;
  if (!user.isModified('password')) return next();
  try {
    user.password = await bcrypt.hash(user.password, 10);
    next();
  } catch (err) {
    console.error('Error hashing password:', err.message, err.stack);
    next(err);
  }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
