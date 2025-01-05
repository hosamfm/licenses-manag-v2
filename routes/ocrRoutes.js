const express = require('express');
const router = express.Router();
const multer = require('multer');
const ocrService = require('../services/ocrService');

// التحقق من نوع الملف
const fileFilter = (req, file, cb) => {
    // السماح فقط بأنواع الصور
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('نوع الملف غير مدعوم. يرجى رفع ملف صورة فقط'), false);
    }
};

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1 // ملف واحد فقط
    },
    fileFilter: fileFilter
});

router.post('/api/ocr', upload.single('image'), async (req, res) => {
    try {
        // التحقق من وجود الملف
        if (!req.file) {
            return res.status(400).json({ 
                success: false,
                error: 'لم يتم تقديم ملف صورة' 
            });
        }

        // التحقق من الحد الأدنى لحجم الصورة
        if (req.file.size < 10 * 1024) { // 10KB
            return res.status(400).json({
                success: false,
                error: 'حجم الصورة صغير جداً. يرجى تقديم صورة بجودة أعلى'
            });
        }

        const imageBuffer = req.file.buffer;
        const recognizedText = await ocrService.recognizeText(imageBuffer);
        
        if (!recognizedText) {
            return res.status(422).json({
                success: false,
                error: 'لم يتم العثور على كود صالح في الصورة. تأكد من أن الكود يبدأ بحرف R ويتكون من 16 خانة'
            });
        }
        
        res.json({ 
            success: true,
            code: recognizedText 
        });
    } catch (error) {
        console.error('OCR Error:', error);
        
        // التحقق من نوع الخطأ
        if (error.message.includes('نوع الملف غير مدعوم')) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        
        res.status(500).json({ 
            success: false,
            error: 'حدث خطأ أثناء معالجة الصورة' 
        });
    }
});

module.exports = router;
