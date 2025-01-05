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
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            
            const modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">التقاط صورة</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <video autoplay style="width: 100%"></video>
                            <canvas style="display: none"></canvas>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">إلغاء</button>
                            <button type="button" class="btn btn-primary capture-btn">التقاط</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            const modalInstance = new bootstrap.Modal(modal);
            
            const video = modal.querySelector('video');
            const canvas = modal.querySelector('canvas');
            const captureBtn = modal.querySelector('.capture-btn');
            
            video.srcObject = stream;
            
            captureBtn.addEventListener('click', () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext('2d').drawImage(video, 0, 0);
                
                canvas.toBlob(async (blob) => {
                    await this.processImage(blob);
                    modalInstance.hide();
                    stream.getTracks().forEach(track => track.stop());
                });
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
            } else {
                this.onError('لم يتم العثور على نص في الصورة');
            }
        } catch (error) {
            this.onError(error.message);
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
`;
document.head.appendChild(style);
