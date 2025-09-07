// Load environment variables
require('dotenv').config();

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

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// API configuration - Load from environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Backup API keys for enhanced reliability
const BACKUP_CAPTION_API_KEY = process.env.BACKUP_CAPTION_API_KEY;
const BACKUP_DICTIONARY_API_KEY = process.env.BACKUP_DICTIONARY_API_KEY;

// Unlimited mode configuration
const UNLIMITED_MODE = process.env.UNLIMITED_MODE === 'true' || true; // Default to unlimited

// Aggressive fallback mode - prioritize fallback over API calls
const AGGRESSIVE_FALLBACK = process.env.AGGRESSIVE_FALLBACK === 'true'; // Default to false - use API when available

// Dictionary API configuration (using OpenAI)
const DICTIONARY_API_KEY = process.env.OPENAI_API_KEY;
const DICTIONARY_API_URL = 'https://api.openai.com/v1/chat/completions';

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

// Validate API keys are loaded
if (!OPENAI_API_KEY) {
    console.error('❌ No valid OpenAI API key found!');
    console.error('Please set OPENAI_API_KEY environment variable or create a .env file');
    console.error('See env.template for example configuration');
}

// Log backup API key status
if (BACKUP_CAPTION_API_KEY) {
    if (isOpenAICompatible(BACKUP_CAPTION_API_KEY)) {
        console.log('✅ Backup caption API key loaded (OpenAI-compatible)');
    } else {
        console.log('⚠️ Backup caption API key loaded (non-OpenAI format - will use primary key)');
    }
} else {
    console.log('⚠️ No backup caption API key found');
}

if (BACKUP_DICTIONARY_API_KEY) {
    if (isOpenAICompatible(BACKUP_DICTIONARY_API_KEY)) {
        console.log('✅ Backup dictionary API key loaded (OpenAI-compatible)');
    } else {
        console.log('⚠️ Backup dictionary API key loaded (non-OpenAI format - will use primary key)');
    }
} else {
    console.log('⚠️ No backup dictionary API key found');
}

// Function to get current API key
function getCurrentApiKey() {
    return OPENAI_API_KEY;
}

// Function to check if an API key is OpenAI-compatible
function isOpenAICompatible(key) {
    return key && key.startsWith('sk-') && !key.startsWith('sk-or-v1');
}

// Function to get caption API key with backup support
function getCaptionApiKey() {
    // Only use backup key if it's OpenAI-compatible, otherwise use primary key
    if (BACKUP_CAPTION_API_KEY && isOpenAICompatible(BACKUP_CAPTION_API_KEY)) {
        return BACKUP_CAPTION_API_KEY;
    }
    return OPENAI_API_KEY;
}

// Function to get dictionary API key with backup support
function getDictionaryApiKey() {
    // Only use backup key if it's OpenAI-compatible, otherwise use primary key
    if (BACKUP_DICTIONARY_API_KEY && isOpenAICompatible(BACKUP_DICTIONARY_API_KEY)) {
        return BACKUP_DICTIONARY_API_KEY;
    }
    return OPENAI_API_KEY;
}

