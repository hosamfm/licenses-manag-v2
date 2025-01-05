const express = require('express');
const router = express.Router();
const multer = require('multer');
const ocrService = require('../services/ocrService');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

router.post('/api/ocr', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const imageBuffer = req.file.buffer;
        const recognizedText = await ocrService.recognizeText(imageBuffer);
        
        res.json({ text: recognizedText });
    } catch (error) {
        console.error('OCR Error:', error);
        res.status(500).json({ error: 'Failed to process image' });
    }
});

module.exports = router;
