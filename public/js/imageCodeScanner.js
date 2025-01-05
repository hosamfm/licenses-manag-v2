class ImageCodeScanner {
    constructor(options = {}) {
        this.targetInput = options.targetInput;
        this.onSuccess = options.onSuccess || (() => {});
        this.onError = options.onError || (() => {});
        this.setupUI();
    }

    setupUI() {
        this.container = document.createElement('div');
        this.container.className = 'image-code-scanner-container';
        
        // Create camera button
        this.cameraButton = document.createElement('button');
        this.cameraButton.className = 'btn btn-outline-secondary';
        this.cameraButton.innerHTML = '<i class="fas fa-camera"></i>';
        this.cameraButton.title = 'التقاط صورة';
        
        // Create file upload button
        this.uploadButton = document.createElement('button');
        this.uploadButton.className = 'btn btn-outline-secondary';
        this.uploadButton.innerHTML = '<i class="fas fa-upload"></i>';
        this.uploadButton.title = 'تحميل صورة';
        
        // Hidden file input
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'image/*';
        this.fileInput.style.display = 'none';
        
        // Add event listeners
        this.cameraButton.addEventListener('click', () => this.startCamera());
        this.uploadButton.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Append elements
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

            if (!response.ok) {
                throw new Error('فشل في معالجة الصورة');
            }

            const { text } = await response.json();
            if (text && this.targetInput) {
                this.targetInput.value = text;
                this.onSuccess(text);
                return text; // إرجاع النص المستخرج لعرضه في المعاينة
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
        if (element) {
            element.appendChild(this.container);
        }
    }
}

// Add styles
const style = document.createElement('style');
style.textContent = `
    .image-code-scanner-container {
        display: inline-flex;
        gap: 5px;
    }
    
    .image-code-scanner-container button {
        padding: 6px 12px;
    }
    
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
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
    }
    
    .viewfinder-frame {
        width: 80%;
        height: 100px;
        border: 2px solid #fff;
        border-radius: 4px;
        background: transparent;
        box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
    }
    
    .viewfinder-help {
        position: absolute;
        bottom: 20px;
        left: 0;
        right: 0;
        text-align: center;
        color: #fff;
        font-size: 14px;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    }
    
    .preview-container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: #000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
    }
    
    .preview-image {
        max-width: 100%;
        max-height: 70%;
        object-fit: contain;
        border-radius: 4px;
        margin-bottom: 15px;
    }
    
    .preview-code {
        font-family: monospace;
        font-size: 1.2em;
        padding: 10px 20px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        color: #fff;
    }
    
    .processing-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }
`;
document.head.appendChild(style);