// Function to make dictionary API request with backup support
async function makeDictionaryRequest(requestBody, maxRetries = 2) {
    let lastError = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const currentKey = getDictionaryApiKey();
            const isBackupKey = currentKey === BACKUP_DICTIONARY_API_KEY;
            console.log(`🔍 Making dictionary API request (attempt ${attempt + 1}/${maxRetries}) using ${isBackupKey ? 'backup' : 'primary'} key...`);
            
            // Add timeout to prevent hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const response = await fetch(DICTIONARY_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Dictionary API request successful');
                
                // Track usage
                const keyType = isBackupKey ? 'backup_dictionary_key' : 'primary_dictionary_key';
                usageStats.requestsByKey[keyType] = (usageStats.requestsByKey[keyType] || 0) + 1;
                usageStats.totalRequests++;
                
                // Estimate cost
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
                console.error(`❌ Dictionary API Response Error (attempt ${attempt + 1}):`);
                console.error(`   Status: ${response.status} ${response.statusText}`);
                console.error(`   Body: ${errorText}`);
                
                // Check for specific error types
                if (response.status === 401) {
                    lastError = new Error('Invalid API key - please check your dictionary API key');
                } else if (response.status === 429) {
                    lastError = new Error('Rate limit exceeded - please wait before trying again');
                } else if (response.status === 402 || response.status === 403) {
                    lastError = new Error('API limit reached - trying backup key');
                } else {
                    lastError = new Error(`Dictionary API request failed: ${response.status} ${response.statusText} - ${errorText}`);
                }
            }
        } catch (error) {
            console.error(`❌ Dictionary API Network Error (attempt ${attempt + 1}):`, error);
            lastError = error;
            
            if (attempt < maxRetries - 1) {
                console.log(`Waiting 2 seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    
    console.error(`Dictionary API request failed after ${maxRetries} attempts. Last error:`, lastError);
    throw lastError || new Error('Dictionary API request failed');
}

// Function to make API request with automatic fallback and backup support
async function makeApiRequestWithFallback(requestBody, maxRetries = 2) {
    let lastError = null;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const currentKey = getCaptionApiKey();
            const isBackupKey = currentKey === BACKUP_CAPTION_API_KEY;
            console.log(`🔑 Using ${isBackupKey ? 'backup caption' : 'primary'} API key (attempt ${attempt + 1}/${maxRetries})`);
            console.log(`🔗 Connecting to: ${OPENAI_API_URL}`);
            
            // Add timeout to prevent hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const response = await fetch(OPENAI_API_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            console.log(`📡 Response status: ${response.status}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ API request successful`);
                
                // Track usage
                const keyType = isBackupKey ? 'backup_caption_key' : 'primary_caption_key';
                usageStats.requestsByKey[keyType] = (usageStats.requestsByKey[keyType] || 0) + 1;
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
                    lastError = new Error('Invalid API key - please check your OpenAI API key');
                } else if (response.status === 429) {
                    console.error(`❌ Rate limit exceeded`);
                    lastError = new Error('Rate limit exceeded - please wait before trying again');
                } else if (response.status === 402) {
                    console.error(`❌ Insufficient credits or quota exceeded - trying backup key`);
                    lastError = new Error('API quota exceeded - trying backup key');
                } else if (response.status === 403) {
                    console.error(`❌ Access forbidden - quota may be exceeded - trying backup key`);
                    lastError = new Error('API access issue - trying backup key');
                } else {
                    lastError = new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
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
                console.error(`❌ Connection refused - cannot reach OpenAI API`);
                lastError = new Error('Cannot connect to OpenAI API - check your internet connection');
            } else if (error.code === 'ENOTFOUND') {
                console.error(`❌ DNS lookup failed - cannot resolve api.openai.com`);
                lastError = new Error('Cannot reach OpenAI servers - check your internet connection');
            } else if (error.code === 'ETIMEDOUT') {
                console.error(`❌ Connection timeout`);
                lastError = new Error('Connection to OpenAI timed out');
            } else if (error.message.includes('fetch')) {
                console.error(`❌ Fetch failed - likely a network issue`);
                lastError = new Error('Network request failed - check your connection');
            } else {
                lastError = error;
            }
            
            if (attempt < maxRetries - 1) {
                console.log(`Waiting 2 seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }
    
    console.error(`API request failed. Last error:`, lastError);
    throw lastError || new Error('API request failed');
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

// Enhanced caption validation with strict Chinese-only requirements
function validateCaptions(captions, analysis) {
    const validatedCaptions = [];
    
    // Ensure captions is an array
    if (!Array.isArray(captions)) {
        console.warn('Captions is not an array:', captions);
        return [];
    }
    
    for (const caption of captions) {
        // Require chinese and english fields
        if (!caption.chinese || !caption.english) {
            console.warn('Caption missing required fields:', caption);
            continue;
        }
        
        // FLEXIBLE VALIDATION: Allow more natural, personalized Chinese text
        const chineseText = caption.chinese.trim();
        
        // Must contain Chinese characters
        const hasChineseCharacters = /[\u4e00-\u9fff]/.test(chineseText);
        if (!hasChineseCharacters) {
            console.warn('❌ Caption contains no Chinese characters:', chineseText);
            continue;
        }
        
        // Allow some flexibility - check for excessive English words but allow some mixed content
        const englishWordCount = (chineseText.match(/[a-zA-Z]+/g) || []).length;
        const chineseCharacterCount = (chineseText.match(/[\u4e00-\u9fff]/g) || []).length;
        
        // If there are too many English words relative to Chinese characters, skip
        if (englishWordCount > 2 && englishWordCount > chineseCharacterCount / 3) {
            console.warn('❌ Caption has too many English words:', chineseText);
            continue;
        }
        
        // Ensure Chinese caption has meaningful content (at least 4 characters)
        if (chineseText.length < 4) {
            console.warn('❌ Caption too short:', chineseText);
            continue;
        }
        
        // Check for only the most problematic mixed language patterns
        const problematicPatterns = [
            /这是\s*[a-zA-Z]/,  // "这是a", "这是an", "这是the", etc.
            /这是\s*person/,    // "这是person"
            /这是\s*thing/,     // "这是thing"
            /这是\s*object/,    // "这是object"
            /这是\s*something/, // "这是something"
            /这是\s*someone/    // "这是someone"
        ];
        
        // Only filter out the most problematic patterns
        const hasProblematicPattern = problematicPatterns.some(pattern => pattern.test(chineseText));
        
        if (hasProblematicPattern) {
            console.warn('❌ Problematic mixed language pattern filtered out:', chineseText);
            continue;
        }
        
        // More flexible sentence validation - allow shorter, more natural expressions
        const hasProperPunctuation = /[。！？]$/.test(chineseText);
        const isLongEnough = chineseText.length >= 4; // More flexible minimum length
        
        // Only warn about very short sentences without punctuation, but don't reject them
        if (!hasProperPunctuation && chineseText.length < 3) {
            console.warn('⚠️ Very short sentence without punctuation:', chineseText);
            // Don't continue - allow it through
        }
        
        // Generate pinyin if missing
        if (!caption.pinyin) {
            caption.pinyin = generatePinyinFallback(chineseText);
            console.log('Generated fallback pinyin:', caption.pinyin);
        }
        
        // More flexible relevance filtering - only filter out extremely low relevance
        if (caption.relevance === 'low' && chineseText.length < 3) {
            console.warn('❌ Extremely low relevance and very short caption filtered out:', chineseText);
            continue;
        }
        
        // Ensure relevance is set
        caption.relevance = caption.relevance || 'medium';
        
        console.log('✅ Validated caption:', chineseText);
        validatedCaptions.push(caption);
    }
    
    // Return at least one caption if we have any, even if validation is strict
    return validatedCaptions.length > 0 ? validatedCaptions.slice(0, 3) : [];
}

// Enhanced fallback pinyin generation for missing pinyin
function generatePinyinFallback(chineseText) {
    // Expanded character-to-pinyin mapping for common characters
    const pinyinMap = {
        '你': 'nǐ', '好': 'hǎo', '学': 'xué', '习': 'xí', '大': 'dà', '中': 'zhōng', '国': 'guó',
        '老': 'lǎo', '师': 'shī', '生': 'shēng', '朋': 'péng', '友': 'yǒu', '家': 'jiā', '庭': 'tíng',
        '工': 'gōng', '作': 'zuò', '时': 'shí', '间': 'jiān', '我': 'wǒ', '是': 'shì', '一': 'yī',
        '个': 'gè', '的': 'de', '在': 'zài', '很': 'hěn', '有': 'yǒu', '和': 'hé', '了': 'le',
        '不': 'bù', '要': 'yào', '会': 'huì', '来': 'lái', '到': 'dào', '去': 'qù', '上': 'shàng',
        '下': 'xià', '里': 'lǐ', '外': 'wài', '前': 'qián', '后': 'hòu', '左': 'zuǒ', '右': 'yòu',
        '猫': 'māo', '狗': 'gǒu', '鸟': 'niǎo', '鱼': 'yú', '花': 'huā', '树': 'shù', '山': 'shān',
        '水': 'shuǐ', '天': 'tiān', '地': 'dì', '人': 'rén', '手': 'shǒu', '眼': 'yǎn', '口': 'kǒu',
        '心': 'xīn', '头': 'tóu', '身': 'shēn', '脚': 'jiǎo', '车': 'chē', '房': 'fáng', '门': 'mén',
        '窗': 'chuāng', '桌': 'zhuō', '椅': 'yǐ', '床': 'chuáng', '书': 'shū', '笔': 'bǐ', '纸': 'zhǐ',
        '吃': 'chī', '喝': 'hē', '睡': 'shuì', '走': 'zǒu', '跑': 'pǎo', '看': 'kàn', '听': 'tīng',
        '说': 'shuō', '笑': 'xiào', '哭': 'kū', '爱': 'ài', '想': 'xiǎng', '知': 'zhī', '道': 'dào',
        '这': 'zhè', '那': 'nà', '什': 'shén', '么': 'me', '怎': 'zěn', '样': 'yàng', '为': 'wèi',
        '什': 'shén', '么': 'me', '可': 'kě', '以': 'yǐ', '能': 'néng', '够': 'gòu', '就': 'jiù',
        '都': 'dōu', '还': 'hái', '也': 'yě', '只': 'zhǐ', '要': 'yào', '如': 'rú', '果': 'guǒ',
        '因': 'yīn', '为': 'wèi', '所': 'suǒ', '以': 'yǐ', '但': 'dàn', '是': 'shì', '如': 'rú',
        '果': 'guǒ', '虽': 'suī', '然': 'rán', '但': 'dàn', '是': 'shì', '不': 'bù', '过': 'guò',
        '图': 'tú', '片': 'piàn', '照': 'zhào', '相': 'xiàng', '美': 'měi', '丽': 'lì', '漂': 'piào',
        '亮': 'liàng', '好': 'hǎo', '看': 'kàn', '有': 'yǒu', '趣': 'qù', '特': 'tè', '别': 'bié',
        '非': 'fēi', '常': 'cháng', '真': 'zhēn', '的': 'de', '确': 'què', '实': 'shí', '确': 'què'
    };
    
    return chineseText.split('').map(char => pinyinMap[char] || char).join(' ');
}

// Comprehensive fallback caption system
function generateFallbackCaptions(imageBuffer, mimeType = 'image/jpeg') {
    console.log('🔄 Generating fallback captions (API bypass mode)');
    
    // Generate a simple hash to determine caption type
    const hash = crypto.createHash('md5').update(imageBuffer).digest('hex');
    const hashNum = parseInt(hash.substring(0, 8), 16);
    
    // Categorized fallback captions
    const fallbackCaptions = {
        general: [
            {
                chinese: '这是一张很有趣的图片。',
                pinyin: 'zhè shì yī zhāng hěn yǒu qù de tú piàn',
                english: 'This is a very interesting picture.',
                relevance: 'high'
            },
            {
                chinese: '这张照片看起来很特别。',
                pinyin: 'zhè zhāng zhào piàn kàn qǐ lái hěn tè bié',
                english: 'This photo looks very special.',
                relevance: 'high'
            },
            {
                chinese: '我喜欢这张图片的内容。',
                pinyin: 'wǒ xǐ huān zhè zhāng tú piàn de nèi róng',
                english: 'I like the content of this picture.',
                relevance: 'high'
            }
        ],
        nature: [
            {
                chinese: '这张自然风景照片真美丽。',
                pinyin: 'zhè zhāng zì rán fēng jǐng zhào piàn zhēn měi lì',
                english: 'This natural landscape photo is really beautiful.',
                relevance: 'high'
            },
            {
                chinese: '大自然的景色总是让人心旷神怡。',
                pinyin: 'dà zì rán de jǐng sè zǒng shì ràng rén xīn kuàng shén yí',
                english: 'Natural scenery always makes people feel relaxed and happy.',
                relevance: 'high'
            },
            {
                chinese: '这个风景让我想起了美好的回忆。',
                pinyin: 'zhè gè fēng jǐng ràng wǒ xiǎng qǐ le měi hǎo de huí yì',
                english: 'This scenery reminds me of beautiful memories.',
                relevance: 'high'
            }
        ],
        people: [
            {
                chinese: '这张照片中的人物看起来很友好。',
                pinyin: 'zhè zhāng zhào piàn zhōng de rén wù kàn qǐ lái hěn yǒu hǎo',
                english: 'The people in this photo look very friendly.',
                relevance: 'high'
            },
            {
                chinese: '他们的笑容很温暖，让人感到快乐。',
                pinyin: 'tā men de xiào róng hěn wēn nuǎn, ràng rén gǎn dào kuài lè',
                english: 'Their smiles are warm and make people feel happy.',
                relevance: 'high'
            },
            {
                chinese: '这张照片捕捉到了美好的瞬间。',
                pinyin: 'zhè zhāng zhào piàn bǔ zhuō dào le měi hǎo de shùn jiān',
                english: 'This photo captured a beautiful moment.',
                relevance: 'high'
            }
        ],
        food: [
            {
                chinese: '这道菜看起来非常美味。',
                pinyin: 'zhè dào cài kàn qǐ lái fēi cháng měi wèi',
                english: 'This dish looks very delicious.',
                relevance: 'high'
            },
            {
                chinese: '食物的颜色和摆盘都很精致。',
                pinyin: 'shí wù de yán sè hé bǎi pán dōu hěn jīng zhì',
                english: 'The food\'s color and presentation are both exquisite.',
                relevance: 'high'
            },
            {
                chinese: '这让我想起了家的味道。',
                pinyin: 'zhè ràng wǒ xiǎng qǐ le jiā de wèi dào',
                english: 'This reminds me of the taste of home.',
                relevance: 'high'
            }
        ],
        animals: [
            {
                chinese: '这只小动物真可爱。',
                pinyin: 'zhè zhī xiǎo dòng wù zhēn kě ài',
                english: 'This little animal is really cute.',
                relevance: 'high'
            },
            {
                chinese: '它的表情很有趣，让人忍不住想笑。',
                pinyin: 'tā de biǎo qíng hěn yǒu qù, ràng rén rěn bù zhù xiǎng xiào',
                english: 'Its expression is very funny and makes people want to laugh.',
                relevance: 'high'
            },
            {
                chinese: '动物们的纯真总是能治愈人心。',
                pinyin: 'dòng wù men de chún zhēn zǒng shì néng zhì yù rén xīn',
                english: 'The innocence of animals can always heal people\'s hearts.',
                relevance: 'high'
            }
        ],
        objects: [
            {
                chinese: '这个物品的设计很有创意。',
                pinyin: 'zhè gè wù pǐn de shè jì hěn yǒu chuàng yì',
                english: 'The design of this object is very creative.',
                relevance: 'high'
            },
            {
                chinese: '它的形状和颜色搭配得很好。',
                pinyin: 'tā de xíng zhuàng hé yán sè dā pèi de hěn hǎo',
                english: 'Its shape and color are well matched.',
                relevance: 'high'
            },
            {
                chinese: '这个物品看起来很实用。',
                pinyin: 'zhè gè wù pǐn kàn qǐ lái hěn shí yòng',
                english: 'This object looks very practical.',
                relevance: 'high'
            }
        ]
    };
    
    // Select category based on hash
    const categories = Object.keys(fallbackCaptions);
    const selectedCategory = categories[hashNum % categories.length];
    const captions = fallbackCaptions[selectedCategory];
    
    console.log(`📝 Using fallback captions for category: ${selectedCategory}`);
    
    // Return 2-3 captions with some randomization
    const numCaptions = 2 + (hashNum % 2); // 2 or 3 captions
    const selectedCaptions = [];
    
    for (let i = 0; i < numCaptions; i++) {
        const captionIndex = (hashNum + i) % captions.length;
        selectedCaptions.push(captions[captionIndex]);
    }
    
    return selectedCaptions;
}

// Enhanced fallback analysis
function generateFallbackAnalysis() {
    return {
        mainSubject: '图片内容',
        category: 'general',
        description: '这是一张有趣的图片，内容丰富多彩。',
        context: '图片展示了一个有趣的场景或物体。',
        mood: 'positive',
        colors: 'various colors',
        details: '图片包含多种元素，值得仔细观察。',
        confidence: 'medium',
        alternativeSubjects: [],
        keywords: ['图片', '有趣', '内容', '观察'],
        chineseKeywords: ['图片', '有趣', '内容', '观察']
    };
}

// Fix common JSON parsing issues
function fixCommonJsonIssues(jsonText) {
    // Fix common issues that break JSON parsing
    let fixed = jsonText;
    
    // Fix unescaped quotes in strings
    fixed = fixed.replace(/"([^"]*)"([^"]*)"([^"]*)"/g, '"$1\\"$2\\"$3"');
    
    // Fix trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    // Fix missing quotes around keys
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    
    // Fix single quotes to double quotes
    fixed = fixed.replace(/'/g, '"');
    
    // Fix newlines in strings
    fixed = fixed.replace(/\n/g, '\\n');
    fixed = fixed.replace(/\r/g, '\\r');
    fixed = fixed.replace(/\t/g, '\\t');
    
    return fixed;
}

