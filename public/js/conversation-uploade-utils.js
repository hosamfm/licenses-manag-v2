/**
 * وحدة مساعدة لتسجيل الصوت والتقاط الصور في المحادثات
 * هذا الملف يحتوي على دوال خاصة بالتقاط الوسائط مباشرة من المتصفح
 */

// نافذة عالمية للوظائف المشتركة
(function(window) {
  // كائن عام للتعامل مع تسجيل الصوت
  const audioRecorder = {
    mediaRecorder: null,
    audioChunks: [],
    stream: null,
    isRecording: false,
    maxDuration: 60000, // مدة التسجيل القصوى بالميلي ثانية (60 ثانية)
    recordingTimer: null,
    
    /**
     * بدء تسجيل الصوت
     * @param {Function} onStartCallback دالة يتم استدعاؤها عند بدء التسجيل
     */
    startRecording: async function(onStartCallback) {
      try {
        // الحصول على إذن استخدام الميكروفون
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // إنشاء كائن مسجل الصوت
        this.mediaRecorder = new MediaRecorder(this.stream);
        this.audioChunks = [];
        
        // إضافة مستمع لحدث البيانات
        this.mediaRecorder.addEventListener('dataavailable', (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        });
        
        // بدء التسجيل
        this.mediaRecorder.start();
        this.isRecording = true;
        
        // إيقاف التسجيل تلقائيًا بعد المدة القصوى
        this.recordingTimer = setTimeout(() => {
          if (this.isRecording) {
            this.stopRecording();
          }
        }, this.maxDuration);
        
        // استدعاء دالة رد النداء (إذا تم توفيرها)
        if (typeof onStartCallback === 'function') {
          onStartCallback();
        }
        
        // تحديث حالة الزر
        updateRecordButtonState(true);
      } catch (error) {
        console.error('خطأ في بدء تسجيل الصوت:', error);
        window.showToast && window.showToast('لا يمكن الوصول إلى الميكروفون. يرجى التحقق من إذن الوصول.', 'danger');
      }
    },
    
    /**
     * إيقاف تسجيل الصوت وتحويله إلى ملف
     */
    stopRecording: function() {
      return new Promise((resolve) => {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
          resolve(null);
          return;
        }
        
        // إضافة مستمع لحدث إيقاف التسجيل
        this.mediaRecorder.addEventListener('stop', async () => {
          // إيقاف كل المسارات في الدفق
          if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
          }
          
          // إنشاء ملف صوتي من البيانات المسجلة
          if (this.audioChunks.length > 0) {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/ogg; codecs=opus' });
            const audioFile = new File([audioBlob], 'voice-message.ogg', { type: 'audio/ogg' });
            
            // تهيئة الحالة لتسجيل جديد
            this.isRecording = false;
            this.audioChunks = [];
            
            // تحديث حالة الزر
            updateRecordButtonState(false);
            
            // إرجاع ملف الصوت
            resolve(audioFile);
          } else {
            resolve(null);
          }
        });
        
        // إيقاف التسجيل
        this.mediaRecorder.stop();
        
        // إلغاء المؤقت
        if (this.recordingTimer) {
          clearTimeout(this.recordingTimer);
          this.recordingTimer = null;
        }
      });
    },
    
    /**
     * إلغاء التسجيل الحالي
     */
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
        
        // تحديث حالة الزر
        updateRecordButtonState(false);
      }
    }
  };
  
  // كائن عام للتعامل مع التقاط الصور
  const cameraCapture = {
    videoStream: null,
    videoElement: null,
    
    /**
     * فتح الكاميرا وعرضها في عنصر الفيديو
     * @param {HTMLVideoElement} videoElement عنصر الفيديو لعرض الكاميرا
     */
    startCamera: async function(videoElement) {
      try {
        // إغلاق أي دفق سابق
        this.stopCamera();
        
        // الحصول على إذن استخدام الكاميرا
        this.videoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        
        // عرض الفيديو
        this.videoElement = videoElement;
        videoElement.srcObject = this.videoStream;
        
        // انتظار تحميل الفيديو
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
    
    /**
     * التقاط صورة من الكاميرا
     * @returns {File|null} ملف الصورة أو null في حالة الفشل
     */
    capturePhoto: function() {
      if (!this.videoElement || !this.videoStream) {
        return null;
      }
      
      try {
        // إنشاء عنصر canvas بنفس أبعاد الفيديو
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // تعيين أبعاد canvas لتطابق أبعاد الفيديو
        canvas.width = this.videoElement.videoWidth;
        canvas.height = this.videoElement.videoHeight;
        
        // رسم الصورة على canvas
        context.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
        
        // تحويل الصورة إلى ملف
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
    
    /**
     * إغلاق الكاميرا وتحرير الموارد
     */
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
  
  /**
   * تحديث حالة زر التسجيل
   * @param {boolean} isRecording حالة التسجيل
   */
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
  
  /**
   * دالة للتعامل مع زر تسجيل الصوت
   */
  function handleAudioRecording() {
    // إذا كان التسجيل نشطًا، قم بإيقافه وإرسال الملف
    if (audioRecorder.isRecording) {
      audioRecorder.stopRecording().then(audioFile => {
        if (audioFile) {
          // إضافة الملف إلى عنصر إدخال الملف
          const fileInputEl = document.getElementById('mediaFile');
          if (fileInputEl) {
            // إنشاء قائمة ملفات جديدة تحتوي على ملف الصوت
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(audioFile);
            fileInputEl.files = dataTransfer.files;
            
            // استدعاء دالة معالجة الملف
            if (typeof window.handleFileSelection === 'function') {
              window.handleFileSelection();
            } else {
              handleFileSelection();
            }
          }
        }
      });
    } else {
      // بدء تسجيل جديد
      audioRecorder.startRecording();
    }
  }
  
  /**
   * دالة لفتح نافذة التقاط الصور
   */
  function openCameraCapture() {
    // عرض نافذة الكاميرا
    const modal = new bootstrap.Modal(document.getElementById('cameraCaptureModal'));
    modal.show();
    
    // تشغيل الكاميرا
    const videoElement = document.getElementById('cameraStream');
    if (videoElement) {
      cameraCapture.startCamera(videoElement).then((success) => {
        if (!success) {
          modal.hide();
        }
      });
    }
  }
  
  /**
   * دالة لالتقاط صورة من الكاميرا
   */
  async function capturePhoto() {
    const photo = await cameraCapture.capturePhoto();
    if (photo) {
      // إغلاق النافذة المنبثقة
      const modal = bootstrap.Modal.getInstance(document.getElementById('cameraCaptureModal'));
      if (modal) {
        modal.hide();
      }
      
      // إضافة الصورة إلى عنصر إدخال الملف
      const fileInputEl = document.getElementById('mediaFile');
      if (fileInputEl) {
        // إنشاء قائمة ملفات جديدة تحتوي على الصورة
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(photo);
        fileInputEl.files = dataTransfer.files;
        
        // استدعاء دالة معالجة الملف
        if (typeof window.handleFileSelection === 'function') {
          window.handleFileSelection();
        } else {
          handleFileSelection();
        }
      }
    }
  }
  
  /**
   * دالة لإغلاق نافذة الكاميرا
   */
  function closeCameraCapture() {
    cameraCapture.stopCamera();
  }
  
  /**
   * دالة لمسح الوسائط المرفقة
   */
  function clearMediaAttachment() {
    // تفريغ عنصر إدخال الملف
    const fileInput = document.getElementById('mediaFile');
    if (fileInput) {
      fileInput.value = '';
    }
    
    // إخفاء معاينة الوسائط
    const mediaPreview = document.getElementById('mediaPreview');
    if (mediaPreview) {
      mediaPreview.style.display = 'none';
    }
  }
  
  // أنماط CSS لأزرار التسجيل والكاميرا
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
  
  /**
   * دالة معالجة اختيار الملف
   */
  function handleFileSelection() {
    const fileInput = document.getElementById('mediaFile');
    const mediaPreview = document.getElementById('mediaPreview');
    const mediaFileName = document.getElementById('mediaFileName');
    const uploadMediaType = document.getElementById('uploadMediaType');
    
    if (fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];
      
      // عرض اسم الملف
      mediaFileName.textContent = file.name;
      
      // تحديد نوع الملف وتحديث القيمة
      let mediaType = 'document';
      
      if (file.type.startsWith('image/')) {
        mediaType = 'image';
      } else if (file.type.startsWith('video/')) {
        mediaType = 'video';
      } else if (file.type.startsWith('audio/')) {
        mediaType = 'audio';
      }
      
      // تحديث نوع الوسائط
      uploadMediaType.value = mediaType;
      
      // التحقق من دعم نوع الملف
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
      
      // التحقق من دعم نوع الملف
      let isSupported = false;
      for (const type in supportedTypes) {
        if (supportedTypes[type].includes(file.type)) {
          isSupported = true;
          break;
        }
      }
      
      if (!isSupported) {
        window.showToast && window.showToast(`نوع الملف ${file.type} غير مدعوم في واتساب. الأنواع المدعومة هي: JPEG, PNG, WEBP للصور، MP4 للفيديو، MP3/OGG للصوت، PDF/DOC/DOCX/XLS/XLSX للمستندات.`, 'warning');
        fileInput.value = '';
        return;
      }
      
      // إظهار معاينة الملف
      mediaPreview.style.display = 'block';
      
      // بدء تحميل الملف تلقائياً
      if (window.uploadMedia) {
        window.uploadMedia();
      }
    }
  }
  
  // تصدير الكائنات والدوال للاستخدام العام
  window.audioRecorder = audioRecorder;
  window.cameraCapture = cameraCapture;
  window.handleAudioRecording = handleAudioRecording;
  window.openCameraCapture = openCameraCapture;
  window.capturePhoto = capturePhoto;
  window.closeCameraCapture = closeCameraCapture;
  window.clearMediaAttachment = clearMediaAttachment;
  window.handleFileSelection = handleFileSelection;
  
  // إضافة مستمعات الأحداث عند تحميل المستند
  document.addEventListener('DOMContentLoaded', function() {
    // إضافة الأنماط
    addCaptureStyles();
    
    // ربط مستمعات الأزرار
    const recordBtn = document.getElementById('recordAudioBtn');
    if (recordBtn) {
      recordBtn.addEventListener('click', handleAudioRecording);
    }
    
    const captureBtn = document.getElementById('captureImageBtn');
    if (captureBtn) {
      captureBtn.addEventListener('click', openCameraCapture);
    }
    
    const capturePhotoBtn = document.getElementById('capturePhotoBtn');
    if (capturePhotoBtn) {
      capturePhotoBtn.addEventListener('click', capturePhoto);
    }
    
    const closeCameraBtn = document.getElementById('closeCameraCaptureBtn');
    if (closeCameraBtn) {
      closeCameraBtn.addEventListener('click', closeCameraCapture);
    }
    
    const cancelCameraBtn = document.getElementById('cancelCameraCaptureBtn');
    if (cancelCameraBtn) {
      cancelCameraBtn.addEventListener('click', closeCameraCapture);
    }
    
    const clearMediaBtn = document.getElementById('clearMediaAttachmentBtn');
    if (clearMediaBtn) {
      clearMediaBtn.addEventListener('click', clearMediaAttachment);
    }
    
    const clearReplyMessageBtn = document.getElementById('clearReplyMessageBtn');
    if (clearReplyMessageBtn) {
      clearReplyMessageBtn.addEventListener('click', function() {
        document.getElementById('replyMessage').value = '';
      });
    }
    
    // ربط أحداث التفاعل والرد
    const reactionButtons = document.querySelectorAll('[id^="reactionBtn_"]');
    reactionButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        const msgId = this.id.split('_')[1];
        const externalId = this.getAttribute('data-external-id') || '';
        if (window.showReactionPicker) {
          window.showReactionPicker(msgId, externalId, this);
        }
      });
    });
    
    const replyButtons = document.querySelectorAll('[id^="replyBtn_"]');
    replyButtons.forEach(btn => {
      btn.addEventListener('click', function() {
        const msgId = this.id.split('_')[1];
        const externalId = this.getAttribute('data-external-id') || '';
        if (window.showReplyForm) {
          window.showReplyForm(msgId, externalId, this.closest('.message'));
        }
      });
    });
    
    console.log('تم تهيئة وظائف الوسائط والتسجيل بنجاح');
  });
  
})(window);
