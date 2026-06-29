# Waitless

Waitless is a plain HTML, CSS, and JavaScript Firebase queue-management system. It uses Firebase Authentication and Firebase Realtime Database through CDN scripts, with no build framework and no frontend compilation step.

## What the system does

Waitless lets an organization run a digital queue:

- businesses create services, counters, kiosks, bookings, and settings
- customers join queues, book appointments, and track tokens
- kiosk devices issue self-service tokens
- staff serve customers from a counter screen
- superadmins approve and manage organizations

## Final route structure

```text
index.html                  Public role-based landing page

auth/
  login.html                Business/admin sign-in and business registration
  pending-approval.html     Waiting-for-approval page

business/
  dashboard.html            Business account status / overview
  queue.html                Live queue operations
  services.html             Services module
  counters.html             Counters and assignments module
  kiosks.html               Kiosk management
  bookings.html             Online bookings module
  reports.html              Reports module
  settings.html             Open hours and customization settings

customer/
  index.html                Customer join-queue portal
  book.html                 Online booking
  track.html                Token tracking

kiosk/
  login.html                Kiosk device login
  interface.html            Customer-facing kiosk interface

staff/
  login.html                Staff entry
  counter.html              Staff/counter serving screen

display/
  counter-display.html      Queue/counter display screen

admin/
  login.html                Superadmin entry
  dashboard.html            Admin overview
  approvals.html            Organization approvals
  organizations.html        Organization management
```

## Important source folders

```text
css/                        Page-specific legacy-compatible styles still used by working modules
shared/css/                 Unified app-wide UI system
shared/js/                  Shared UI/role helpers
js/auth/                    Authentication flow
js/business/                Business route adapter
js/queue/                   Queue manager logic
js/kiosk/                   Kiosk logic and database helpers
js/customer/                Customer portal logic
js/staff/                   Counter/staff display logic
js/admin/                   Admin panel logic
js/utils/                   Shared constants, helpers, and token factory
docs/                       Redesign, data model, backend/security, and testing notes
scripts/                    Admin utility scripts
```

## How to run

From the project root:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/
```

If `python` is not available on Windows, try:

```bash
py -m http.server 8000
```

## Firebase setup

The Firebase web config is in:

```text
js/config/firebase-config.js
```

Publish database rules from:

```text
firebase-rules.json
```

To set a superadmin custom claim:

```bash
npm install
npm run set-superadmin -- <firebase-user-uid>
```

Set `GOOGLE_APPLICATION_CREDENTIALS` to a Firebase service-account JSON path before running the script.

## Notes

- Old compatibility pages and old duplicated customer/counter folders have been removed.
- The UI is unified through `shared/css/unified-ui.css` and `shared/js/index-ui.js`.
- Backend hardening work is documented in `docs/BACKEND_SECURITY_PLAN.md`.