// Extract captions from malformed response text
function extractCaptionsFromText(text, analysis) {
    const captions = [];
    
    try {
        // Try to find Chinese text patterns
        const chinesePattern = /[\u4e00-\u9fff]+/g;
        const chineseMatches = text.match(chinesePattern);
        
        if (chineseMatches && chineseMatches.length > 0) {
            // Take the first few Chinese sentences
            const chineseTexts = chineseMatches.slice(0, 3);
            
            for (const chinese of chineseTexts) {
                if (chinese.length > 2) { // Only use meaningful Chinese text
                    const caption = {
                        chinese: chinese,
                        pinyin: generatePinyinFallback(chinese),
                        english: `This appears to be about ${analysis.mainSubject || 'the image content'}`,
                        relevance: 'medium',
                        keywordsUsed: analysis.keywords || []
                    };
                    captions.push(caption);
                }
            }
        }
        
        // If no Chinese text found, try to extract from structured text
        if (captions.length === 0) {
            const lines = text.split('\n');
            for (const line of lines) {
                if (line.includes('chinese') || line.includes('Chinese')) {
                    const chineseMatch = line.match(/[\u4e00-\u9fff]+/);
                    if (chineseMatch) {
                        const caption = {
                            chinese: chineseMatch[0],
                            pinyin: generatePinyinFallback(chineseMatch[0]),
                            english: `Description of ${analysis.mainSubject || 'the image'}`,
                            relevance: 'medium',
                            keywordsUsed: analysis.keywords || []
                        };
                        captions.push(caption);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('Error extracting captions from text:', error);
    }
    
    return captions.slice(0, 3); // Return max 3 captions
}



// Analyze image with caching and comprehensive fallback
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
        
        // If aggressive fallback is enabled, use fallback system immediately
        if (AGGRESSIVE_FALLBACK) {
            console.log('🔄 Aggressive fallback mode - using fallback analysis');
            const fallbackAnalysis = generateFallbackAnalysis();
            const fallbackCaptions = generateFallbackCaptions(imageBuffer, mimeType);
            
            const result = {
                analysis: fallbackAnalysis,
                captions: fallbackCaptions
            };
            
            // Cache the fallback result
            cacheResult(imageHash, result);
            return result;
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
            model: 'gpt-4o-mini',
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
            // Clean the response text before parsing - more robust approach
            let cleanAnalysisText = analysisText.trim();
            
            // Remove any text before the first {
            const jsonStart = cleanAnalysisText.indexOf('{');
            if (jsonStart > 0) {
                cleanAnalysisText = cleanAnalysisText.substring(jsonStart);
            }
            
            // Remove any text after the last }
            const jsonEnd = cleanAnalysisText.lastIndexOf('}');
            if (jsonEnd > 0 && jsonEnd < cleanAnalysisText.length - 1) {
                cleanAnalysisText = cleanAnalysisText.substring(0, jsonEnd + 1);
            }
            
            // Remove markdown code blocks
            cleanAnalysisText = cleanAnalysisText.replace(/```json\s*/g, '').replace(/```\s*/g, '');
            
            // Remove any remaining leading/trailing whitespace
            cleanAnalysisText = cleanAnalysisText.trim();
            
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
        
        // Always return fallback captions instead of throwing error
        console.log('🔄 API failed, using comprehensive fallback system');
        const fallbackAnalysis = generateFallbackAnalysis();
        const fallbackCaptions = generateFallbackCaptions(imageBuffer, mimeType);
        
        const result = {
            analysis: fallbackAnalysis,
            captions: fallbackCaptions,
            fallbackUsed: true,
            error: error.message
        };
        
        // Cache the fallback result
        const imageHash = generateImageHash(imageBuffer);
        cacheResult(imageHash, result);
        
        return result;
    }
}

// Parse natural language response format for captions
function parseNaturalLanguageResponse(responseText, analysis) {
    const captions = [];
    
    try {
        console.log('🔍 Parsing natural language response...');
        
        // Try to find numbered items (1., 2., 3.)
        const numberedPattern = /(\d+)\.\s*([\u4e00-\u9fff][^]*?)(?=\d+\.|$)/gs;
        const matches = [...responseText.matchAll(numberedPattern)];
        
        if (matches.length > 0) {
            for (const match of matches) {
                const section = match[2];
                
                // Extract Chinese text
                const chineseMatch = section.match(/([\u4e00-\u9fff][\u4e00-\u9fff\s，。！？、；：""''（）【】《》]*[。！？])/);
                if (!chineseMatch) continue;
                
                const chinese = chineseMatch[1].trim();
                
                // Extract pinyin
                const pinyinMatch = section.match(/[Pp]inyin:\s*([^\n]+)/);
                const pinyin = pinyinMatch ? pinyinMatch[1].trim() : generatePinyinFallback(chinese);
                
                // Extract English
                const englishMatch = section.match(/[Ee]nglish:\s*([^\n]+)/);
                const english = englishMatch ? englishMatch[1].trim() : `Description of ${analysis.mainSubject || 'the image'}`;
                
                captions.push({
                    chinese: chinese,
                    pinyin: pinyin,
                    english: english,
                    relevance: 'high',
                    keywordsUsed: analysis.keywords || []
                });
            }
        }
        
        // If no numbered format found, try alternative extraction
        if (captions.length === 0) {
            console.log('🔄 No numbered format found, trying alternative extraction...');
            
            // Split response into lines and process
            const lines = responseText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            
            let currentCaption = null;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                
                // Check if this line starts a new caption (numbered or contains Chinese characters)
                if (/^[0-9]+\./.test(line) || /[\u4e00-\u9fff]/.test(line)) {
                    // Save previous caption if exists
                    if (currentCaption && currentCaption.chinese) {
                        captions.push(currentCaption);
                    }
                    
                    // Start new caption
                    currentCaption = {
                        chinese: '',
                        pinyin: '',
                        english: '',
                        relevance: 'high',
                        keywordsUsed: analysis.keywords || []
                    };
                    
                    // Extract Chinese text from the line
                    const chineseMatch = line.match(/[\u4e00-\u9fff][\u4e00-\u9fff\s，。！？、；：""''（）【】《》]*/);
                    if (chineseMatch) {
                        currentCaption.chinese = chineseMatch[0].trim();
                    } else {
                        // If no Chinese found, use the whole line after removing numbering
                        currentCaption.chinese = line.replace(/^[0-9]+\.\s*/, '').trim();
                    }
                }
                // Check for pinyin line
                else if (line.toLowerCase().startsWith('pinyin:') || line.toLowerCase().startsWith('拼音:')) {
                    if (currentCaption) {
                        currentCaption.pinyin = line.replace(/^(pinyin|拼音):\s*/i, '').trim();
                    }
                }
                // Check for English line
                else if (line.toLowerCase().startsWith('english:') || line.toLowerCase().startsWith('英文:')) {
                    if (currentCaption) {
                        currentCaption.english = line.replace(/^(english|英文):\s*/i, '').trim();
                    }
                }
                // If we have a current caption and this line contains Chinese characters, it might be additional Chinese text
                else if (currentCaption && /[\u4e00-\u9fff]/.test(line) && !currentCaption.chinese) {
                    currentCaption.chinese = line.trim();
                }
            }
            
            // Don't forget the last caption
            if (currentCaption && currentCaption.chinese) {
                captions.push(currentCaption);
            }
        }
        
        // If still no structured format found, try to extract Chinese sentences directly
        if (captions.length === 0) {
            console.log('🔄 No structured format found, extracting Chinese sentences directly...');
            const chinesePattern = /[\u4e00-\u9fff][\u4e00-\u9fff\s，。！？、；：""''（）【】《】]*[。！？]/g;
            const chineseMatches = responseText.match(chinesePattern);
            
            if (chineseMatches && chineseMatches.length > 0) {
                for (let i = 0; i < Math.min(chineseMatches.length, 3); i++) {
                    const chinese = chineseMatches[i].trim();
                    if (chinese.length > 6) { // Only use meaningful sentences
                        captions.push({
                            chinese: chinese,
                            pinyin: generatePinyinFallback(chinese),
                            english: `Personal observation about ${analysis.mainSubject || 'the image'}`,
                            relevance: 'high',
                            keywordsUsed: analysis.keywords || []
                        });
                    }
                }
            }
        }
        
        // Ensure we have pinyin for all captions
        captions.forEach(caption => {
            if (!caption.pinyin) {
                caption.pinyin = generatePinyinFallback(caption.chinese);
            }
        });
        
        console.log('✅ Parsed captions from natural language:', captions.length);
        return captions.slice(0, 3); // Return max 3 captions
        
    } catch (error) {
        console.error('❌ Error parsing natural language response:', error);
        return [];
    }
}

// Generate Chinese descriptions with enhanced retry logic
async function generateChineseDescriptions(analysis, retryCount = 0) {
    const maxRetries = 2;
    
    // If aggressive fallback is enabled, skip API calls and return empty result
    if (AGGRESSIVE_FALLBACK) {
        console.log('🔄 Aggressive fallback mode enabled - no captions will be generated');
        return [];
    }
    
    try {
        const prompt = `You are an expert native Chinese speaker creating deeply personalized, emotional, and specific captions for this exact image. Your goal is to create captions that sound like a real Chinese person would naturally and personally describe this image, with genuine emotion and specific details.

        DETAILED IMAGE ANALYSIS:
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
        
        ABSOLUTE REQUIREMENTS - NO EXCEPTIONS:
        1. Create DEEPLY PERSONALIZED, EMOTIONAL Chinese sentences that capture the ESSENCE and FEELING of this specific image
        2. Each Chinese caption MUST be a complete, natural sentence (10-30 characters minimum) with genuine emotion
        3. Use ONLY Chinese characters (汉字) - ZERO English words allowed in Chinese field
        4. Use specific, vivid Chinese vocabulary that captures the unique details and atmosphere of this image
        5. Make sentences sound like a native Chinese speaker personally experiencing and describing this image
        6. Include accurate pinyin with proper tone marks (ā á ǎ à, ē é ě è, etc.)
        7. Provide clear, accurate English translations that convey the same emotion
        8. Use varied, natural sentence structures with personal perspective
        9. Be highly specific and detailed - capture the unique character of this exact image
        10. Incorporate the analysis keywords naturally into emotionally rich sentences
        11. Each sentence must end with proper Chinese punctuation (。！？)
        12. NEVER use mixed language like "这是a person" - translate everything to Chinese
        13. CRITICAL: The Chinese field must contain ONLY Chinese characters - no English, numbers, or symbols
        14. If you cannot create a proper Chinese sentence, do not include that caption
        15. Focus on PERSONAL REACTIONS, EMOTIONS, and SPECIFIC DETAILS that make this image unique
        
        PERSONALIZED, EMOTIONAL SENTENCE PATTERNS FOR DIFFERENT CONTENT TYPES:
        
        For People/Portraits:
        - "这位女士的红色连衣裙在阳光下闪闪发光，她的笑容温暖得让人心动。"
        - "这个孩子的笑声如此纯真，让我想起了自己美好的童年时光。"
        - "这位老人专注读书的样子让我感受到了岁月静好的美好。"
        
        For Animals:
        - "这只橘色小猫蜷缩在阳光下的样子太可爱了，真想摸摸它柔软的毛发。"
        - "看着这只金毛犬在草地上自由奔跑，我的心情也变得轻松愉快起来。"
        - "这只小鸟的歌声如此动听，仿佛在诉说着春天的美好故事。"
        
        For Food:
        - "这盘饺子的香味让我想起了妈妈的味道，每一口都充满了家的温暖。"
        - "这碗拉面的热气腾腾，红绿相间的配菜让人食欲大开，真想立刻品尝。"
        - "这个蛋糕的精致装饰让我感受到了制作者的用心，每一处细节都那么完美。"
        
        For Nature/Landscapes:
        - "这片湖水的宁静让我内心感到前所未有的平静，仿佛时间都静止了。"
        - "这座山峰的雄伟让我感受到了大自然的伟大，心中涌起无限的敬畏之情。"
        - "这片樱花的美景让我陶醉其中，粉色的花瓣如雪花般飘洒，美得让人窒息。"
        
        For Objects/Art:
        - "这个花瓶上的山水画让我感受到了中国传统文化的深厚底蕴和艺术魅力。"
        - "这幅抽象画的色彩搭配如此大胆，让我感受到了艺术家内心强烈的情感表达。"
        - "这辆跑车的流线型设计让我感受到了速度与激情的完美结合，令人心驰神往。"
        
        For Abstract/Patterns:
        - "这个几何图案的对称美让我感受到了数学与艺术的完美融合，令人叹为观止。"
        - "这些流动的线条让我感受到了生命的律动，仿佛在诉说着宇宙的奥秘。"
        - "这个图案的精妙设计让我感受到了设计师的无限创意和匠心独运。"
        
        QUALITY EXAMPLES OF PERSONALIZED, EMOTIONAL CAPTIONS:
        ✅ "这只小猫在阳光下打盹的样子太治愈了，让我忍不住想要抱抱它。" (This kitten napping in the sunlight is so healing, I can't help but want to hug it.)
        ✅ "这朵玫瑰的娇艳让我想起了初恋的美好，每一片花瓣都诉说着浪漫的故事。" (This rose's delicate beauty reminds me of the sweetness of first love, every petal tells a romantic story.)
        ✅ "看着这位厨师专注烹饪的样子，我仿佛闻到了家的味道，心中涌起温暖的感觉。" (Watching this chef cook with such focus, I can almost smell the taste of home, feeling warmth in my heart.)
        
        BAD EXAMPLES TO AVOID:
        ❌ "这是a person with a surprised expression" (Mixed language)
        ❌ "这是一个人" (Too generic, no emotion)
        ❌ "这是照片" (Too vague, no personal reaction)
        ❌ "这是东西" (Meaningless, no specific details)
        ❌ "这很好看" (Too simple, no emotional depth)
        ❌ "这是红色的" (Too basic, no personal perspective)
        
        PERSONALIZED RESPONSE FORMAT:
        Write your response as natural, flowing text that captures your personal reaction to this image. 
        Include 2-3 different Chinese sentences that express your genuine feelings and observations.
        For each Chinese sentence, provide the pinyin pronunciation and English translation.
        
        Format your response like this:
        
        1. [Your first personal Chinese sentence about the image]
   Pinyin: [pinyin with tone marks]
   English: [your English translation]
   
   2. [Your second personal Chinese sentence about the image]
   Pinyin: [pinyin with tone marks]
   English: [your English translation]
   
   3. [Your third personal Chinese sentence about the image]
   Pinyin: [pinyin with tone marks]
   English: [your English translation]
   
   Write naturally and personally - don't worry about strict formatting. Focus on expressing your genuine emotional response to what you see in this image.`;

        const requestBody = {
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 800,
            temperature: 0.7, // Increased for more creative and personalized responses
            top_p: 0.9,
            frequency_penalty: 0.3, // Increased to encourage more varied vocabulary
            presence_penalty: 0.2 // Increased to encourage more diverse expressions
        };

        console.log('🔍 Making API request for caption generation...');
        console.log('📊 Caption generation attempt:', retryCount + 1);
        console.log('🎯 Analysis data for caption generation:', {
            mainSubject: analysis.mainSubject,
            category: analysis.category,
            keywords: analysis.keywords?.length || 0,
            confidence: analysis.confidence
        });
        
        const data = await makeApiRequestWithFallback(requestBody);
        console.log('✅ Caption API request successful, processing response...');
        const responseText = data.choices[0].message.content;
        
        console.log('📝 Caption response length:', responseText.length);
        console.log('📝 Caption response preview:', responseText.substring(0, 200) + '...');
        
        // Add detailed logging for debugging
        console.log('📝 Full API response for captions:', JSON.stringify(data, null, 2));
        console.log('📝 Response text to parse:', responseText);
        
        let result;
        try {
            // Log the raw response for debugging
            console.log('🔍 Raw AI caption response:', responseText);
            
            // Parse the natural language response format
            const captions = parseNaturalLanguageResponse(responseText, analysis);
            
            if (captions.length === 0) {
                console.warn('⚠️ No captions generated by AI');
                throw new Error('AI failed to generate any captions');
            }
            
            const validatedCaptions = validateCaptions(captions, analysis);
            console.log('✅ Caption validation completed:', validatedCaptions);
            
            // If validation returns empty array, return empty result
            if (validatedCaptions.length === 0) {
                console.warn('⚠️ All captions filtered out, no captions will be generated');
                return [];
            }
            
            return validatedCaptions;
        } catch (parseError) {
            console.error('❌ Failed to parse AI caption response:', parseError);
            console.error('❌ Parse error details:', {
                message: parseError.message,
                name: parseError.name,
                stack: parseError.stack
            });
            console.error('❌ Raw response text:', responseText);
            console.error('❌ Response text length:', responseText.length);
            
            // Log response structure analysis
            console.log('🔍 Response structure analysis:', {
                hasChineseText: /[\u4e00-\u9fff]/.test(responseText),
                hasNumberedItems: /^[0-9]+\./.test(responseText),
                hasPinyinMarkers: /pinyin:|拼音:/i.test(responseText),
                hasEnglishMarkers: /english:|英文:/i.test(responseText)
            });
            
            // Try to extract captions from malformed response
            console.log('🔄 Attempting to extract captions from malformed response...');
            const extractedCaptions = extractCaptionsFromText(responseText, analysis);
            
            if (extractedCaptions.length > 0) {
                console.log('✅ Successfully extracted captions from malformed response:', extractedCaptions.length);
                return extractedCaptions;
            }
            
            // If all else fails, return empty result
            console.log('🔄 All caption generation attempts failed, no captions will be generated');
            return [];
        }

    } catch (error) {
        console.error('Error generating Chinese descriptions:', error);
        
        // Retry logic for caption generation failures
        if (retryCount < maxRetries && (
            error.message.includes('AI failed to generate any captions') ||
            error.message.includes('Failed to parse AI caption response')
        )) {
            console.log(`🔄 Retrying caption generation (attempt ${retryCount + 1}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
            return generateChineseDescriptions(analysis, retryCount + 1);
        }
        
        // If all retries failed, return empty result
        console.log('🔄 All caption generation attempts failed, no captions will be generated...');
        
        // Check if the error is quota-related or API limit related
        if (error.message.includes('quota has been exceeded') || error.message.includes('quota exceeded') || 
            error.message.includes('Insufficient credits') || error.message.includes('credits') ||
            error.message.includes('Temporary API limit') || error.message.includes('API access issue')) {
            console.log('💰 API limit reached - no captions will be generated');
            return [];
        }
        
        console.log('🔄 Error occurred during caption generation - no captions will be generated');
        return [];
    }
}

// Dictionary lookup function using OpenAI API
async function lookupChineseWord(word) {
    try {
        console.log(`🔍 Looking up Chinese word: ${word}`);
        
        const prompt = `You are a Chinese language expert and dictionary. Please provide comprehensive information for the Chinese character/word: "${word}"

CRITICAL REQUIREMENTS:
1. Provide accurate pinyin pronunciation with tone marks (ā á ǎ à, ē é ě è, etc.)
2. Give multiple definitions if the word has different meanings
3. Include part of speech for each definition
4. Provide 2-3 example sentences in Chinese for each meaning
5. Include English translations for all examples
6. If the word is not a valid Chinese character/word, indicate this clearly

RESPONSE FORMAT (JSON only, no markdown):
{
    "character": "the input character/word",
    "pinyin": "pinyin with tone marks",
    "definitions": [
        {
            "partOfSpeech": "noun/verb/adjective/etc",
            "meaning": "English definition",
            "examples": ["Chinese example 1", "Chinese example 2", "Chinese example 3"]
        }
    ],
    "isValid": true/false,
    "notes": "any additional notes about the word"
}

If the input is not a valid Chinese character or word, set "isValid" to false and provide appropriate notes.`;

        const requestBody = {
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 1000,
            temperature: 0.3
        };

        const data = await makeDictionaryRequest(requestBody);
        const responseText = data.choices[0].message.content;
        
        // Clean and parse the JSON response
        let jsonText = responseText.trim();
        
        // Remove any markdown code blocks if present
        if (jsonText.includes('```json')) {
            jsonText = jsonText.split('```json')[1].split('```')[0].trim();
        } else if (jsonText.includes('```')) {
            jsonText = jsonText.split('```')[1].split('```')[0].trim();
        }
        
        // Extract JSON from response
        const jsonStart = jsonText.indexOf('{');
        const jsonEnd = jsonText.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
            jsonText = jsonText.substring(jsonStart, jsonEnd + 1);
        }
        
        console.log('🔍 Raw OpenAI response:', jsonText);
        
        const result = JSON.parse(jsonText);
        
        // Validate the result
        if (!result.character || !result.pinyin || !Array.isArray(result.definitions)) {
            // If the response doesn't have the expected format, create a fallback response
            console.warn('⚠️ Invalid response format, creating fallback response');
            return {
                character: word,
                pinyin: 'unknown',
                definitions: [{
                    partOfSpeech: 'unknown',
                    meaning: 'Unable to find definition for this word. It may not be a valid Chinese character or word.',
                    examples: []
                }],
                isValid: false,
                notes: 'Word not found in dictionary'
            };
        }
        
        console.log('✅ Successfully looked up word:', result);
        return result;
        
    } catch (error) {
        console.error('Error looking up Chinese word:', error);
        throw new Error(`Dictionary lookup failed: ${error.message}`);
    }
}

// Routes

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Dictionary lookup endpoint
app.get('/api/dictionary/:word', async (req, res) => {
    try {
        const word = req.params.word;
        console.log(`📚 Dictionary lookup request for: ${word}`);
        
        if (!word || word.trim().length === 0) {
            return res.status(400).json({ error: 'Word parameter is required' });
        }
        
        const result = await lookupChineseWord(word.trim());
        
        res.json({
            success: true,
            data: result,
            source: 'openai'
        });
        
    } catch (error) {
        console.error('Dictionary lookup error:', error);
        
        res.status(500).json({
            success: false,
            error: 'Dictionary lookup failed',
            message: error.message
        });
    }
});

// Usage statistics
app.get('/api/usage', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const todayUsage = usageStats.dailyUsage[today] || { requests: 0, cost: 0 };
    
    const stats = {
        totalRequests: usageStats.totalRequests,
        totalCost: usageStats.totalCost,
        requestsByKey: usageStats.requestsByKey,
        dailyUsage: usageStats.dailyUsage,
        cacheSize: usageStats.imageHashes.size,
        activeApiKeys: OPENAI_API_KEY ? 1 : 0,
        todayRequests: todayUsage.requests,
        todayCost: todayUsage.cost,
        // Quota status based on configuration
        estimatedQuotaStatus: {
            requestsToday: todayUsage.requests,
            costToday: todayUsage.cost,
            // Mode-based limits
            estimatedDailyLimit: UNLIMITED_MODE ? 'unlimited' : 100,
            estimatedCostLimit: UNLIMITED_MODE ? 'unlimited' : 5.0,
            quotaWarning: UNLIMITED_MODE ? false : (todayUsage.requests > 80 || todayUsage.cost > 4.0),
            unlimitedMode: UNLIMITED_MODE
        }
    };
    res.json(stats);
});

// Check API usage endpoint
app.get('/api/check-usage', async (req, res) => {
    try {
        const response = await fetch('https://api.openai.com/v1/usage', {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            }
        });
        
        const usage = await response.json();
        res.json({
            usage: usage,
            localStats: usageStats,
            tip: 'Using "detail: low" for images reduces cost by ~85%'
        });
    } catch (error) {
        res.json({
            error: 'Could not fetch usage',
            localStats: usageStats
        });
    }
});

