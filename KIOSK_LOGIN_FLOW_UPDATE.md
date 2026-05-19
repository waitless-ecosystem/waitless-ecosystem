# KIOSK Login Flow Update - Three-Step Authentication

## Summary of Changes

The KIOSK login flow has been updated to **enforce user account authentication first**, then KIOSK device selection, then PIN entry. This provides better security and ensures KIOSKs are only accessible to authorized users within their organization.

## Updated Flow

### Step 1: User Account Authentication (NEW)
- User enters email and password
- Firebase authentication verifies credentials
- User must be approved role to proceed

### Step 2: KIOSK Device Selection (MODIFIED)
- After authentication, user sees only KIOSKs from their organization
- No longer shows KIOSKs from all organizations
- Dropdown populated with organization-specific devices

### Step 3: KIOSK PIN Entry (UNCHANGED)
- User selects device and enters PIN
- PIN verified against kioskUsers collection
- Session established upon successful authentication

## Files Updated

### 1. kiosk-login.html
**Changes:**
- Added step indicator showing 1, 2, 3 progress
- Added Step 1 view for user email/password login
- Added Step 2 view for KIOSK selection (from organization only)
- Added Step 3 view for PIN entry
- Added CSS for step indicators with active/completed states
- Renamed internal view elements for clarity

**New CSS Classes:**
```css
.view { display: flex; flex-direction: column; gap: 20px; }
.view.hidden { display: none; }
.step-indicator { ... shows progress through steps ... }
.step { ... individual step button ... }
.step.active { ... currently active step ... }
.step.completed { ... completed steps ... }
```

**New HTML Elements:**
- `#user-auth-view` - Step 1 email/password form
- `#step1`, `#step2`, `#step3` - Step indicators
- "Back" button to return from KIOSK selection to login

### 2. kiosk-login.js
**Complete Rewrite:**

**New Functionality:**
- User authentication using Firebase Auth
- Organization-level KIOSK filtering
- Three-step flow with step indicators
- Logout capability between steps
- Session auto-detection (redirects if already logged in)

**New Functions:**
```javascript
updateStepIndicator(activeStep)  // Update visual progress
goToKioskSelection()             // Transition to step 2
loadKiosksForSelection()          // Load org-specific KIOSKs
goToPinEntry()                   // Transition to step 3
goBackToKioskSelection()         // Return to step 2
```

**Modified Functions:**
- `submitPin()` - Now stores `authenticatedUserUID` in session
- Initialization - Checks auth state and redirects accordingly

**New Event Listeners:**
- User auth form submission (email/password)
- Back button from KIOSK selection (logout)

**Removed:**
- Device detection code (moved to alternative location if needed)
- Ability to load all organization KIOSKs
- Direct KIOSK selection without authentication

## Security Improvements

### 1. **Organization Isolation**
- Users can only see KIOSKs from their organization
- Cannot access KIOSKs from other organizations

### 2. **User Verification**
- Users must be approved role to access KIOSKs
- Prevents unapproved users from using terminals

### 3. **Authentication Chain**
- User account authentication required before KIOSK access
- PIN verification still required for KIOSK operation
- Two levels of security

### 4. **Session Tracking**
- `authenticatedUserUID` stored in session
- Traces KIOSK sessions back to authenticated user
- Enables audit logging

## Firebase Rules Implications

**Current Rules (No Changes Needed):**
```json
"kiosks": {
  ".read": "auth != null && auth.uid === $uid",
  ".write": "auth != null && auth.uid === $uid"
}
```

These rules already enforce:
- ✅ User must be authenticated (`auth != null`)
- ✅ User can only access their own organization's KIOSKs (`auth.uid === $uid`)

## User Workflows

### Customer: Get Token via KIOSK

```
1. Navigate to kiosk-login.html
   ↓
2. STEP 1 - User Login
   Enter Email: admin@company.com
   Enter Password: ••••••••
   Click Login
   ↓
3. Firebase authenticates user
   ↓
4. STEP 2 - Select Device
   Dropdown shows only company's KIOSKs:
   - Front Desk KIOSK
   - Lobby KIOSK
   Select KIOSK
   ↓
5. STEP 3 - Enter PIN
   Enter PIN: 1234
   Click Submit Arrow
   ↓
6. KIOSK authenticated
   Redirect to kiosk-interface.html
   ↓
7. Customer selects service and gets token
```

### Admin: Monitor KIOSK Usage

