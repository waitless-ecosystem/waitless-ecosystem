# EcoSystem — Firebase Auth + Admin + Queue Management System

## Complete System Overview

Professional, modular queue management system with role-based access control and real-time Firebase integration.

## Components

### Authentication & Admin
- `index.html` / `app.js` — Auth page (login, register, reset)
- `admin.html` / `admin.js` — Superadmin panel (approve/reject accounts)
- `dashboard.html` / `dashboard.js` — User dashboard (account status)
- `firebase-config.js` — Firebase configuration
- `firebase-rules.json` — Realtime Database security rules
- `scripts/set-superadmin.js` — Grant superadmin custom claims

### Queue Management System
- `queue-manager.html` — Queue management UI with tabs
- `queue-manager.js` — Professional modular application logic

## User Roles & Navigation

After login, users are routed based on role:

**Superadmin** → `admin.html`
- UID: `tcWCQtILJNcahfAQA3qakrUP9Nv1`
- Email: `contact.pasan@gmail.com`
- Approve/reject/remove accounts
- View all users and pending applications

**Approved User** → `dashboard.html` → `queue-manager.html`
- Full queue management access
- Create/manage counters and services
- View live queue dashboard
- Generate reports

**Pending User** → `dashboard.html`
- Awaiting approval
- No queue system access

**Rejected User** → `dashboard.html`
- Cannot access queue system

## Queue Manager Features

### 1. Counter Management (Tab: Counters)
- Create/update/delete service counters
- Set status (active/inactive)
- Real-time sync across all users

### 2. Service Management (Tab: Services)
- Create/update/delete services
- Fields: name, description, estimatedTime
- Unique service names enforced

### 3. Assign Services to Counters (Tab: Assignments)
- Multi-select service assignment per counter
- Real-time updates
- Efficient Firebase storage

### 4. Live Queue Dashboard (Tab: Queue)
- Real-time queue status per service
- Display waiting, serving, idle counts
- No page reload needed (Firebase listeners)

### 5. Reports & Statistics (Tab: Reports)
- Daily summary (tokens served, avg wait time, avg serve time)
- Counter-wise performance metrics
- Filter by date
- Automatic token tracking

## Firebase Data Structure

```
/users/$uid/
  role: "approved" | "pending" | "rejected"
  email: string
  createdAt: timestamp
  cryptoSalt: string

/counters/$counterId/
  id, name, status, createdAt

/services/$serviceId/
  id, name, description, estimatedTime, createdAt

/assignments/$counterId/
  counterId, services: [serviceIds], updatedAt

/queue/$serviceId/$tokenId/
  id, serviceId, description, timestamp, status, counter

/tokens/$tokenId/
  id, counterId, serviceId, waitTime, serveTime, date, timestamp
```

## Professional Code Architecture

### Modular Design
- Separate CRUD modules: `countersDB`, `servicesDB`, `assignmentsDB`, `queueDB`, `tokensDB`
- Reusable UI rendering functions
- Event delegation for efficiency
- No global variables

### Real-time Sync
- Firebase `onValue` listeners
- Automatic DOM updates on changes
- No manual refresh required

### Error Handling
- Try/catch on all async operations
- User-friendly error messages
- Console logging for debugging

### Performance
- Indexed Firebase queries
- Minimal DOM re-renders
- Optimized read/write operations

## Setup Instructions

### 1. Publish Firebase Rules

1. Go to Firebase Console → Realtime Database → Rules
2. Copy contents of `firebase-rules.json`
3. Paste and publish

### 2. Set Superadmin (Optional)

UID `tcWCQtILJNcahfAQA3qakrUP9Nv1` is pre-configured as bootstrap superadmin.

To also set custom claims:
```powershell
npm install
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
npm run set-superadmin -- tcWCQtILJNcahfAQA3qakrUP9Nv1
```

Then sign out/in to refresh token claims.

### 3. Run the App

**Direct:**
```
Open index.html in browser
```

**With local server:**
```powershell
npx http-server -p 8000
Open http://localhost:8000
```

### 4. Test Flow

1. Register new account
2. Login as superadmin → approve account
3. Login as new user → queue-manager.html
4. Add counters, services, assignments
5. View live queue and reports

## File Organization

```
index.html              Auth UI
app.js                  Auth + routing logic
admin.html              Superadmin panel
admin.js                Superadmin logic
dashboard.html          Account status display
dashboard.js            Dashboard logic
queue-manager.html      Queue management UI
queue-manager.js        Queue app logic (~700 lines, fully modular)
firebase-config.js      Firebase config
firebase-rules.json     Security rules (updated)
styles.css              Responsive styling
package.json            Dependencies
scripts/
  └─ set-superadmin.js  Claim setter
README.md               This file
```

## Troubleshooting

**Can't access queue manager?**
- Check dashboard.html for approval status
- Ensure role is "approved"

**Queue not updating?**
- Verify firebase-rules.json is published
- Check browser console for errors

**Lost superadmin access?**
- Sign out/in to refresh ID token

**No data showing?**
- Check Firebase Realtime Database console
- Verify data exists under /counters, /services, etc.

