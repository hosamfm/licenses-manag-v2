// public/js/imageCodeScanner.js
class ImageCodeScanner {
    constructor(options = {}) {
        this.targetInput = options.targetInput || null;
        this.onSuccess = options.onSuccess || (() => {});
        this.onError = options.onError || (() => {});
    }

    setupUI() {
        // لا نحتاج لإنشاء أي أزرار إضافية
        // سنستخدم الزر الموجود في القالب
    }

    async startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            
            // إنشاء مودال لأخذ الصورة
            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.innerHTML = `
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">التقاط كود الترخيص</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-0">
                            <div class="camera-container">
                                <video autoplay playsinline></video>
                                <div class="viewfinder">
                                    <div class="viewfinder-frame"></div>
                                    <div class="viewfinder-help">قم بمحاذاة كود الترخيص داخل الإطار</div>
                                </div>
                                <canvas style="display: none"></canvas>
                                <div class="preview-container" style="display: none">
                                    <img class="preview-image" />
                                    <div class="preview-code"></div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                            <button type="button" class="btn btn-warning retry-btn" style="display: none">
                                <i class="fas fa-redo me-2"></i>إعادة المحاولة
                            </button>
                            <button type="button" class="btn btn-primary capture-btn">
                                <i class="fas fa-camera me-2"></i>التقاط
                            </button>
                        </div>
                        <div class="processing-overlay" style="display: none">
                            <div class="spinner-border text-light" role="status">
                                <span class="visually-hidden">جاري المعالجة...</span>
                            </div>
                            <div class="mt-2 text-light">جاري معالجة الصورة...</div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            const modalInstance = new bootstrap.Modal(modal);
            
            const video = modal.querySelector('video');
            const canvas = modal.querySelector('canvas');
            const captureBtn = modal.querySelector('.capture-btn');
            const retryBtn = modal.querySelector('.retry-btn');
            const previewContainer = modal.querySelector('.preview-container');
            const previewImage = modal.querySelector('.preview-image');
            const previewCode = modal.querySelector('.preview-code');
            const processingOverlay = modal.querySelector('.processing-overlay');
            const viewfinder = modal.querySelector('.viewfinder');

            video.srcObject = stream;
            await new Promise(resolve => video.addEventListener('loadedmetadata', resolve));

            const showProcessing = () => {
                processingOverlay.style.display = 'flex';
                captureBtn.disabled = true;
                retryBtn.disabled = true;
            };
            const hideProcessing = () => {
                processingOverlay.style.display = 'none';
                captureBtn.disabled = false;
                retryBtn.disabled = false;
            };

            const showPreview = (imageUrl, code) => {
                video.style.display = 'none';
                viewfinder.style.display = 'none';
                previewContainer.style.display = 'block';
                previewImage.src = imageUrl;
                previewCode.textContent = code || 'لم يتم العثور على كود';
                previewCode.className = `preview-code ${code ? 'text-success' : 'text-danger'}`;
                captureBtn.style.display = 'none';
                retryBtn.style.display = 'inline-block';
            };
            const hidePreview = () => {
                video.style.display = 'block';
                viewfinder.style.display = 'flex';
                previewContainer.style.display = 'none';
                captureBtn.style.display = 'inline-block';
                retryBtn.style.display = 'none';
            };

            retryBtn.addEventListener('click', hidePreview);

            captureBtn.addEventListener('click', async () => {
                showProcessing();
                const viewfinderFrame = modal.querySelector('.viewfinder-frame');
                const rect = viewfinderFrame.getBoundingClientRect();
                const videoRect = video.getBoundingClientRect();

                // حساب نسبة التقاط الإطار
                const scaleX = video.videoWidth / videoRect.width;
                const scaleY = video.videoHeight / videoRect.height;

                const captureWidth = rect.width * scaleX;
                const captureHeight = rect.height * scaleY;
                const captureX = (rect.left - videoRect.left) * scaleX;
                const captureY = (rect.top - videoRect.top) * scaleY;

                // رسم المنطقة المحددة فقط
                canvas.width = captureWidth;
                canvas.height = captureHeight;
                canvas.getContext('2d').drawImage(
                    video,
                    captureX, captureY, captureWidth, captureHeight,
                    0, 0, captureWidth, captureHeight
                );
                
                try {
                    const imageUrl = canvas.toDataURL('image/png');
                    canvas.toBlob(async (blob) => {
                        try {
                            const result = await this.processImage(blob);
                            if (result) {
                                showPreview(imageUrl, result);
                                setTimeout(() => {
                                    modalInstance.hide();
                                    stream.getTracks().forEach(track => track.stop());
                                }, 1500);
                            } else {
                                showPreview(imageUrl, 'لم يتم العثور على كود');
                            }
                        } catch (error) {
                            console.error('Error processing image:', error);
                            showPreview(imageUrl, 'حدث خطأ في معالجة الصورة');
                            this.onError(error.message);
                        } finally {
                            hideProcessing();
                        }
                    });
                } catch (error) {
                    console.error('Error capturing image:', error);
                    hideProcessing();
                    this.onError('فشل في التقاط الصورة');
                }
            });

            modal.addEventListener('hidden.bs.modal', () => {
                stream.getTracks().forEach(track => track.stop());
                modal.remove();
            });

            modalInstance.show();
        } catch (error) {
            this.onError('فشل في الوصول إلى الكاميرا: ' + error.message);
        }
    }

    async handleFileSelect(event) {
        // لا يوجد استخدام لهذا الأسلوب الآن
    }

    async processImage(imageData) {
        try {
            const formData = new FormData();
            formData.append('image', imageData);

            const response = await fetch('/api/ocr', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('فشل في معالجة الصورة (استجابة غير ناجحة)');
            }

            const { text } = await response.json();
            if (text && this.targetInput) {
                this.targetInput.value = text;
                this.onSuccess(text);
                return text; 
            } else {
                this.onError('لم يتم العثور على كود ترخيص صالح');
                return null;
            }
        } catch (error) {
            this.onError(error.message);
            throw error;
        }
    }

    mount(element) {
        if (!element) return;
        
        // حفظ مرجع حقل الإدخال
        this.targetInput = this.targetInput || element.closest('.input-group').querySelector('input');
        
        // ربط حدث النقر على الزر الموجود بفتح الكاميرا
        element.addEventListener('click', () => this.startCamera());
    }
}

// نحتفظ فقط بالأنماط المتعلقة بالكاميرا والمعاينة
const style = document.createElement('style');
style.textContent = `
.camera-container {
    position: relative;
    width: 100%;
    height: 0;
    padding-bottom: 75%;
    background: #000;
    overflow: hidden;
}
.camera-container video {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.viewfinder {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.5);
}
.viewfinder-frame {
    width: 300px; height: 60px;
    border: 2px solid #fff;
    border-radius: 4px;
    background: transparent;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
}
.viewfinder-help {
    position: absolute;
    bottom: 20px; left: 0; right: 0;
    text-align: center; color: #fff; font-size: 14px;
    text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}
.preview-container {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: #000; display: flex; flex-direction: column;
    align-items: center; justify-content: center; padding: 20px;
}
.preview-image {
    max-width: 100%; max-height: 70%; object-fit: contain;
    border-radius: 4px; margin-bottom: 15px;
}
.preview-code {
    font-family: monospace; font-size: 1.2em;
    padding: 10px 20px; background: rgba(255,255,255,0.1);
    border-radius: 4px; color: #fff;
}
.processing-overlay {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: none; flex-direction: column; align-items: center;
    justify-content: center; z-index: 1000;
}
`;
document.head.appendChild(style);
