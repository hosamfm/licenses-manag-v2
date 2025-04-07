/**
 * وحدة وسائط الرسائل - Message Media Module
 * تحتوي على الدوال المتعلقة بإدارة الوسائط (صور، فيديو، صوت، مستندات)
 */

(function(window) {

  /**
   * دالة لتنسيق حجم الملفات بشكل مقروء
   * @param {number} bytes - حجم الملف بالبايت
   * @returns {string} - الحجم المنسق (مثال: 1.5 MB)
   */
  window.formatFileSize = function(bytes) {
    if (!bytes || isNaN(bytes)) return '';
    
    const units = ['بايت', 'كيلوبايت', 'ميجابايت', 'جيجابايت', 'تيرابايت'];
    let size = parseInt(bytes, 10);
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  /**
   * دالة لمعالجة اختيار الملف
   */
  window.handleFileSelection = function() {
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
      
      // قائمة أنواع MIME المدعومة في واتساب API
      const supportedTypes = {
        'image': ['image/jpeg', 'image/png', 'image/webp'],
        'video': ['video/mp4'],
        'audio': ['audio/mpeg', 'audio/ogg', 'audio/mp3', 'audio/mp4'],
        'document': [
          'application/pdf', 
          'application/msword', 
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation'
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
      
      // تحديث نوع الوسائط إذا كان تلقائيًا
      if (uploadMediaType && uploadMediaType.value === 'auto') {
        uploadMediaType.value = mediaType;
      }
      
      // بدء تحميل الملف تلقائياً
      window.uploadMedia && window.uploadMedia();
    }
  };

  /**
   * دالة لتحميل الوسائط إلى الخادم
   */
  window.uploadMedia = function() {
    const fileInput = document.getElementById('mediaFile');
    const mediaType = document.getElementById('uploadMediaType').value;
    const conversationId = document.getElementById('uploadConversationId').value;
    const progressBar = document.querySelector('.upload-progress .progress-bar');
    const progressContainer = document.querySelector('.upload-progress');
    
    // التحقق من اختيار ملف
    if (!fileInput.files || fileInput.files.length === 0) {
      window.showToast && window.showToast('يرجى اختيار ملف للتحميل', 'warning');
      return;
    }
    
    // إنشاء FormData
    const formData = new FormData();
    formData.append('mediaFile', fileInput.files[0]);
    formData.append('mediaType', mediaType);
    formData.append('conversationId', conversationId);
    
    // إظهار شريط التقدم
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    
    // تعطيل زر التحميل (إذا كان موجودًا)
    const uploadBtn = document.getElementById('uploadMediaBtn');
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحميل...';
    }
    
    // إرسال طلب تحميل الملف باستخدام XMLHttpRequest لتتبع التقدم
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/whatsapp/media/upload', true);
    
    // مراقبة تقدم التحميل
    xhr.upload.onprogress = function(e) {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = percentComplete + '%';
        progressBar.textContent = percentComplete + '%';
        progressBar.setAttribute('aria-valuenow', percentComplete);
      }
    };
    
    // معالجة الاستجابة
    xhr.onload = function() {
      try {
        const response = JSON.parse(xhr.responseText);
        
        if (response.success) {
          document.getElementById('mediaId').value = response.media._id;
          document.getElementById('mediaType').value = response.media.mediaType;
          window.showToast && window.showToast('تم تحميل الملف بنجاح', 'success');
        } else {
          window.showToast && window.showToast(response.error || 'حدث خطأ أثناء تحميل الملف', 'danger');
        }
      } catch (error) {
        window.showToast && window.showToast('حدث خطأ أثناء معالجة الاستجابة', 'danger');
        console.error('خطأ في معالجة استجابة تحميل الملف:', error);
      } finally {
        // إخفاء شريط التقدم بعد الانتهاء
        setTimeout(function() {
          progressContainer.style.display = 'none';
        }, 1000);
      }
    };
    
    // معالجة الأخطاء
    xhr.onerror = function() {
      window.showToast && window.showToast('حدث خطأ أثناء الاتصال بالخادم', 'danger');
      
      // إخفاء شريط التقدم
      progressContainer.style.display = 'none';
    };
    
    // إرسال البيانات
    xhr.send(formData);
  };

  /**
   * دالة لمسح الملف المرفق من الرسالة
   */
  window.clearMediaAttachment = function() {
    document.getElementById('mediaPreview').style.display = 'none';
    document.getElementById('mediaFileName').textContent = '';
    document.getElementById('mediaId').value = '';
    document.getElementById('mediaType').value = '';
  };

  /**
   * دالة لفتح معاينة الوسائط
   * @param {string} url - رابط الوسائط
   * @param {string} type - نوع الوسائط
   */
  window.openMediaPreview = function(url, type) {
    // تفعيل النموذج
    const mediaModal = document.getElementById('mediaPreviewModal');
    if (!mediaModal) return;
    
    const mediaContent = document.getElementById('mediaPreviewContent');
    const downloadButton = document.getElementById('downloadMediaBtn');
    
    if (mediaContent && downloadButton) {
      mediaContent.innerHTML = '';
      
      // تعيين الرابط للتحميل
      downloadButton.href = url;
      
      // إنشاء العنصر المناسب حسب النوع
      if (type === 'image') {
        const img = document.createElement('img');
        img.src = url;
        img.className = 'img-fluid';
        img.alt = 'صورة';
        mediaContent.appendChild(img);
      } else if (type === 'video') {
        const video = document.createElement('video');
        video.controls = true;
        video.className = 'w-100';
        
        const source = document.createElement('source');
        source.src = url;
        source.type = 'video/mp4';
        
        video.appendChild(source);
        mediaContent.appendChild(video);
      } else if (type === 'audio') {
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.className = 'w-100 media-audio';
        audio.preload = 'metadata';
        
        const source = document.createElement('source');
        source.src = url;
        source.type = 'audio/ogg';
        
        audio.appendChild(source);
        mediaContent.appendChild(audio);
      }
    }
    
    // تفعيل النموذج (تحتاج إلى Bootstrap JS)
    const bsModal = new bootstrap.Modal(mediaModal);
    bsModal.show();
  };
  
  /**
   * دالة لتحسين تجربة تشغيل الملفات الصوتية
   */
  window.setupAudioPlayers = function() {
    // الحصول على جميع عناصر الصوت في الصفحة
    const audioElements = document.querySelectorAll('.media-audio');
    
    // إضافة مستمعي الأحداث لكل عنصر صوت
    audioElements.forEach(audio => {
      // إضافة حدث تحميل البيانات
      audio.addEventListener('loadedmetadata', function() {
        // تحسين عرض المدة عند تحميل الملف
        if (this.duration) {
          const durationMinutes = Math.floor(this.duration / 60);
          const durationSeconds = Math.floor(this.duration % 60);
          const formattedDuration = `${durationMinutes}:${durationSeconds < 10 ? '0' : ''}${durationSeconds}`;
          
          // إضافة سمة بيانات للمدة
          this.setAttribute('data-duration', formattedDuration);
          
          // تحسين قابلية وصول العنصر
          this.setAttribute('aria-label', `ملف صوتي، المدة ${formattedDuration}`);
        }
      });
      
      // إضافة حدث عند النقر
      audio.addEventListener('click', function(e) {
        // منع انتشار الحدث إذا كان النقر على عناصر التحكم
        if (e.target !== this) {
          e.stopPropagation();
        }
      });
      
      // إضافة حدث عند بدء التشغيل
      audio.addEventListener('play', function() {
        // إيقاف تشغيل أي ملفات صوتية أخرى عند تشغيل ملف
        audioElements.forEach(otherAudio => {
          if (otherAudio !== this && !otherAudio.paused) {
            otherAudio.pause();
          }
        });
      });
    });
  };

  /**
   * دالة لتفعيل خاصية السحب والإفلات على منطقة الكتابة
   * @param {HTMLElement} messageInput - عنصر منطقة الكتابة
   */
  window.setupDragAndDropOnMessageInput = function(messageInput) {
    if (!messageInput) return;

    // إضافة أنماط CSS لتأثيرات السحب والإفلات
    if (!document.getElementById('messageDragDropStyles')) {
      const style = document.createElement('style');
      style.id = 'messageDragDropStyles';
      style.textContent = `
        .message-input-container {
          position: relative;
        }
        .message-input {
          transition: all 0.3s;
        }
        .message-input.drag-over {
          background-color: #e9ecef;
          border-color: #6c757d;
        }
        .message-input-actions {
          position: absolute;
          left: 10px;
          bottom: 10px;
          z-index: 5;
        }
        .rtl .message-input-actions {
          left: auto;
          right: 10px;
        }
      `;
      document.head.appendChild(style);
    }

    // أحداث السحب والإفلات
    messageInput.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.add('drag-over');
    });

    messageInput.addEventListener('dragleave', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove('drag-over');
    });

    messageInput.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      this.classList.remove('drag-over');
      
      // التأكد من وجود ملفات
      if (e.dataTransfer.files.length) {
        const fileInput = document.getElementById('mediaFile');
        if (fileInput) {
          fileInput.files = e.dataTransfer.files;
          // استخدام الدالة المعرفة في النطاق العالمي
          window.handleFileSelection && window.handleFileSelection();
        }
      }
    });
  };

  // استدعاء بعض الدوال عند تحميل الصفحة
  window.addEventListener('DOMContentLoaded', function() {
    window.setupAudioPlayers();
    
    // إضافة حدث لتحديث مشغلات الصوت بعد تحميل محتوى الرسائل
    document.addEventListener('messages-loaded', function() {
      window.setupAudioPlayers();
    });
  });

})(window); 