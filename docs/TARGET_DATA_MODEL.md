# Target Data Model

The redesign should reduce duplicated data paths and make ownership obvious.

```text
organizations/{orgId}
  profile
    name
    contactNumber
    address
    ownerUid
    status
  settings
    openHours
    tokenPrefix
    kioskCustomerDetails
    bookingRules
  services/{serviceId}
  counters/{counterId}
  assignments/{counterId}
  kiosks/{kioskId}
  queue/{serviceId}/{tokenId}
  bookings/{bookingId}
  activity/{activityId}
  reports/{dateKey}

users/{uid}
  role
  organizationId
  profile

staff/{staffUid}
  organizationId
  counterIds
  serviceIds
  status

kioskUsers/{kioskUserId}
  organizationId
  kioskId
  status
  credentialVersion

customers/{customerId}
  profile
  organizationLinks/{orgId}

customerTokens/{customerId}/{orgId}/{tokenId}

publicOrganizations/{orgId}
  meta
  services
```

## Rules of thumb

- Private operational data belongs under `organizations/{orgId}`.
- Public discovery data belongs under `publicOrganizations/{orgId}` only.
- User account metadata belongs under `users/{uid}`.
- Staff and kiosk accounts are identities with narrow permissions, not full organization owners.
- Token allocation and PIN verification should be backend-mediated.
