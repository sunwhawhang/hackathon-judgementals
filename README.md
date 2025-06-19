# 🏆 Hackathon Judgementals

An AI-powered hackathon project judging system that uses Claude AI to evaluate and rank projects with comprehensive error handling and graceful fallbacks.

## 🎥 Demo Video

<iframe width="560" height="315" src="https://www.youtube.com/embed/X_S9ijbSavw?si=pcQP9ZJfqUWENxMy" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

*Watch the full demo to see the AI judging system in action!*

## ✨ Features

- **🔄 Never Crashes**: Comprehensive error handling ensures the app always provides results
- **📁 Smart Upload**: Automatically filters out large files, dependencies, and images
- **🤖 AI Judges**: 3 specialized default judges + custom judge creation
- **⚡ Parallel Processing**: All judges evaluate projects simultaneously
- **🎯 Master Judge**: Final ranking by AI master judge analyzing all evaluations
- **📊 Interactive Results**: Expandable results with judge-specific feedback
- **🛡️ Graceful Fallbacks**: Always provides meaningful results even when APIs fail

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set up API Key**
   ```bash
   cp .env.example .env
   # Edit .env and add your Anthropic API key
   ```

3. **Build & Start**
   ```bash
   npm start
   ```

4. **Open Browser**
   Navigate to `http://localhost:3001`

## 🎯 Usage

1. **📤 Upload Projects**: Select project folders (source code focuses)
2. **👨‍⚖️ Configure Judges**: Use defaults or create custom evaluation criteria  
3. **🏁 Start Judging**: Begin AI evaluation process
4. **🏅 View Rankings**: See detailed results and judge feedback

## 🔧 Default Judges

- **🔧 Technical Excellence**: Code quality, architecture, implementation
- **💡 Innovation**: Creativity, originality, problem-solving approach
- **👤 User Experience**: Usability, design, user interaction

## ⚠️ Project Guidelines

- **Focus on**: Source code, README, docs, config files
- **Automatically excluded**: node_modules, .git, dist, build, images, large files
- **Size limits**: 10MB total, 1MB per file (auto-truncated if larger)
- **Smart filtering**: Prioritizes important files for AI analysis

## 🛡️ Error Resilience

- **Never fails**: Always provides results even with API errors
- **Graceful degradation**: Fallback evaluations when services unavailable
- **Smart recovery**: Partial processing when some files fail
- **Comprehensive logging**: Detailed error tracking and recovery

## 🔧 Development

```bash
# Development mode
npm run dev

# Build only  
npm run build

# Production server
npm start
```

## 📡 API Endpoints

- `GET /`: Main application interface
- `POST /api/upload`: Project file upload with filtering
- `POST /api/claude`: Claude AI evaluation endpoint

## 🔒 Security

- ✅ API keys excluded from repository (.env files)
- ✅ Comprehensive .gitignore for sensitive files
- ✅ No secrets committed to version control
- ✅ CORS configured for local development only

## 🎨 Architecture

- **Frontend**: Vanilla TypeScript with comprehensive error handling
- **Backend**: Node.js with robust file processing and API integration
- **AI Integration**: Claude API with fallback systems
- **File Processing**: Smart filtering and size management
- **Error Handling**: Multi-layer fallback systems ensure reliability