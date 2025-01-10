// services/ocrService.js
const Tesseract = require('tesseract.js');
const sharp = require('sharp');

class OCRService {
    constructor() {
        this.worker = null;
    }

    async initialize() {
        // إذا كان الـ worker غير مهيأ، قم بإنشائه وضبط اللغة
        if (!this.worker) {
            this.worker = await Tesseract.createWorker();
            await this.worker.loadLanguage('eng');
            await this.worker.initialize('eng');

            // ملاحظة: يمكنك تجربة psm=7 أو psm=8 أو حتى psm=13
            await this.worker.setParameters({
                tessedit_char_whitelist: 'ABCDEF0123456789RX',
                tessedit_char_blacklist: 'abcdefghijklmnopqrstuvwxyz', // استبعاد الأحرف الصغيرة تماماً
                tessedit_pageseg_mode: '7', // وضع التعرف على سطر واحد
                preserve_interword_spaces: '1',
                tessjs_create_pdf: '0',
                tessjs_create_hocr: '0',
                tessjs_create_tsv: '0',
                tessjs_create_box: '0',
                tessjs_create_unlv: '0',
                tessjs_create_osd: '0',
            });
        }
    }

    /**
     * معالجة الصورة قبل تمريرها لـ Tesseract
     * يمكنك تغيير ترتيب الخطوات أو إضافة عمليات مورفولوجية (erosion/dilation) حسب الحاجة
     */
    async preprocessImage(imageBuffer) {
        try {
            const processedBuffer = await sharp(imageBuffer)
                .rotate()        // ضبط التدوير التلقائي بناء على الـ EXIF
                .resize({        // تكبير الصورة (إن كانت صغيرة) لتحسين الدقة
                    width: 1000,
                    height: 800,
                    fit: 'inside',
                    withoutEnlargement: false
                })
                .grayscale()     // تحويل إلى تدرجات الرمادي
                .normalize()     // تطبيع التباين
                .sharpen({       // زيادة الحدة قليلاً
                    sigma: 1.0,
                    m1: 1.0,
                    m2: 0.5
                })
                .threshold(140)  // عتبة binarization (يمكن تعديلها أو تجربة قيم أخرى)
                .toBuffer();

            return processedBuffer;
        } catch (error) {
            console.error('Error preprocessing image:', error);
            // إذا فشلت المعالجة المسبقة، نعيد الصورة الأصلية كحل أخير
            return imageBuffer;
        }
    }

    /**
     * استبدالات للأخطاء الشائعة في OCR
     */
    correctCommonMistakes(text) {
        return text
            .replace(/O/g, '0')  // حرف O -> رقم 0
            .replace(/I/g, '1')  // حرف I -> رقم 1
            .replace(/L/g, '1'); // حرف L -> رقم 1 (إن كنت ترغب)
    }

    /**
     * التحقق من صحة الكود
     * يشترط أن يبدأ بـ R أو X
     * طوله 17 أو 18 حرف
     * باقي الأحرف 0-9A-F
     */
    isValidHexCode(code) {
        if (!code || typeof code !== 'string') return false;

        // التحقق من أن الكود يبدأ بـ R أو X
        if (!code.startsWith('R') && !code.startsWith('X')) {
            return false;
        }

        // الطول يجب أن يكون 17 أو 18
        if (code.length !== 17 && code.length !== 18) {
            return false;
        }

        // التحقق من الأحرف الست عشرية
        const hexPart = code.substring(1); // احذف الحرف الأول (R أو X)
        return /^[0-9A-F]+$/i.test(hexPart);
    }

    /**
     * البحث في النص واستخراج الأكواد المحتملة
     */
    findPossibleCodes(rawText) {
        // تصحيح الأخطاء الشائعة أولاً
        const correctedText = this.correctCommonMistakes(rawText);

        // إزالة كل ما ليس A-F0-9 R X أو مسافة أو سطر جديد
        const cleanText = correctedText
            .replace(/[^A-F0-9RX\n\s]/gi, '')
            .toUpperCase()
            .split(/[\n\s]+/) // قسّم إلى أسطر أو كلمات
            .filter(line => line.length > 0);

        const possibleCodes = [];
        for (const line of cleanText) {
            // جرّب استخراج substr بطول 17 و 18
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

        return [...new Set(possibleCodes)]; // إزالة التكرارات
    }

    /**
     * الدالة الرئيسية للتعرف على النص
     */
    async recognizeText(imageData) {
        try {
            // تهيئة الـ worker إن لم يكن جاهزاً
            await this.initialize();

            // معالجة الصورة
            const processedImage = await this.preprocessImage(imageData);

            // جرّب تدوير الصورة في عدة زوايا + ربما PSM مختلف
            const rotateAngles = [0, 90, 180, 270];
            // يمكنك أيضاً تجربة PSM متعددة: [7, 8] إن أردت
            for (const angle of rotateAngles) {
                try {
                    const { data: { text } } = await this.worker.recognize(processedImage, {
                        rotate: angle,
                    });

                    console.log(`Recognized text (rotation ${angle}°):`, text);

                    // ابحث عن الأكواد الممكنة
                    const possibleCodes = this.findPossibleCodes(text);
                    console.log(`Possible codes (rotation ${angle}°):`, possibleCodes);

                    if (possibleCodes.length > 0) {
                        // يكفي إعادة أول كود صحيح نجده
                        return possibleCodes[0];
                    }
                } catch (err) {
                    console.error(`Error in attempt with rotation ${angle}°:`, err);
                }
            }

            // في حال لم نجد أي كود صحيح
            throw new Error(
                'لم يتم العثور على كود ترخيص صالح. الكود يجب أن يبدأ بـ R أو X ' +
                'ويتبعه 16 أو 17 حرف ست عشري (0-9, A-F).'
            );
        } catch (error) {
            console.error('Error in OCR processing:', error);
            throw error;
        }
    }

    // لإنهاء الـ worker في حال أردت إيقاف الخدمة أو إنهاء السيرفر
    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
}

module.exports = new OCRService();
