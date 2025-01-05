const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const fs = require('fs');

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

    async processImage(imageBuffer) {
        try {
            // تحسين الصورة باستخدام sharp
            const processedBuffer = await sharp(imageBuffer)
                .grayscale() // تحويل إلى تدرجات الرمادي
                .normalize() // تحسين التباين
                .modulate({ brightness: 1.2, contrast: 1.2 }) // زيادة السطوع والتباين
                .threshold(128) // تحويل إلى أبيض وأسود
                .resize(1000, null, { // تحجيم الصورة مع الحفاظ على النسبة
                    fit: 'contain',
                    withoutEnlargement: true
                })
                .sharpen({ // تحسين حدة الصورة
                    sigma: 1,
                    m1: 0.1,
                    m2: 0.3
                })
                .toBuffer();

            // قراءة النص من الصورة المعالجة
            const { data: { text } } = await this.worker.recognize(processedBuffer, {
                lang: 'eng',
                tessedit_char_whitelist: '0123456789ABCDEFXR',
                tessedit_pageseg_mode: '7', // تعامل مع النص كسطر واحد
            });

            // البحث عن الأكواد المحتملة
            const possibleCodes = this.findPossibleCodes(text);
            
            if (possibleCodes.length > 0) {
                // إرجاع أول كود صالح
                return possibleCodes[0];
            }
            
            return null;
        } catch (error) {
            console.error('Error processing image:', error);
            throw new Error('فشل في معالجة الصورة');
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
        // تنظيف النص
        const cleanText = text.replace(/[^0-9A-FXR]/g, '');
        
        // البحث عن الأكواد التي تبدأ بـ R أو X
        const pattern = /[RX][0-9A-F]{16,17}/g;
        const matches = cleanText.match(pattern) || [];
        
        return matches;
    }

    async recognizeText(imageData) {
        try {
            await this.initialize();

            // قراءة النص من الصورة
            const { data: { text } } = await this.worker.recognize(imageData, {
                lang: 'eng',
                tessedit_char_whitelist: '0123456789ABCDEFXR',
                tessedit_pageseg_mode: '7' // تعامل مع النص كسطر واحد
            });

            console.log('النص المستخرج:', text);

            // البحث عن الأكواد المحتملة
            const possibleCodes = this.findPossibleCodes(text);
            console.log('الأكواد المحتملة:', possibleCodes);

            if (possibleCodes.length > 0) {
                return possibleCodes[0];
            }

            return null;
        } catch (error) {
            console.error('Error in recognizeText:', error);
            throw new Error('فشل في التعرف على النص في الصورة');
        }
    }

    findPossibleCodes(text) {
        // تنظيف النص من الأحرف غير المطلوبة
        const cleanText = text.replace(/[^0-9A-FXR]/g, '');
        console.log('النص بعد التنظيف:', cleanText);
        
        // البحث عن الأكواد التي تبدأ بـ R أو X
        const pattern = /[RX][0-9A-F]{16,17}/g;
        const matches = cleanText.match(pattern) || [];
        console.log('الأكواد المطابقة:', matches);
        
        return matches;
    }

    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
}

module.exports = new OCRService();