```
1. Login to Firebase with admin account
   ↓
2. System only shows KIOSKs in admin's organization
   ↓
3. Cannot see other companies' KIOSKs
   ↓
4. Track KIOSK sessions by authenticatedUserUID
```

## Configuration

### Change Email/Password Requirements

**File:** `kiosk-login.html`
```html
<input type="email" id="user-email" placeholder="your@email.com" required />
<input type="password" id="user-password" placeholder="Enter password" required />
```

### Add Custom Auth Method

**File:** `kiosk-login.js`
Modify `userAuthForm.addEventListener('submit', ...)` to use custom authentication instead of Firebase Auth:

```javascript
// Replace:
const result = await auth.signInWithEmailAndPassword(email, password);

// With:
const result = await customAuth.verifyCredentials(email, password);
```

## Error Handling

### Unapproved User
```
Message: "Your account is not approved for KIOSK access"
Action: Redirects to login page after 2 seconds
```

### No KIOSKs in Organization
```
Message: "No KIOSKs available in your organization"
Action: Disables KIOSK selection dropdown
```

### Authentication Failed
```
Message: "Authentication failed: [Firebase error message]"
Action: User remains on login page, can retry
```

### Invalid PIN
```
Message: "Invalid PIN"
Action: Clears PIN, user can retry
```

## Testing Checklist

- [ ] User can login with valid email/password
- [ ] User cannot login with invalid credentials
- [ ] After login, only org's KIOSKs appear in dropdown
- [ ] Cannot see other organization's KIOSKs
- [ ] Back button logs out and returns to login
- [ ] PIN still required after KIOSK selection
- [ ] Invalid PIN shows error
- [ ] Valid PIN redirects to interface
- [ ] Session stores authenticatedUserUID
- [ ] Auto-redirect if already in KIOSK session
- [ ] Step indicators update correctly
- [ ] Offline/online messages display

## Database Changes

### No Database Structure Changes

The current structure remains the same:
```
/users/{uid}/kiosks/         - Organization's KIOSKs
/kioskUsers/{kioskId}/       - KIOSK PIN credentials
```

### New Session Data

**SessionStorage additions:**
```javascript
sessionStorage.setItem('authenticatedUserUID', currentUserUID);
```

This enables:
- Tracking which user account accessed the KIOSK
- Audit logging of user-to-KIOSK access
- Session validation against organization

## Future Enhancements

### 1. **Custom User Flows**
- Replace Firebase Auth with custom credential system
- Implement SSO (Single Sign-On) integration
- Add biometric authentication

### 2. **Advanced Security**
- Rate limiting on failed login attempts
- Account lockout after X failed attempts
- Two-factor authentication (2FA)

### 3. **User Experience**
- Remember last-used KIOSK
- Session persistence across browser refreshes
- Mobile app authentication

### 4. **Audit & Compliance**
- Log all authentication attempts
- Track user-to-KIOSK mappings
- Generate compliance reports

## Deployment Steps

1. **Test in Development**
   - Create test user account (approved role)
   - Create test KIOSK
   - Test full three-step flow
   - Verify KIOSK isolation

2. **Update Firebase**
   - No new rules needed (existing rules support flow)
   - Verify organization structure

3. **Deploy to Production**
   - Update kiosk-login.html
   - Update kiosk-login.js
   - Test with real user accounts
   - Monitor for errors

4. **Notify Users**
   - Update documentation with new login flow
   - Train staff on three-step process
   - Provide support contact information

## Support & Troubleshooting

### "Authentication failed: User not found"
- Verify email is correct
- Check user exists in Firebase
- Verify password is correct

### "Your account is not approved for KIOSK access"
- User role must be 'approved' (not 'pending' or 'rejected')
- Contact admin to approve user account

### "No KIOSKs available in your organization"
- Admin must create KIOSKs for organization
- KIOSKs must have status='active'
- Check organization ID matches

### KIOSKs from other orgs still visible
- Clear browser cache (localStorage/sessionStorage)
- Verify Firebase rules are deployed
- Check auth.uid matches organization UID

## Rollback Plan

If issues occur:
1. Restore previous kiosk-login.html
2. Restore previous kiosk-login.js
3. Clear browser cache
4. Reload page

Previous flow (direct KIOSK selection) will still work as fallback.

---

**Version:** 2.0.0 (Three-Step Authentication)  
**Date:** May 5, 2026  
**Status:** ✅ Complete & Ready for Testing
