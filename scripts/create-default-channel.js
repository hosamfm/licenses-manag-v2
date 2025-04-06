/**
 * سكريبت لإنشاء قناة واتساب افتراضية
 * 
 * كيفية الاستخدام:
 * node scripts/create-default-channel.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// تحميل النماذج
const WhatsAppChannelSchema = require('../models/WhatsAppChannel');
const MetaWhatsappSettingsSchema = require('../models/MetaWhatsappSettings');

async function createDefaultChannel() {
  try {
    console.log('جاري الاتصال بقاعدة البيانات...');
    
    // الاتصال بقاعدة البيانات
    await mongoose.connect(process.env.DATABASE_URL);
    console.log('تم الاتصال بقاعدة البيانات بنجاح!');
    
    // البحث عن إعدادات واتساب
    const MetaWhatsappSettings = mongoose.model('MetaWhatsappSettings');
    const settings = await MetaWhatsappSettings.findOne({}).sort({ createdAt: -1 });
    
    if (!settings) {
      console.error('لم يتم العثور على أي إعدادات واتساب!');
      process.exit(1);
    }
    
    console.log('تم العثور على إعدادات واتساب:', {
      settingsId: settings._id,
      phoneNumberId: settings.config?.phoneNumberId,
      businessAccountId: settings.config?.businessAccountId
    });
    
    // التحقق من وجود قناة افتراضية
    const WhatsAppChannel = mongoose.model('WhatsAppChannel');
    const existingChannel = await WhatsAppChannel.findOne({ 
      name: 'القناة الافتراضية'
    });
    
    if (existingChannel) {
      console.log('توجد قناة افتراضية بالفعل:', {
        channelId: existingChannel._id,
        name: existingChannel.name,
        isActive: existingChannel.isActive
      });
      
      // تحديث القناة الموجودة لتكون نشطة
      if (!existingChannel.isActive) {
        existingChannel.isActive = true;
        existingChannel.settingsId = settings._id;
        await existingChannel.save();
        console.log('تم تحديث القناة الافتراضية لتكون نشطة!');
      }
      
      process.exit(0);
    }
    
    // إنشاء قناة افتراضية جديدة
    const defaultChannel = await WhatsAppChannel.create({
      name: 'القناة الافتراضية',
      description: 'القناة الافتراضية لمحادثات واتساب - أنشئت تلقائياً',
      isActive: true,
      settingsId: settings._id,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    console.log('تم إنشاء قناة افتراضية بنجاح!', {
      channelId: defaultChannel._id,
      name: defaultChannel.name,
      settingsId: defaultChannel.settingsId
    });
    
    process.exit(0);
    
  } catch (error) {
    console.error('حدث خطأ أثناء إنشاء القناة الافتراضية:', error);
    process.exit(1);
  }
}

createDefaultChannel();
