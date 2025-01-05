// models/TelegramMessage.js
const mongoose = require('mongoose');

const TelegramMessageSchema = new mongoose.Schema({
  chatId: { type: Number, required: true },
  username: { type: String },
  firstName: { type: String },
  lastName: { type: String },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  direction: { type: String, enum: ['sent', 'received'], required: true }
});

const TelegramMessage = mongoose.model('TelegramMessage', TelegramMessageSchema);

module.exports = TelegramMessage;