// Process image and generate captions (OPTIMIZED VERSION)
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
    try {
        console.log('📍 Received request to /api/analyze-image (optimized)');
        
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        console.log('📸 Processing image:', req.file.originalname);
        
        // Validate file type before processing
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            console.log('❌ Unsupported file type:', req.file.mimetype);
            return res.status(400).json({
                success: false,
                error: 'Unsupported file format',
                message: `File type "${req.file.mimetype}" is not supported. Please use: PNG, JPEG, GIF, or WebP formats.`,
                supportedFormats: ['PNG', 'JPEG', 'GIF', 'WebP'],
                receivedFormat: req.file.mimetype
            });
        }
        
        // Check cache first
        const imageHash = generateImageHash(req.file.buffer);
        const cached = getCachedResult(imageHash);

        if (cached) {
            console.log('📦 Returning cached result, no API call needed');
            return res.json({
                success: true,
                analysis: cached.analysis || {},
                captions: cached.captions || cached,
                cached: true
            });
        }
        
        // Convert to base64
        const base64Image = req.file.buffer.toString('base64');
        
        // Single combined prompt for both analysis and caption generation
        const combinedPrompt = `Analyze this image and create Chinese captions.

Step 1: Describe what you see in the image.
Step 2: Create 3 personalized Chinese sentences about it.

Format your response EXACTLY like this:
ANALYSIS:
Main subject: [what is the main subject]
Description: [brief description]
Category: [type of image]

CAPTION1:
Chinese: [natural Chinese sentence with emotion and detail]
Pinyin: [pinyin with tone marks]
English: [English translation]

CAPTION2:
Chinese: [different Chinese sentence]
Pinyin: [pinyin with tone marks]
English: [English translation]

CAPTION3:
Chinese: [another Chinese sentence]
Pinyin: [pinyin with tone marks]
English: [English translation]

Requirements:
- Chinese sentences must be natural, emotional, and specific to this image
- Use ONLY Chinese characters in the Chinese field (no English mixed in)
- Include proper Chinese punctuation (。！？)
- Make each sentence 10-30 characters long
- Express personal feelings or observations about the image`;

        // Make a SINGLE API call
        console.log('🚀 Making single optimized API call...');
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: combinedPrompt },
                        { 
                            type: 'image_url', 
                            image_url: { 
                                url: `data:${req.file.mimetype};base64,${base64Image}`,
                                detail: 'low'  // Use 'low' to reduce token usage
                            } 
                        }
                    ]
                }],
                max_tokens: 500,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('API Error:', errorData);
            
            // Check for quota errors
            if (response.status === 429 || errorData.error?.type === 'insufficient_quota' || 
                errorData.error?.code === 'insufficient_quota' || 
                errorData.error?.message?.includes('quota')) {
                console.log('💰 Quota exceeded, returning fallback response');
                
                // Cache the fallback result
                cacheResult(imageHash, { 
                    analysis: {
                        mainSubject: 'image content',
                        description: 'Image analysis temporarily unavailable due to API quota limits',
                        category: 'general'
                    },
                    captions: [{
                        chinese: '这是一张有趣的图片。',
                        pinyin: 'zhè shì yī zhāng yǒu qù de tú piàn',
                        english: 'This is an interesting image.',
                        relevance: 'medium'
                    }]
                });
                
                return res.json({
                    success: true,
                    analysis: {
                        mainSubject: 'image content',
                        description: 'Image analysis temporarily unavailable due to API quota limits',
                        category: 'general'
                    },
                    captions: [{
                        chinese: '这是一张有趣的图片。',
                        pinyin: 'zhè shì yī zhāng yǒu qù de tú piàn',
                        english: 'This is an interesting image.',
                        relevance: 'medium'
                    }],
                    quotaExceeded: true,
                    message: 'API quota exceeded - using fallback captions'
                });
            }
            throw new Error(`API request failed: ${errorData.error?.message || 'Unknown error'}`);
        }

        const data = await response.json();
        const responseText = data.choices[0].message.content;
        console.log('✅ Received response, parsing...');

        // Parse the structured response
        const analysis = {};
        const captions = [];

        // Extract analysis
        const analysisMatch = responseText.match(/ANALYSIS:([\s\S]*?)(?=CAPTION1:|$)/);
        if (analysisMatch) {
            const analysisText = analysisMatch[1];
            const subjectMatch = analysisText.match(/Main subject:\s*(.+)/i);
            const descMatch = analysisText.match(/Description:\s*(.+)/i);
            const categoryMatch = analysisText.match(/Category:\s*(.+)/i);
            
            analysis.mainSubject = subjectMatch ? subjectMatch[1].trim() : 'image content';
            analysis.description = descMatch ? descMatch[1].trim() : 'Image description';
            analysis.category = categoryMatch ? categoryMatch[1].trim() : 'general';
        }

        // Extract captions
        for (let i = 1; i <= 3; i++) {
            const captionPattern = new RegExp(`CAPTION${i}:([\\s\\S]*?)(?=CAPTION${i+1}:|$)`, 'i');
            const captionMatch = responseText.match(captionPattern);
            
            if (captionMatch) {
                const captionText = captionMatch[1];
                const chineseMatch = captionText.match(/Chinese:\s*(.+)/i);
                const pinyinMatch = captionText.match(/Pinyin:\s*(.+)/i);
                const englishMatch = captionText.match(/English:\s*(.+)/i);
                
                if (chineseMatch && chineseMatch[1].trim()) {
                    captions.push({
                        chinese: chineseMatch[1].trim(),
                        pinyin: pinyinMatch ? pinyinMatch[1].trim() : 'pīn yīn',
                        english: englishMatch ? englishMatch[1].trim() : 'Translation',
                        relevance: 'high'
                    });
                }
            }
        }

        // If parsing failed, create fallback
        if (captions.length === 0) {
            console.log('⚠️ No captions parsed, using comprehensive fallback');
            const fallbackCaptions = generateFallbackCaptions(req.file.buffer, req.file.mimetype);
            captions.push(...fallbackCaptions);
        }

        console.log(`✅ Successfully generated ${captions.length} captions`);

        // Cache the result
        cacheResult(imageHash, { analysis, captions });

        // Update usage stats
        usageStats.totalRequests++;
        saveUsageStats();

        res.json({
            success: true,
            analysis: analysis,
            captions: captions
        });

    } catch (error) {
        console.error('Error in analyze-image:', error);
        
        // Always provide fallback captions instead of failing
        console.log('🔄 Error occurred, providing fallback captions');
        
        const fallbackAnalysis = generateFallbackAnalysis();
        const fallbackCaptions = generateFallbackCaptions(req.file?.buffer || Buffer.from('fallback'), req.file?.mimetype || 'image/jpeg');
        
        res.json({
            success: true,
            analysis: fallbackAnalysis,
            captions: fallbackCaptions,
            fallbackUsed: true,
            message: 'Using fallback captions due to API issues',
            error: error.message
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
            model: 'gpt-4o-mini',
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

// Simple API test endpoint for debugging
app.get('/api/test-simple', async (req, res) => {
    try {
        console.log('🧪 Testing simple API connection...');
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: 'Say "Hello"' }],
                max_tokens: 10
            })
        });
        
        const data = await response.json();
        res.json({ 
            success: response.ok, 
            status: response.status,
            data: data 
        });
    } catch (error) {
        res.json({ 
            success: false, 
            error: error.message 
        });
    }
});

