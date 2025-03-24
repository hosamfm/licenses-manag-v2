const SemClient = require('../models/SemClient');
const SemMessage = require('../models/SemMessage');
const logger = require('../services/loggerService');

/**
 * إرسال رسالة باستخدام مفتاح API
 */
exports.sendMessage = async (req, res) => {
    try {
        const { token, phone, msg } = req.query;

        // التحقق من توفر البيانات المطلوبة
        if (!token || !phone || !msg) {
            return res.status(400).send("2"); // كود خطأ 2: بيانات غير مكتملة
        }

        // التحقق من صحة مفتاح API
        const client = await SemClient.validateApiCredentials(token);
        if (!client) {
            logger.error(`محاولة استخدام مفتاح API غير صالح: ${token}`);
            return res.status(401).send("3"); // كود خطأ 3: مفتاح API غير صالح
        }

        // التحقق من الحدود اليومية والشهرية
        const withinDailyLimit = await client.checkDailyLimit();
        if (!withinDailyLimit) {
            logger.warn(`العميل ${client.name} تجاوز الحد اليومي للرسائل`);
            return res.status(429).send("4"); // كود خطأ 4: تجاوز الحد اليومي
        }

        const withinMonthlyLimit = await client.checkMonthlyLimit();
        if (!withinMonthlyLimit) {
            logger.warn(`العميل ${client.name} تجاوز الحد الشهري للرسائل`);
            return res.status(429).send("5"); // كود خطأ 5: تجاوز الحد الشهري
        }

        // إنشاء سجل للرسالة
        const newMessage = new SemMessage({
            clientId: client._id,
            recipients: [phone],
            content: msg,
            status: 'pending'
        });

        // حفظ الرسالة في قاعدة البيانات
        await newMessage.save();

        // هنا ستكون الشيفرة الفعلية لإرسال الرسالة SMS عبر خدمة خارجية
        // للتبسيط، سنفترض أن الرسالة تم إرسالها بنجاح

        // تحديث حالة الرسالة
        newMessage.status = 'sent';
        newMessage.sentAt = new Date();
        newMessage.messageId = 'MSG_' + Date.now();
        await newMessage.save();

        // زيادة عدد الرسائل المرسلة للعميل
        client.messagesSent += 1;
        await client.save();

        logger.info(`تم إرسال رسالة بنجاح للعميل ${client.name} إلى ${phone}`);

        // إعادة استجابة نجاح مبسطة (رقم فقط)
        return res.status(200).send("1");

    } catch (error) {
        logger.error('خطأ في إرسال الرسالة:', error);
        return res.status(500).send("6");
    }
};

/**
 * التحقق من الرصيد المتبقي للعميل
 */
exports.checkBalance = async (req, res) => {
    try {
        const { token } = req.query;

        // التحقق من توفر مفتاح API
        if (!token) {
            return res.status(400).send("2"); // كود خطأ 2: بيانات غير مكتملة
        }

        // التحقق من صحة مفتاح API
        const client = await SemClient.validateApiCredentials(token);
        if (!client) {
            logger.error(`محاولة استخدام مفتاح API غير صالح: ${token}`);
            return res.status(401).send("3"); // كود خطأ 3: مفتاح API غير صالح
        }

        // حاليًا نعيد قيمة 0 كما هو مطلوب
        // سيتم تنفيذ وظيفة معرفة الرصيد الحقيقي لاحقًا
        return res.status(200).send("0");

    } catch (error) {
        logger.error('خطأ في التحقق من الرصيد:', error);
        return res.status(500).send("6");
    }
};
