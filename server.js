const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('.'));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// API configuration - Multiple API keys for redundancy
const OPENROUTER_API_KEYS = [
    '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'
];
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Usage tracking
let usageStats = {
    totalRequests: 0,
    totalCost: 0,
    requestsByKey: {},
    dailyUsage: {},
    imageHashes: new Map() // For caching
};

// Load usage stats from file if exists
const USAGE_FILE = 'usage-stats.json';
if (fs.existsSync(USAGE_FILE)) {
    try {
        const savedStats = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
        usageStats = { ...usageStats, ...savedStats };
        // Convert imageHashes back to Map
        if (savedStats.imageHashes) {
            usageStats.imageHashes = new Map(Object.entries(savedStats.imageHashes));
        }
    } catch (error) {
        console.error('Error loading usage stats:', error);
    }
}

// Save usage stats to file
function saveUsageStats() {
    try {
        const statsToSave = {
            ...usageStats,
            imageHashes: Object.fromEntries(usageStats.imageHashes)
        };
        fs.writeFileSync(USAGE_FILE, JSON.stringify(statsToSave, null, 2));
    } catch (error) {
        console.error('Error saving usage stats:', error);
    }
}

// Current API key index (for round-robin)
let currentApiKeyIndex = 0;

// Function to get current API key
function getCurrentApiKey() {
    return OPENROUTER_API_KEYS[currentApiKeyIndex];
}

// Function to switch to next API key
function switchToNextApiKey() {
    currentApiKeyIndex = (currentApiKeyIndex + 1) % OPENROUTER_API_KEYS.length;
    console.log(`🔄 Switched to API key ${currentApiKeyIndex + 1} of ${OPENROUTER_API_KEYS.length}`);
}

