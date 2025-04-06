/**
 * متحكم API الخاص بالرسائل
 * يوفر واجهات برمجة لتتبع وتحديث حالة قراءة الرسائل
 */

const WhatsappMessage = require('../../models/WhatsappMessage');
const socketService = require('../../services/socketService');
const logger = require('../../utils/logger');

/**
 * تحديث حالة قراءة الرسالة بإضافة معلومات القارئ
 * طريقة: POST /api/messages/update-read-status
 */
exports.updateReadStatus = async (req, res) => {
  try {
    const { messageId, externalId, conversationId, readBy } = req.body;

    if (!messageId && !externalId) {
      return res.status(400).json({ 
        success: false, 
        message: 'يجب توفير معرف الرسالة أو المعرف الخارجي' 
      });
    }

    if (!readBy || !readBy.userId || !readBy.username) {
      return res.status(400).json({ 
        success: false, 
        message: 'يجب توفير معلومات المستخدم القارئ' 
      });
    }

    // البحث عن الرسالة
    const query = messageId ? { _id: messageId } : { externalMessageId: externalId };
    const message = await WhatsappMessage.findOne(query);

    if (!message) {
      return res.status(404).json({ 
        success: false, 
        message: 'الرسالة غير موجودة' 
      });
    }

    // التأكد من أن الرسالة "واردة" لا يمكن تحديث حالة رسائل أخرى
    if (message.direction !== 'incoming') {
      return res.status(400).json({ 
        success: false, 
        message: 'يمكن فقط تحديث حالة قراءة الرسائل الواردة' 
      });
    }

    // تهيئة مصفوفة القراء إذا لم تكن موجودة
    if (!message.readBy) {
      message.readBy = [];
    }

    // التحقق من أن المستخدم لم يقرأ الرسالة من قبل
    const existingReader = message.readBy.find(reader => reader.userId === readBy.userId);
    if (!existingReader) {
      // إضافة المستخدم إلى قائمة القراء
      message.readBy.push({
        userId: readBy.userId,
        username: readBy.username,
        readAt: readBy.readAt || new Date()
      });

      // تحديث حالة الرسالة إلى "مقروءة"
      message.status = 'read';
      message.readAt = new Date();

      // حفظ التغييرات
      await message.save();

      // إرسال إشعار تحديث حالة الرسالة عبر Socket.io
      if (conversationId) {
        socketService.notifyMessageStatusUpdate(
          conversationId,
          message.externalMessageId || message._id.toString(),
          'read'
        );
      }

      logger.info('messageController', 'تم تحديث حالة قراءة الرسالة', { 
        messageId: message._id, 
        reader: readBy.username 
      });
    }

    return res.status(200).json({ 
      success: true, 
      message: 'تم تحديث حالة قراءة الرسالة بنجاح' 
    });
  } catch (error) {
    logger.error('messageController', 'خطأ في تحديث حالة قراءة الرسالة', { error });
    return res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ أثناء تحديث حالة قراءة الرسالة', 
      error: error.message 
    });
  }
};

/**
 * الحصول على قائمة المستخدمين الذين قرأوا رسالة معينة
 * طريقة: GET /api/messages/:messageId/read-by
 */
exports.getReadBy = async (req, res) => {
  try {
    const { messageId } = req.params;

    if (!messageId) {
      return res.status(400).json({ 
        success: false, 
        message: 'يجب توفير معرف الرسالة' 
      });
    }

    // البحث عن الرسالة
    const message = await WhatsappMessage.findById(messageId);

    if (!message) {
      return res.status(404).json({ 
        success: false, 
        message: 'الرسالة غير موجودة' 
      });
    }

    // إرجاع قائمة القراء
    const readers = message.readBy || [];

    return res.status(200).json({ 
      success: true, 
      readers: readers
    });
  } catch (error) {
    logger.error('messageController', 'خطأ في جلب قائمة قراء الرسالة', { 
      messageId: req.params.messageId, 
      error 
    });
    return res.status(500).json({ 
      success: false, 
      message: 'حدث خطأ أثناء جلب قائمة قراء الرسالة', 
      error: error.message 
    });
  }
}; 