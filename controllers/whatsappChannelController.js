/**
 * متحكم إدارة قنوات واتساب
 */
const WhatsAppChannel = require('../models/WhatsAppChannel');
const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');
const logger = require('../services/loggerService');
const mongoose = require('mongoose');

/**
 * الحصول على جميع قنوات واتساب
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getChannels(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const channels = await WhatsAppChannel.find()
      .populate('settingsId', 'config.phoneNumberId config.businessAccountId isActive')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();
    
    const total = await WhatsAppChannel.countDocuments();
    
    return res.status(200).json({
      success: true,
      data: {
        channels,
        pagination: {
          total,
          page,
          pages: Math.ceil(total / limit),
          limit
        }
      }
    });
  } catch (error) {
    logger.error('whatsappChannelController', 'خطأ في الحصول على قنوات واتساب', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب قنوات واتساب',
      error: error.message
    });
  }
}

/**
 * إنشاء قناة واتساب جديدة
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function createChannel(req, res) {
  try {
    const { name, description, settingsId, isActive } = req.body;
    
    // التحقق من وجود إعدادات صالحة
    const settings = await MetaWhatsappSettings.findById(settingsId);
    if (!settings) {
      return res.status(400).json({
        success: false,
        message: 'إعدادات واتساب غير موجودة'
      });
    }
    
    // إذا كانت القناة نشطة، تحقق من عدم وجود قنوات نشطة أخرى بنفس الإعدادات
    if (isActive) {
      const existingActiveChannel = await WhatsAppChannel.findOne({
        settingsId,
        isActive: true,
        _id: { $ne: req.params.id } // استثناء القناة الحالية في حالة التعديل
      });
      
      if (existingActiveChannel) {
        return res.status(400).json({
          success: false,
          message: 'توجد قناة نشطة بالفعل تستخدم نفس الإعدادات'
        });
      }
    }
    
    // إنشاء القناة الجديدة
    const channel = await WhatsAppChannel.create({
      name,
      description,
      settingsId,
      isActive,
      createdBy: req.session.userId
    });
    
    logger.info('whatsappChannelController', 'تم إنشاء قناة واتساب جديدة', {
      channelId: channel._id,
      channelName: channel.name,
      userId: req.session.userId
    });
    
    return res.status(201).json({
      success: true,
      data: channel,
      message: 'تم إنشاء قناة واتساب بنجاح'
    });
  } catch (error) {
    logger.error('whatsappChannelController', 'خطأ في إنشاء قناة واتساب', {
      error: error.message,
      stack: error.stack,
      reqBody: req.body
    });
    
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء إنشاء قناة واتساب',
      error: error.message
    });
  }
}

/**
 * الحصول على قناة واتساب معينة بواسطة المعرف
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getChannelById(req, res) {
  try {
    const channel = await WhatsAppChannel.findById(req.params.id)
      .populate('settingsId', 'config.phoneNumberId config.businessAccountId isActive')
      .lean();
    
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: 'قناة واتساب غير موجودة'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: channel
    });
  } catch (error) {
    logger.error('whatsappChannelController', 'خطأ في الحصول على قناة واتساب', {
      error: error.message,
      stack: error.stack,
      channelId: req.params.id
    });
    
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب قناة واتساب',
      error: error.message
    });
  }
}

/**
 * تحديث قناة واتساب
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function updateChannel(req, res) {
  try {
    const { name, description, settingsId, isActive } = req.body;
    
    // التحقق من وجود القناة
    const channel = await WhatsAppChannel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: 'قناة واتساب غير موجودة'
      });
    }
    
    // التحقق من وجود إعدادات صالحة
    if (settingsId) {
      const settings = await MetaWhatsappSettings.findById(settingsId);
      if (!settings) {
        return res.status(400).json({
          success: false,
          message: 'إعدادات واتساب غير موجودة'
        });
      }
    }
    
    // إذا كانت القناة نشطة، تحقق من عدم وجود قنوات نشطة أخرى بنفس الإعدادات
    if (isActive) {
      const existingActiveChannel = await WhatsAppChannel.findOne({
        settingsId: settingsId || channel.settingsId,
        isActive: true,
        _id: { $ne: req.params.id } // استثناء القناة الحالية
      });
      
      if (existingActiveChannel) {
        return res.status(400).json({
          success: false,
          message: 'توجد قناة نشطة بالفعل تستخدم نفس الإعدادات'
        });
      }
    }
    
    // تحديث القناة
    channel.name = name || channel.name;
    channel.description = description || channel.description;
    channel.settingsId = settingsId || channel.settingsId;
    channel.isActive = isActive !== undefined ? isActive : channel.isActive;
    channel.updatedBy = req.user._id;
    channel.updatedAt = new Date();
    
    await channel.save();
    
    logger.info('whatsappChannelController', 'تم تحديث قناة واتساب', {
      channelId: channel._id,
      channelName: channel.name,
      userId: req.user._id
    });
    
    return res.status(200).json({
      success: true,
      data: channel,
      message: 'تم تحديث قناة واتساب بنجاح'
    });
  } catch (error) {
    logger.error('whatsappChannelController', 'خطأ في تحديث قناة واتساب', {
      error: error.message,
      stack: error.stack,
      channelId: req.params.id,
      reqBody: req.body
    });
    
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تحديث قناة واتساب',
      error: error.message
    });
  }
}

/**
 * حذف قناة واتساب
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function deleteChannel(req, res) {
  try {
    const channel = await WhatsAppChannel.findById(req.params.id);
    
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: 'قناة واتساب غير موجودة'
      });
    }
    
    // التحقق من وجود محادثات مرتبطة بالقناة قبل الحذف
    const Conversation = mongoose.model('Conversation');
    const conversationsCount = await Conversation.countDocuments({ channelId: req.params.id });
    
    if (conversationsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `لا يمكن حذف القناة لأنها تحتوي على ${conversationsCount} محادثة. قم بنقل المحادثات إلى قناة أخرى أولاً أو أرشفتها.`
      });
    }
    
    // استخدام deleteOne بدلاً من remove (الأسلوب القديم)
    await WhatsAppChannel.deleteOne({ _id: req.params.id });
    
    logger.info('whatsappChannelController', 'تم حذف قناة واتساب', {
      channelId: req.params.id,
      userId: req.session.userId
    });
    
    return res.status(200).json({
      success: true,
      message: 'تم حذف قناة واتساب بنجاح'
    });
  } catch (error) {
    logger.error('whatsappChannelController', 'خطأ في حذف قناة واتساب', {
      error: error.message,
      stack: error.stack,
      channelId: req.params.id
    });
    
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء حذف قناة واتساب',
      error: error.message
    });
  }
}

/**
 * عرض صفحة إدارة قنوات واتساب
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function renderChannelsPage(req, res) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // الحصول على قنوات واتساب مع التصفح
    const channels = await WhatsAppChannel.find()
      .populate('settingsId', 'config.phoneNumberId config.businessAccountId isActive')
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });
    
    const total = await WhatsAppChannel.countDocuments();
    
    // الحصول على إعدادات واتساب المتاحة للاختيار
    const metaSettings = await MetaWhatsappSettings.find()
      .select('_id config.phoneNumberId config.businessAccountId isActive')
      .lean();
    
    // بيانات المستخدم الحالي
    // إضافة طباعة تشخيصية
    console.log('بيانات المستخدم الحالي:', {
      userId: req.session.userId,
      userRole: req.session.userRole
    });
    
    return res.render('whatsapp_channels', {
      title: 'إدارة قنوات واتساب',
      currentUser: {
        _id: req.session.userId,
        user_role: req.session.userRole
      },
      channels,
      metaSettings,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
        limit
      }
    });
  } catch (error) {
    logger.error('whatsappChannelController', 'خطأ في عرض صفحة إدارة قنوات واتساب', {
      error: error.message,
      stack: error.stack
    });
    
    req.flash('error', 'حدث خطأ أثناء تحميل صفحة إدارة قنوات واتساب');
    return res.redirect('/');
  }
}

/**
 * الحصول على قائمة بإعدادات واتساب المتاحة
 * @param {Object} req - طلب HTTP
 * @param {Object} res - استجابة HTTP
 */
async function getAvailableSettings(req, res) {
  try {
    const settings = await MetaWhatsappSettings.find({ isActive: true })
      .select('_id config.phoneNumberId config.businessAccountId createdAt')
      .lean();
    
    return res.status(200).json({
      success: true,
      data: settings
    });
  } catch (error) {
    logger.error('whatsappChannelController', 'خطأ في الحصول على إعدادات واتساب المتاحة', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء جلب إعدادات واتساب المتاحة',
      error: error.message
    });
  }
}

module.exports = {
  getChannels,
  createChannel,
  getChannelById,
  updateChannel,
  deleteChannel,
  renderChannelsPage,
  getAvailableSettings
};
