# Firebase Deployment Guide

## Current Status
✅ **Frontend deployed**: https://hackathon-judgementals.web.app
⚠️ **Backend pending**: Requires Blaze plan upgrade

## Deployment Steps

### 1. Upgrade Firebase Plan
Your Firebase project needs to be on the **Blaze (pay-as-you-go)** plan to use Cloud Functions.

1. Visit: https://console.firebase.google.com/project/hackathon-judgementals/usage/details
2. Click "Upgrade to Blaze plan"
3. Add a billing account (you'll only pay for what you use)

### 2. Deploy Cloud Functions
Once upgraded to Blaze plan, deploy the backend:

```bash
firebase deploy --only functions
```

### 3. Set Environment Variables
Set your Anthropic API key in Firebase Functions:

```bash
firebase functions:config:set anthropic.api_key="your-api-key-here"
```

Then redeploy functions:
```bash
firebase deploy --only functions
```

## Local Development

### Option 1: Firebase Emulators (Recommended)
```bash
# Start local emulators
npm run firebase:emulate
```
- Frontend: http://localhost:5000
- Functions: http://localhost:5001  
- Firebase UI: http://localhost:4000

### Option 2: Original Node.js Server
```bash
# Set environment variable
export ANTHROPIC_API_KEY="your-api-key"

# Start local server
npm start
```
- App: http://localhost:3001

## Deployment Commands

```bash
# Deploy everything
npm run firebase:deploy

# Deploy only frontend
npm run firebase:deploy:hosting  

# Deploy only backend
npm run firebase:deploy:functions
```

## Project Structure

```
├── public/           # Frontend files (deployed to Firebase Hosting)
│   ├── index.html
│   ├── app.js
│   └── fonts/
├── functions/        # Backend (deployed to Firebase Functions)
│   ├── src/
│   │   └── index.ts
│   └── package.json
├── firebase.json     # Firebase configuration
└── .firebaserc      # Project settings
```

## Environment Variables

The backend needs the following environment variable:
- `ANTHROPIC_API_KEY`: Your Claude API key from Anthropic

## Features

✅ File upload (folder & ZIP)
✅ AI-powered judging with Claude
✅ Project download as ZIP
✅ TypeScript throughout
✅ Responsive UI with Claude.ai theme
✅ Firebase hosting deployment

## Next Steps

1. Upgrade to Blaze plan
2. Deploy functions: `firebase deploy --only functions`
3. Set API key: `firebase functions:config:set anthropic.api_key="your-key"`
4. Test the live app: https://hackathon-judgementals.web.app