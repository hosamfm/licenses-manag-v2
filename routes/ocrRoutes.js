const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const ocrService = require('../services/ocrService');

// تكوين multer لتخزين الصور مؤقتاً في الذاكرة
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // الحد الأقصى 5 ميجابايت
    },
    fileFilter: (req, file, cb) => {
        // قبول الصور فقط
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('يرجى رفع ملف صورة صالح'));
        }
    }
});

router.post('/api/ocr', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'لم يتم تحديد ملف' });
        }

        // معالجة الصورة قبل إرسالها إلى خدمة OCR
        const processedImageBuffer = await sharp(req.file.buffer)
            .resize(1000, null, { // تحجيم الصورة مع الحفاظ على النسبة
                fit: 'contain',
                withoutEnlargement: true
            })
            .jpeg({ quality: 90 }) // تحويل إلى JPEG مع جودة عالية
            .toBuffer();

        // إرسال الصورة المعالجة إلى خدمة OCR
        const text = await ocrService.recognizeText(processedImageBuffer);
        
        res.json({ text });
    } catch (error) {
        console.error('Error in OCR route:', error);
        res.status(500).json({ 
            error: error.message || 'حدث خطأ أثناء معالجة الصورة'
        });
    }
});

module.exports = router;
