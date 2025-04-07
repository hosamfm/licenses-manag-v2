/**
 * وحدة مساعدة للمحادثات - Conversation Utilities Module (Legacy)
 * ملاحظة: هذا ملف تاريخي مبقى للتوافقية الخلفية
 * يجب استخدام الوحدات المقسمة الجديدة المتوفرة في مجلد /js/conversation/ بدلاً منه
 * 
 * @deprecated يستخدم كجسر إلى الوحدات الجديدة المقسمة
 */

// شفافية لدوال الوحدات الجديدة
(function(window) {
  console.warn("تحذير: تستخدم conversation-utils.js المهجور. يرجى استخدام الوحدات الجديدة في مجلد /js/conversation/");
  
  // --- توجيهات الوظائف إلى الوحدات الجديدة ---
  
  // توجيهات وحدة تفاعلات الرسائل
  window.showReactionPicker = window.showReactionPicker || function() {
    console.warn("الوظيفة showReactionPicker غير متاحة - تأكد من تحميل message-reactions.js");
  };
  
  window.sendReaction = window.sendReaction || function() {
    console.warn("الوظيفة sendReaction غير متاحة - تأكد من تحميل message-reactions.js");
  };
  
  window.updateReactionInUI = window.updateReactionInUI || function() {
    console.warn("الوظيفة updateReactionInUI غير متاحة - تأكد من تحميل message-reactions.js");
  };
  
  window.updateMessageReaction = window.updateMessageReaction || function() {
    console.warn("الوظيفة updateMessageReaction غير متاحة - تأكد من تحميل message-reactions.js");
  };
  
  // توجيهات وحدة الردود على الرسائل
  window.showReplyForm = window.showReplyForm || function() {
    console.warn("الوظيفة showReplyForm غير متاحة - تأكد من تحميل message-replies.js");
  };
  
  window.clearReplyIndicator = window.clearReplyIndicator || function() {
    console.warn("الوظيفة clearReplyIndicator غير متاحة - تأكد من تحميل message-replies.js");
  };
  
  // توجيهات وحدة حالات الرسائل
  window.updateMessageStatus = window.updateMessageStatus || function() {
    console.warn("الوظيفة updateMessageStatus غير متاحة - تأكد من تحميل message-status.js");
  };
  
  window.getStatusText = window.getStatusText || function() {
    console.warn("الوظيفة getStatusText غير متاحة - تأكد من تحميل message-status.js");
  };
  
  window.setupMessageReadObserver = window.setupMessageReadObserver || function() {
    console.warn("الوظيفة setupMessageReadObserver غير متاحة - تأكد من تحميل message-status.js");
  };
  
  window.markMessagesAsRead = window.markMessagesAsRead || function() {
    console.warn("الوظيفة markMessagesAsRead غير متاحة - تأكد من تحميل message-status.js");
  };
  
  // توجيهات وحدة وسائط الرسائل
  window.formatFileSize = window.formatFileSize || function() {
    console.warn("الوظيفة formatFileSize غير متاحة - تأكد من تحميل message-media.js");
  };
  
  window.handleFileSelection = window.handleFileSelection || function() {
    console.warn("الوظيفة handleFileSelection غير متاحة - تأكد من تحميل message-media.js");
  };
  
  window.uploadMedia = window.uploadMedia || function() {
    console.warn("الوظيفة uploadMedia غير متاحة - تأكد من تحميل message-media.js");
  };
  
  window.clearMediaAttachment = window.clearMediaAttachment || function() {
    console.warn("الوظيفة clearMediaAttachment غير متاحة - تأكد من تحميل message-media.js");
  };
  
  window.openMediaPreview = window.openMediaPreview || function() {
    console.warn("الوظيفة openMediaPreview غير متاحة - تأكد من تحميل message-media.js");
  };
  
  window.setupAudioPlayers = window.setupAudioPlayers || function() {
    console.warn("الوظيفة setupAudioPlayers غير متاحة - تأكد من تحميل message-media.js");
  };
  
  window.setupDragAndDropOnMessageInput = window.setupDragAndDropOnMessageInput || function() {
    console.warn("الوظيفة setupDragAndDropOnMessageInput غير متاحة - تأكد من تحميل message-media.js");
  };
  
  // توجيهات وحدة إرسال الرسائل
  window.sendReply = window.sendReply || function() {
    console.warn("الوظيفة sendReply غير متاحة - تأكد من تحميل message-sending.js");
  };
  
  window.playNotificationSound = window.playNotificationSound || function() {
    console.warn("الوظيفة playNotificationSound غير متاحة - تأكد من تحميل message-sending.js");
  };
  
  window.formatTime = window.formatTime || function() {
    console.warn("الوظيفة formatTime غير متاحة - تأكد من تحميل message-sending.js");
  };
  
  window.addMessageToConversation = window.addMessageToConversation || function() {
    console.warn("الوظيفة addMessageToConversation غير متاحة - تأكد من تحميل message-sending.js");
  };
  
  // توجيهات وحدة إدارة المحادثات
  window.closeConversation = window.closeConversation || function() {
    console.warn("الوظيفة closeConversation غير متاحة - تأكد من تحميل conversation-management.js");
    return Promise.reject(new Error("الوظيفة closeConversation غير متاحة - تأكد من تحميل conversation-management.js"));
  };
  
  window.reopenConversation = window.reopenConversation || function() {
    console.warn("الوظيفة reopenConversation غير متاحة - تأكد من تحميل conversation-management.js");
    return Promise.reject(new Error("الوظيفة reopenConversation غير متاحة - تأكد من تحميل conversation-management.js"));
  };
  
  window.updateConversationHeader = window.updateConversationHeader || function() {
    console.warn("الوظيفة updateConversationHeader غير متاحة - تأكد من تحميل conversation-management.js");
  };
  
  // توجيهات وحدة أحداث الرسائل
  window.setupMessageActions = window.setupMessageActions || function() {
    console.warn("الوظيفة setupMessageActions غير متاحة - تأكد من تحميل message-actions.js");
  };
  
  window.attachConversationEventListeners = window.attachConversationEventListeners || function() {
    console.warn("الوظيفة attachConversationEventListeners غير متاحة - تأكد من تحميل message-actions.js");
  };
  
  // توجيهات وحدة تعيين المحادثات
  window.setupAssignmentButtons = window.setupAssignmentButtons || function() {
    console.warn("الوظيفة setupAssignmentButtons غير متاحة - تأكد من تحميل conversation-assignment.js");
  };
  
  window.assignConversationToMe = window.assignConversationToMe || function() {
    console.warn("الوظيفة assignConversationToMe غير متاحة - تأكد من تحميل conversation-assignment.js");
  };
  
  window.showAssignmentModal = window.showAssignmentModal || function() {
    console.warn("الوظيفة showAssignmentModal غير متاحة - تأكد من تحميل conversation-assignment.js");
  };
  
  // توجيهات وحدة صفحات المحادثات
  window.conversationPagination = window.conversationPagination || {
    initialize: function() {
      console.warn("الوظيفة conversationPagination.initialize غير متاحة - تأكد من تحميل conversation-pagination.js");
    },
    loadMoreMessages: function() {
      console.warn("الوظيفة conversationPagination.loadMoreMessages غير متاحة - تأكد من تحميل conversation-pagination.js");
    }
  };
  
  // توجيهات وحدة التعليقات الداخلية
  window.addInternalNote = window.addInternalNote || function() {
    console.warn("الوظيفة addInternalNote غير متاحة - تأكد من تحميل conversation-notes.js");
  };
  
  window.addInternalNoteButton = window.addInternalNoteButton || function() {
    console.warn("الوظيفة addInternalNoteButton غير متاحة - تأكد من تحميل conversation-notes.js");
  };
  
  window.openInternalNoteModal = window.openInternalNoteModal || function() {
    console.warn("الوظيفة openInternalNoteModal غير متاحة - تأكد من تحميل conversation-notes.js");
  };
  
  window.initInternalNoteModal = window.initInternalNoteModal || function() {
    console.warn("الوظيفة initInternalNoteModal غير متاحة - تأكد من تحميل conversation-notes.js");
  };
  
  window.fetchUsersForMention = window.fetchUsersForMention || function() {
    console.warn("الوظيفة fetchUsersForMention غير متاحة - تأكد من تحميل conversation-notes.js");
    return Promise.resolve([]);
  };
  
})(window);