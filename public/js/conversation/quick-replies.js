'use strict';

/**
 * وحدة الردود السريعة - Quick Replies Module
 * تضيف القدرة على البحث عن ردود سريعة واستخدامها
 */

(function(window) {
    // تعريف المتغيرات الخاصة بالوحدة
    let quickRepliesCache = [];
    let fetchTimestamp = 0;
    let replyMessageInput;
    let suggestionsContainer;
    let messageInputContainer;
    let conversationMainContainer;
    let isInitialized = false;
    let selectedSuggestionIndex = -1;

    // دالة لجلب الردود السريعة
    async function fetchQuickReplies() {
        if (quickRepliesCache.length === 0 || (Date.now() - fetchTimestamp > 300000)) { // Cache for 5 minutes
            try {
                // console.log('Quick Replies: Fetching...');
                const response = await fetch('/api/quick-replies');
                if (!response.ok) {
                    let errorBody = '';
                    try { errorBody = await response.json(); } catch (e) {}
                    // console.error('Quick Replies: API response not OK:', response.status, errorBody);
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                if (Array.isArray(data)) {
                    quickRepliesCache = data;
                } else {
                    // console.warn('Quick Replies: Unexpected data format:', data);
                    quickRepliesCache = [];
                }
                fetchTimestamp = Date.now();
                // console.log(`Quick Replies: Fetched ${quickRepliesCache.length} replies.`);
            } catch (error) {
                // console.error('Quick Replies: Failed to fetch:', error);
                quickRepliesCache = [];
            }
        }
        return quickRepliesCache;
    }

    // دالة لعرض الاقتراحات
    function showSuggestions(filteredReplies) {
        if (!suggestionsContainer || !replyMessageInput || !messageInputContainer) return;

        suggestionsContainer.innerHTML = '';
        if (filteredReplies.length === 0) {
            suggestionsContainer.style.display = 'none';
            return;
        }

        filteredReplies.forEach(reply => {
            if (!reply || typeof reply.shortcut !== 'string' || typeof reply.text !== 'string') {
                // console.warn('Quick Replies: Ignoring invalid reply format:', reply);
                return;
            }
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'list-group-item list-group-item-action quick-reply-suggestion';
            item.innerHTML = `<strong>/${reply.shortcut}</strong> - ${reply.text.substring(0, 50)}${reply.text.length > 50 ? '...' : ''}`;
            item.addEventListener('click', () => {
                replyMessageInput.value = reply.text;
                suggestionsContainer.style.display = 'none';
                replyMessageInput.focus();
                // Trigger input event to update textarea height etc.
                replyMessageInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
            suggestionsContainer.appendChild(item);
        });

        if (suggestionsContainer.children.length > 0) {
            // Position the suggestions container above the input field
            const inputRect = replyMessageInput.getBoundingClientRect();
            const containerRect = messageInputContainer.getBoundingClientRect();

            suggestionsContainer.style.position = 'absolute';
            suggestionsContainer.style.bottom = `${containerRect.height}px`; // Position above input container
            suggestionsContainer.style.left = `${replyMessageInput.offsetLeft}px`;
            suggestionsContainer.style.width = `${replyMessageInput.offsetWidth}px`;
            suggestionsContainer.style.display = 'block';
        } else {
            suggestionsContainer.style.display = 'none';
        }
    }

    // Input event listener
    async function handleInput() {
        if (!replyMessageInput) return;
        const text = replyMessageInput.value;

        if (text.startsWith('/')) { // Show suggestions if text starts with /
            const shortcutQuery = text.substring(1).toLowerCase();
            const replies = await fetchQuickReplies();

            let filteredReplies = [];
            if (text === '/') { // Show all if only "/" is typed
                filteredReplies = replies;
            } else {
                filteredReplies = replies.filter(reply =>
                    reply && reply.shortcut && reply.shortcut.toLowerCase().startsWith(shortcutQuery)
                );
            }
            showSuggestions(filteredReplies);
        } else {
            if (suggestionsContainer) suggestionsContainer.style.display = 'none';
        }
    }

    // Keydown event listener for arrow keys, Enter, Escape
    function handleKeyDown(event) {
        if (!suggestionsContainer || suggestionsContainer.style.display !== 'block' || suggestionsContainer.children.length === 0) {
            return;
        }

        const suggestions = suggestionsContainer.querySelectorAll('.quick-reply-suggestion');
        let currentFocusIndex = -1;
        suggestions.forEach((item, index) => {
            if (item.classList.contains('active')) {
                currentFocusIndex = index;
            }
        });

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            if (currentFocusIndex < suggestions.length - 1) {
                if (currentFocusIndex !== -1) suggestions[currentFocusIndex].classList.remove('active');
                suggestions[currentFocusIndex + 1].classList.add('active');
                // suggestions[currentFocusIndex + 1].focus(); // Optional: focus for screen readers
            }
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (currentFocusIndex > 0) {
                if (currentFocusIndex !== -1) suggestions[currentFocusIndex].classList.remove('active');
                suggestions[currentFocusIndex - 1].classList.add('active');
                // suggestions[currentFocusIndex - 1].focus(); // Optional
            }
        } else if (event.key === 'Enter' && currentFocusIndex !== -1) {
            event.preventDefault();
            suggestions[currentFocusIndex].click();
        } else if (event.key === 'Escape') {
            suggestionsContainer.style.display = 'none';
        }
    }

    // Click outside listener
    function handleClickOutside(event) {
        if (suggestionsContainer && replyMessageInput && !suggestionsContainer.contains(event.target) && event.target !== replyMessageInput && !event.target.closest('.quick-reply-suggestion')) {
            suggestionsContainer.style.display = 'none';
        }
    }

     // Mouseover listener for suggestions
    function handleMouseOver(event) {
        if (event.target.classList.contains('quick-reply-suggestion')) {
            // Remove active class from others
             if (suggestionsContainer) {
                suggestionsContainer.querySelectorAll('.quick-reply-suggestion.active').forEach(item => item.classList.remove('active'));
             }
            // Add active class to the hovered item
            event.target.classList.add('active');
        }
    }

    function initQuickReplies(detailsContainer) {

       isInitialized = false; // إعادة تعيين للسماح بإعادة التهيئة إذا لزم الأمر

        // Find elements within the newly loaded container or globally
        replyMessageInput = (detailsContainer || document).querySelector('#replyMessage');
        messageInputContainer = (detailsContainer || document).querySelector('.message-input-container');
        conversationMainContainer = (detailsContainer || document).querySelector('.conversation-main-container');

        if (!replyMessageInput || !messageInputContainer || !conversationMainContainer) {
            // console.error('Quick Replies: Required elements not found (#replyMessage, .message-input-container, .conversation-main-container).');
            isInitialized = false;
            return;
        }

        // Create or find suggestions container
        suggestionsContainer = (messageInputContainer || document).querySelector('#quickReplySuggestions');
        if (!suggestionsContainer) {
            // console.log("Quick Replies: Creating suggestions container.");
            suggestionsContainer = document.createElement('div');
            suggestionsContainer.id = 'quickReplySuggestions';
            suggestionsContainer.className = 'list-group position-absolute';
            suggestionsContainer.style.display = 'none';
            suggestionsContainer.style.zIndex = '1050';
            suggestionsContainer.style.maxHeight = '200px';
            suggestionsContainer.style.overflowY = 'auto';
            
            // Find the form within the message input container
            const replyForm = messageInputContainer.querySelector('#replyForm');

            if (replyForm) {
                 messageInputContainer.style.position = 'relative'; // Needed for absolute positioning
                 // Insert the suggestions container *before* the form
                 messageInputContainer.insertBefore(suggestionsContainer, replyForm);
            } else {
                 // console.error("Quick Replies: Could not find #replyForm to insert suggestions container before.");
                 // Fallback: append to messageInputContainer (might affect layout)
                 messageInputContainer.appendChild(suggestionsContainer);
            }
        } else {
             // console.log("Quick Replies: Reusing existing suggestions container.");
             suggestionsContainer.innerHTML = ''; // Clear previous suggestions
             suggestionsContainer.style.display = 'none';
        }
        
        // --- Attach Event Listeners --- 
        // Remove existing listeners first to prevent duplicates if re-initializing
        replyMessageInput.removeEventListener('input', handleInput);
        replyMessageInput.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('click', handleClickOutside);
        if(suggestionsContainer) {
            suggestionsContainer.removeEventListener('mouseover', handleMouseOver);
        }

        // Attach new listeners
        replyMessageInput.addEventListener('input', handleInput);
        replyMessageInput.addEventListener('keydown', handleKeyDown);
        document.addEventListener('click', handleClickOutside);
        if(suggestionsContainer) {
            suggestionsContainer.addEventListener('mouseover', handleMouseOver);
        }
        // --- End Attach Event Listeners ---

        // Initial fetch of replies
        fetchQuickReplies();
        
        isInitialized = true;
        // console.log("Quick Replies: Initialization complete.");
    }
    
    // Expose the init function to the global scope or a specific namespace
    window.conversationModules = window.conversationModules || {};
    window.conversationModules.quickReplies = {
        init: initQuickReplies
    };

})(window); 