// Comprehensive Chinese Learning Platform - Road to H1 Chinese

// Backend API configuration
const API_BASE_URL = window.location.origin;
const BACKEND_ENDPOINTS = {
    analyzeImage: '/api/analyze-image',
    rateCaption: '/api/rate-caption',
    usage: '/api/usage',
    clearCache: '/api/clear-cache',
    dictionary: '/api/dictionary'
};

// Global variables for the new features
let selectedVoice = 'female-standard';
let currentUtterance = null;
let searchHistory = JSON.parse(localStorage.getItem('chineseDictionaryHistory') || '[]');
let learningHistory = JSON.parse(localStorage.getItem('learningHistory') || '[]');
let currentFilter = 'all';
let currentSearchTerm = '';
let currentImageFile = null; // Store the current image file

// Offline storage for cached responses
const CACHE_KEY = 'mandarin_captions_cache';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Usage tracking
let usageStats = {
    totalRequests: 0,
    cacheHits: 0,
    offlineRequests: 0
};

// Load usage stats from localStorage
function loadUsageStats() {
    const saved = localStorage.getItem('usage_stats');
    if (saved) {
        usageStats = { ...usageStats, ...JSON.parse(saved) };
    }
}

// Save usage stats to localStorage
function saveUsageStats() {
    localStorage.setItem('usage_stats', JSON.stringify(usageStats));
}

// Check if we're online
function isOnline() {
    return navigator.onLine;
}

// Get cached response
function getCachedResponse(imageHash) {
    try {
        const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
        const cached = cache[imageHash];
        
        if (cached && (Date.now() - cached.timestamp) < CACHE_EXPIRY) {
            console.log('📦 Using cached response');
            usageStats.cacheHits++;
            saveUsageStats();
            return cached.data;
        }
    } catch (error) {
        console.warn('Error reading cache:', error);
    }
    return null;
}

// Cache response
function cacheResponse(imageHash, data) {
    try {
        const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
        cache[imageHash] = {
            data: data,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.warn('Error caching response:', error);
    }
}

// Generate image hash for caching
async function generateImageHash(file) {
    console.log('🔍 Generating hash for file:', file.name);
    
    try {
        // Try to use crypto.subtle.digest if available (requires HTTPS)
        if (window.crypto && window.crypto.subtle) {
            console.log('✅ Using crypto.subtle.digest for hash generation');
            const buffer = await file.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            console.log('✅ Generated crypto hash:', hash.substring(0, 16) + '...');
            return hash;
        } else {
            // Fallback for HTTP or browsers without crypto.subtle
            console.warn('⚠️ crypto.subtle not available, using fallback hash method');
            const fallbackHash = generateFallbackHash(file);
            console.log('✅ Generated fallback hash:', fallbackHash);
            return fallbackHash;
        }
    } catch (error) {
        console.warn('⚠️ crypto.subtle failed, using fallback hash method:', error);
        const fallbackHash = generateFallbackHash(file);
        console.log('✅ Generated fallback hash after error:', fallbackHash);
        return fallbackHash;
    }
}

// Fallback hash function for HTTP or when crypto.subtle is not available
function generateFallbackHash(file) {
    // Create a simple hash based on file properties and content
    const fileInfo = `${file.name}_${file.size}_${file.type}_${file.lastModified}`;
    
    // Simple hash function (not cryptographically secure, but good enough for caching)
    let hash = 0;
    for (let i = 0; i < fileInfo.length; i++) {
        const char = fileInfo.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Add some randomness based on current time
    const timeComponent = Date.now().toString(36);
    
    return Math.abs(hash).toString(16) + '_' + timeComponent;
}

// Analyze image and generate captions using backend API with caching and offline support
async function analyzeImageAndGenerateCaptions(imageFile, retryCount = 0) {
    const maxRetries = 2;
    
    try {
        console.log('🔍 Analyzing image content and generating captions...');
        
        // Generate hash for caching
        const imageHash = await generateImageHash(imageFile);
        
        // Check cache first
        const cached = getCachedResponse(imageHash);
        if (cached) {
            console.log('📦 Using cached response:', cached);
            // Check if cached data has the new format with captions
            if (cached.captions && Array.isArray(cached.captions)) {
                return cached;
            } else {
                console.log('⚠️ Cached data is in old format, ignoring cache');
                // Continue with fresh API call
            }
        }
        
        // Check if we're online
        if (!isOnline()) {
            throw new Error('You are offline. Please check your internet connection and try again.');
        }
        
        // Create FormData for file upload
        const formData = new FormData();
        formData.append('image', imageFile);
        
        // Make request to backend with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
        
        const response = await fetch(`${API_BASE_URL}${BACKEND_ENDPOINTS.analyzeImage}`, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to analyze image');
        }
        
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Successfully analyzed image content:', result.analysis);
            console.log('✅ Successfully generated captions:', result.captions);
            
            // Cache the result (both analysis and captions)
            cacheResponse(imageHash, result);
            
            // Update usage stats
            usageStats.totalRequests++;
            saveUsageStats();
            
            return result;
        } else {
            throw new Error('Analysis failed');
        }

    } catch (error) {
        console.error('Error analyzing image:', error);
        
        // Retry logic for certain errors
        if (retryCount < maxRetries && (
            error.message.includes('timeout') ||
            error.message.includes('network') ||
            error.message.includes('fetch') ||
            error.name === 'AbortError'
        )) {
            console.log(`🔄 Retrying request (attempt ${retryCount + 1}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
            return analyzeImageAndGenerateCaptions(imageFile, retryCount + 1);
        }
        
        throw error;
    }
}


// Rate a caption
async function rateCaption(captionId, rating, feedback = '') {
    try {
        const response = await fetch(`${API_BASE_URL}${BACKEND_ENDPOINTS.rateCaption}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                captionId: captionId,
                rating: rating,
                feedback: feedback
            })
        });
        
        if (response.ok) {
            console.log('✅ Caption rating recorded');
            return true;
        } else {
            console.warn('Failed to record rating');
            return false;
        }
    } catch (error) {
        console.error('Error rating caption:', error);
        return false;
    }
}

