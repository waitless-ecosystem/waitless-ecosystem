# KIOSK System - Quick Reference

## File Structure

```
EcoSystem/
├── kiosk-db.js                          # Core KIOSK operations (490+ lines)
├── kiosk-login.html                     # PIN-based authentication UI
├── kiosk-login.js                       # KIOSK selection & PIN entry logic
├── kiosk-interface.html                 # Customer service interface
├── kiosk-interface.js                   # Token generation & UI
├── kiosk-management.html                # Admin management panel
├── kiosk-management.js                  # Admin CRUD & reporting
├── KIOSK_SYSTEM_DOCUMENTATION.md        # Full documentation (this file + more)
├── firebase-rules.json                  # Updated with KIOSK rules
├── queue-manager.html                   # Updated with KIOSK analytics
├── queue-manager.js                     # Updated with KIOSK reporting
├── admin.html                           # Updated with KIOSK buttons
└── admin.js                             # Updated with KIOSK navigation
```

## Entry Points

### For Customers
1. **URL:** `kiosk-login.html`
2. **Select KIOSK Terminal** → Enter PIN → Get Token
3. **Tokens tracked in:** `queue-manager` analytics

### For Admin
1. **URL:** `admin.html` → Click "Manage KIOSKs"
2. **Manage:** Create, edit, delete KIOSKs
3. **Monitor:** Activity logs, reports, PIN management
4. **Analyze:** Token generation stats per KIOSK

### For Management Staff
1. **URL:** `queue-manager.html` → Reports tab
2. **View:** KIOSK analytics section
3. **Track:** Total tokens by KIOSK
4. **Success Rate:** Per KIOSK metrics

## Core APIs

### Create KIOSK
```javascript
const kioskId = await kioskDB.createKiosk(organizationId, 'KIOSK Name');
await kioskAuthDB.createKioskUser(organizationId, kioskId, '1234');
```

### Generate Token (with tracking)
```javascript
const result = await kioskTokenDB.generateToken(
  organizationId,
  kioskId,
  kioskName,
  serviceId
);
// Returns: { tokenId, tokenNumber }
```

### Get KIOSK Report
```javascript
const report = await kioskReportingDB.getKioskReport(organizationId, {
  startDate: timestamp,
  endDate: timestamp,
  kioskId: 'optional_kiosk_id'
});
```

### Log Activity
```javascript
await kioskTokenDB.logKioskActivity(
  organizationId,
  kioskId,
  'token_generated',
  { tokenNumber: 'A0001', serviceId: 'svc_123' }
);
```

## Database Paths

```
/users/{uid}/kiosks/
/users/{uid}/kioskActivity/
/users/{uid}/queue/{serviceId}/{tokenId}  (includes kioskId)
/kioskUsers/{kioskId}/
```

## Key Features

✅ **KIOSK Account Management**
- Create, update, delete KIOSKs
- PIN-based authentication (4-6 digits)
- Unique name validation

✅ **Service Selection**
- Real-time service display
- Touch-friendly interface
- Queue position tracking

✅ **Token Generation**
- Atomic transaction-based
- Automatic activity logging
- KIOSK tracking embedded

✅ **Activity Tracking**
- Every token links to KIOSK
- Timestamp and metadata
- Success/failure logging

✅ **Reporting**
- Tokens per KIOSK (period)
- Success rates
- Service breakdown
- Date filtering

✅ **Security**
- Organization-level isolation
- Role-based access control
- Session timeout (5 min)
- PIN verification

## Configuration

### Session Timeout
**File:** `kiosk-interface.js`
```javascript
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // milliseconds
```

### PIN Length
**File:** `kiosk-db.js` (kioskAuthDB.createKioskUser)
```javascript
if (!pinCode || !/^\d{4,6}$/.test(pinCode)) // Change regex
```

### KIOSK Inactive Timeout
**File:** `kiosk-interface.js`
```javascript
const INACTIVITY_CHECK_MS = 30 * 1000; // Check every 30s
```

## Workflows

### Admin: Create KIOSK
```
1. Go to admin.html
2. Click "Manage KIOSKs" button
3. Click "+ New KIOSK"
4. Enter Name and PIN
5. KIOSK created with unique ID
6. Now available for customer use
```

### Customer: Get Token
```
1. Go to kiosk-login.html
2. Select KIOSK from dropdown
3. Enter PIN on numeric pad
4. Select service from cards
5. Token generated (e.g., "A0045")
6. Shows queue position and service
```

### Admin: Monitor Activity
```
1. Go to kiosk-management.html
2. Click "Activity Logs" tab
3. Select date range
4. View all token generation events
5. Track KIOSK usage patterns
```

### Admin: Generate Report
```
1. Go to kiosk-management.html
2. Click "Reports" tab
3. Select KIOSK (or All)
4. Select date
5. View success rates, token counts, breakdown by service
```

## Testing Checklist

- [ ] Create test KIOSK from admin panel
- [ ] Test PIN entry (valid and invalid)
- [ ] Generate token from KIOSK interface
- [ ] Verify token appears in queue manager
- [ ] Check KIOSK ID in token data
- [ ] Test activity logging
- [ ] Verify reports show correct data
- [ ] Test session timeout
- [ ] Test offline handling
- [ ] Test with multiple services
- [ ] Verify analytics in queue-manager

## Firebase Rules Deployment

1. Open Firebase Console
2. Go to Realtime Database → Rules
3. Replace with content from `firebase-rules.json`
4. **Important:** Publish rules
5. Test KIOSK operations

## Troubleshooting

| Issue | Solution |
|-------|----------|
| KIOSKs not loading | Check status='active' and Firebase rules |
| PIN won't authenticate | Verify PIN format (4-6 digits) in kioskUsers |
| Tokens not in queue | Check kiosk-db.js is loaded, verify rules |
| Session timeout wrong | Adjust SESSION_TIMEOUT_MS in kiosk-interface.js |
| Analytics not showing | Ensure kiosk-db.js loaded before queue-manager.js |

## Performance Tips

1. **Real-time listeners** - Automatically sync without polling
2. **Denormalized data** - kioskName in tokens enables fast queries
3. **Activity indexing** - Optimized for timestamp queries
4. **Lazy loading** - Load reports only when needed

## Security Reminders

- ✅ PIN hashed (production: use bcrypt)
- ✅ Organization isolation enforced
- ✅ Session timeout active
- ✅ Activity audit trail enabled
- ⚠️ TODO: Implement rate limiting on PIN attempts
- ⚠️ TODO: Add encryption for PIN storage

## Next Steps

1. **Deploy Firebase Rules** - Update from firebase-rules.json
2. **Test Complete Flow** - Admin create KIOSK → Customer generate token
3. **Monitor Metrics** - Track tokens per KIOSK
4. **User Training** - Teach admin/staff how to use system
5. **Feedback Collection** - Gather user feedback for improvements

## Links & Resources

- **Admin Panel:** `admin.html` (then click "Manage KIOSKs")
- **KIOSK Login:** `kiosk-login.html`
- **Queue Manager:** `queue-manager.html` (view KIOSK analytics)
- **Docs:** `KIOSK_SYSTEM_DOCUMENTATION.md`

## Support

For issues or questions, refer to:
1. This quick reference
2. KIOSK_SYSTEM_DOCUMENTATION.md
3. Browser console for errors
4. Firebase console for database/rules issues
