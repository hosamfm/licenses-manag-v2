class ImageCodeScanner {
    constructor(options = {}) {
        this.targetInput = null;
        this.onSuccess = options.onSuccess || (() => {});
        this.onError = options.onError || (() => {});
    }

    setupUI() {
        this.container = document.createElement('div');
        this.container.className = 'image-code-scanner-container';
        
        // إنشاء زر الكاميرا
        this.cameraButton = document.createElement('button');
        this.cameraButton.className = 'btn btn-outline-secondary';
        this.cameraButton.innerHTML = '<i class="fas fa-camera"></i>';
        this.cameraButton.title = 'التقاط صورة';
        
        // إنشاء زر الرفع
        this.uploadButton = document.createElement('button');
        this.uploadButton.className = 'btn btn-outline-secondary';
        this.uploadButton.innerHTML = '<i class="fas fa-upload"></i>';
        this.uploadButton.title = 'تحميل صورة';
        
        // إدخال الملف المخفي
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'image/*';
        this.fileInput.style.display = 'none';
        
        // إضافة مستمعي الأحداث
        this.uploadButton.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.cameraButton.addEventListener('click', () => this.startCamera());
        
        // إضافة العناصر
        this.container.appendChild(this.cameraButton);
        this.container.appendChild(this.uploadButton);
        this.container.appendChild(this.fileInput);
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
                                    <div class="viewfinder-frame">
                                        <div class="corner-guides">
                                            <div class="corner top-left"></div>
                                            <div class="corner top-right"></div>
                                            <div class="corner bottom-left"></div>
                                            <div class="corner bottom-right"></div>
                                        </div>
                                        <div class="guide-lines">
                                            <div class="line horizontal"></div>
                                            <div class="line vertical"></div>
                                        </div>
                                        <div class="code-outline">
                                            <div class="code-text">R _ _ _ _ _ _ _ _ _ _ _ _ _ _ _</div>
                                        </div>
                                    </div>
                                    <div class="viewfinder-help">قم بمحاذاة كود الترخيص داخل الإطار</div>
                                    <div class="light-indicator">
                                        <i class="fas fa-sun"></i>
                                        <span class="light-level">جاري قياس مستوى الإضاءة...</span>
                                    </div>
                                    <div class="zoom-controls">
                                        <button class="zoom-out"><i class="fas fa-minus"></i></button>
                                        <span class="zoom-level">1x</span>
                                        <button class="zoom-in"><i class="fas fa-plus"></i></button>
                                    </div>
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
            
            // انتظار تحميل الفيديو
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
                
                // تحديد منطقة الالتقاط بناءً على إطار التحديد
                const viewfinderFrame = modal.querySelector('.viewfinder-frame');
                const rect = viewfinderFrame.getBoundingClientRect();
                const videoRect = video.getBoundingClientRect();
                
                // حساب نسبة المنطقة المحددة
                const scaleX = video.videoWidth / videoRect.width;
                const scaleY = video.videoHeight / videoRect.height;
                
                const captureWidth = rect.width * scaleX;
                const captureHeight = rect.height * scaleY;
                const captureX = (rect.left - videoRect.left) * scaleX;
                const captureY = (rect.top - videoRect.top) * scaleY;
                
                // التقاط المنطقة المحددة فقط
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
            this.onError('فشل في الوصول إلى الكاميرا');
        }
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            await this.processImage(file);
        }
    }

    async processImage(imageData) {
        try {
            const formData = new FormData();
            formData.append('image', imageData);

            const response = await fetch('/api/ocr', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (!result.success) {
                throw new Error(result.error);
            }

            return result.code;
        } catch (error) {
            console.error('Error processing image:', error);
            throw error;
        }
    }

    mount(element) {
        if (!element) return;
        
        this.targetInput = element.closest('.input-group').querySelector('input');
        element.addEventListener('click', () => this.startCamera());
    }
}

// Add styles
const style = document.createElement('style');
style.textContent = `
    .image-code-scanner-container {
        display: inline-block;
    }
    
    .camera-container {
        position: relative;
        width: 100%;
        background: #000;
    }
    
    .viewfinder {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    }
    
    .viewfinder-frame {
        position: relative;
        width: 80%;
        height: 120px;
        border: 2px solid rgba(255, 255, 255, 0.8);
        border-radius: 4px;
    }
    
    .corner-guides {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
    }
    
    .corner {
        position: absolute;
        width: 20px;
        height: 20px;
        border: 3px solid #fff;
    }
    
    .top-left {
        top: -2px;
        left: -2px;
        border-right: none;
        border-bottom: none;
    }
    
    .top-right {
        top: -2px;
        right: -2px;
        border-left: none;
        border-bottom: none;
    }
    
    .bottom-left {
        bottom: -2px;
        left: -2px;
        border-right: none;
        border-top: none;
    }
    
    .bottom-right {
        bottom: -2px;
        right: -2px;
        border-left: none;
        border-top: none;
    }
    
    .guide-lines {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
    }
    
    .line {
        position: absolute;
        background: rgba(255, 255, 255, 0.3);
    }
    
    .line.horizontal {
        width: 100%;
        height: 1px;
        top: 50%;
    }
    
    .line.vertical {
        width: 1px;
        height: 100%;
        left: 50%;
    }
    
    .code-outline {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        text-align: center;
    }
    
    .code-text {
        color: rgba(255, 255, 255, 0.6);
        font-family: monospace;
        font-size: 16px;
        letter-spacing: 2px;
    }
    
    .light-indicator {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.6);
        padding: 5px 10px;
        border-radius: 15px;
        color: #fff;
        display: flex;
        align-items: center;
        gap: 5px;
    }
    
    .zoom-controls {
        position: absolute;
        bottom: 20px;
        right: 10px;
        background: rgba(0, 0, 0, 0.6);
        padding: 5px;
        border-radius: 20px;
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .zoom-controls button {
        background: none;
        border: none;
        color: #fff;
        cursor: pointer;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .zoom-controls button:hover {
        background: rgba(255, 255, 255, 0.2);
    }
    
    .zoom-level {
        color: #fff;
        font-size: 14px;
        min-width: 30px;
        text-align: center;
    }
    
    .viewfinder-help {
        color: #fff;
        background: rgba(0, 0, 0, 0.6);
        padding: 8px 15px;
        border-radius: 20px;
        margin-top: 10px;
        font-size: 14px;
    }
`;
document.head.appendChild(style);
