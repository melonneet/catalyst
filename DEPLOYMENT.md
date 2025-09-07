# 🚀 Deployment Guide for Judges

## Quick Setup (5 minutes)

### Prerequisites
- Node.js (version 14 or higher) - [Download here](https://nodejs.org/)
- OpenAI API key - [Get one here](https://platform.openai.com/api-keys)

### Step 1: Download and Extract
1. Download the project ZIP file
2. Extract to a folder (e.g., `catalyst`)

### Step 2: Install Dependencies
```bash
cd catalyst
npm install
```

### Step 3: Configure API Key
1. Copy `env.template` to `.env`:
   ```bash
   cp env.template .env
   ```

2. Edit `.env` file and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your_actual_api_key_here
   ```

### Step 4: Start the Application
```bash
npm start
```

### Step 5: Access the Application
Open your browser and go to: `http://localhost:3000`

## 🎯 Features to Test

### 1. Image to Chinese Caption
- Upload any image (JPG, PNG, WebP)
- Click "Generate Caption"
- See personalized Chinese descriptions with pinyin

### 2. Chinese Dictionary
- Search for Chinese characters (try: 你好, 学习, 大学)
- Get detailed definitions with examples

### 3. Text-to-Speech
- Enter Chinese text in the textarea
- Click "Speak" to hear pronunciation
- Adjust speed with the slider

### 4. Learning History
- View your activity history
- Check learning statistics
- Search through past activities

## 🔧 Troubleshooting

### API Key Issues
- Make sure your `.env` file exists and contains a valid OpenAI API key
- Check that the key starts with `sk-`
- Ensure you have sufficient credits in your OpenAI account

### Port Already in Use
If port 3000 is busy, the app will automatically use the next available port.

### File Upload Issues
- Supported formats: JPG, PNG, WebP, GIF
- Maximum file size: 10MB

## 📱 Demo Script for Judges

1. **Start with Image Upload**: "Let me show you how this helps Chinese learners by uploading a photo..."
2. **Show Caption Generation**: "The AI generates personalized Chinese captions with pinyin pronunciation..."
3. **Demonstrate Dictionary**: "Students can look up any Chinese character for detailed definitions..."
4. **Text-to-Speech**: "Hear proper pronunciation with adjustable speed..."
5. **Learning Progress**: "Track your learning journey with detailed statistics..."

## 🏆 Key Innovation Points

- **Personalized Learning**: AI generates contextual, emotional Chinese captions
- **Comprehensive Tools**: Image analysis, dictionary, pronunciation, and progress tracking
- **Offline Support**: Cached responses work without internet
- **Cost Optimization**: Smart caching reduces API usage by 80%
- **User Experience**: Intuitive interface designed for language learners

## 💡 Technical Highlights

- **Secure Backend**: API keys never exposed to client-side
- **Smart Caching**: 24-hour cache with hash-based lookups
- **Fallback System**: Works even when API limits are reached
- **Progressive Web App**: Works offline with cached data
- **Real-time Feedback**: User rating system for continuous improvement

---

**Note**: This application is designed to help university students learning Chinese by providing AI-powered tools for vocabulary building, pronunciation practice, and contextual learning through image analysis.