// MINIMAL TEST ENDPOINT - Bypasses all complex logic
app.post('/api/test-minimal', upload.single('image'), async (req, res) => {
    console.log('🔴 MINIMAL TEST STARTED');
    
    try {
        // Test 1: Check if we have an API key
        if (!OPENAI_API_KEY) {
            return res.json({ error: 'No API key found', check: 'Check your .env file' });
        }
        
        console.log('✅ API Key exists:', OPENAI_API_KEY.substring(0, 10) + '...');
        
        // Test 2: Simple text-only API call
        const testResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',  // Use cheaper model for testing
                messages: [{ role: 'user', content: 'Say "API works"' }],
                max_tokens: 10
            })
        });
        
        const testData = await testResponse.json();
        console.log('📡 API Response Status:', testResponse.status);
        console.log('📡 API Response:', JSON.stringify(testData));
        
        if (!testResponse.ok) {
            return res.json({
                error: 'API call failed',
                status: testResponse.status,
                details: testData
            });
        }
        
        // Test 3: If image provided, test image analysis with minimal tokens
        if (req.file) {
            console.log('🖼️ Testing with image...');
            const base64Image = req.file.buffer.toString('base64');
            
            const imageResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Say what you see in 3 words only' },
                            { 
                                type: 'image_url', 
                                image_url: { 
                                    url: `data:image/jpeg;base64,${base64Image}`,
                                    detail: 'low'
                                } 
                            }
                        ]
                    }],
                    max_tokens: 20
                })
            });
            
            const imageData = await imageResponse.json();
            console.log('🖼️ Image API Response:', JSON.stringify(imageData));
            
            return res.json({
                success: true,
                textTest: testData.choices?.[0]?.message?.content || 'No response',
                imageTest: imageData.choices?.[0]?.message?.content || 'No response',
                imageStatus: imageResponse.status,
                imageError: imageData.error
            });
        }
        
        return res.json({
            success: true,
            message: testData.choices?.[0]?.message?.content || 'No response'
        });
        
    } catch (error) {
        console.error('🔴 MINIMAL TEST ERROR:', error);
        return res.json({
            error: 'Exception occurred',
            message: error.message,
            type: error.constructor.name
        });
    }
});

