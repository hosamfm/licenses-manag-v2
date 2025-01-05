const Tesseract = require('tesseract.js');
const sharp = require('sharp');

class OCRService {
    constructor() {
        this.worker = null;
    }

    async initialize() {
        if (!this.worker) {
            this.worker = await Tesseract.createWorker();
            await this.worker.loadLanguage('eng');
            await this.worker.initialize('eng');
            await this.worker.setParameters({
                tessedit_char_whitelist: 'ABCDEF0123456789RX',
                tessedit_pageseg_mode: '6', // تحسين للنص المنفرد
                preserve_interword_spaces: '1',
                tessjs_create_pdf: '0',
                tessjs_create_hocr: '0',
                tessjs_create_tsv: '0',
                tessjs_create_box: '0',
                tessjs_create_unlv: '0',
                tessjs_create_osd: '0'
            });
        }
    }

    async preprocessImage(imageBuffer) {
        try {
            // تحويل الصورة إلى تدرجات الرمادي وتحسين التباين
            const processedBuffer = await sharp(imageBuffer)
                .grayscale() // تحويل إلى تدرجات الرمادي
                .normalize() // تطبيع التباين
                .modulate({
                    brightness: 1.2, // زيادة السطوع قليلاً
                    contrast: 1.4    // زيادة التباين
                })
                .sharpen({
                    sigma: 1.5,      // حدة معتدلة
                    m1: 1.5,
                    m2: 0.7
                })
                .threshold(128)      // تحويل إلى أبيض وأسود
                .toBuffer();

            return processedBuffer;
        } catch (error) {
            console.error('Error preprocessing image:', error);
            return imageBuffer; // إرجاع الصورة الأصلية في حالة الفشل
        }
    }

    isValidHexCode(code) {
        if (!code || typeof code !== 'string') return false;

        // التحقق من أن الكود يبدأ بـ R أو X
        if (!code.startsWith('R') && !code.startsWith('X')) {
            return false;
        }
        
        // التحقق من الطول (17 أو 18 حرفاً)
        if (code.length !== 17 && code.length !== 18) {
            return false;
        }
        
        // التحقق من أن باقي الأحرف هي ست عشرية صالحة (0-9 و A-F)
        const hexPart = code.substring(1);
        return /^[0-9A-F]+$/i.test(hexPart);
    }

    findPossibleCodes(text) {
        const possibleCodes = [];
        
        // تنظيف النص
        const cleanText = text.replace(/[^A-F0-9RX\n\s]/gi, '')
            .toUpperCase()
            .split(/[\n\s]+/)
            .filter(line => line.length > 0);
        
        for (const line of cleanText) {
            // البحث عن الأنماط المحتملة للكود
            for (let i = 0; i <= line.length - 17; i++) {
                const potentialCode = line.substr(i, 18);
                if (this.isValidHexCode(potentialCode)) {
                    possibleCodes.push(potentialCode);
                }
                // محاولة مع 17 حرفاً أيضاً
                const shorterCode = line.substr(i, 17);
                if (this.isValidHexCode(shorterCode)) {
                    possibleCodes.push(shorterCode);
                }
            }
        }
        
        return [...new Set(possibleCodes)]; // إزالة التكرارات
    }

    async recognizeText(imageData) {
        try {
            await this.initialize();
            
            // معالجة الصورة
            const processedImage = await this.preprocessImage(imageData);
            
            // محاولات متعددة مع إعدادات مختلفة
            const attempts = [
                { rotate: 0 },
                { rotate: 90 },
                { rotate: 270 },
                { rotate: 180 }
            ];

            for (const attempt of attempts) {
                try {
                    const { data: { text } } = await this.worker.recognize(processedImage, {
                        rotate: attempt.rotate
                    });
                    
                    console.log(`Recognized text (rotation ${attempt.rotate}°):`, text);
                    
                    const possibleCodes = this.findPossibleCodes(text);
                    console.log(`Possible codes (rotation ${attempt.rotate}°):`, possibleCodes);
                    
                    if (possibleCodes.length > 0) {
                        return possibleCodes[0];
                    }
                } catch (err) {
                    console.error(`Error in attempt with rotation ${attempt.rotate}°:`, err);
                }
            }
            
            throw new Error('لم يتم العثور على كود ترخيص صالح. الكود يجب أن يبدأ بـ R أو X ويتبعه 16-17 حرف ست عشري (0-9, A-F)');
        } catch (error) {
            console.error('Error in OCR processing:', error);
            throw error;
        }
    }

    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
}

module.exports = new OCRService();
