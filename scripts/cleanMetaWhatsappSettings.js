/**
 * سكربت لتنظيف سجلات إعدادات واتساب الرسمي وإزالة السجلات المكررة
 * 
 * يقوم هذا السكربت بالبحث عن جميع سجلات إعدادات واتساب الرسمي، 
 * واختيار أحدث سجل يحتوي على بيانات، وحذف باقي السجلات.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const MetaWhatsappSettings = require('../models/MetaWhatsappSettings');

/**
 * اختبار إذا كان السجل يحتوي على بيانات حقيقية
 */
function hasRealData(settings) {
    return (
        settings.config &&
        (
            (settings.config.appId && settings.config.appId.trim() !== '') ||
            (settings.config.accessToken && settings.config.accessToken.trim() !== '') ||
            (settings.config.phoneNumberId && settings.config.phoneNumberId.trim() !== '')
        )
    );
}

/**
 * تنظيف سجلات إعدادات واتساب الرسمي
 */
async function cleanMetaWhatsappSettings() {
    try {
        // الاتصال بقاعدة البيانات
        await mongoose.connect(process.env.DATABASE_URL, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('تم الاتصال بقاعدة البيانات بنجاح');
        
        // الحصول على جميع سجلات إعدادات واتساب الرسمي
        const allSettings = await MetaWhatsappSettings.find({});
        console.log(`تم العثور على ${allSettings.length} سجل إعدادات واتساب رسمي`);
        
        if (allSettings.length === 0) {
            console.log('لا توجد سجلات لتنظيفها');
            return;
        }
        
        if (allSettings.length === 1) {
            console.log('يوجد سجل واحد فقط، لا حاجة للتنظيف');
            return;
        }
        
        // البحث عن السجلات التي تحتوي على بيانات حقيقية
        const settingsWithData = allSettings.filter(hasRealData);
        console.log(`تم العثور على ${settingsWithData.length} سجل يحتوي على بيانات حقيقية`);
        
        let settingToKeep;
        
        if (settingsWithData.length > 0) {
            // ترتيب السجلات حسب تاريخ التحديث (الأحدث أولاً)
            settingsWithData.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            settingToKeep = settingsWithData[0];
            console.log(`سيتم الاحتفاظ بالسجل المحدث بتاريخ: ${settingToKeep.updatedAt}`);
        } else {
            // إذا لم يوجد سجلات بها بيانات، نحتفظ بأحدث سجل
            allSettings.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
            settingToKeep = allSettings[0];
            console.log(`لا توجد سجلات بها بيانات حقيقية، سيتم الاحتفاظ بأحدث سجل بتاريخ: ${settingToKeep.updatedAt}`);
        }
        
        // حذف جميع السجلات الأخرى
        const deleteResult = await MetaWhatsappSettings.deleteMany({ _id: { $ne: settingToKeep._id } });
        console.log(`تم حذف ${deleteResult.deletedCount} سجل مكرر بنجاح`);
        
        // تعيين السجل المتبقي كنشط
        if (!settingToKeep.isActive) {
            settingToKeep.isActive = true;
            await settingToKeep.save();
            console.log('تم تفعيل السجل المتبقي');
        }
        
        console.log('تم تنظيف قاعدة البيانات بنجاح');
    } catch (error) {
        console.error('حدث خطأ أثناء تنظيف قاعدة البيانات:', error);
    } finally {
        // قطع الاتصال بقاعدة البيانات
        await mongoose.disconnect();
        console.log('تم قطع الاتصال بقاعدة البيانات');
    }
}

// تنفيذ الدالة
cleanMetaWhatsappSettings();
