const mongoose = require('mongoose');
// استبدل './models/Conversation' و './models/WhatsappMessage' بالمسارات الصحيحة لنماذجك
const Conversation = require('./models/Conversation'); 
const WhatsappMessage = require('./models/WhatsappMessageModel'); // تأكد من استخدام الاسم الصحيح للنموذج

// --- قم بتكوين اتصال قاعدة البيانات هنا ---
const MONGODB_URI = 'mongodb://root:8u%246Y%26B2%40u%2AJ4@134.209.232.57:27017/licenses-manag?authSource=admin'; 

async function runMigration() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB.');

    // 1. البحث عن أرقام الهواتف المكررة
    console.log('Finding duplicate phone numbers...');
    const duplicatePhoneNumbers = await Conversation.aggregate([
      {
        $group: {
          _id: '$phoneNumber', // تجميع حسب رقم الهاتف
          count: { $sum: 1 }, // حساب عدد المحادثات لكل رقم
          conversationIds: { $push: '$_id' }, // جمع معرفات المحادثات
        },
      },
      {
        $match: {
          count: { $gt: 1 }, // اختيار الأرقام التي لديها أكثر من محادثة واحدة
        },
      },
    ]);

    console.log(`Found ${duplicatePhoneNumbers.length} phone numbers with duplicate conversations.`);

    if (duplicatePhoneNumbers.length === 0) {
      console.log('No duplicate conversations found based on phone number. Migration not needed.');
      return;
    }

    let mergedCount = 0;
    let errorsCount = 0;

    // 2. المرور على كل رقم هاتف مكرر
    for (const duplicate of duplicatePhoneNumbers) {
      const phoneNumber = duplicate._id;
      const conversationIds = duplicate.conversationIds; // [ ObjectId('conv1'), ObjectId('conv2'), ... ]

      console.log(`\nProcessing phone number: ${phoneNumber} with conversations: ${conversationIds.join(', ')}`);

      try {
        // 3. تحديد المحادثة الأساسية بناءً على آخر رسالة واردة
        let primaryConversationId = null;
        let targetChannelId = null;

        const latestIncomingMessage = await WhatsappMessage.findOne({
          conversationId: { $in: conversationIds }, // البحث ضمن المحادثات المرشحة
          direction: 'incoming', // فقط الرسائل الواردة
        })
          .sort({ timestamp: -1 }) // ترتيب تنازلي حسب الوقت
          .lean(); // للحصول على كائن JavaScript بسيط

        if (latestIncomingMessage) {
          primaryConversationId = latestIncomingMessage.conversationId;
          console.log(`  Primary conversation identified by latest incoming message: ${primaryConversationId}`);
          // الحصول على channelId الصحيح من المحادثة الأساسية المختارة
          const primaryConvDoc = await Conversation.findById(primaryConversationId).lean();
          if (primaryConvDoc) {
              targetChannelId = primaryConvDoc.channelId;
              console.log(`  Target channelId from primary conversation: ${targetChannelId}`);
          } else {
               console.warn(`  Could not find primary conversation ${primaryConversationId} to get channelId.`);
               // يمكنك اختيار آلية احتياطية هنا إذا لزم الأمر
          }

        } else {
          // حالة احتياطية: لا توجد رسائل واردة، اختر الأحدث بناءً على lastMessageAt
          console.warn(`  No incoming messages found for ${phoneNumber}. Selecting primary based on lastMessageAt.`);
          const latestConversation = await Conversation.findOne({
            _id: { $in: conversationIds },
          })
            .sort({ lastMessageAt: -1 }) // الأحدث أولاً
            .lean();
          
          if (latestConversation) {
            primaryConversationId = latestConversation._id;
            targetChannelId = latestConversation.channelId; // استخدام channelId من هذه المحادثة
            console.log(`  Primary conversation fallback selected: ${primaryConversationId} with channelId: ${targetChannelId}`);
          }
        }

        // إذا لم نتمكن من تحديد محادثة أساسية، نتخطى هذا الرقم
        if (!primaryConversationId || !targetChannelId) {
          console.error(`  Could not determine primary conversation for ${phoneNumber}. Skipping.`);
          errorsCount++;
          continue;
        }

        // 4. تحديد معرفات المحادثات القديمة (التي سيتم حذفها)
        const oldConversationIds = conversationIds.filter(
          (id) => !id.equals(primaryConversationId) // استخدام .equals للمقارنة بين ObjectIds
        );

        console.log(`  Primary conversation: ${primaryConversationId}`);
        console.log(`  Old conversations to merge/delete: ${oldConversationIds.join(', ')}`);

        // 5. (اختياري ولكن آمن) التأكد من تحديث channelId في المحادثة الأساسية
        // قد يكون هذا ضرورياً إذا تم اختيار المحادثة الأساسية بالآلية الاحتياطية
        await Conversation.updateOne(
            { _id: primaryConversationId },
            { $set: { channelId: targetChannelId } }
        );
        console.log(`  Ensured primary conversation ${primaryConversationId} has channelId ${targetChannelId}.`);


        // 6. تحديث الرسائل لـتوجيهها إلى المحادثة الأساسية
        if (oldConversationIds.length > 0) {
          const updateResult = await WhatsappMessage.updateMany(
            { conversationId: { $in: oldConversationIds } }, // البحث عن الرسائل المرتبطة بالمحادثات القديمة
            { $set: { conversationId: primaryConversationId } } // تحديثها لترتبط بالمحادثة الأساسية
          );
          console.log(`  Updated ${updateResult.modifiedCount} messages to point to primary conversation ${primaryConversationId}.`);
        } else {
           console.log('  No old conversation IDs found, skipping message update.');
        }

        // 7. حذف المحادثات المكررة (القديمة)
        if (oldConversationIds.length > 0) {
          const deleteResult = await Conversation.deleteMany({
            _id: { $in: oldConversationIds },
          });
          console.log(`  Deleted ${deleteResult.deletedCount} duplicate conversation documents.`);
        } else {
           console.log('  No old conversation IDs found, skipping conversation deletion.');
        }

        mergedCount++;

      } catch (error) {
        console.error(`  Error processing phone number ${phoneNumber}:`, error);
        errorsCount++;
      }
    }

    console.log('\n--- Migration Summary ---');
    console.log(`Processed ${duplicatePhoneNumbers.length} phone numbers with duplicates.`);
    console.log(`Successfully merged conversations for ${mergedCount} phone numbers.`);
    console.log(`Encountered errors for ${errorsCount} phone numbers.`);

  } catch (error) {
    console.error('Migration script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

// تشغيل السكربت
runMigration(); 