// Display captions with animation and rating system
function displayCaptions(captions) {
    // Try new UI container first, then fallback to legacy
    const container = document.getElementById('captionResult') || document.getElementById('captionsContainer');
    if (!container) {
        console.error('No caption container found');
        return;
    }
    
    container.innerHTML = '';
    
    // Check if captions exist and is an array
    if (!captions || !Array.isArray(captions) || captions.length === 0) {
        container.innerHTML = `
            <div class="error-message">
                <h3>No Captions Generated</h3>
                <p>Sorry, we couldn't generate captions for this image. Please try a different image.</p>
                <button onclick="resetUpload()" class="retry-btn">Try Another Photo</button>
            </div>
        `;
        return;
    }
    
    // For new UI, display first caption in simple format
    if (container.id === 'captionResult') {
        const caption = captions[0];
        container.innerHTML = `
            <div class="chinese-text">${caption.chinese}</div>
            <div class="pinyin-text">${caption.pinyin}</div>
            <div class="english-text">${caption.english}</div>
            <button class="btn" onclick="speakCaption('${caption.chinese}')" style="margin-top: 10px;">🔊 Listen to Caption</button>
        `;
        
        // Add to learning history
        addToLearningHistory('image', {
            chinese: caption.chinese,
            pinyin: caption.pinyin,
            imageUrl: document.querySelector('#imagePreview img')?.src || ''
        });
    } else {
        // Legacy UI - display all captions with rating system
        captions.forEach((caption, index) => {
            setTimeout(() => {
                const card = document.createElement('div');
                card.className = 'caption-card';
                card.setAttribute('data-caption-id', `caption_${Date.now()}_${index}`);
                
                card.innerHTML = `
                    <div class="chinese-text">
                        ${caption.chinese}
                        <button class="audio-btn" onclick="speakChinese('${caption.chinese}')" title="Play audio">
                            🔊
                        </button>
                    </div>
                    <div class="pinyin-text">${caption.pinyin}</div>
                    <div class="english-text">${caption.english}</div>
                    <div class="rating-section">
                        <div class="rating-label">Rate this caption:</div>
                        <div class="rating-stars">
                            ${[1,2,3,4,5].map(star => 
                                `<span class="star" data-rating="${star}" onclick="rateCaptionStar(this, '${card.getAttribute('data-caption-id')}')">⭐</span>`
                            ).join('')}
                        </div>
                        <div class="rating-feedback">
                            <input type="text" placeholder="Optional feedback..." class="feedback-input" data-caption-id="${card.getAttribute('data-caption-id')}">
                            <button class="feedback-btn" onclick="submitFeedback('${card.getAttribute('data-caption-id')}')">Submit</button>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            }, index * 200);
        });
    }
}

// Rate caption star
function rateCaptionStar(starElement, captionId) {
    const rating = parseInt(starElement.getAttribute('data-rating'));
    const stars = starElement.parentElement.querySelectorAll('.star');
    
    // Update visual state
    stars.forEach((star, index) => {
        if (index < rating) {
            star.style.color = '#ffd700';
            star.style.transform = 'scale(1.2)';
        } else {
            star.style.color = '#ccc';
            star.style.transform = 'scale(1)';
        }
    });
    
    // Record rating
    rateCaption(captionId, rating);
    
    // Show thank you message
    const card = document.querySelector(`[data-caption-id="${captionId}"]`);
    const ratingSection = card.querySelector('.rating-section');
    ratingSection.innerHTML = `
        <div class="rating-thanks">
            <span style="color: #27ae60;">✅ Thank you for rating!</span>
        </div>
    `;
}

// Submit feedback
async function submitFeedback(captionId) {
    const feedbackInput = document.querySelector(`[data-caption-id="${captionId}"] .feedback-input`);
    const feedback = feedbackInput.value.trim();
    
    if (feedback) {
        const success = await rateCaption(captionId, 0, feedback); // 0 rating for feedback-only
        if (success) {
            feedbackInput.value = '';
            feedbackInput.placeholder = 'Thank you for your feedback!';
            feedbackInput.style.color = '#27ae60';
        }
    }
}

// Text-to-speech function
function speakChinese(text) {
    if ('speechSynthesis' in window) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.rate = 0.8;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        // Get Chinese voice if available
        const voices = window.speechSynthesis.getVoices();
        const chineseVoice = voices.find(voice => 
            voice.lang === 'zh-CN' || 
            voice.lang.startsWith('zh')
        );
        
        if (chineseVoice) {
            utterance.voice = chineseVoice;
        }
        
        window.speechSynthesis.speak(utterance);
    } else {
        alert('Speech synthesis not supported in your browser. Try Chrome or Edge for audio playback!');
    }
}

// Image Upload Functionality for new UI
const uploadArea = document.getElementById('uploadArea');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const captionResult = document.getElementById('captionResult');
const captionLoading = document.getElementById('captionLoading');

// Legacy file upload handling (keep for compatibility)
const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const previewSection = document.getElementById('previewSection');
const photoPreview = document.getElementById('photoPreview');
const generatingText = document.getElementById('generatingText');

// New UI Image Upload Handling
if (uploadArea) {
    uploadArea.addEventListener('click', () => imageInput.click());
    
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleNewImageUpload(files[0]);
        }
    });

    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleNewImageUpload(e.target.files[0]);
        }
    });
}

// Legacy upload handling (keep for compatibility)
if (uploadBox) {
    uploadBox.addEventListener('click', (e) => {
        // Only trigger if the click is not on the file input itself
        if (e.target !== fileInput) {
            fileInput.click();
        }
    });
}

// Drag and drop (only if legacy elements exist)
if (uploadBox) {
    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.classList.add('dragover');
    });

    uploadBox.addEventListener('dragleave', () => {
        uploadBox.classList.remove('dragover');
    });

    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadBox.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0 && files[0].type.startsWith('image/')) {
            handleImageUpload(files[0]);
        }
    });
}

if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleImageUpload(e.target.files[0]);
        }
    });
}

// New UI Image Upload Handler
function handleNewImageUpload(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload a valid image file.');
        return;
    }

    // Store the file for later use
    currentImageFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.innerHTML = `<img src="${e.target.result}" alt="Uploaded image" class="image-preview">`;
    };
    reader.readAsDataURL(file);
}

// Generate Caption for new UI
function generateCaption() {
    console.log('🔍 generateCaption() called');
    
    const img = imagePreview.querySelector('img');
    if (!img) {
        alert('Please upload an image first.');
        return;
    }

    if (!currentImageFile) {
        alert('Image file not found. Please upload the image again.');
        return;
    }

    console.log('📸 Processing image file:', {
        name: currentImageFile.name,
        size: currentImageFile.size,
        type: currentImageFile.type
    });

    captionLoading.classList.add('show');
    captionResult.innerHTML = '';
    
    // Clear any previous error messages
    const errorElements = document.querySelectorAll('.error-message');
    errorElements.forEach(el => el.remove());

    // Use the stored file directly instead of converting from data URL
    analyzeImageAndGenerateCaptions(currentImageFile)
        .then(result => {
            captionLoading.classList.remove('show');
            
            if (result.captions && result.captions.length > 0) {
                const caption = result.captions[0]; // Use first caption
                captionResult.innerHTML = `
                    <div class="chinese-text">${caption.chinese}</div>
                    <div class="pinyin-text">${caption.pinyin}</div>
                    <div class="english-text">${caption.english}</div>
                    <button class="btn" onclick="speakCaption('${caption.chinese}')" style="margin-top: 10px;">🔊 Listen to Caption</button>
                `;
                
                // Add to learning history
                addToLearningHistory('image', {
                    chinese: caption.chinese,
                    pinyin: caption.pinyin,
                    imageUrl: img.src
                });
            } else {
                captionResult.innerHTML = '<p style="color: #e53e3e;">No captions generated. Please try again.</p>';
            }
        })
        .catch(error => {
            console.error('Error generating caption:', error);
            console.error('Full error object:', error);
            captionLoading.classList.remove('show');
            
            // Provide more specific error messages
            let errorMessage = 'Error generating caption. Please try again.';
            let errorDetails = '';
            
            if (error.message.includes('Unsupported file format') || error.message.includes('not supported')) {
                errorMessage = 'Unsupported File Format';
                errorDetails = 'Please use PNG, JPEG, GIF, or WebP image formats. Other formats like AVIF are not supported.';
            } else if (error.message.includes('quota has been exceeded') || error.message.includes('quota exceeded') ||
                error.message.includes('Temporary API limit') || error.message.includes('API access issue')) {
                errorMessage = 'API Temporarily Limited';
                errorDetails = 'The API is temporarily limited. Please try again later for personalized captions.';
            } else if (error.message.includes('Insufficient credits') || error.message.includes('credits')) {
                errorMessage = 'API Credits Issue';
                errorDetails = 'There\'s a temporary API credits issue. Please try again later for personalized captions.';
            } else if (error.message.includes('Rate limit exceeded')) {
                errorMessage = 'Rate Limit Exceeded';
                errorDetails = 'Too many requests. Please wait a few minutes before trying again.';
            } else if (error.message.includes('crypto.subtle')) {
                errorMessage = 'Browser compatibility issue detected.';
                errorDetails = 'Your browser may not support the required features. Please try using Chrome, Firefox, or Edge.';
            } else if (error.message.includes('offline')) {
                errorMessage = 'You are offline.';
                errorDetails = 'Please check your internet connection and try again.';
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Request timeout.';
                errorDetails = 'The request took too long. Please try again with a smaller image.';
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                errorMessage = 'Network error.';
                errorDetails = 'Unable to connect to the server. Please check your connection.';
            } else if (error.message.includes('Failed to analyze')) {
                errorMessage = 'Image analysis failed.';
                errorDetails = 'Unable to process the image. Please try a different image.';
            }
            
            captionResult.innerHTML = `
                <div style="color: #e53e3e; text-align: center; padding: 20px;">
                    <h3>${errorMessage}</h3>
                    <p>${errorDetails}</p>
                    <details style="margin-top: 15px; text-align: left;">
                        <summary style="cursor: pointer; color: #718096;">Technical Details</summary>
                        <p style="font-size: 0.8rem; margin-top: 10px; color: #718096;">
                            Error: ${error.message}
                        </p>
                    </details>
                    <button class="btn" onclick="resetUpload()" style="margin-top: 15px;">Try Again</button>
                </div>
            `;
        });
}

// Speak caption text
function speakCaption(text) {
    document.getElementById('ttsText').value = text;
    speakText();
}

async function handleImageUpload(file) {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        // Only update legacy elements if they exist
        if (photoPreview) photoPreview.src = e.target.result;
        if (previewSection) previewSection.classList.add('active');
        if (generatingText) generatingText.classList.add('active');
        
        try {
            // AI analysis and caption generation with loading indicator
            console.log('📸 Starting image analysis and caption generation for file:', file.name, 'Size:', file.size, 'Type:', file.type);
            const result = await analyzeImageAndGenerateCaptions(file);
            console.log('🔍 Full result:', result);
            console.log('🔍 Image analysis result:', result.analysis);
            console.log('📝 Generated captions:', result.captions);
            generatingText.classList.remove('active');
            
            // Validate result structure
            if (!result || !result.captions) {
                throw new Error('Invalid response structure - missing captions data');
            }
            
            // Check if captions array is empty
            if (!Array.isArray(result.captions) || result.captions.length === 0) {
                throw new Error('No captions generated - AI service returned empty results');
            }
            
            console.log('✅ Caption generation successful:', result.captions.length, 'captions generated');
            displayCaptions(result.captions);
        } catch (error) {
            console.error('Error processing image:', error);
            if (generatingText) generatingText.classList.remove('active');
            
            // Show detailed error message to user
            const container = document.getElementById('captionResult') || document.getElementById('captionsContainer');
            if (!container) {
                console.error('No container found for error display');
                return;
            }
            
            let errorMessage = 'Sorry, there was an error analyzing your image.';
            let errorDetails = 'Please try again or check your internet connection.';
            
            // Provide more specific error information
            if (error.message.includes('Unsupported file format') || error.message.includes('not supported')) {
                errorMessage = 'Unsupported File Format';
                errorDetails = 'Please use PNG, JPEG, GIF, or WebP image formats. Other formats like AVIF are not supported.';
            } else if (error.message.includes('offline')) {
                errorMessage = 'You are offline';
                errorDetails = 'Please check your internet connection and try again.';
            } else if (error.message.includes('response parsing error')) {
                errorMessage = 'AI Response Format Error';
                errorDetails = 'The AI service returned an unexpected response format. Our system will automatically retry with improved parsing. Please try again.';
            } else if (error.message.includes('No captions generated')) {
                errorMessage = 'Caption Generation Issue';
                errorDetails = 'The AI service was unable to generate personalized captions for this image. Please try again with a different image or check back later.';
            } else if (error.message.includes('AI service unavailable')) {
                errorMessage = 'AI Service Unavailable';
                errorDetails = 'Unable to connect to the AI analysis service. Please try again later.';
            } else if (error.message.includes('Service temporarily unavailable')) {
                errorMessage = 'Service Temporarily Unavailable';
                errorDetails = 'All AI service endpoints are currently unavailable. Please try again later.';
            } else if (error.message.includes('Rate limit exceeded')) {
                errorMessage = 'Service Busy';
                errorDetails = 'The service is currently busy. Please wait a moment and try again.';
            } else if (error.message.includes('Request timeout')) {
                errorMessage = 'Request Timeout';
                errorDetails = 'The request took too long to process. Please try again with a smaller image.';
            } else if (error.message.includes('Network error')) {
                errorMessage = 'Network Error';
                errorDetails = 'Unable to connect to external services. Please check your internet connection.';
            } else if (error.message.includes('Failed to analyze')) {
                errorMessage = 'AI Analysis Failed';
                errorDetails = 'Unable to analyze the image content. Our system has enhanced error handling and will retry automatically. Please try again.';
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                errorMessage = 'Network Connection Issue';
                errorDetails = 'Check your internet connection and try again.';
            }
            
            container.innerHTML = `
                <div class="error-message">
                    <h3>${errorMessage}</h3>
                    <p>${errorDetails}</p>
                    <details>
                        <summary>Technical Details</summary>
                        <p><small>Error: ${error.message}</small></p>
                    </details>
                    <button onclick="resetUpload()" class="retry-btn">Try Again</button>
                </div>
            `;
        }
    };
    
    reader.readAsDataURL(file);
}

function resetUpload() {
    // Reset new UI elements
    const imagePreview = document.getElementById('imagePreview');
    const captionResult = document.getElementById('captionResult');
    const imageInput = document.getElementById('imageInput');
    
    if (imagePreview) imagePreview.innerHTML = '';
    if (captionResult) captionResult.innerHTML = '';
    if (imageInput) imageInput.value = '';
    
    // Clear the stored image file
    currentImageFile = null;
    
    // Reset legacy UI elements (if they exist)
    const previewSection = document.getElementById('previewSection');
    const fileInput = document.getElementById('fileInput');
    const captionsContainer = document.getElementById('captionsContainer');
    
    if (previewSection) previewSection.classList.remove('active');
    if (fileInput) fileInput.value = '';
    if (captionsContainer) captionsContainer.innerHTML = '';
}

// Enhanced TTS with better voice options
function speakText(text = null) {
    const textToSpeak = text || document.getElementById('ttsText').value.trim();
    if (!textToSpeak) {
        alert('Please enter some Chinese text to speak.');
        return;
    }

    stopSpeaking();

    if ('speechSynthesis' in window) {
        currentUtterance = new SpeechSynthesisUtterance(textToSpeak);
        currentUtterance.lang = 'zh-CN';
        currentUtterance.rate = parseFloat(document.getElementById('speedSlider').value);
        
        // Enhanced voice selection
        const voices = speechSynthesis.getVoices();
        const chineseVoices = voices.filter(voice => 
            voice.lang.includes('zh') || 
            voice.lang.includes('cmn') || 
            voice.lang.includes('yue')
        );
        
        if (chineseVoices.length > 0) {
            let selectedVoiceObj = chineseVoices[0];
            
            // More sophisticated voice selection
            switch(selectedVoice) {
                case 'female-standard':
                    selectedVoiceObj = chineseVoices.find(v => 
                        v.name.toLowerCase().includes('female') || 
                        v.name.toLowerCase().includes('女') ||
                        v.name.toLowerCase().includes('mandarin')
                    ) || chineseVoices[0];
                    currentUtterance.pitch = 1.0;
                    break;
                case 'male-standard':
                    selectedVoiceObj = chineseVoices.find(v => 
                        v.name.toLowerCase().includes('male') || 
                        v.name.toLowerCase().includes('男') ||
                        v.name.toLowerCase().includes('cantonese')
                    ) || chineseVoices[1] || chineseVoices[0];
                    currentUtterance.pitch = 0.9;
                    break;
            }
            
            currentUtterance.voice = selectedVoiceObj;
        }

        currentUtterance.onstart = () => {
            document.getElementById('ttsLoading').classList.add('show');
        };

        currentUtterance.onend = () => {
            document.getElementById('ttsLoading').classList.remove('show');
        };

        currentUtterance.onerror = () => {
            document.getElementById('ttsLoading').classList.remove('show');
            alert('Error occurred during speech synthesis. Please try again.');
        };

        speechSynthesis.speak(currentUtterance);
        
        // Add to learning history
        addToLearningHistory('tts', {
            text: textToSpeak,
            voice: selectedVoice,
            speed: parseFloat(document.getElementById('speedSlider').value)
        });
    } else {
        alert('Text-to-speech is not supported in your browser.');
    }
}

function stopSpeaking() {
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }
    document.getElementById('ttsLoading').classList.remove('show');
}

// Voice Selection
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.voice-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.voice-option').forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedVoice = option.dataset.voice;
        });
    });

    // Speed Control
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');

    if (speedSlider && speedValue) {
        speedSlider.addEventListener('input', () => {
            speedValue.textContent = speedSlider.value + 'x';
        });
    }
});

// Dictionary Functionality
function handleDictionarySearch(event) {
    if (event.key === 'Enter') {
        searchDictionary();
    }
}

async function searchDictionary() {
    const searchTerm = document.getElementById('dictionarySearch').value.trim();
    if (!searchTerm) {
        alert('Please enter a Chinese character or word to search.');
        return;
    }

    const loading = document.getElementById('dictionaryLoading');
    const loadingText = document.getElementById('loadingText');
    const result = document.getElementById('dictionaryResult');
    
    loading.classList.add('show');
    result.classList.remove('show');

    try {
        console.log('Searching for:', searchTerm);
        
        // Update loading text to show AI dictionary status
        loadingText.textContent = '🤖 Looking up in AI dictionary...';
        
        const dictionaryData = await fetchDictionaryData(searchTerm);
        console.log('Dictionary data received:', dictionaryData);
        
        // Show success message briefly
        loadingText.textContent = '✅ Data retrieved successfully!';
        await new Promise(resolve => setTimeout(resolve, 500));
        
        displayDictionaryResult(dictionaryData, dictionaryData.source || 'fallback');
        addToSearchHistory(searchTerm, dictionaryData.pinyin);
        
        // Add to learning history
        addToLearningHistory('dictionary', {
            character: searchTerm,
            pinyin: dictionaryData.pinyin,
            definitions: dictionaryData.definitions,
            source: dictionaryData.source || 'fallback'
        });
        
    } catch (error) {
        console.error('Dictionary search error:', error);
        result.innerHTML = `
            <div style="color: #e53e3e; text-align: center; padding: 20px;">
                <p>Error searching dictionary. Please try again.</p>
                <p style="font-size: 0.9rem; margin-top: 10px;">Try searching for: 你好, 学习, 大学, 中国, 老师, 学生, 朋友, 家庭, 工作, 时间</p>
            </div>
        `;
        result.classList.add('show');
    } finally {
        loading.classList.remove('show');
        loadingText.textContent = 'Searching dictionary...';
    }
}

async function fetchDictionaryData(searchTerm) {
    try {
        console.log('🔍 Fetching dictionary data from API for:', searchTerm);
        
        // Check if we're online
        if (!isOnline()) {
            throw new Error('You are offline. Please check your internet connection and try again.');
        }
        
        // Make request to backend dictionary API
        const response = await fetch(`${API_BASE_URL}${BACKEND_ENDPOINTS.dictionary}/${encodeURIComponent(searchTerm)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to fetch dictionary data');
        }
        
        const result = await response.json();
        
        if (result.success && result.data) {
            console.log('✅ Dictionary data received from API:', result.data);
            return {
                ...result.data,
                source: result.source || 'api'
            };
        } else {
            throw new Error('Invalid response from dictionary API');
        }
        
    } catch (error) {
        console.error('Dictionary API error:', error);
        
        // Fallback to sample data for common words
        const sampleData = {
            '你好': {
                character: '你好',
                pinyin: 'nǐ hǎo',
                definitions: [
                    {
                        partOfSpeech: 'greeting',
                        meaning: 'Hello; Hi - a common greeting in Chinese',
                        examples: ['你好，很高兴见到你！', '你好吗？', '你好，我是小明。']
                    }
                ],
                source: 'fallback'
            },
            '学习': {
                character: '学习',
                pinyin: 'xué xí',
                definitions: [
                    {
                        partOfSpeech: 'verb',
                        meaning: 'to study; to learn; to acquire knowledge',
                        examples: ['我在学习中文。', '学习新知识很重要。', '他学习很努力。']
                    }
                ],
                source: 'fallback'
            },
            '大学': {
                character: '大学',
                pinyin: 'dà xué',
                definitions: [
                    {
                        partOfSpeech: 'noun',
                        meaning: 'university; college; higher education institution',
                        examples: ['我在北京大学学习。', '大学教育很重要。', '这所大学很有名。']
                    }
                ],
                source: 'fallback'
            },
            '中国': {
                character: '中国',
                pinyin: 'zhōng guó',
                definitions: [
                    {
                        partOfSpeech: 'noun',
                        meaning: 'China; the People\'s Republic of China',
                        examples: ['中国是一个美丽的国家。', '我来自中国。', '中国有很长的历史。']
                    }
                ],
                source: 'fallback'
            },
            '老师': {
                character: '老师',
                pinyin: 'lǎo shī',
                definitions: [
                    {
                        partOfSpeech: 'noun',
                        meaning: 'teacher; instructor; educator',
                        examples: ['我的中文老师很好。', '老师教我们学习。', '他是一位好老师。']
                    }
                ],
                source: 'fallback'
            }
        };

        // Return sample data if available, otherwise return error message
        if (sampleData[searchTerm]) {
            console.log('📚 Using fallback data for:', searchTerm);
            return sampleData[searchTerm];
        } else {
            // Re-throw the error to be handled by the calling function
            throw error;
        }
    }
}

function generatePinyin(text) {
    // Simple pinyin generation for common characters
    const pinyinMap = {
        '你': 'nǐ', '好': 'hǎo', '学': 'xué', '习': 'xí', '大': 'dà', '中': 'zhōng', '国': 'guó',
        '老': 'lǎo', '师': 'shī', '生': 'shēng', '朋': 'péng', '友': 'yǒu', '家': 'jiā', '庭': 'tíng',
        '工': 'gōng', '作': 'zuò', '时': 'shí', '间': 'jiān', '我': 'wǒ', '是': 'shì', '一': 'yī',
        '个': 'gè', '的': 'de', '在': 'zài', '很': 'hěn', '有': 'yǒu', '和': 'hé', '了': 'le',
        '不': 'bù', '要': 'yào', '会': 'huì', '来': 'lái', '到': 'dào', '去': 'qù', '上': 'shàng',
        '下': 'xià', '里': 'lǐ', '外': 'wài', '前': 'qián', '后': 'hòu', '左': 'zuǒ', '右': 'yòu'
    };
    
    return text.split('').map(char => pinyinMap[char] || char).join(' ');
}

function displayDictionaryResult(data, source = 'fallback') {
    const result = document.getElementById('dictionaryResult');
    
    // Use the source from data if available, otherwise use the parameter
    const actualSource = data.source || source;
    
    let html = `
        <div class="word-header">
            <div class="chinese-character">${data.character}</div>
            <div class="pinyin-display">${data.pinyin}</div>
            <button class="btn" onclick="speakText('${data.character}')" style="margin-left: auto;">🔊</button>
        </div>
        <div style="text-align: center; margin-bottom: 15px;">
            <span style="font-size: 0.8rem; color: #718096; background: #f7fafc; padding: 4px 8px; border-radius: 12px;">
                ${actualSource === 'openai' ? '🤖 AI-powered dictionary' : 
                  actualSource === 'api' ? '🌐 Live dictionary data' : 
                  '📚 Local dictionary'}
            </span>
        </div>
    `;

    // Check if the word is valid
    if (data.isValid === false) {
        html += `
            <div class="definition-section">
                <div class="definition-title">Not Found</div>
                <div class="definition-text" style="color: #e53e3e;">
                    ${data.notes || 'This does not appear to be a valid Chinese character or word.'}
                </div>
            </div>
        `;
    } else {
        data.definitions.forEach((def, index) => {
            html += `
                <div class="definition-section">
                    <div class="definition-title">${def.partOfSpeech.charAt(0).toUpperCase() + def.partOfSpeech.slice(1)}</div>
                    <div class="definition-text">${def.meaning}</div>
                    ${def.examples && def.examples.length > 0 ? `
                        <div class="example-sentence">
                            <strong>Examples:</strong><br>
                            ${def.examples.map(example => `• ${example}`).join('<br>')}
                        </div>
                    ` : ''}
                </div>
            `;
        });
    }

    result.innerHTML = html;
    result.classList.add('show');
}

function addToSearchHistory(character, pinyin) {
    // Remove if already exists
    searchHistory = searchHistory.filter(item => item.character !== character);
    
    // Add to beginning
    searchHistory.unshift({ character, pinyin, timestamp: Date.now() });
    
    // Keep only last 10 searches
    searchHistory = searchHistory.slice(0, 10);
    
    // Save to localStorage
    localStorage.setItem('chineseDictionaryHistory', JSON.stringify(searchHistory));
}

function searchSample(character) {
    document.getElementById('dictionarySearch').value = character;
    searchDictionary();
}

function testWebCrawling() {
    const testWords = ['你好', '学习', '大学', '中国', '老师'];
    const randomWord = testWords[Math.floor(Math.random() * testWords.length)];
    
    document.getElementById('dictionarySearch').value = randomWord;
    searchDictionary();
}

// Learning History Functions
function addToLearningHistory(type, data) {
    const historyItem = {
        id: Date.now(),
        type: type,
        timestamp: new Date().toISOString(),
        data: data
    };
    
    learningHistory.unshift(historyItem);
    
    // Keep only last 100 items
    if (learningHistory.length > 100) {
        learningHistory = learningHistory.slice(0, 100);
    }
    
    localStorage.setItem('learningHistory', JSON.stringify(learningHistory));
    updateLearningHistoryDisplay();
}

function updateLearningHistoryDisplay() {
    const historyList = document.getElementById('historyList');
    let filteredHistory = filterHistory(learningHistory, currentFilter);
    
    // Apply search filter if there's a search term
    if (currentSearchTerm) {
        filteredHistory = searchInHistory(filteredHistory, currentSearchTerm);
    }
    
    if (filteredHistory.length === 0) {
        const emptyMessage = currentSearchTerm ? 
            `No activities found matching "${currentSearchTerm}"` : 
            `No ${currentFilter === 'all' ? 'activities' : currentFilter} found in your learning history.`;
        
        historyList.innerHTML = `
            <div class="empty-history">
                <div class="empty-history-icon">${currentSearchTerm ? '🔍' : '📚'}</div>
                <p>${emptyMessage}</p>
                <p style="font-size: 0.9rem; margin-top: 10px;">${currentSearchTerm ? 'Try a different search term or clear the search.' : 'Start using the features to build your progress!'}</p>
            </div>
        `;
        return;
    }
    
    historyList.innerHTML = filteredHistory.map(item => createHistoryItemHTML(item)).join('');
}

function filterHistory(history, filter) {
    if (filter === 'all') return history;
    return history.filter(item => item.type === filter);
}

function createHistoryItemHTML(item) {
    const timeAgo = getTimeAgo(new Date(item.timestamp));
    const typeInfo = getTypeInfo(item.type);
    
    return `
        <div class="history-item-card">
            <div class="history-item-header">
                <span class="history-item-type">${typeInfo.icon} ${typeInfo.name}</span>
                <span class="history-item-time">${timeAgo}</span>
            </div>
            <div class="history-item-content">
                <div class="history-item-title">${getItemTitle(item)}</div>
                <div class="history-item-details">${getItemDetails(item)}</div>
            </div>
            <div class="history-item-actions">
                ${getItemActions(item)}
            </div>
        </div>
    `;
}

function getTypeInfo(type) {
    const types = {
        'dictionary': { name: 'Dictionary Search', icon: '📚' },
        'image': { name: 'Image Caption', icon: '📸' },
        'tts': { name: 'Text-to-Speech', icon: '🔊' }
    };
    return types[type] || { name: 'Activity', icon: '📝' };
}

function getItemTitle(item) {
    switch(item.type) {
        case 'dictionary':
            return `Searched for "${item.data.character}"`;
        case 'image':
            return `Generated caption for image`;
        case 'tts':
            return `Spoke: "${item.data.text.substring(0, 30)}${item.data.text.length > 30 ? '...' : ''}"`;
        default:
            return 'Learning Activity';
    }
}

function getItemDetails(item) {
    switch(item.type) {
        case 'dictionary':
            return `Pinyin: ${item.data.pinyin} | Found ${item.data.definitions.length} definition(s)`;
        case 'image':
            return `Chinese: ${item.data.chinese} | Pinyin: ${item.data.pinyin}`;
        case 'tts':
            return `Voice: ${item.data.voice} | Speed: ${item.data.speed}x`;
        default:
            return 'Learning activity details';
    }
}

function getItemActions(item) {
    let actions = '';
    
    switch(item.type) {
        case 'dictionary':
            actions += `<button class="btn" onclick="searchFromHistory('${item.data.character}')">Search Again</button>`;
            actions += `<button class="btn" onclick="speakText('${item.data.character}')">🔊 Speak</button>`;
            break;
        case 'image':
            actions += `<button class="btn" onclick="speakText('${item.data.chinese}')">🔊 Speak Caption</button>`;
            break;
        case 'tts':
            actions += `<button class="btn" onclick="speakText('${item.data.text}')">🔊 Speak Again</button>`;
            break;
    }
    
    actions += `<button class="btn" onclick="removeHistoryItem(${item.id})" style="background: linear-gradient(135deg, #e53e3e, #c53030);">🗑️ Remove</button>`;
    
    return actions;
}

function getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

function removeHistoryItem(id) {
    learningHistory = learningHistory.filter(item => item.id !== id);
    localStorage.setItem('learningHistory', JSON.stringify(learningHistory));
    updateLearningHistoryDisplay();
}

// History Filter Functions
function showAllHistory() {
    currentFilter = 'all';
    updateActiveButton('allHistoryBtn');
    updateLearningHistoryDisplay();
}

function showDictionaryHistory() {
    currentFilter = 'dictionary';
    updateActiveButton('dictHistoryBtn');
    updateLearningHistoryDisplay();
}

function showImageHistory() {
    currentFilter = 'image';
    updateActiveButton('imageHistoryBtn');
    updateLearningHistoryDisplay();
}

function showTTSHistory() {
    currentFilter = 'tts';
    updateActiveButton('ttsHistoryBtn');
    updateLearningHistoryDisplay();
}

function updateActiveButton(activeId) {
    document.querySelectorAll('.history-controls .btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = document.getElementById(activeId);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
}

function showProgressStats() {
    const statsContainer = document.getElementById('historyStats');
    const statsContent = document.getElementById('statsContent');
    
    if (statsContainer.style.display === 'none') {
        const stats = calculateLearningStats();
        statsContent.innerHTML = createStatsHTML(stats);
        statsContainer.style.display = 'block';
        updateActiveButton('statsBtn');
    } else {
        statsContainer.style.display = 'none';
        updateActiveButton('allHistoryBtn');
    }
}

function calculateLearningStats() {
    const totalActivities = learningHistory.length;
    const dictionarySearches = learningHistory.filter(item => item.type === 'dictionary').length;
    const imageCaptions = learningHistory.filter(item => item.type === 'image').length;
    const ttsUsage = learningHistory.filter(item => item.type === 'tts').length;
    
    const uniqueWords = new Set(learningHistory
        .filter(item => item.type === 'dictionary')
        .map(item => item.data.character)
    ).size;
    
    const lastWeek = learningHistory.filter(item => {
        const itemDate = new Date(item.timestamp);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return itemDate > weekAgo;
    }).length;
    
    return {
        totalActivities,
        dictionarySearches,
        imageCaptions,
        ttsUsage,
        uniqueWords,
        lastWeek
    };
}

function createStatsHTML(stats) {
    return `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${stats.totalActivities}</div>
                <div class="stat-label">Total Activities</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.dictionarySearches}</div>
                <div class="stat-label">Dictionary Searches</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.imageCaptions}</div>
                <div class="stat-label">Image Captions</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.ttsUsage}</div>
                <div class="stat-label">TTS Sessions</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.uniqueWords}</div>
                <div class="stat-label">Unique Words Learned</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.lastWeek}</div>
                <div class="stat-label">Activities This Week</div>
            </div>
        </div>
    `;
}

function clearAllHistory() {
    if (confirm('Are you sure you want to clear all learning history? This action cannot be undone.')) {
        learningHistory = [];
        localStorage.removeItem('learningHistory');
        updateLearningHistoryDisplay();
        document.getElementById('historyStats').style.display = 'none';
    }
}

// History Search Functions
function handleHistorySearch(event) {
    if (event.key === 'Enter') {
        filterHistoryBySearch();
    }
}

function filterHistoryBySearch() {
    const searchInput = document.getElementById('historySearch');
    currentSearchTerm = searchInput.value.trim().toLowerCase();
    updateLearningHistoryDisplay();
}

function searchInHistory(history, searchTerm) {
    if (!searchTerm) return history;
    
    return history.filter(item => {
        const searchableText = getSearchableText(item).toLowerCase();
        return searchableText.includes(searchTerm);
    });
}

function getSearchableText(item) {
    let text = '';
    
    switch(item.type) {
        case 'dictionary':
            text = `${item.data.character} ${item.data.pinyin} ${item.data.definitions.map(d => d.meaning).join(' ')}`;
            break;
        case 'image':
            text = `${item.data.chinese} ${item.data.pinyin}`;
            break;
        case 'tts':
            text = item.data.text;
            break;
    }
    
    // Add type name for searching by activity type
    text += ` ${item.type} dictionary image tts`;
    
    return text;
}

function clearHistorySearch() {
    document.getElementById('historySearch').value = '';
    currentSearchTerm = '';
    updateLearningHistoryDisplay();
}

function searchFromHistory(character) {
    document.getElementById('dictionarySearch').value = character;
    searchDictionary();
}

// Check quota status and show warnings
async function checkQuotaStatus() {
    try {
        const response = await fetch('/api/usage');
        if (response.ok) {
            const stats = await response.json();
            
            // In unlimited mode, we don't show quota warnings
            if (stats.estimatedQuotaStatus && stats.estimatedQuotaStatus.quotaWarning && !stats.estimatedQuotaStatus.unlimitedMode) {
                showQuotaWarning(stats.estimatedQuotaStatus);
            }
        }
    } catch (error) {
        console.warn('Could not check quota status:', error);
    }
}

// Show quota warning to user
function showQuotaWarning(quotaStatus) {
    const warningHtml = `
        <div id="quotaWarning" style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #f6ad55, #ed8936);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            max-width: 300px;
            font-size: 0.9rem;
        ">
            <div style="display: flex; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 1.2rem; margin-right: 8px;">⚠️</span>
                <strong>API Quota Warning</strong>
            </div>
            <div style="margin-bottom: 10px;">
                <div>Requests today: ${quotaStatus.requestsToday}/${quotaStatus.estimatedDailyLimit}</div>
                <div>Cost today: $${quotaStatus.costToday.toFixed(4)}</div>
            </div>
            <div style="font-size: 0.8rem; opacity: 0.9;">
                You're approaching the daily limit. Please try again later for personalized captions.
            </div>
            <button onclick="document.getElementById('quotaWarning').style.display='none'" 
                    style="
                        position: absolute;
                        top: 5px;
                        right: 8px;
                        background: none;
                        border: none;
                        color: white;
                        font-size: 1.2rem;
                        cursor: pointer;
                        padding: 0;
                        width: 20px;
                        height: 20px;
                    ">×</button>
        </div>
    `;
    
    // Remove existing warning if any
    const existingWarning = document.getElementById('quotaWarning');
    if (existingWarning) {
        existingWarning.remove();
    }
    
    // Add new warning
    document.body.insertAdjacentHTML('beforeend', warningHtml);
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
        const warning = document.getElementById('quotaWarning');
        if (warning) {
            warning.style.opacity = '0';
            warning.style.transition = 'opacity 0.5s ease';
            setTimeout(() => warning.remove(), 500);
        }
    }, 10000);
}

// Initialize speech synthesis voices
if ('speechSynthesis' in window) {
    // Load voices
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
    
    // Initial load
    window.speechSynthesis.getVoices();
}

// Dark Mode Functionality
function toggleTheme() {
    const body = document.body;
    const themeIcon = document.querySelector('.theme-toggle-icon');
    const currentTheme = body.getAttribute('data-theme');
    
    if (currentTheme === 'dark') {
        body.removeAttribute('data-theme');
        themeIcon.textContent = '🌙';
        localStorage.setItem('theme', 'light');
    } else {
        body.setAttribute('data-theme', 'dark');
        themeIcon.textContent = '☀️';
        localStorage.setItem('theme', 'dark');
    }
}

function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const themeIcon = document.querySelector('.theme-toggle-icon');
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.setAttribute('data-theme', 'dark');
        themeIcon.textContent = '☀️';
    } else {
        themeIcon.textContent = '🌙';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎓 Road to H1 Chinese Learning Platform loaded!');
    console.log('✨ Comprehensive Chinese learning tools active!');
    console.log('🔐 API keys secured on backend');
    console.log('💾 Caching and offline support enabled');
    console.log('📊 Usage tracking and learning history active');
    console.log('📚 Dictionary, TTS, and Image Caption features ready');
    
    // Initialize theme
    initializeTheme();
    
    // Check quota status on load
    checkQuotaStatus();
    
    // Clear old cache format to prevent issues
    try {
        const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
        let hasOldFormat = false;
        for (const [key, value] of Object.entries(cache)) {
            if (value.data && !value.data.captions) {
                hasOldFormat = true;
                break;
            }
        }
        if (hasOldFormat) {
            console.log('🧹 Clearing old cache format...');
            localStorage.removeItem(CACHE_KEY);
        }
    } catch (error) {
        console.warn('Error checking cache format:', error);
    }
    
    // Load usage stats
    loadUsageStats();
    
    // Initialize new features
    updateLearningHistoryDisplay();
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
        console.log('🌐 Back online');
    });
    
    window.addEventListener('offline', () => {
        console.log('📴 Gone offline');
    });
});
