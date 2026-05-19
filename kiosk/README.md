# KIOSK Application - ESP32 Deployment Package

This folder contains the standalone KIOSK application for deployment on ESP32 devices or as a web-based customer service terminal.

## 📁 Folder Structure

```
kiosk/
├── README.md                    (This file)
├── kiosk-login.html            (Entry point - 3-step login)
├── kiosk-interface.html        (Customer service terminal)
├── kiosk-login.js              (Login authentication logic)
├── kiosk-interface.js          (Service selection & token generation)
├── kiosk-db.js                 (Firebase database operations)
```

## 🚀 Quick Start

### For Web Hosting (Browser Access)

1. **Upload Files**: Upload all files in this folder to your web server
2. **Firebase Config**: Ensure parent directory has `firebase-config.js` with your Firebase credentials
3. **Access**: Navigate to `kiosk-login.html` in your browser

### For ESP32 Deployment

1. **Prepare Files**: 
   - Upload all files to ESP32's SPIFFS (file system)
   - Copy parent's `firebase-config.js` to this folder first

2. **Web Server Setup**:
   ```cpp
   server.serveStatic("/kiosk/", SPIFFS, "/kiosk/");
   server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
     request->send(SPIFFS, "/kiosk/kiosk-login.html", "text/html");
   });
   ```

3. **Access**: Connect to ESP32 on `http://device-ip/`

## 📋 File Descriptions

### kiosk-login.html
**Purpose**: Three-step authentication gateway
- **Step 1**: User email/password login via Firebase Auth
- **Step 2**: KIOSK device selection (filtered by organization)
- **Step 3**: KIOSK PIN verification
- **Output**: Session storage with KIOSK credentials

### kiosk-interface.html
**Purpose**: Customer-facing service terminal
- Service card selection grid
- Token generation with QR code
- Real-time queue position tracking
- Logout functionality

### kiosk-login.js
**Key Functions**:
- `signInWithEmailAndPassword()` - Firebase user authentication
- `loadKiosksForSelection()` - Fetch org's KIOSK devices
- `verifyKioskPin()` - PIN validation
- `sessionStorage` - Persist session data

### kiosk-interface.js
**Key Functions**:
- `loadServices()` - Fetch active services for organization
- `generateToken()` - Create token with assignment
- `displayToken()` - Render token with QR code
- Session timeout & inactivity checking

### kiosk-db.js
**Modules**:
- `kioskDB` - KIOSK CRUD operations
- `kioskAuthDB` - PIN management & verification
- `kioskTokenDB` - Token generation with atomic writes
- `kioskReportingDB` - Analytics & activity logs

## 🔐 Security Configuration

### Firebase Rules Required
Your parent `firebase-rules.json` must include:
```json
{
  "users": {
    "$uid": {
      "kiosks": {
        "$kioskId": {
          ".read": "$uid === auth.uid || auth.token.superadmin === true",
          ".write": "$uid === auth.uid || auth.token.superadmin === true"
        }
      },
      "services": {
        ".read": "$uid === auth.uid",
      },
      "queue": {
        ".read": "$uid === auth.uid || auth.token.superadmin === true",
        ".write": "$uid === auth.uid"
      }
    }
  },
  "kioskUsers": {
    "$kioskUserId": {
      ".read": true,
      ".write": true
    }
  }
}
```

## 🔧 Configuration

### Firebase Credentials
- Place `../firebase-config.js` in parent directory with:
  ```javascript
  const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "your-project.firebaseapp.com",
    databaseURL: "https://your-project.firebaseio.com",
    // ... other config
  };
  ```

### Session Storage Keys
After login, the following are stored in `sessionStorage`:
- `kioskId` - KIOSK device ID
- `kioskName` - KIOSK display name
- `organizationId` - Owner organization UID
- `kioskUserId` - KIOSK user ID (kiosk_{kioskId})
- `kioskLoginTime` - ISO timestamp
- `authenticatedUserUID` - Operator's user ID

## 📡 Firebase Database Structure

```
/users/{organizationId}/
  ├── kiosks/{kioskId}/
  │   ├── name, status, tokensGenerated
  ├── services/{serviceId}/
  │   ├── name, status, estimatedTime
  ├── queue/{serviceId}/{tokenId}/
  │   ├── tokenNumber, status, assignedCounterId
  └── tokens/{tokenId}/
      ├── tokenNumber, status, qrPayload

/kioskUsers/{kioskUserId}/
  ├── pinHash, organizationId, kioskId
```

## ⏱️ Session Management

- **Timeout**: 5 minutes of inactivity
- **Inactivity Check**: Every 30 seconds
- **Auto-Logout**: Redirects to login on timeout

## 🎯 Typical User Flow

1. **Operator Login**: Email + Password (Step 1)
2. **Device Selection**: Choose KIOSK from dropdown (Step 2)
3. **PIN Verification**: Enter 4-6 digit PIN (Step 3)
4. **Service Display**: See available services
5. **Token Generation**: Customer selects service → token issued
6. **QR Code**: Scanned for queue tracking

## 🛠️ Development & Testing

### Local Testing
```bash
# Serve from current directory
python -m http.server 8000

# Access at: http://localhost:8000/kiosk/kiosk-login.html
```

### Mock Data Insertion
```javascript
// In browser console for testing:
const mockOrg = {
  name: "Demo Organization",
  role: "approved",
  organizationName: "Demo Org"
};
await db.ref(`users/testuid`).set(mockOrg);
```

## 📝 Deployment Checklist

- [ ] Firebase credentials configured in `firebase-config.js`
- [ ] Firebase security rules updated
- [ ] All files uploaded (HTML, JS files, config)
- [ ] Tested login flow with test user account
- [ ] Verified token generation works
- [ ] QR code renders correctly
- [ ] Session timeout behavior tested
- [ ] Network connectivity verified (internet required)

## 🔗 Related Files

- Parent `firebase-config.js` - Shared Firebase configuration
- `counter-display.html` - Operator counter display page (separate deployment)
- `queue-manager.html` - Admin queue management (separate deployment)

## ❓ Troubleshooting

| Issue | Solution |
|-------|----------|
| "firebase not defined" | Check `../firebase-config.js` is loaded |
| Login fails | Verify Firebase Auth is enabled & user exists |
| No KIOSKs shown | Ensure user has `role: 'approved'` in Firebase |
| PIN verification fails | Check PIN hash format in `kioskAuthDB.hashPin()` |
| QR code not rendering | Verify QRCode CDN link in HTML head |
| Session expired too fast | Check browser's sessionStorage permissions |

## 📞 Support

For issues or questions:
1. Check browser console for errors (`F12`)
2. Verify Firebase credentials and security rules
3. Test with parent application first
4. Review Firebase Realtime Database structure

---

**Last Updated**: 2024
**Version**: 1.0.0
