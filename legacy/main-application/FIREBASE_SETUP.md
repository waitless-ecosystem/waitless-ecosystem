# Firebase Setup Guide

## Camera Detection Fixes Applied
✅ **Fixed Issues:**
- Added proper camera permission checking before initializing scanner
- Added detailed error messages for different camera issues
- Added page visibility detection to pause/resume scanner appropriately
- Improved scanner lifecycle management
- Added retry logic and better error handling

## Firebase Authentication Setup

### Step 1: Create Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project"
3. Enter your project name (e.g., "QR Connect")
4. Follow the setup wizard

### Step 2: Get Firebase Configuration
1. In Firebase Console, go to Project Settings (gear icon)
2. Scroll to "Your apps" section
3. Click on Web icon (</>) to create a web app
4. Copy the Firebase config object

### Step 3: Update Firebase Config in script.js
Replace these values in `script.js` (lines 5-12):
```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",                    // From Firebase config
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",              // Your project ID
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

### Step 4: Enable Authentication Methods
1. In Firebase Console, go to **Authentication** > **Sign-in method**
2. Enable:
   - **Email/Password** (for form login)
   - **Google** (for Google Sign-In)

3. For Google Sign-In, click Google and add your OAuth consent screen

### Step 5: Google Sign-In Setup (Optional)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Go to **Credentials** > **Create Credentials** > **OAuth client ID**
4. Choose **Web application**
5. Add authorized redirect URIs:
   - `http://localhost:3000`
   - Your production domain
6. Copy the Client ID and update `YOUR_GOOGLE_CLIENT_ID` in script.js

### Step 6: Enable Database (Optional)
If you want to store user data:
1. In Firebase Console, go to **Realtime Database** or **Firestore**
2. Click **Create Database**
3. Choose your location
4. Set security rules (example for testing):
```json
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

## Testing Camera
1. Run the app in HTTPS (required for camera access)
2. Click "Sign In" to log in
3. Allow camera permissions when prompted
4. You should see "📷 Camera active - scan a QR code"

## Troubleshooting

### Camera Issues
- **"No camera device found"**: Check if your device has a camera
- **"Camera is in use"**: Close other apps using the camera
- **"Permission denied"**: Check browser permissions for camera access
- **"Camera not compatible"**: Try disabling constraints in config or use a different browser

### Firebase Issues
- **Auth errors**: Make sure all credentials are correct in Firebase config
- **Google Sign-In not working**: Verify OAuth redirect URI is added in Google Cloud Console
- **CORS errors**: Enable all origins temporarily for testing (not recommended for production)

## Security Notes
⚠️ **Never commit real credentials to version control!**
- Use environment variables for production
- Rotate API keys regularly
- Enable Firebase Security Rules for Realtime Database
- Use App Check to prevent abuse

## Environment Variables (Recommended for Production)
Create a `.env` file (don't commit to git):
```
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
VITE_FIREBASE_PROJECT_ID=your_project_id
```

Then update script.js:
```javascript
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    // ... other config
};
```

## Support
For more help:
- [Firebase Documentation](https://firebase.google.com/docs)
- [Html5QRCode Documentation](https://scanapp.org/html5-qrcode.html)
