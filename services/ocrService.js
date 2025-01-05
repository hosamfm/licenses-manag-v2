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
            // تحسين إعدادات التعرف للحروف الست عشرية
            await this.worker.setParameters({
                tessedit_char_whitelist: 'ABCDEF0123456789RX',
                tessedit_pageseg_mode: '7', // تحسين لقراءة سطر واحد
                tessedit_ocr_engine_mode: '2', // وضع الدقة العالية
            });
        }
    }

    isValidHexCode(code) {
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

    async recognizeText(imageData) {
        try {
            await this.initialize();
            
            // تحسين الصورة قبل المعالجة
            const { data: { text } } = await this.worker.recognize(imageData, {
                rectangle: { top: 0, left: 0, width: 300, height: 50 }, // تركيز على منطقة أصغر
                preprocessing: true
            });
            
            // تنظيف النص وتحويله إلى أحرف كبيرة
            const lines = text.split('\n')
                .map(line => line.trim().toUpperCase())
                .filter(line => line.length > 0);
            
            // البحث عن كود صالح
            for (const line of lines) {
                // إزالة المسافات والرموز الخاصة
                const cleanLine = line.replace(/[^A-F0-9RX]/g, '');
                
                // البحث عن نمط الكود في السطر
                const matches = cleanLine.match(/[RX][A-F0-9]{16,17}/g);
                if (matches) {
                    for (const match of matches) {
                        if (this.isValidHexCode(match)) {
                            return match;
                        }
                    }
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
