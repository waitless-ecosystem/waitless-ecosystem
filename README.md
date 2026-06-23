# Waitless / EcoSystem

Waitless is a plain HTML, CSS, and JavaScript Firebase queue-management project. It uses Firebase Authentication and Firebase Realtime Database through CDN scripts. There is no build framework and no frontend compilation step.

## Folder Structure

```text
waitless-ecosystem/
├── index.html
├── firebase-rules.json
├── package.json
├── README.md
├── scripts/
│   └── set-superadmin.js
├── assets/
│   ├── images/
│   ├── icons/
│   └── logo/
├── css/
│   ├── global.css
│   ├── auth.css
│   ├── dashboard.css
│   ├── admin.css
│   ├── queue-manager.css
│   └── kiosk.css
├── js/
│   ├── config/
│   │   └── firebase-config.js
│   ├── auth/
│   │   ├── app.js
│   │   └── auth-guard.js
│   ├── admin/
│   │   └── admin.js
│   ├── dashboard/
│   │   └── dashboard.js
│   ├── queue/
│   │   └── queue-manager.js
│   ├── kiosk/
│   │   ├── kiosk-db.js
│   │   ├── kiosk-management.js
│   │   ├── kiosk-login.js
│   │   └── kiosk-interface.js
│   └── utils/
│       ├── constants.js
│       └── helpers.js
├── pages/
│   ├── admin.html
│   ├── dashboard.html
│   ├── queue-manager.html
│   └── kiosk/
│       ├── kiosk-management.html
│       ├── kiosk-login.html
│       └── kiosk-interface.html
└── legacy/
    └── main-application/
```

## Main Entry Points

- `index.html` - login, registration, and password reset.
- `pages/admin.html` - superadmin approval and account management.
- `pages/dashboard.html` - account status and approved-user entry point.
- `pages/queue-manager.html` - counters, services, assignments, queue status, and reports.
- `pages/kiosk/kiosk-management.html` - kiosk CRUD, PIN reset, activity, and reports.
- `pages/kiosk/kiosk-login.html` - three-step kiosk login.
- `pages/kiosk/kiosk-interface.html` - customer service selection and token generation.

## How To Run

You can open `index.html` directly in a browser. For fewer browser restrictions, run a simple static server from the project root:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

## Firebase Setup

The shared Firebase config lives at:

```text
js/config/firebase-config.js
```

Publish the rules from:

```text
firebase-rules.json
```

The optional custom-claim helper is still available:

```bash
npm install
npm run set-superadmin -- <firebase-user-uid>
```

Set `GOOGLE_APPLICATION_CREDENTIALS` to a Firebase service-account JSON file before running the script.

## Legacy QR Flow

The older customer-facing QR/token flow was preserved under:

```text
legacy/main-application/
```

Its internal relative links are kept intact, and its Firebase config now loads from the shared config file.
