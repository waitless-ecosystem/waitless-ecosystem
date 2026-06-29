# Testing Checklist

## Automated checks

- JavaScript syntax check for all `.js` files.
- Link check for local HTML routes.
- Firebase rules emulator tests:
  - anonymous user denied private data
  - customer denied organization private data
  - business denied other organization data
  - staff denied unassigned counters
  - kiosk denied other kiosk/org token creation
  - superadmin allowed platform actions

## Manual user journeys

### Business owner

1. Register organization.
2. See pending approval.
3. Superadmin approves account.
4. Business logs in.
5. Create service.
6. Create counter.
7. Assign service to counter.
8. Add kiosk.
9. Start serving queue.

### Customer

1. Open customer portal.
2. Join queue.
3. Book appointment.
4. Track token.

### Staff

1. Sign in.
2. Open assigned counter.
3. Call next token.
4. Recall token.
5. Complete token.
6. Skip or transfer token.

### Kiosk

1. Open kiosk login.
2. Select organization/kiosk.
3. Enter PIN.
4. Generate token.
5. Timeout back to start screen.

### Superadmin

1. Sign in.
2. Review pending organizations.
3. Approve/reject.
4. View organization directory.
