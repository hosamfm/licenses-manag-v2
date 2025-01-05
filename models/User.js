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
  phone_number: { 
    type: String, 
    required: true,
    match: /^(0|\+)[0-9]+$/ // Allow only numbers starting with 0 or +
  },
  company_name: { type: String, required: true, default: 'Default Company' },
  telegram_chat_id: { type: String },
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
  temp_code: { type: String },
  subordinates: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  supervisor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false }
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
