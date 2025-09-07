# 📸 Mandarin Photo Captions - Enhanced Version

An AI-powered application that generates personalized Mandarin captions for your photos with secure backend architecture, caching, offline support, and user feedback system.

## ✨ New Features

### 🔐 Security Improvements
- **API Keys Secured**: All API keys are now stored securely on the backend server
- **No Client-Side Exposure**: API keys are never exposed to the client-side code
- **Secure Communication**: All API requests go through the backend server

### 💰 Cost Management
- **Usage Tracking**: Monitor API usage and costs
- **Cost Estimation**: Track estimated costs for each request
- **Daily Usage Reports**: View usage statistics by day
- **API Key Management**: Secure API key handling on backend

### 🚀 Performance Enhancements
- **Image Caching**: Similar images are cached to reduce API calls
- **Hash-Based Caching**: Uses SHA-256 hashing for efficient cache lookups
- **24-Hour Cache**: Cached responses are valid for 24 hours
- **Cache Statistics**: Track cache hit rates and performance

### 📱 Progressive Enhancement
- **Offline Support**: Graceful handling when offline
- **Cached Responses**: Use cached data when offline
- **Connection Status**: Real-time online/offline indicators
- **Fallback Mechanisms**: Multiple fallback strategies

### ⭐ User Feedback System
- **Caption Rating**: 5-star rating system for generated captions
- **Feedback Collection**: Optional text feedback for improvements
- **Quality Tracking**: Monitor caption quality over time
- **User Experience**: Improved user engagement

## 🚀 Quick Start

### Prerequisites
- Node.js (version 14 or higher)
- npm or yarn package manager

### Installation

1. **Clone or download the project**
   ```bash
   cd /Users/charis/catalyst
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

4. **Open your browser**
   Navigate to `http://localhost:3000`

### Development Mode
For development with auto-restart:
```bash
npm run dev
```

## 🏗️ Architecture

### Backend (server.js)
- **Express.js Server**: Handles API requests and file uploads
- **Secure API Management**: Manages OpenAI API key securely
- **Usage Tracking**: Monitors costs and usage patterns
- **Image Caching**: Server-side caching with hash-based storage
- **File Upload**: Handles image uploads with multer

### Frontend (app.js)
- **Progressive Web App**: Works offline with cached data
- **Real-time Status**: Shows connection and cache status
- **User Feedback**: Rating and feedback collection system
- **Local Storage**: Client-side caching and usage tracking

### Key Endpoints
- `POST /api/analyze-image` - Analyze image and generate captions
- `POST /api/rate-caption` - Submit caption ratings and feedback
- `GET /api/usage` - Get usage statistics
- `POST /api/clear-cache` - Clear server cache

## 📊 Usage Statistics

The application tracks:
- Total API requests
- Cache hit rates
- Cost estimates
- Daily usage patterns
- API usage patterns
- User ratings and feedback

## 🔧 Configuration

### API Keys
Set your OpenAI API key in the `.env` file:
```bash
OPENAI_API_KEY=your_openai_api_key_here
```

### Cache Settings
Modify cache expiry time in both server and client:
```javascript
// Server (server.js)
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

// Client (app.js)
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
```

## 🛡️ Security Features

1. **API Key Protection**: Keys stored only on server
2. **Request Validation**: Input validation and sanitization
3. **Error Handling**: Secure error messages without sensitive data
4. **Rate Limiting**: Built-in usage tracking and limits
5. **File Upload Security**: File type and size validation

## 📱 Offline Support

- **Cached Responses**: Previously analyzed images work offline
- **Connection Detection**: Automatic online/offline detection
- **Graceful Degradation**: Clear error messages when offline
- **Local Storage**: Persistent cache across browser sessions

## 🎯 User Experience

- **Real-time Feedback**: Immediate rating and feedback submission
- **Visual Indicators**: Clear status indicators for connection and cache
- **Responsive Design**: Works on desktop and mobile devices
- **Accessibility**: Screen reader friendly with proper ARIA labels

## 🔍 Monitoring

### Usage Dashboard
Access usage statistics at `/api/usage`:
```json
{
  "totalRequests": 150,
  "totalCost": 0.45,
  "requestsByKey": {
    "key_1": 75,
    "key_2": 75
  },
  "dailyUsage": {
    "2024-01-15": {
      "requests": 25,
      "cost": 0.08
    }
  },
  "cacheSize": 45
}
```

### Cache Management
- View cache statistics in the usage dashboard
- Clear cache via `/api/clear-cache` endpoint
- Monitor cache hit rates for performance optimization

## 🚀 Deployment

### Environment Variables
Set these environment variables for production:
```bash
PORT=3000
NODE_ENV=production
```

### Production Considerations
- Use a reverse proxy (nginx) for SSL termination
- Set up proper logging and monitoring
- Configure backup strategies for usage data
- Implement proper error tracking

## 📈 Performance Tips

1. **Cache Optimization**: Monitor cache hit rates and adjust expiry times
2. **API Key Management**: Ensure your OpenAI API key has sufficient credits
3. **Image Compression**: Consider client-side image compression
4. **CDN Integration**: Use CDN for static assets in production

## 🐛 Troubleshooting

### Common Issues

1. **API Key Errors**: Check that API keys are valid and have sufficient credits
2. **Cache Issues**: Clear browser cache and server cache if needed
3. **Upload Failures**: Check file size limits and supported formats
4. **Offline Mode**: Ensure cached responses are available for offline use

### Debug Mode
Enable debug logging by checking the browser console for detailed information.

## 📄 License

MIT License - feel free to use and modify as needed.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

---

**Note**: This enhanced version provides significant improvements in security, performance, and user experience while maintaining the core functionality of generating personalized Mandarin captions for photos.
