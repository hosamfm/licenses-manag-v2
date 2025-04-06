/**
 * نموذج قنوات واتساب
 * يتيح دعم العديد من قنوات واتساب في النظام
 */
const mongoose = require('mongoose');

const whatsAppChannelSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true
  },
  description: { 
    type: String,
    trim: true
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  settingsId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'MetaWhatsappSettings' 
  },
  createdBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
}, {
  timestamps: true // يضيف تلقائيًا حقول createdAt و updatedAt
});

/**
 * الحصول على القناة النشطة الافتراضية
 * إذا لم تكن هناك قناة، يتم إنشاء قناة افتراضية
 */
whatsAppChannelSchema.statics.getDefaultChannel = async function() {
  try {
    // البحث عن القناة الافتراضية
    let defaultChannel = await this.findOne({ name: 'القناة الافتراضية' });
    
    // إذا لم تكن موجودة، قم بإنشاء قناة افتراضية
    if (!defaultChannel) {
      const MetaWhatsappSettings = mongoose.model('MetaWhatsappSettings');
      const settings = await MetaWhatsappSettings.getActiveSettings();
      
      defaultChannel = await this.create({
        name: 'القناة الافتراضية',
        description: 'القناة الافتراضية لمحادثات واتساب',
        isActive: true,
        settingsId: settings._id
      });
    }
    
    return defaultChannel;
  } catch (error) {
    console.error('خطأ في الحصول على القناة الافتراضية:', error);
    throw error;
  }
};

/**
 * الحصول على القناة حسب معرّف رقم الهاتف
 */
whatsAppChannelSchema.statics.getChannelByPhoneNumberId = async function(phoneNumberId) {
  try {
    const MetaWhatsappSettings = mongoose.model('MetaWhatsappSettings');
    
    // البحث عن الإعدادات المطابقة لرقم الهاتف
    const settings = await MetaWhatsappSettings.findOne({
      'config.phoneNumberId': phoneNumberId
    });
    
    if (!settings) {
      return null;
    }
    
    // البحث عن القناة المرتبطة بهذه الإعدادات
    let channel = await this.findOne({ settingsId: settings._id });
    
    // إذا لم تكن هناك قناة، نعود إلى القناة الافتراضية
    if (!channel) {
      channel = await this.getDefaultChannel();
    }
    
    return channel;
  } catch (error) {
    console.error('خطأ في البحث عن القناة حسب معرّف رقم الهاتف:', error);
    throw error;
  }
};

const WhatsAppChannel = mongoose.model('WhatsAppChannel', whatsAppChannelSchema);

module.exports = WhatsAppChannel;
