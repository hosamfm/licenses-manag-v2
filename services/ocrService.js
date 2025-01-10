// services/ocrService.js
const fetch = require('node-fetch');
const FormData = require('form-data');
const sharp = require('sharp');

/**
 * لم نعد بحاجة إلى تهيئة Worker خاص بـ Tesseract،
 * لذا لن نستخدم constructor أو initialize/terminate كما في السابق.
 */
class OCRService {
    
    /**
     * معالجة الصورة قبل إرسالها إلى OCR.space
     * (ما زلنا نستخدم Sharp لتحسين الصورة إن أحببت)
     */
    async preprocessImage(imageBuffer) {
        try {
            const processedBuffer = await sharp(imageBuffer)
                .rotate()        // تدوير تلقائي وفق بيانات EXIF
                .resize({
                    width: 1000,
                    height: 800,
                    fit: 'inside',
                    withoutEnlargement: false
                })
                .grayscale()
                .normalize()
                .sharpen({
                    sigma: 1.0,
                    m1: 1.0,
                    m2: 0.5
                })
                .threshold(140)
                .toBuffer();
            
            return processedBuffer;
        } catch (error) {
            console.error('Error preprocessing image:', error);
            return imageBuffer; // fallback: إرجاع الصورة الأصلية إن فشلت المعالجة
        }
    }

    /**
     * استبدالات للأخطاء الشائعة في قراءة الأحرف
     */
    correctCommonMistakes(text) {
        return text
            .replace(/O/g, '0')  // O -> 0
            .replace(/I/g, '1')  // I -> 1
            .replace(/L/g, '1'); // L -> 1
    }

    /**
     * التحقق من صحة الكود (R أو X + 16/17 محرف هيكس)
     */
    isValidHexCode(code) {
        if (!code || typeof code !== 'string') return false;
        if (!code.startsWith('R') && !code.startsWith('X')) return false;
        if (code.length !== 17 && code.length !== 18) return false;
        const hexPart = code.substring(1);
        return /^[0-9A-F]+$/i.test(hexPart);
    }

    /**
     * البحث عن الأكواد المحتملة في النص
     */
    findPossibleCodes(rawText) {
        const correctedText = this.correctCommonMistakes(rawText);
        const cleanText = correctedText
            .replace(/[^A-F0-9RX\n\s]/gi, '')  // حذف أي رموز غير مسموحة
            .toUpperCase()
            .split(/[\n\s]+/)
            .filter(line => line.length > 0);

        const possibleCodes = [];
        for (const line of cleanText) {
            // جرّب substr بطول 17 أو 18
            for (let i = 0; i <= line.length - 17; i++) {
                const maybe18 = line.substr(i, 18);
                if (this.isValidHexCode(maybe18)) {
                    possibleCodes.push(maybe18);
                }
                const maybe17 = line.substr(i, 17);
                if (this.isValidHexCode(maybe17)) {
                    possibleCodes.push(maybe17);
                }
            }
        }
        return [...new Set(possibleCodes)];
    }

    /**
     * الدالة الرئيسية للتعرف على النص من الصورة باستخدام OCR.space
     */
    async recognizeText(imageBuffer) {
        try {
            // 1) معالجة الصورة أولًا
            const processedImage = await this.preprocessImage(imageBuffer);
            
            // 2) تجهيز form-data
            // ملاحظة: يمكنك تخزين مفتاحك بشكل آمن في متغير بيئة
            // أو ملف إعدادات عوضًا عن كتابته صراحةً
            const formData = new FormData();
            formData.append('file', processedImage, { filename: 'image.png' });
            formData.append('apikey', 'K85529519688957'); // ضع مفتاحك هنا
            formData.append('language', 'eng');
            formData.append('OCREngine', '2');           // استخدام المحرك 2 للدقة العالية
            formData.append('scale', 'true');           // تحسين دقة التعرف للصور منخفضة الدقة
            formData.append('isTable', 'false');        // لا نحتاج لمعالجة الجداول
            formData.append('detectOrientation', 'true'); // كشف وتصحيح اتجاه النص تلقائياً
            
            // 3) إرسال الطلب إلى OCR.space
            const response = await fetch('https://api.ocr.space/parse/image', {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                throw new Error(`OCR.space API responded with status ${response.status}`);
            }
            
            // 4) قراءة النص من النتيجة
            const result = await response.json();
            
            // التحقق من وجود أخطاء في الاستجابة
            if (result.IsErroredOnProcessing) {
                throw new Error(result.ErrorMessage || 'حدث خطأ أثناء معالجة الصورة');
            }

            // التحقق من نجاح عملية OCR
            if (result.OCRExitCode !== 1) {
                throw new Error('فشلت عملية التعرف على النص');
            }

            const rawText = result?.ParsedResults?.[0]?.ParsedText || '';
            console.log('Raw OCR Text:', rawText);

            // 5) البحث عن الأكواد المحتملة
            const possibleCodes = this.findPossibleCodes(rawText);
            console.log('Possible codes:', possibleCodes);

            if (possibleCodes.length > 0) {
                return possibleCodes[0];
            }

            // إذا لم نجد أي كود صالح
            throw new Error('لم يتم العثور على كود ترخيص صالح.');
        } catch (error) {
            console.error('Error in OCR processing:', error);
            throw error;
        }
    }
}

module.exports = new OCRService();