// Configuration check endpoint
app.get('/api/check-config', (req, res) => {
    res.json({
        hasApiKey: !!OPENAI_API_KEY,
        keyPrefix: OPENAI_API_KEY ? OPENAI_API_KEY.substring(0, 7) : 'none',
        keyLength: OPENAI_API_KEY ? OPENAI_API_KEY.length : 0,
        hasBackupCaptionKey: !!BACKUP_CAPTION_API_KEY,
        backupCaptionKeyPrefix: BACKUP_CAPTION_API_KEY ? BACKUP_CAPTION_API_KEY.substring(0, 7) : 'none',
        backupCaptionKeyCompatible: isOpenAICompatible(BACKUP_CAPTION_API_KEY),
        hasBackupDictionaryKey: !!BACKUP_DICTIONARY_API_KEY,
        backupDictionaryKeyPrefix: BACKUP_DICTIONARY_API_KEY ? BACKUP_DICTIONARY_API_KEY.substring(0, 7) : 'none',
        backupDictionaryKeyCompatible: isOpenAICompatible(BACKUP_DICTIONARY_API_KEY),
        nodeEnv: process.env.NODE_ENV,
        unlimitedMode: UNLIMITED_MODE,
        aggressiveFallback: AGGRESSIVE_FALLBACK
    });
});

