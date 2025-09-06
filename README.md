# catalyst
<<<<<<< HEAD
fffff
=======


# Hi guys this is Simpson
>>>>>>> 13084591044a8ae0b81d17afc357427be2a6fc96

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>📸 Mandarin Photo Captions</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }

        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.1);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #ff6b6b, #ffa726);
            color: white;
            padding: 40px;
            text-align: center;
        }

        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
        }

        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
            font-style: italic;
        }

        .content {
            padding: 40px;
        }

        .upload-section {
            text-align: center;
            margin-bottom: 40px;
        }

        .upload-box {
            border: 3px dashed #ddd;
            border-radius: 15px;
            padding: 60px 20px;
            margin-bottom: 20px;
            cursor: pointer;
            transition: all 0.3s ease;
            background: #fafafa;
        }

        .upload-box:hover {
            border-color: #667eea;
            background: #f0f4ff;
        }

        .upload-box.dragover {
            border-color: #667eea;
            background: #f0f4ff;
            transform: scale(1.02);
        }

        .upload-icon {
            font-size: 4rem;
            margin-bottom: 20px;
            color: #667eea;
        }

        .upload-text {
            font-size: 1.3rem;
            color: #666;
            margin-bottom: 10px;
        }

        .upload-subtext {
            color: #999;
            font-size: 1rem;
        }

        #fileInput {
            display: none;
        }

        .photo-preview {
            display: none;
            text-align: center;
            margin-bottom: 30px;
        }

        .photo-preview img {
            max-width: 100%;
            max-height: 300px;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }

        .new-photo-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 1rem;
        }

        .captions-section {
            display: none;
        }

        .caption-card {
            background: #f8f9ff;
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 20px;
            border-left: 5px solid #667eea;
            transition: all 0.3s ease;
        }

        .caption-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
        }

        .chinese-text {
            font-size: 1.8rem;
            color: #333;
            margin-bottom: 10px;
            font-weight: 500;
        }

        .pinyin {
            font-size: 1.2rem;
            color: #667eea;
            margin-bottom: 8px;
            font-style: italic;
        }

        .english {
            font-size: 1.1rem;
            color: #666;
            margin-bottom: 15px;
        }

        .audio-btn {
            background: linear-gradient(45deg, #ff6b6b, #ffa726);
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 0.9rem;
            margin-right: 10px;
            transition: all 0.3s ease;
        }

        .audio-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 5px 15px rgba(255,107,107,0.3);
        }

        .dictionary-btn {
            background: #4CAF50;
            color: white;
            border: none;
            padding: 8px 15px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 0.9rem;
            transition: all 0.3s ease;
        }

        .dictionary-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 5px 15px rgba(76,175,80,0.3);
        }

        .loading {
            display: none;
            text-align: center;
            padding: 40px;
        }

        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #667eea;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .dictionary-popup {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 1000;
            justify-content: center;
            align-items: center;
        }

        .dictionary-content {
            background: white;
            padding: 30px;
            border-radius: 20px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        }

        .close-btn {
            float: right;
            font-size: 2rem;
            cursor: pointer;
            color: #999;
        }

        .word-entry {
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid #eee;
        }

        @media (max-width: 768px) {
            .header h1 {
                font-size: 2rem;
            }
            
            .content {
                padding: 20px;
            }
            
            .upload-box {
                padding: 40px 20px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📸 Mandarin Photo Captions</h1>
            <p>Turn your everyday photos into instant Mandarin captions</p>
        </div>

        <div class="content">
            <div class="upload-section">
                <div class="upload-box" id="uploadBox">
                    <div class="upload-icon">📷</div>
                    <div class="upload-text">Upload or drop a photo here</div>
                    <div class="upload-subtext">Your meal, pet, desk, travel shot - anything!</div>
                </div>
                <input type="file" id="fileInput" accept="image/*">
            </div>

            <div class="photo-preview" id="photoPreview">
                <img id="previewImg" src="" alt="Uploaded photo">
                <br>
                <button class="new-photo-btn" onclick="resetUpload()">📷 Upload New Photo</button>
            </div>

            <div class="loading" id="loading">
                <div class="spinner"></div>
                <p>Generating your Mandarin captions... 🎯</p>
            </div>

            <div class="captions-section" id="captionsSection">
                <div id="captionsContainer"></div>
            </div>
        </div>
    </div>

    <!-- Dictionary Popup -->
    <div class="dictionary-popup" id="dictionaryPopup">
        <div class="dictionary-content">
            <span class="close-btn" onclick="closeDictionary()">&times;</span>
            <h3>📖 Dictionary</h3>
            <div id="dictionaryContent"></div>
        </div>
    </div>

    <script>
        // Sample captions database organized by detected objects
        const captionTemplates = {
            coffee: [
                { chinese: "我在喝咖啡。", pinyin: "wǒ zài hē kāfēi", english: "I'm drinking coffee." },
                { chinese: "今天的咖啡很香。", pinyin: "jīntiān de kāfēi hěn xiāng", english: "Today's coffee smells good." },
                { chinese: "我喜欢早上喝一杯咖啡。", pinyin: "wǒ xǐhuān zǎoshang hē yì bēi kāfēi", english: "I like drinking a cup of coffee in the morning." }
            ],
            food: [
                { chinese: "这个菜很好吃。", pinyin: "zhège cài hěn hǎochī", english: "This dish is very delicious." },
                { chinese: "我今天吃了很多。", pinyin: "wǒ jīntiān chī le hěnduō", english: "I ate a lot today." },
                { chinese: "这是我最喜欢的食物。", pinyin: "zhè shì wǒ zuì xǐhuān de shíwù", english: "This is my favorite food." }
            ],
            cat: [
                { chinese: "我的猫很可爱。", pinyin: "wǒ de māo hěn kě'ài", english: "My cat is very cute." },
                { chinese: "猫咪在睡觉。", pinyin: "māomī zài shuìjiào", english: "The kitty is sleeping." },
                { chinese: "我喜欢和猫玩。", pinyin: "wǒ xǐhuān hé māo wán", english: "I like playing with cats." }
            ],
            dog: [
                { chinese: "我的狗很聪明。", pinyin: "wǒ de gǒu hěn cōngmíng", english: "My dog is very smart." },
                { chinese: "狗狗想要出去走走。", pinyin: "gǒugǒu xiǎng yào chūqù zǒuzǒu", english: "The doggie wants to go for a walk." },
                { chinese: "我每天遛狗。", pinyin: "wǒ měitiān liùgǒu", english: "I walk the dog every day." }
            ],
            default: [
                { chinese: "这个很有趣。", pinyin: "zhège hěn yǒuqù", english: "This is very interesting." },
                { chinese: "今天天气很好。", pinyin: "jīntiān tiānqì hěn hǎo", english: "The weather is very nice today." },
                { chinese: "我觉得这个很漂亮。", pinyin: "wǒ juéde zhège hěn piàoliang", english: "I think this is very beautiful." }
            ]
        };

        // Dictionary data
        const dictionary = {
            "我": { pinyin: "wǒ", english: "I, me" },
            "在": { pinyin: "zài", english: "at, in, on (indicating ongoing action)" },
            "喝": { pinyin: "hē", english: "to drink" },
            "咖啡": { pinyin: "kāfēi", english: "coffee" },
            "今天": { pinyin: "jīntiān", english: "today" },
            "的": { pinyin: "de", english: "possessive particle" },
            "很": { pinyin: "hěn", english: "very" },
            "香": { pinyin: "xiāng", english: "fragrant, aromatic" },
            "喜欢": { pinyin: "xǐhuān", english: "to like" },
            "早上": { pinyin: "zǎoshang", english: "morning" },
            "一杯": { pinyin: "yì bēi", english: "one cup" }
        };

        // File upload handling
        const uploadBox = document.getElementById('uploadBox');
        const fileInput = document.getElementById('fileInput');
        const photoPreview = document.getElementById('photoPreview');
        const previewImg = document.getElementById('previewImg');
        const loading = document.getElementById('loading');
        const captionsSection = document.getElementById('captionsSection');

        uploadBox.addEventListener('click', () => fileInput.click());
        uploadBox.addEventListener('dragover', handleDragOver);
        uploadBox.addEventListener('dragleave', handleDragLeave);
        uploadBox.addEventListener('drop', handleDrop);
        fileInput.addEventListener('change', handleFileSelect);

        function handleDragOver(e) {
            e.preventDefault();
            uploadBox.classList.add('dragover');
        }

        function handleDragLeave(e) {
            e.preventDefault();
            uploadBox.classList.remove('dragover');
        }

        function handleDrop(e) {
            e.preventDefault();
            uploadBox.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                processFile(files[0]);
            }
        }

        function handleFileSelect(e) {
            const files = e.target.files;
            if (files.length > 0) {
                processFile(files[0]);
            }
        }

        function processFile(file) {
            if (!file.type.startsWith('image/')) {
                alert('Please upload an image file!');
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                previewImg.src = e.target.result;
                
                // Hide upload section, show preview
                document.querySelector('.upload-section').style.display = 'none';
                photoPreview.style.display = 'block';
                
                // Show loading
                loading.style.display = 'block';
                captionsSection.style.display = 'none';
                
                // Simulate AI processing
                setTimeout(() => {
                    generateCaptions(file.name);
                }, 2000);
            };
            reader.readAsDataURL(file);
        }

        function generateCaptions(filename) {
            // Simple object detection simulation based on filename
            let detectedObject = 'default';
            const name = filename.toLowerCase();
            
            if (name.includes('coffee') || name.includes('cafe')) {
                detectedObject = 'coffee';
            } else if (name.includes('cat') || name.includes('kitty')) {
                detectedObject = 'cat';
            } else if (name.includes('dog') || name.includes('puppy')) {
                detectedObject = 'dog';
            } else if (name.includes('food') || name.includes('meal') || name.includes('lunch') || name.includes('dinner')) {
                detectedObject = 'food';
            }

            const captions = captionTemplates[detectedObject] || captionTemplates.default;
            displayCaptions(captions);
        }

        function displayCaptions(captions) {
            loading.style.display = 'none';
            captionsSection.style.display = 'block';
            
            const container = document.getElementById('captionsContainer');
            container.innerHTML = '';
            
            captions.forEach((caption, index) => {
                const card = document.createElement('div');
                card.className = 'caption-card';
                card.innerHTML = `
                    <div class="chinese-text">${caption.chinese}</div>
                    <div class="pinyin">${caption.pinyin}</div>
                    <div class="english">${caption.english}</div>
                    <button class="audio-btn" onclick="playAudio('${caption.chinese}')">🔊 Listen</button>
                    <button class="dictionary-btn" onclick="showDictionary('${caption.chinese}')">📖 Dictionary</button>
                `;
                container.appendChild(card);
            });
        }

        function playAudio(text) {
            // Simulate text-to-speech (in real app, would use Web Speech API or external service)
            alert(`🔊 Playing: "${text}"\n\n(In the real app, this would use text-to-speech to pronounce the Mandarin!)`);
        }

        function showDictionary(sentence) {
            const popup = document.getElementById('dictionaryPopup');
            const content = document.getElementById('dictionaryContent');
            
            // Parse characters from sentence and show definitions
            const characters = Array.from(sentence).filter(char => dictionary[char]);
            
            content.innerHTML = '';
            characters.forEach(char => {
                if (dictionary[char]) {
                    const entry = document.createElement('div');
                    entry.className = 'word-entry';
                    entry.innerHTML = `
                        <strong style="font-size: 1.3rem; color: #333;">${char}</strong><br>
                        <span style="color: #667eea; font-style: italic;">${dictionary[char].pinyin}</span><br>
                        <span style="color: #666;">${dictionary[char].english}</span>
                    `;
                    content.appendChild(entry);
                }
            });
            
            popup.style.display = 'flex';
        }

        function closeDictionary() {
            document.getElementById('dictionaryPopup').style.display = 'none';
        }

        function resetUpload() {
            document.querySelector('.upload-section').style.display = 'block';
            photoPreview.style.display = 'none';
            captionsSection.style.display = 'none';
            loading.style.display = 'none';
            fileInput.value = '';
        }

        // Close dictionary when clicking outside
        document.getElementById('dictionaryPopup').addEventListener('click', function(e) {
            if (e.target === this) {
                closeDictionary();
            }
        });
    </script>
</body>
</html>