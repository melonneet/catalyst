// AI-Powered Mandarin Photo Captions - Secure Backend Architecture

// Backend API configuration
const API_BASE_URL = window.location.origin;
const BACKEND_ENDPOINTS = {
    analyzeImage: '/api/analyze-image',
    rateCaption: '/api/rate-caption',
    usage: '/api/usage',
    clearCache: '/api/clear-cache'
};

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
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Analyze image and generate captions using backend API with caching and offline support
async function analyzeImageAndGenerateCaptions(imageFile) {
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
        
        // Make request to backend
        const response = await fetch(`${API_BASE_URL}${BACKEND_ENDPOINTS.analyzeImage}`, {
            method: 'POST',
            body: formData
        });
        
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
    const container = document.getElementById('captionsContainer');
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

// File upload handling
const uploadBox = document.getElementById('uploadBox');
const fileInput = document.getElementById('fileInput');
const previewSection = document.getElementById('previewSection');
const photoPreview = document.getElementById('photoPreview');
const generatingText = document.getElementById('generatingText');

uploadBox.addEventListener('click', (e) => {
    // Only trigger if the click is not on the file input itself
    if (e.target !== fileInput) {
        fileInput.click();
    }
});

// Drag and drop
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

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleImageUpload(e.target.files[0]);
    }
});

async function handleImageUpload(file) {
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        photoPreview.src = e.target.result;
        previewSection.classList.add('active');
        generatingText.classList.add('active');
        
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
            
            displayCaptions(result.captions);
        } catch (error) {
            console.error('Error processing image:', error);
            generatingText.classList.remove('active');
            
            // Show detailed error message to user
            const container = document.getElementById('captionsContainer');
            let errorMessage = 'Sorry, there was an error analyzing your image.';
            let errorDetails = 'Please try again or check your internet connection.';
            
            // Provide more specific error information
            if (error.message.includes('offline')) {
                errorMessage = 'You are offline';
                errorDetails = 'Please check your internet connection and try again.';
            } else if (error.message.includes('response parsing error')) {
                errorMessage = 'AI Response Format Error';
                errorDetails = 'The AI service returned an unexpected response format. Please try again.';
            } else if (error.message.includes('AI service unavailable')) {
                errorMessage = 'AI Service Unavailable';
                errorDetails = 'Unable to connect to the AI analysis service. Please try again later.';
            } else if (error.message.includes('Service temporarily unavailable')) {
                errorMessage = 'Service Temporarily Unavailable';
                errorDetails = 'All AI service endpoints are currently unavailable. Please try again later.';
            } else if (error.message.includes('Failed to analyze')) {
                errorMessage = 'AI Analysis Failed';
                errorDetails = 'Unable to analyze the image content. Please try again.';
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
    previewSection.classList.remove('active');
    fileInput.value = '';
    document.getElementById('captionsContainer').innerHTML = '';
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🤔 AI-Powered Mandarin Photo Captions loaded!');
    console.log('✨ Now with secure backend architecture!');
    console.log('🔐 API keys secured on backend');
    console.log('💾 Caching and offline support enabled');
    console.log('📊 Usage tracking and rating system active');
    
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
    
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
        console.log('🌐 Back online');
    });
    
    window.addEventListener('offline', () => {
        console.log('📴 Gone offline');
    });
});
