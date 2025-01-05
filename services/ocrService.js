const Tesseract = require('tesseract.js');

class OCRService {
    constructor() {
        this.worker = null;
    }

    async initialize() {
        if (!this.worker) {
            this.worker = await Tesseract.createWorker();
            await this.worker.loadLanguage('eng');
            await this.worker.initialize('eng');
            // تحسين إعدادات التعرف للحصول على نتائج أفضل للأحرف الإنجليزية الكبيرة
            await this.worker.setParameters({
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
            });
        }
    }

    extractValidCode(text) {
        // تنظيف النص وتحويله إلى أحرف كبيرة
        const cleanText = text.replace(/[^A-Z0-9]/g, '').toUpperCase();
        
        // البحث عن نمط الكود المطلوب
        const codePattern = /[XR][A-Z0-9]{16,17}/g;
        const matches = cleanText.match(codePattern);
        
        if (matches && matches.length > 0) {
            // إرجاع أول كود صالح
            return matches[0];
        }
        
        return null;
    }

    async recognizeText(imageData) {
        try {
            await this.initialize();
            const { data: { text } } = await this.worker.recognize(imageData);
            
            // البحث عن كود صالح في النص المستخرج
            const validCode = this.extractValidCode(text);
            
            if (!validCode) {
                throw new Error('لم يتم العثور على كود صالح في الصورة. الكود يجب أن يبدأ بـ X أو R ويتكون من 17 أو 18 حرفاً.');
            }
            
            return validCode;
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
