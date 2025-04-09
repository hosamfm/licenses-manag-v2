const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  crystalSupplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: false
  },
  sirajSupplier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
    required: false
  },
  aiAssistantEnabled: {
    type: Boolean,
    default: true
  },
  autoAssignAI: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);

module.exports = SystemSettings;