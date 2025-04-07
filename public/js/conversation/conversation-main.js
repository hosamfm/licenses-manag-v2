/**
 * وحدة المحادثات الرئيسية - Conversation Main Module
 * هذا الملف يقوم بتحميل جميع وحدات المحادثات الأخرى وتهيئة الصفحة
 */

// استيراد الوحدات (يمكن استخدام هذه التعليقات كإشارة إلى ملفات يجب تضمينها)
// import './message-reactions.js';
// import './message-replies.js';
// import './message-media.js';
// import './message-status.js';
// import './message-sending.js';
// import './conversation-management.js';
// import './message-actions.js';

(function(window) {
  // تعيين وضع التصحيح (false لإيقاف رسائل التصحيح)
  window.debugMode = false;
  
  /**
   * تهيئة وظائف المحادثات عند تحميل الصفحة
   */
  function initializeConversationModule() {
    console.log("تهيئة وحدة المحادثات");
    
    // تحقق من وجود المتغيرات العالمية الضرورية
    if (typeof window.currentUserId === 'undefined') {
      console.warn("تحذير: المتغير currentUserId غير معرف");
    }
    
    if (typeof window.currentUsername === 'undefined') {
      console.warn("تحذير: المتغير currentUsername غير معرف");
    }
    
    // إعداد مستمعات الأحداث الرئيسية
    window.attachConversationEventListeners && window.attachConversationEventListeners();
    
    // تهيئة مراقبة قراءة الرسائل
    window.setupMessageReadObserver && window.setupMessageReadObserver();
    
    // تهيئة مشغلات الصوت
    window.setupAudioPlayers && window.setupAudioPlayers();
    
    // تنسيق التواريخ
    if (typeof window.formatAllMessageTimes === 'function') {
      setTimeout(window.formatAllMessageTimes, 500);
    }
    
    // تهيئة النوافذ المنبثقة (إذا كانت متاحة)
    if (typeof window.initInternalNoteModal === 'function') {
      window.initInternalNoteModal();
    }
    
    // تهيئة أزرار التعيين
    if (typeof window.setupAssignmentButtons === 'function') {
      window.setupAssignmentButtons();
    }
    
    // إعداد مستمعات أحداث تحميل الرسائل الجديدة
    document.addEventListener('messages-loaded', function(e) {
      console.log('تم تحميل رسائل جديدة:', e.detail);
      
      // تنسيق التواريخ للرسائل الجديدة
      if (typeof window.formatAllMessageTimes === 'function') {
        setTimeout(window.formatAllMessageTimes, 300);
      }
      
      // تهيئة مشغلات الصوت للرسائل الجديدة
      window.setupAudioPlayers && window.setupAudioPlayers();
      
      // إضافة مستمعات الأحداث للرسائل الجديدة
      window.setupMessageActions && window.setupMessageActions();
    });
  }
  
  // انتظار اكتمال تحميل الصفحة قبل تهيئة الوحدة
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeConversationModule);
  } else {
    // إذا كان المستند محملاً بالفعل
    initializeConversationModule();
  }
  
})(window); 