// Function to make API request with automatic fallback
async function makeApiRequestWithFallback(requestBody, maxRetries = OPENROUTER_API_KEYS.length) {
    let lastError = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const currentKey = getCurrentApiKey();
            console.log(`🔑 Using API key ${currentApiKeyIndex + 1} (attempt ${attempt + 1}/${maxRetries})`);
            console.log(`🔗 Connecting to: ${OPENROUTER_API_URL}`);
            
            // Add timeout to prevent hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const response = await fetch(OPENROUTER_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'http://localhost:3000',
                    'X-Title': 'Mandarin Photo Captions'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            console.log(`📡 Response status: ${response.status}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ API request successful with key ${currentApiKeyIndex + 1}`);
                
                // Track usage
                const keyName = `key_${currentApiKeyIndex + 1}`;
                usageStats.requestsByKey[keyName] = (usageStats.requestsByKey[keyName] || 0) + 1;
                usageStats.totalRequests++;
                
                // Estimate cost (rough calculation)
                const estimatedCost = estimateApiCost(requestBody, data);
                usageStats.totalCost += estimatedCost;
                
                // Track daily usage
                const today = new Date().toISOString().split('T')[0];
                if (!usageStats.dailyUsage[today]) {
                    usageStats.dailyUsage[today] = { requests: 0, cost: 0 };
                }
                usageStats.dailyUsage[today].requests++;
                usageStats.dailyUsage[today].cost += estimatedCost;
                
                saveUsageStats();
                
                return data;
            } else {
                const errorText = await response.text();
                console.error(`❌ API Response Error:`);
                console.error(`   Status: ${response.status} ${response.statusText}`);
                console.error(`   Body: ${errorText}`);
                
                // Check for specific error types
                if (response.status === 401) {
                    console.error(`❌ Authentication failed - API key may be invalid`);
                    lastError = new Error('Invalid API key - please check your OpenRouter API key');
                } else if (response.status === 429) {
                    console.error(`❌ Rate limit exceeded`);
                    lastError = new Error('Rate limit exceeded - please wait before trying again');
                } else if (response.status === 402) {
                    console.error(`❌ Insufficient credits`);
                    lastError = new Error('Insufficient OpenRouter credits - please add credits to your account');
                } else {
                    lastError = new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
                }
                
                if (attempt < maxRetries - 1) {
                    switchToNextApiKey();
                }
            }
        } catch (error) {
            console.error(`❌ Network/Connection Error:`, error);
            console.error(`   Error Type: ${error.name}`);
            console.error(`   Error Message: ${error.message}`);
            console.error(`   Error Code: ${error.code}`);
            
            // Enhanced error detection
            if (error.name === 'AbortError') {
                lastError = new Error('Request timeout - API request took too long');
            } else if (error.code === 'ECONNREFUSED') {
                console.error(`❌ Connection refused - cannot reach OpenRouter API`);
                lastError = new Error('Cannot connect to OpenRouter API - check your internet connection');
            } else if (error.code === 'ENOTFOUND') {
                console.error(`❌ DNS lookup failed - cannot resolve openrouter.ai`);
                lastError = new Error('Cannot reach OpenRouter servers - check your internet connection');
            } else if (error.code === 'ETIMEDOUT') {
                console.error(`❌ Connection timeout`);
                lastError = new Error('Connection to OpenRouter timed out');
            } else if (error.message.includes('fetch')) {
                console.error(`❌ Fetch failed - likely a network issue`);
                lastError = new Error('Network request failed - check your connection');
            } else {
                lastError = error;
            }
            
            if (attempt < maxRetries - 1) {
                console.log(`⏳ Waiting 2 seconds before retry...`);
                switchToNextApiKey();
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    
    console.error(`❌ All API attempts failed. Last error:`, lastError);
    throw lastError || new Error('All API keys failed');
}

// Estimate API cost based on request and response
function estimateApiCost(requestBody, response) {
    // Rough cost estimation (adjust based on actual pricing)
    const inputTokens = JSON.stringify(requestBody).length / 4; // Rough token estimation
    const outputTokens = response.choices?.[0]?.message?.content?.length / 4 || 0;
    
    // GPT-4o-mini pricing (approximate)
    const inputCostPer1K = 0.00015;
    const outputCostPer1K = 0.0006;
    
    return (inputTokens / 1000 * inputCostPer1K) + (outputTokens / 1000 * outputCostPer1K);
}

// Generate image hash for caching
function generateImageHash(imageBuffer) {
    return crypto.createHash('sha256').update(imageBuffer).digest('hex');
}

// Check if image is cached
function getCachedResult(imageHash) {
    return usageStats.imageHashes.get(imageHash);
}

// Cache result
function cacheResult(imageHash, result) {
    usageStats.imageHashes.set(imageHash, {
        result: result,
        timestamp: Date.now(),
        accessCount: 1
    });
    saveUsageStats();
}

// Update cache access count
function updateCacheAccess(imageHash) {
    const cached = usageStats.imageHashes.get(imageHash);
    if (cached) {
        cached.accessCount++;
        cached.lastAccessed = Date.now();
        saveUsageStats();
    }
}

// Image analysis validation
function validateImageAnalysis(analysis) {
    const issues = [];
    
    if (!analysis.mainSubject || analysis.mainSubject.length < 2) {
        issues.push('mainSubject is missing or too short');
    }
    
    if (!analysis.category || analysis.category.length < 2) {
        issues.push('category is missing or too short');
    }
    
    if (!analysis.description || analysis.description.length < 10) {
        issues.push('description is missing or too short');
    }
    
    const genericTerms = ['photo', 'image', 'picture', 'something', 'object', 'thing'];
    if (genericTerms.some(term => analysis.mainSubject.toLowerCase().includes(term))) {
        issues.push('mainSubject is too generic');
    }
    
    if (genericTerms.some(term => analysis.description.toLowerCase().includes(term))) {
        issues.push('description is too generic');
    }
    
    if (analysis.confidence === 'low') {
        issues.push('low confidence in analysis');
    }
    
    if (!analysis.keywords || !Array.isArray(analysis.keywords) || analysis.keywords.length === 0) {
        issues.push('AI-generated keywords are missing');
    }
    
    return {
        isValid: issues.length === 0,
        issues: issues
    };
}

// Caption validation
function validateCaptions(captions, analysis) {
    const validatedCaptions = [];
    
    for (const caption of captions) {
        if (!caption.chinese || !caption.pinyin || !caption.english) {
            console.warn('Caption missing required fields:', caption);
            continue;
        }
        
        if (caption.relevance === 'low') {
            console.warn('Low relevance caption filtered out:', caption.chinese);
            continue;
        }
        
        const genericPhrases = [
            'è¿™æ˜¯ä¸€ä¸ª', 'è¿™æ˜¯ç…§ç‰‡', 'è¿™æ˜¯å›¾ç‰‡', 'è¿™æ˜¯ä¸œè¥¿', 'è¿™æ˜¯ç‰©ä½"',
            'this is a', 'this is an', 'this is the', 'this looks like'
        ];
        
        const isGeneric = genericPhrases.some(phrase => 
            caption.chinese.toLowerCase().includes(phrase) || 
            caption.english.toLowerCase().includes(phrase)
        );
        
        if (isGeneric) {
            console.warn('Generic caption filtered out:', caption.chinese);
            continue;
        }
        
        validatedCaptions.push(caption);
    }
    
    return validatedCaptions.slice(0, 3);
}

// Analyze image with caching
async function analyzeImage(imageBuffer, mimeType = 'image/jpeg') {
    try {
        console.log('🔍 Analyzing image content...');
        
        // Generate hash for caching
        const imageHash = generateImageHash(imageBuffer);
        
        // Check cache first
        const cached = getCachedResult(imageHash);
        if (cached && (Date.now() - cached.timestamp) < 24 * 60 * 60 * 1000) { // 24 hour cache
            console.log('📦 Using cached analysis result');
            updateCacheAccess(imageHash);
            return cached.result;
        }
        
        // Convert buffer to base64
        const base64Image = imageBuffer.toString('base64');
        
        const prompt = `You are an expert image analyst and keyword generator. Analyze this image carefully and provide a detailed, accurate description with intelligent keywords.

        IMPORTANT INSTRUCTIONS:
        - Look at the image carefully and describe ONLY what you actually see
        - Be specific about all visible elements: objects, people, animals, food, scenes, artwork, text, etc.
        - Identify the most prominent elements first
        - Consider the context and setting
        - Note colors, lighting, and mood
        - Describe any text you can read
        - Note facial expressions and characteristics when visible
        - Identify specific items, species, or details when possible
        - Describe art styles, visual elements, and composition when applicable
        - Generate relevant keywords that would help create accurate Mandarin captions
        - Be factual and avoid assumptions
        
        CRITICAL: You MUST respond with ONLY valid JSON. Do not include any text before or after the JSON object. Do not use markdown formatting.
        
        Return your analysis in this exact JSON format:
        {
            "mainSubject": "the most prominent object, person, animal, or scene in the image",
            "category": "descriptive category of the main content",
            "description": "detailed, factual description of what is visible in the image",
            "context": "the setting, location, or situation shown",
            "mood": "the feeling or atmosphere conveyed by the image",
            "colors": "dominant colors and color scheme",
            "details": "specific visual details that would help create accurate captions",
            "confidence": "high|medium|low - your confidence in the analysis",
            "alternativeSubjects": ["other notable subjects in the image"],
            "keywords": ["relevant", "keywords", "for", "caption", "generation"],
            "chineseKeywords": ["ä¸­æ–‡å…³é"®è¯", "for", "better", "captions"]
        }
        
        Be precise and only describe what you can clearly see. Generate keywords that are specific to the image content.`;

        const requestBody = {
            model: 'openai/gpt-4o-mini',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: prompt
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:${mimeType};base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 400,
            temperature: 0.1,
            top_p: 0.9,
            frequency_penalty: 0.1,
            presence_penalty: 0.1
        };

        console.log('🔍 Making API request for image analysis...');
        const data = await makeApiRequestWithFallback(requestBody);
        console.log('✅ API request successful, processing response...');
        const analysisText = data.choices[0].message.content;
        
        let analysis;
        try {
            // Clean the response text before parsing
            let cleanAnalysisText = analysisText.trim();
            
            // Remove any markdown code blocks if present
            if (cleanAnalysisText.includes('```json')) {
                cleanAnalysisText = cleanAnalysisText.split('```json')[1].split('```')[0].trim();
            } else if (cleanAnalysisText.includes('```')) {
                cleanAnalysisText = cleanAnalysisText.split('```')[1].split('```')[0].trim();
            }
            
            // Additional cleaning for common AI response issues
            // Remove any leading/trailing text that's not JSON
            const jsonStart = cleanAnalysisText.indexOf('{');
            const jsonEnd = cleanAnalysisText.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                cleanAnalysisText = cleanAnalysisText.substring(jsonStart, jsonEnd + 1);
            }
            
            // Log the raw response for debugging
            console.log('🔍 Raw AI analysis response:', cleanAnalysisText);
            
            // Try to parse the JSON
            analysis = JSON.parse(cleanAnalysisText);
            
            // Validate that we have the required fields
            if (!analysis || typeof analysis !== 'object') {
                throw new Error('Invalid analysis object structure');
            }
            
            // Ensure required fields exist with fallbacks
            analysis.mainSubject = analysis.mainSubject || 'unknown subject';
            analysis.category = analysis.category || 'objects';
            analysis.description = analysis.description || 'No description available';
            analysis.context = analysis.context || 'No context available';
            analysis.mood = analysis.mood || 'neutral';
            analysis.colors = analysis.colors || 'various colors';
            analysis.details = analysis.details || 'No specific details';
            analysis.confidence = analysis.confidence || 'medium';
            analysis.alternativeSubjects = analysis.alternativeSubjects || [];
            analysis.keywords = analysis.keywords || [];
            analysis.chineseKeywords = analysis.chineseKeywords || [];
            
            const validationResult = validateImageAnalysis(analysis);
            if (!validationResult.isValid) {
                console.warn('❌ Analysis validation failed:', validationResult.issues);
                // Don't throw error, just log the issues and continue
            }
            
            console.log('✅ Successfully analyzed image content:', analysis);
            
            // Cache the result
            cacheResult(imageHash, analysis);
            
            return analysis;
        } catch (parseError) {
            console.error('❌ Failed to parse AI response as JSON:', parseError);
            console.error('❌ Raw response text:', analysisText);
            console.error('❌ Cleaned response text:', cleanAnalysisText);
            
            // If parsing fails, throw an error to encourage retry
            console.error('❌ Failed to create analysis from AI response');
            throw new Error(`AI analysis failed - response parsing error: ${parseError.message}`);
        }

    } catch (error) {
        console.error('Error analyzing image:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        throw new Error(`AI analysis failed - unable to generate personalized captions: ${error.message}`);
    }
}

// Generate Chinese descriptions
async function generateChineseDescriptions(analysis) {
    try {
        const prompt = `You are a native Chinese speaker creating captions for this specific image.

        IMAGE ANALYSIS:
        - Main Subject: ${analysis.mainSubject}
        - Category: ${analysis.category}
        - Description: ${analysis.description}
        - Context: ${analysis.context}
        - Mood: ${analysis.mood}
        ${analysis.colors ? `- Colors: ${analysis.colors}` : ''}
        ${analysis.details ? `- Specific Details: ${analysis.details}` : ''}
        ${analysis.confidence ? `- Analysis Confidence: ${analysis.confidence}` : ''}
        ${analysis.keywords ? `- AI-Generated Keywords: ${analysis.keywords.join(', ')}` : ''}
        ${analysis.chineseKeywords ? `- Chinese Keywords: ${analysis.chineseKeywords.join(', ')}` : ''}
        ${analysis.alternativeSubjects ? `- Alternative Subjects: ${analysis.alternativeSubjects.join(', ')}` : ''}
        
        CRITICAL REQUIREMENTS:
        1. Create captions that DIRECTLY relate to what is shown in the image
        2. Use specific vocabulary that matches the actual content and AI-generated keywords
        3. Use appropriate vocabulary for the specific content type (food, animals, places, objects, etc.)
        4. Make sentences sound natural and conversational
        5. Include accurate pinyin with tone marks (Ä á ÇŽ Ã )
        6. Provide clear, accurate English translations
        7. Use varied sentence structures but keep them relevant
        8. Avoid generic phrases that could apply to any image
        9. Incorporate the AI-generated keywords naturally into the captions
        
        SENTENCE PATTERNS TO USE:
        - Direct description: "è¿™æ˜¯..." (This is...)
        - Personal reaction: "æˆ'è§‰å¾—..." (I think...)
        - Observation: "çœ‹èµ·æ¥..." (It looks...)
        - Experience: "æˆ'å–œæ¬¢..." (I like...)
        - Quality assessment: "å¾ˆ..." (very...)
        - Keyword integration: Use the specific keywords in natural sentences
        
        CRITICAL: You MUST respond with ONLY valid JSON. Do not include any text before or after the JSON object. Do not use markdown formatting.
        
        Return in this exact JSON format:
        {
            "captions": [
                {
                    "chinese": "Chinese sentence that specifically relates to the image content and uses relevant keywords",
                    "pinyin": "pinyin pronunciation with tone marks",
                    "english": "Accurate English translation",
                    "relevance": "high|medium|low - how well this caption matches the image",
                    "keywordsUsed": ["keywords", "from", "analysis", "used", "in", "this", "caption"]
                }
            ]
        }`;

        const requestBody = {
            model: 'qwen/qwen-2.5-72b-instruct:free',
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 800,
            temperature: 0.5,
            top_p: 0.9,
            frequency_penalty: 0.2,
            presence_penalty: 0.1
        };

        console.log('🔍 Making API request for caption generation...');
        const data = await makeApiRequestWithFallback(requestBody);
        console.log('✅ Caption API request successful, processing response...');
        const responseText = data.choices[0].message.content;
        
        let result;
        try {
            // Clean the response text before parsing
            let jsonText = responseText.trim();
            
            // Remove any markdown code blocks if present
            if (jsonText.includes('```json')) {
                jsonText = jsonText.split('```json')[1].split('```')[0].trim();
            } else if (jsonText.includes('```')) {
                jsonText = jsonText.split('```')[1].split('```')[0].trim();
            }
            
            // Additional cleaning for common AI response issues
            // Remove any leading/trailing text that's not JSON
            const jsonStart = jsonText.indexOf('{');
            const jsonEnd = jsonText.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
            }
            
            // Log the raw response for debugging
            console.log('🔍 Raw AI caption response:', jsonText);
            
            result = JSON.parse(jsonText);
            const captions = result.captions || [];
            
            if (captions.length === 0) {
                console.warn('⚠️ No captions generated by AI');
                throw new Error('AI failed to generate any captions');
            }
            
            const validatedCaptions = validateCaptions(captions, analysis);
            console.log('✅ Caption validation completed:', validatedCaptions);
            return validatedCaptions;
        } catch (parseError) {
            console.error('❌ Failed to parse AI caption response as JSON:', parseError);
            console.error('❌ Raw response text:', responseText);
            console.error('❌ Cleaned response text:', jsonText);
            
            // If parsing fails, throw an error to encourage retry
            console.error('❌ Failed to create captions from AI response');
            throw new Error(`AI caption generation failed - response parsing error: ${parseError.message}`);
        }

    } catch (error) {
        console.error('Error generating Chinese descriptions:', error);
        throw error;
    }
}

// Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Usage statistics
app.get('/api/usage', (req, res) => {
    const stats = {
        totalRequests: usageStats.totalRequests,
        totalCost: usageStats.totalCost,
        requestsByKey: usageStats.requestsByKey,
        dailyUsage: usageStats.dailyUsage,
        cacheSize: usageStats.imageHashes.size,
        activeApiKeys: OPENROUTER_API_KEYS.length
    };
    res.json(stats);
});

// Process image and generate captions
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
    try {
        console.log('🔍 Received request to /api/analyze-image');
        console.log('🔍 Request headers:', req.headers);
        console.log('🔍 Request body keys:', Object.keys(req.body || {}));
        console.log('🔍 Request file:', req.file ? 'Present' : 'Missing');
        
        if (!req.file) {
            console.error('❌ No image file provided in request');
            return res.status(400).json({ error: 'No image file provided' });
        }

        console.log('📸 Processing image:', req.file.originalname, 'Size:', req.file.size, 'Type:', req.file.mimetype);
        console.log('📸 Image buffer length:', req.file.buffer.length);
        
        // Validate image file
        if (!req.file.mimetype.startsWith('image/')) {
            throw new Error('Invalid file type. Please upload an image file.');
        }
        
        if (req.file.size === 0) {
            throw new Error('Empty file. Please upload a valid image.');
        }
        
        // Analyze image
        const analysis = await analyzeImage(req.file.buffer, req.file.mimetype);
        
        // Generate captions
        const captions = await generateChineseDescriptions(analysis);
        
        res.json({
            success: true,
            analysis: analysis,
            captions: captions,
            cached: false // Will be true if from cache
        });
        
    } catch (error) {
        console.error('Error processing image:', error);
        
        // Provide more specific error messages based on the error type
        let errorMessage = 'Failed to process image';
        let technicalDetails = error.message;
        
        if (error.message.includes('response parsing error')) {
            errorMessage = 'AI response format error';
            technicalDetails = 'The AI service returned an unexpected response format.';
        } else if (error.message.includes('API request failed')) {
            errorMessage = 'AI service unavailable';
            technicalDetails = 'Unable to connect to the AI analysis service.';
        } else if (error.message.includes('All API keys failed')) {
            errorMessage = 'Service temporarily unavailable';
            technicalDetails = 'All AI service endpoints are currently unavailable.';
        } else if (error.message.includes('rate limit') || error.message.includes('quota')) {
            errorMessage = 'Service temporarily unavailable';
            technicalDetails = 'API rate limit exceeded. Please try again in a few minutes.';
        } else if (error.message.includes('timeout')) {
            errorMessage = 'Request timeout';
            technicalDetails = 'The request took too long to process. Please try again.';
        } else if (error.message.includes('network') || error.message.includes('ECONNREFUSED')) {
            errorMessage = 'Network error';
            technicalDetails = 'Unable to connect to external services. Please check your internet connection.';
        }
        
        res.status(500).json({ 
            error: errorMessage,
            message: technicalDetails,
            technicalDetails: error.message
        });
    }
});

