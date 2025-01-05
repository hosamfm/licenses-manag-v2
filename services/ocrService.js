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
                tessedit_char_whitelist: 'ABCDEF0123456789R',
                tessedit_pageseg_mode: '7', // وضع السطر الواحد
                preserve_interword_spaces: '0',
                tessjs_create_box: '0',
                tessjs_create_unlv: '0',
                tessjs_create_osd: '0'
            });
        }
    }

    async preprocessImage(imageBuffer, rotation = 0) {
        try {
            let processedImage = sharp(imageBuffer)
                .grayscale()
                .normalize() // تطبيع التباين
                .modulate({
                    brightness: 1.2, // زيادة السطوع قليلاً
                    contrast: 1.4    // زيادة التباين
                })
                .sharpen({
                    sigma: 1.5,
                    m1: 1.5,
                    m2: 0.7
                })
                .threshold(150); // تحويل إلى أبيض وأسود نقي

            // تطبيق التدوير إذا تم تحديده
            if (rotation !== 0) {
                processedImage = processedImage.rotate(rotation);
            }

            return await processedImage.toBuffer();
        } catch (error) {
            console.error('Error preprocessing image:', error);
            return imageBuffer;
        }
    }

    async recognizeText(imageBuffer) {
        try {
            await this.initialize();
            
            // المحاولات مع زوايا مختلفة
            const rotations = [0, 90, 270, 180];
            
            for (const rotation of rotations) {
                // معالجة الصورة مع التدوير
                const processedImage = await this.preprocessImage(imageBuffer, rotation);
                
                // التعرف على النص
                const { data: { text, confidence } } = await this.worker.recognize(processedImage);
                
                // تنظيف وتحقق من النص
                const cleanedText = this.validateAndCleanCode(text);
                
                // إذا وجدنا كوداً صالحاً ونسبة الثقة جيدة
                if (cleanedText && confidence > 60) {
                    console.log(`Found valid code with rotation ${rotation}° and confidence ${confidence}%`);
                    return cleanedText;
                }
            }
            
            return null;
        } catch (error) {
            console.error('OCR Error:', error);
            throw error;
        }
    }

    validateAndCleanCode(text) {
        if (!text) return null;
        
        // إزالة المسافات والأحرف الخاصة
        let code = text.replace(/[^A-F0-9R]/g, '').toUpperCase();
        
        // التحقق من الطول والتنسيق
        if (code.length === 16 && code.startsWith('R')) {
            // التحقق من أن جميع الأحرف صالحة
            if (/^R[0-9A-F]{15}$/.test(code)) {
                return code;
            }
        }
        
        return null;
    }

    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
}

module.exports = new OCRService();