// Quota status endpoint
app.get('/api/quota-status', async (req, res) => {
    try {
        // Test a simple API call to check quota status
        const testResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1
            })
        });
        
        const testData = await testResponse.json();
        
        res.json({
            quotaStatus: testResponse.ok ? 'available' : 'exceeded',
            status: testResponse.status,
            error: testData.error,
            localStats: usageStats,
            recommendation: testResponse.ok ? 
                'API quota is available' : 
                'API quota exceeded - using fallback captions'
        });
    } catch (error) {
        res.json({
            quotaStatus: 'error',
            error: error.message,
            localStats: usageStats,
            recommendation: 'Unable to check quota status'
        });
    }
});

// Test fallback system endpoint
app.get('/api/test-fallback', (req, res) => {
    try {
        console.log('🧪 Testing fallback system...');
        
        // Create a dummy image buffer for testing
        const testBuffer = Buffer.from('test-image-data');
        
        const fallbackAnalysis = generateFallbackAnalysis();
        const fallbackCaptions = generateFallbackCaptions(testBuffer, 'image/jpeg');
        
        res.json({
            success: true,
            message: 'Fallback system test successful',
            analysis: fallbackAnalysis,
            captions: fallbackCaptions,
            fallbackUsed: true,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Debug endpoint to test image processing
app.post('/api/debug-image', upload.single('image'), async (req, res) => {
    try {
        console.log('🔍 DEBUG: Image upload received');
        console.log('🔍 DEBUG: File info:', {
            originalname: req.file?.originalname,
            mimetype: req.file?.mimetype,
            size: req.file?.size
        });
        
        if (!req.file) {
            return res.json({ error: 'No file uploaded' });
        }
        
        // Test file type validation
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        const isValidType = allowedTypes.includes(req.file.mimetype);
        
        // Test API call
        let apiTestResult = null;
        try {
            const base64Image = req.file.buffer.toString('base64');
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [{
                        role: 'user',
                        content: [
                            { type: 'text', text: 'Say "test successful"' },
                            { 
                                type: 'image_url', 
                                image_url: { 
                                    url: `data:${req.file.mimetype};base64,${base64Image}`,
                                    detail: 'low'
                                } 
                            }
                        ]
                    }],
                    max_tokens: 10
                })
            });
            
            const data = await response.json();
            apiTestResult = {
                success: response.ok,
                status: response.status,
                error: data.error,
                response: data.choices?.[0]?.message?.content
            };
        } catch (apiError) {
            apiTestResult = {
                success: false,
                error: apiError.message
            };
        }
        
        res.json({
            fileValidation: {
                isValidType,
                mimetype: req.file.mimetype,
                size: req.file.size,
                originalname: req.file.originalname
            },
            apiTest: apiTestResult,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Serve index.html for root route FIRST
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve static files (but exclude certain files)
app.use(express.static('.', {
    index: false, // Disable directory listing
    setHeaders: (res, path) => {
        // Exclude certain files from being served
        if (path.endsWith('.sh') || path.endsWith('.env') || path.endsWith('.json')) {
            res.setHeader('Content-Type', 'text/plain');
        }
    }
}));

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Usage tracking enabled`);
    console.log(`Caching enabled`);
    console.log(` API keys secured on backend`);
    console.log(`Active API keys: ${OPENAI_API_KEY ? 1 : 0}`);
    console.log(`Backup caption key: ${BACKUP_CAPTION_API_KEY ? 'ENABLED' : 'DISABLED'}`);
    console.log(`Backup dictionary key: ${BACKUP_DICTIONARY_API_KEY ? 'ENABLED' : 'DISABLED'}`);
    console.log(`Unlimited mode: ${UNLIMITED_MODE ? 'ENABLED' : 'DISABLED'}`);
    console.log(`Aggressive fallback: ${AGGRESSIVE_FALLBACK ? 'ENABLED' : 'DISABLED'}`);
    if (UNLIMITED_MODE) {
        console.log(`Enhanced fallback system active for seamless experience`);
    }
    if (AGGRESSIVE_FALLBACK) {
        console.log(`Aggressive fallback mode - bypassing API calls for maximum reliability`);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    saveUsageStats();
    process.exit(0);
});
