# Backend and Security Plan

The current static Firebase client can remain for UI, but sensitive operations should move to Cloud Functions or another trusted backend.

## Move server-side first

1. `approveOrganization`
2. `rejectOrganization`
3. `suspendOrganization`
4. `createKioskCredential`
5. `resetKioskPin`
6. `verifyKioskPin`
7. `allocateTokenNumber`
8. `createQueueToken`
9. `sendBookingReminder`
10. `writeAuditLog`

## Firebase rules target

- Default deny at root.
- Business owner reads/writes only their `organizations/{orgId}`.
- Staff can read assigned queue data and write limited serving status changes.
- Kiosk can create tokens only for its assigned organization/kiosk.
- Customer can read only their own booking/token status or public organization metadata.
- Superadmin uses custom claims, not hard-coded UID/email.
- Public reads only `publicOrganizations`.

## Immediate cleanup before production

- Remove checked-in database export files.
- Remove hard-coded bootstrap admin UID/email from rules and frontend.
- Add App Check for browser clients.
- Add rate limiting for auth-sensitive operations.
- Store PIN hashes only server-side with salt and slow hashing.
- Keep audit logs for approval, PIN reset, token creation, and queue status changes.
