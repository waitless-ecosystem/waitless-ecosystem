# Counter Display — ESP32 / Operator Package

This folder contains the operator counter live display split from the main app for standalone deployment (ESP32 or web).

Files:
- `counter-display.html` — operator UI (touch-friendly)
- `counter-display.js` — client logic (uses `../firebase-config.js`)

Deployment:
- Copy files to ESP32 SPIFFS or host under `/counter` path
- Ensure `../firebase-config.js` is available and points to your Firebase project

Notes:
- Simplified UI for operators with larger controls and clear metadata
- Auth reuses existing Firebase session

