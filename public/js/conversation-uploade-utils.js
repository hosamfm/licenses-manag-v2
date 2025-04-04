/**
 * وحدة مساعدة لتسجيل الصوت والتقاط الصور في المحادثات
 * + دعم لصق الصور من الحافظة
 */

(function(window) {
  // كائن عام للتعامل مع تسجيل الصوت
  const audioRecorder = {
    mediaRecorder: null,
    audioChunks: [],
    stream: null,
    isRecording: false,
    maxDuration: 60000, // مدة التسجيل القصوى (60 ثانية)
    recordingTimer: null,
    
    startRecording: async function(onStartCallback) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.mediaRecorder = new MediaRecorder(this.stream);
        this.audioChunks = [];
        
        this.mediaRecorder.addEventListener('dataavailable', (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        });
        
        this.mediaRecorder.start();
        this.isRecording = true;
        
        this.recordingTimer = setTimeout(() => {
          if (this.isRecording) {
            this.stopRecording();
          }
        }, this.maxDuration);
        
        if (typeof onStartCallback === 'function') {
          onStartCallback();
        }
        
        updateRecordButtonState(true);
      } catch (error) {
        console.error('خطأ في بدء تسجيل الصوت:', error);
        window.showToast && window.showToast('لا يمكن الوصول إلى الميكروفون. يرجى التحقق من إذن الوصول.', 'danger');
      }
    },
    
    stopRecording: function() {
      return new Promise((resolve) => {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
          resolve(null);
          return;
        }
        
        this.mediaRecorder.addEventListener('stop', async () => {
          if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
          }
          
          if (this.audioChunks.length > 0) {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/ogg; codecs=opus' });
            const audioFile = new File([audioBlob], 'voice-message.ogg', { type: 'audio/ogg' });
            
            this.isRecording = false;
            this.audioChunks = [];
            updateRecordButtonState(false);
            resolve(audioFile);
          } else {
            resolve(null);
          }
        });
        
        this.mediaRecorder.stop();
        
        if (this.recordingTimer) {
          clearTimeout(this.recordingTimer);
          this.recordingTimer = null;
        }
      });
    },
    
    cancelRecording: function() {
      if (this.isRecording) {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
        
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
        }
        
        if (this.recordingTimer) {
          clearTimeout(this.recordingTimer);
          this.recordingTimer = null;
        }
        
        this.isRecording = false;
        this.audioChunks = [];
        updateRecordButtonState(false);
      }
    }
  };
  
  // كائن عام للتعامل مع التقاط الصور
  const cameraCapture = {
    videoStream: null,
    videoElement: null,
    
    startCamera: async function(videoElement) {
      try {
        this.stopCamera();
        this.videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        this.videoElement = videoElement;
        videoElement.srcObject = this.videoStream;
        
        return new Promise((resolve) => {
          videoElement.onloadedmetadata = () => {
            videoElement.play();
            resolve(true);
          };
        });
      } catch (error) {
        console.error('خطأ في فتح الكاميرا:', error);
        window.showToast && window.showToast('لا يمكن الوصول إلى الكاميرا. يرجى التحقق من إذن الوصول.', 'danger');
        return false;
      }
    },
    
    capturePhoto: function() {
      if (!this.videoElement || !this.videoStream) {
        return null;
      }
      
      try {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        
        context.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
        
        return new Promise((resolve) => {
          canvas.toBlob((blob) => {
            if (blob) {
              const file = new File([blob], 'camera-capture.jpg', { type: 'image/jpeg' });
              resolve(file);
            } else {
              resolve(null);
            }
          }, 'image/jpeg', 0.9);
        });
      } catch (error) {
        console.error('خطأ في التقاط الصورة:', error);
        return null;
      }
    },
    
    stopCamera: function() {
      if (this.videoStream) {
        this.videoStream.getTracks().forEach(track => track.stop());
        this.videoStream = null;
      }
      
      if (this.videoElement) {
        this.videoElement.srcObject = null;
        this.videoElement = null;
      }
    }
  };
  
  // تحديث زر التسجيل
  function updateRecordButtonState(isRecording) {
    const recordButton = document.getElementById('recordAudioBtn');
    if (recordButton) {
      if (isRecording) {
        recordButton.innerHTML = '<i class="fas fa-stop"></i>';
        recordButton.classList.remove('btn-outline-secondary');
        recordButton.classList.add('btn-danger', 'recording-active');
        recordButton.setAttribute('title', 'إيقاف التسجيل');
      } else {
        recordButton.innerHTML = '<i class="fas fa-microphone"></i>';
        recordButton.classList.remove('btn-danger', 'recording-active');
        recordButton.classList.add('btn-outline-secondary');
        recordButton.setAttribute('title', 'تسجيل صوت');
      }
    }
  }
  
  // التعامل مع زر تسجيل الصوت
  function handleAudioRecording() {
    if (audioRecorder.isRecording) {
      audioRecorder.stopRecording().then(audioFile => {
        if (audioFile) {
          const fileInputEl = document.getElementById('mediaFile');
          if (fileInputEl) {
            const dt = new DataTransfer();
            dt.items.add(audioFile);
            fileInputEl.files = dt.files;
            
            if (typeof window.handleFileSelection === 'function') {
              window.handleFileSelection();
            } else {
              handleFileSelection();
            }
          }
        }
      });
    } else {
      audioRecorder.startRecording();
    }
  }
  
  // فتح نافذة الكاميرا
  function openCameraCapture() {
    const modal = new bootstrap.Modal(document.getElementById('cameraCaptureModal'));
    modal.show();
    
    const videoElement = document.getElementById('cameraStream');
    if (videoElement) {
      cameraCapture.startCamera(videoElement).then((success) => {
        if (!success) {
          modal.hide();
        }
      });
    }
  }
  
  // التقاط الصورة من الكاميرا
  async function capturePhoto() {
    const photo = await cameraCapture.capturePhoto();
    if (photo) {
      const modal = bootstrap.Modal.getInstance(document.getElementById('cameraCaptureModal'));
      if (modal) {
        modal.hide();
      }
      
      const fileInputEl = document.getElementById('mediaFile');
      if (fileInputEl) {
        const dt = new DataTransfer();
        dt.items.add(photo);
        fileInputEl.files = dt.files;
        
        if (typeof window.handleFileSelection === 'function') {
          window.handleFileSelection();
        } else {
          handleFileSelection();
        }
      }
    }
  }
  
  // إغلاق نافذة الكاميرا
  function closeCameraCapture() {
    cameraCapture.stopCamera();
  }
  
  // مسح الوسائط المرفقة
  function clearMediaAttachment() {
    const fileInput = document.getElementById('mediaFile');
    if (fileInput) {
      fileInput.value = '';
    }
    const mediaPreview = document.getElementById('mediaPreview');
    if (mediaPreview) {
      mediaPreview.style.display = 'none';
    }
  }
  
  // التعامل مع لصق الصور
  function handlePasteImage(event) {
    if (event.clipboardData && event.clipboardData.items) {
      const items = event.clipboardData.items;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          event.preventDefault();
          
          const file = items[i].getAsFile();
          if (!file) continue;
          
          const timestamp = new Date().getTime();
          const fileName = `pasted-image-${timestamp}.png`;
          
          const newFile = new File([file], fileName, { type: file.type });
          
          const fileInputEl = document.getElementById('mediaFile');
          if (fileInputEl) {
            const dt = new DataTransfer();
            dt.items.add(newFile);
            fileInputEl.files = dt.files;
            
            window.showToast && window.showToast('تم لصق الصورة بنجاح وإضافتها كمرفق', 'success');
            
            if (typeof window.handleFileSelection === 'function') {
              window.handleFileSelection();
            } else {
              handleFileSelection();
            }
          }
          break; // الاكتفاء بأول صورة فقط
        }
      }
    }
  }
  
  // إضافة أنماط
  function addCaptureStyles() {
    if (!document.getElementById('captureMediaStyles')) {
      const style = document.createElement('style');
      style.id = 'captureMediaStyles';
      style.textContent = `
        .media-capture-btn {
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
        }
        .recording-active {
          animation: pulse 1.5s infinite;
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        .camera-container {
          position: relative;
          background-color: #000;
          overflow: hidden;
          border-radius: 8px;
        }
        #cameraStream {
          width: 100%;
          border-radius: 8px;
        }
        .capture-button {
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background-color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
          border: 4px solid #f8f9fa;
          cursor: pointer;
        }
        .capture-button:hover {
          background-color: #e9ecef;
        }
        .capture-inner-circle {
          width: 45px;
          height: 45px;
          border-radius: 50%;
          background-color: #f8f9fa;
          transition: all 0.2s;
        }
        .capture-button:hover .capture-inner-circle {
          width: 40px;
          height: 40px;
          background-color: #dee2e6;
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  // دالة اختيار الملف
  function handleFileSelection() {
    const fileInput = document.getElementById('mediaFile');
    const mediaPreview = document.getElementById('mediaPreview');
    const mediaFileName = document.getElementById('mediaFileName');
    const uploadMediaType = document.getElementById('uploadMediaType');
    
    if (fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      
      mediaFileName.textContent = file.name;
      
      let mediaType = 'document';
      if (file.type.startsWith('image/')) {
        mediaType = 'image';
      } else if (file.type.startsWith('video/')) {
        mediaType = 'video';
      } else if (file.type.startsWith('audio/')) {
        mediaType = 'audio';
      }
      
      uploadMediaType.value = mediaType;
      
      const supportedTypes = {
        'image': ['image/jpeg', 'image/png', 'image/webp'],
        'video': ['video/mp4', 'video/3gpp'],
        'audio': ['audio/aac', 'audio/mp4', 'audio/mpeg', 'audio/amr', 'audio/ogg'],
        'document': [
          'application/pdf', 
          'application/vnd.ms-powerpoint', 
          'application/msword', 
          'application/vnd.ms-excel', 
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
          'application/vnd.openxmlformats-officedocument.presentationml.presentation', 
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
          'text/plain'
        ]
      };
      
      let isSupported = false;
      for (const type in supportedTypes) {
        if (supportedTypes[type].includes(file.type)) {
          isSupported = true;
          break;
        }
      }
      
      if (!isSupported) {
        window.showToast && window.showToast(
          `نوع الملف ${file.type} غير مدعوم. استخدم صور (JPEG/PNG/WEBP) أو فيديو (MP4) أو صوت (OGG/MP3) أو مستندات.`,
          'warning'
        );
        fileInput.value = '';
        return;
      }
      
      mediaPreview.style.display = 'block';
      if (window.uploadMedia) {
        window.uploadMedia();
      }
    }
  }
  
  /**
   * دالة رئيسية لتهيئة الأزرار والأحداث
   * حتى تعمل سواء كان التحميل عبر AJAX أو مباشرةً
   */
  function initConversationUploadUtils() {
    addCaptureStyles();
    
    // زر التسجيل
    const recordBtn = document.getElementById('recordAudioBtn');
    if (recordBtn) {
      recordBtn.removeEventListener('click', handleAudioRecording);
      recordBtn.addEventListener('click', handleAudioRecording);
    }
    
    // زر فتح الكاميرا
    const captureBtn = document.getElementById('captureImageBtn');
    if (captureBtn) {
      captureBtn.removeEventListener('click', openCameraCapture);
      captureBtn.addEventListener('click', openCameraCapture);
    }
    
    // زر التقاط الصورة
    const capturePhotoBtn = document.getElementById('capturePhotoBtn');
    if (capturePhotoBtn) {
      capturePhotoBtn.removeEventListener('click', capturePhoto);
      capturePhotoBtn.addEventListener('click', capturePhoto);
    }
    
    // زر إغلاق الكاميرا
    const closeCameraBtn = document.getElementById('closeCameraCaptureBtn');
    if (closeCameraBtn) {
      closeCameraBtn.removeEventListener('click', closeCameraCapture);
      closeCameraBtn.addEventListener('click', closeCameraCapture);
    }
    
    const cancelCameraBtn = document.getElementById('cancelCameraCaptureBtn');
    if (cancelCameraBtn) {
      cancelCameraBtn.removeEventListener('click', closeCameraCapture);
      cancelCameraBtn.addEventListener('click', closeCameraCapture);
    }
    
    // زر مسح المرفق
    const clearMediaBtn = document.getElementById('clearMediaAttachmentBtn');
    if (clearMediaBtn) {
      clearMediaBtn.removeEventListener('click', clearMediaAttachment);
      clearMediaBtn.addEventListener('click', clearMediaAttachment);
    }
    
    // زر مسح نص الرسالة
    const clearReplyMessageBtn = document.getElementById('clearReplyMessageBtn');
    if (clearReplyMessageBtn) {
      clearReplyMessageBtn.addEventListener('click', function() {
        const replyMsg = document.getElementById('replyMessage');
        if (replyMsg) {
          replyMsg.value = '';
        }
      });
    }
    
    // ربط الـfile input بتغيير الملفات
    const fileInput = document.getElementById('mediaFile');
    if (fileInput) {
      fileInput.removeEventListener('change', handleFileSelection);
      fileInput.addEventListener('change', handleFileSelection);
    }
    
    // ربط حقل الكتابة بحدث اللصق للصور
    const messageInput = document.getElementById('replyMessage');
    if (messageInput) {
      messageInput.removeEventListener('paste', handlePasteImage);
      messageInput.addEventListener('paste', handlePasteImage);
    }
    
    console.log('تم تهيئة دوال الوسائط والتسجيل (initConversationUploadUtils) بنجاح');
  }
  
  // نكشف هذه الدوال عالمياً للاستخدام
  window.audioRecorder = audioRecorder;
  window.cameraCapture = cameraCapture;
  window.handleAudioRecording = handleAudioRecording;
  window.openCameraCapture = openCameraCapture;
  window.capturePhoto = capturePhoto;
  window.closeCameraCapture = closeCameraCapture;
  window.clearMediaAttachment = clearMediaAttachment;
  window.handleFileSelection = handleFileSelection;
  window.handlePasteImage = handlePasteImage;
  window.initConversationUploadUtils = initConversationUploadUtils;
  
})(window);