// Rate caption endpoint
app.post('/api/rate-caption', (req, res) => {
    try {
        const { captionId, rating, feedback } = req.body;
        
        // Store rating (in a real app, you'd save to a database)
        console.log(`📊 Caption rating: ${rating}/5 for caption ${captionId}`);
        if (feedback) {
            console.log(`💬 Feedback: ${feedback}`);
        }
        
        res.json({ success: true, message: 'Rating recorded' });
    } catch (error) {
        console.error('Error recording rating:', error);
        res.status(500).json({ error: 'Failed to record rating' });
    }
});

// Clear cache endpoint
app.post('/api/clear-cache', (req, res) => {
    try {
        usageStats.imageHashes.clear();
        saveUsageStats();
        res.json({ success: true, message: 'Cache cleared' });
    } catch (error) {
        console.error('Error clearing cache:', error);
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

// Test API connectivity endpoint
app.get('/api/test', async (req, res) => {
    try {
        console.log('🧪 Testing API connectivity...');
        
        const testRequest = {
            model: 'openai/gpt-4o-mini',
            messages: [
                {
                    role: 'user',
                    content: 'Say "API is working"'
                }
            ],
            max_tokens: 10
        };
        
        const result = await makeApiRequestWithFallback(testRequest, 1);
        
        res.json({
            success: true,
            message: 'API connection successful',
            response: result.choices[0].message.content
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'API connection failed',
            error: error.message
        });
    }
});

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Usage tracking enabled`);
    console.log(`💾 Caching enabled`);
    console.log(`🔐 API keys secured on backend`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    saveUsageStats();
    process.exit(0);
});
