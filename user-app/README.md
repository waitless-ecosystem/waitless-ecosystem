# EcoSystem Mobile App

This folder contains a separate mobile-friendly application for organization staff.

## Features
- Sign in with name, email, and phone number
- Store the app profile in Firebase under `appuser`
- Scan an organization QR from Queue Manager
- No password or sign-in is required
- Load kiosk services for the scanned organization
- Open the full kiosk interface on mobile
- Track any token number within the scanned organization

## Files
- `login.html` - onboarding page for app access
- `js/login.js` - Firebase Auth sign-in and appuser profile save
- `index.html` - mobile app shell
- `css/app.css` - mobile layout and card styling
- `js/app.js` - QR scanning, kiosk loading, token generation, and tracker wiring
- `js/tracker.js` - real-time token tracking logic
- `js/token-factory.js` - local copy of the token helpers

## Notes
- The app uses the shared Firebase config from `js/config/firebase-config.js`.
- The app uses Firebase Authentication anonymously and stores the user profile in `appuser/{uid}`.
- The organization QR is generated from `pages/queue-manager.html` and points to this app with `orgId` in the URL.
- The app is designed to load only the scanned organization and does not ask for a password.
