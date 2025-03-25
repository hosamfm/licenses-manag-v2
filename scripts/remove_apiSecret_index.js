/**
 * سكريبت لإزالة الفهرس الفريد لحقل apiSecret من مجموعة SemClient في قاعدة البيانات
 * 
 * طريقة الاستخدام:
 * 1. تأكد من إيقاف تشغيل الخادم الرئيسي
 * 2. قم بتشغيل node scripts/remove_apiSecret_index.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../services/loggerService');

async function removeApiSecretIndex() {
    try {
        if (!process.env.DATABASE_URL) {
            console.error("خطأ: متغير بيئة DATABASE_URL غير محدد. يرجى التحقق من ملف .env");
            process.exit(-1);
        }

        console.log('جاري الاتصال بقاعدة البيانات...');
        await mongoose.connect(process.env.DATABASE_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        console.log('تم الاتصال بقاعدة البيانات بنجاح');
        
        // الوصول إلى مجموعة SemClient مباشرة
        const db = mongoose.connection.db;
        const collection = db.collection('semclients');

        // إزالة الفهرس الخاص بحقل apiSecret
        await collection.dropIndex('apiSecret_1');
        
        console.log('تم إزالة الفهرس الخاص بحقل apiSecret بنجاح');
        
    } catch (error) {
        console.error('حدث خطأ أثناء إزالة الفهرس:', error);
        
        // في حالة أن الفهرس غير موجود
        if (error.code === 27) {
            console.log('الفهرس غير موجود بالفعل');
        }
    } finally {
        // إغلاق الاتصال بقاعدة البيانات
        await mongoose.connection.close();
        console.log('تم إغلاق الاتصال بقاعدة البيانات');
    }
}

// تنفيذ الدالة
removeApiSecretIndex();
