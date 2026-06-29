# Waitless Redesign Status

Waitless has been cleaned into a role-based queue-management system. Old compatibility pages, duplicated customer pages, counter-page duplicates, editor backups, old kiosk docs, and unrelated IoT sketches have been removed.

## Final user roles

- Business owner: configures and operates an organization.
- Customer: joins queues, books appointments, and tracks tokens.
- Staff / counter operator: serves customers from an assigned counter screen.
- Kiosk device: issues self-service customer tokens.
- Superadmin: approves and manages organizations.

## Final route structure

```text
index.html
auth/
  login.html
  pending-approval.html
business/
  dashboard.html
  queue.html
  services.html
  counters.html
  kiosks.html
  bookings.html
  reports.html
  settings.html
customer/
  index.html
  book.html
  track.html
staff/
  login.html
  counter.html
kiosk/
  login.html
  interface.html
display/
  counter-display.html
admin/
  login.html
  dashboard.html
  approvals.html
  organizations.html
```

## Current implementation status

- Landing page is role-based and no longer exposes admin publicly.
- Business module pages use the working queue-management logic with route-specific modules.
- Customer pages use `js/customer/` and `shared/css/customer.css`.
- Staff and display pages use `js/staff/counter-display.js`.
- Kiosk pages use the cleaned `kiosk/` routes.
- Admin pages use the cleaned `admin/` routes with route-specific focus.
- All pages share the same UI language through:
  - `shared/css/unified-ui.css`
  - `shared/js/index-ui.js`

## Remaining production-hardening work

These require Firebase/backend implementation rather than static-file cleanup:

- Move organization approval/rejection to Cloud Functions or a trusted backend.
- Move kiosk PIN creation/reset/verification to backend code.
- Move token number allocation to backend code.
- Move booking reminder sending to backend code.
- Rewrite Firebase rules around the final role model.
- Add Firebase emulator tests for allowed/denied access cases.
- Remove hard-coded bootstrap admin UID/email once custom claims are fully enforced.
