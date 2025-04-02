/**
 * خدمة تخزين الملفات باستخدام Cloudflare R2
 * هذه الخدمة تتعامل مع تحميل وتنزيل وإدارة الملفات على خدمة Cloudflare R2
 */

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const logger = require('./loggerService');
const axios = require('axios');
const { Readable } = require('stream');

// إعدادات Cloudflare R2 من متغيرات البيئة
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_ENDPOINT = process.env.R2_ENDPOINT;

// إنشاء خادم S3 متصل بـ Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/**
 * تحميل ملف إلى Cloudflare R2 من URL
 * @param {string} url - رابط الملف المراد تحميله
 * @param {string} fileName - اسم الملف الذي سيتم حفظه به
 * @param {string} mimeType - نوع الملف (MIME Type)
 * @param {string} folder - المجلد الذي سيتم تخزين الملف فيه (اختياري)
 * @returns {Promise<object>} - معلومات الملف المخزن
 */
exports.uploadFileFromUrl = async (url, fileName, mimeType, folder = 'whatsapp') => {
  try {
    logger.info('storageService', 'بدء تحميل ملف من URL', { url, fileName });

    // تنزيل الملف من URL
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const fileBuffer = Buffer.from(response.data);

    // إنشاء مسار كامل للملف في R2
    const r2Key = folder ? `${folder}/${fileName}` : fileName;

    // تحميل الملف إلى R2
    await s3Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: mimeType,
    }));

    // إنشاء رابط مؤقت للملف (صالح لمدة 24 ساعة)
    const expiresIn = 60 * 60 * 24; // 24 ساعة
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
    });
    const publicUrl = await getSignedUrl(s3Client, command, { expiresIn });

    logger.info('storageService', 'تم تحميل الملف بنجاح', { fileName, r2Key });

    // إرجاع معلومات الملف المخزن
    return {
      success: true,
      r2Key,
      fileName,
      mimeType,
      publicUrl,
      size: fileBuffer.length,
    };
  } catch (error) {
    logger.error('storageService', 'خطأ في تحميل الملف من URL', { url, error: error.message });
    throw new Error(`فشل في تحميل الملف: ${error.message}`);
  }
};

/**
 * تحميل ملف إلى Cloudflare R2 من بيانات ثنائية (Buffer)
 * @param {Buffer} fileBuffer - بيانات الملف
 * @param {string} fileName - اسم الملف الذي سيتم حفظه به
 * @param {string} mimeType - نوع الملف (MIME Type)
 * @param {string} folder - المجلد الذي سيتم تخزين الملف فيه (اختياري)
 * @returns {Promise<object>} - معلومات الملف المخزن
 */
exports.uploadFileFromBuffer = async (fileBuffer, fileName, mimeType, folder = 'whatsapp') => {
  try {
    logger.info('storageService', 'بدء تحميل ملف من Buffer', { fileName, size: fileBuffer.length });

    // إنشاء مسار كامل للملف في R2
    const r2Key = folder ? `${folder}/${fileName}` : fileName;

    // تحميل الملف إلى R2
    await s3Client.send(new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: mimeType,
    }));

    // إنشاء رابط مؤقت للملف (صالح لمدة 24 ساعة)
    const expiresIn = 60 * 60 * 24; // 24 ساعة
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
    });
    const publicUrl = await getSignedUrl(s3Client, command, { expiresIn });

    logger.info('storageService', 'تم تحميل الملف بنجاح', { fileName, r2Key });

    // إرجاع معلومات الملف المخزن
    return {
      success: true,
      r2Key,
      fileName,
      mimeType,
      publicUrl,
      size: fileBuffer.length,
    };
  } catch (error) {
    logger.error('storageService', 'خطأ في تحميل الملف من Buffer', { error: error.message });
    throw new Error(`فشل في تحميل الملف: ${error.message}`);
  }
};

/**
 * إنشاء رابط مؤقت للوصول إلى ملف
 * @param {string} r2Key - المسار الكامل للملف في R2
 * @param {number} expiresIn - عدد الثواني التي يستمر فيها الرابط صالحًا (الافتراضي 24 ساعة)
 * @returns {Promise<string>} - الرابط المؤقت
 */
exports.getSignedUrl = async (r2Key, expiresIn = 60 * 60 * 24) => {
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    logger.info('storageService', 'تم إنشاء رابط مؤقت', { r2Key, expiresIn });
    return url;
  } catch (error) {
    logger.error('storageService', 'خطأ في إنشاء رابط مؤقت', { r2Key, error: error.message });
    throw new Error(`فشل في إنشاء رابط مؤقت: ${error.message}`);
  }
};

/**
 * حذف ملف من التخزين
 * @param {string} r2Key - المسار الكامل للملف في R2
 * @returns {Promise<object>} - نتيجة الحذف
 */
exports.deleteFile = async (r2Key) => {
  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
    }));

    logger.info('storageService', 'تم حذف الملف بنجاح', { r2Key });
    return { success: true, message: 'تم حذف الملف بنجاح' };
  } catch (error) {
    logger.error('storageService', 'خطأ في حذف الملف', { r2Key, error: error.message });
    throw new Error(`فشل في حذف الملف: ${error.message}`);
  }
};

/**
 * تنزيل ملف من التخزين إلى بيانات ثنائية (Buffer)
 * @param {string} r2Key - المسار الكامل للملف في R2
 * @returns {Promise<Buffer>} - بيانات الملف
 */
exports.downloadFile = async (r2Key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
    });

    const response = await s3Client.send(command);
    const stream = response.Body;

    // تحويل Stream إلى Buffer
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  } catch (error) {
    logger.error('storageService', 'خطأ في تنزيل الملف', { r2Key, error: error.message });
    throw new Error(`فشل في تنزيل الملف: ${error.message}`);
  }
};

/**
 * توليد اسم فريد للملف
 * @param {string} originalName - الاسم الأصلي للملف
 * @returns {string} - اسم فريد للملف
 */
exports.generateUniqueFileName = (originalName) => {
  const fileExt = path.extname(originalName);
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomString}${fileExt}`;
};

/**
 * استخراج نوع MIME من امتداد الملف
 * @param {string} fileName - اسم الملف
 * @returns {string} - نوع MIME
 */
exports.getMimeTypeFromFileName = (fileName) => {
  const ext = path.extname(fileName).toLowerCase().substring(1);
  
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'mp3': 'audio/mpeg',
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'txt': 'text/plain',
    'zip': 'application/zip',
    'rar': 'application/x-rar-compressed',
    'ogg': 'audio/ogg',
    'wav': 'audio/wav',
    'webm': 'video/webm',
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
};
