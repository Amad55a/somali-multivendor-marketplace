# Authentication and API verification

This application uses a signed JWT stored in an HttpOnly cookie and a
corresponding row in `user_sessions`. The browser never receives a token in
JSON and must not store authentication credentials in web storage.

## Frontend routes

### Public and authentication

- `/{locale}`: public marketplace home.
- `/{locale}/login`: customer or vendor login.
- `/{locale}/register`: customer registration.
- `/{locale}/vendor/register`: vendor registration.
- `/{locale}/forgot-password` and `/{locale}/reset-password`: password recovery.
- `/{locale}/verify-email`: customer/vendor email verification.
- `/{locale}/admin/login`: administrator password, email OTP, and MFA flow.

Authenticated users are redirected away from login and registration pages:

- CUSTOMER -> `/{locale}/customer/dashboard`
- APPROVED VENDOR -> `/{locale}/vendor/dashboard`
- Other VENDOR application states -> `/{locale}/vendor/status`
- ADMIN -> `/{locale}/admin/overview`

The customer dashboard is `/{locale}/customer/dashboard`; the separate
`/{locale}/customer/account` route contains profile settings.

### Protected areas

- Customer: `/{locale}/customer/dashboard`, `/{locale}/customer/account`
- Vendor onboarding/status: `/{locale}/vendor/onboarding`,
  `/{locale}/vendor/status`
- Approved vendor dashboard: `/{locale}/vendor/dashboard`,
  `/{locale}/vendor/products`, `/{locale}/vendor/orders`,
  `/{locale}/vendor/store`
- Admin: `/{locale}/admin/overview`, `/users`, `/vendors`,
  `/vendors/applications`, `/products`, `/orders`, `/analytics`,
  `/notifications`, `/audit-logs`, `/settings`

Server-rendered layouts call the route guards on every request. Approved
vendor routes additionally query the vendor profile status. A pending,
rejected, or changes-requested vendor is redirected to the status page.

## Authentication API inventory

All paths below are under `/api/v1`.

### Public authentication

- `POST /auth/customer/register`: creates a CUSTOMER and sets a short-lived
  email-verification cookie.
- `POST /auth/vendor/register`: creates a VENDOR and sets a
  email-verification cookie.
- `POST /auth/login`: local CUSTOMER/VENDOR login; sets the session cookie.
- `GET /auth/amazon`: begins CUSTOMER/VENDOR Amazon OAuth.
- `GET /auth/amazon/callback`: validates the OAuth state and creates a session.
- `POST /auth/email/verify`: consumes the pending verification cookie and
  creates a session.
- `POST /auth/email/resend`: resends a verification code using the pending
  verification cookie.
- `POST /auth/password/forgot`: account-neutral, rate-limited reset request.
- `POST /auth/password/reset`: consumes a single-use reset code and revokes
  existing sessions.
- `POST /admin/auth/login`: begins administrator authentication.
- `POST /admin/auth/email/verify`: verifies the administrator email OTP.
- `POST /admin/auth/mfa/verify`: verifies MFA and creates the admin session.
- `POST /admin/auth/mfa/setup`: configures admin TOTP through the pending
  challenge.
- `POST /admin/auth/mfa/enable`: enables TOTP and returns recovery codes once.

### Authenticated customer/vendor

- `GET /auth/me`: safe current CUSTOMER/VENDOR identity and vendor status.
- `POST /auth/logout`: revokes the current session and clears its cookie.

### Authenticated vendor

- `GET /vendor/onboarding`: reads the current application.
- `POST /vendor/onboarding`: creates an application draft.
- `PATCH /vendor/onboarding`: updates the owned draft; status fields are not
  writable by the client.
- `POST /vendor/onboarding/files`: uploads an owned application file.
- `GET /vendor/application-files/{fileId}`: reads a file only for its owner.
- `POST /vendor/onboarding/submit`: validates and submits the owned
  application.
- `GET /vendor/onboarding/status`: reads the current application status.

Amazon-authenticated vendors may use onboarding endpoints without a Somsuuq
email OTP, as documented by the endpoint permissions.

### Admin only

- `GET /admin/auth/me`: safe current ADMIN identity and authentication state.
- `POST /admin/auth/logout`: revokes the current admin session and clears its
  cookie.
- `GET /admin/overview`: live user and vendor application counts.
- `GET /admin/users`: paginated users with role, verification, and vendor
  application status and active/suspended state; credentials are excluded.
- `POST /admin/users/{userId}/suspend`: deactivates the account, revokes its
  sessions, and records an audit event. Suspended users can be viewed with
  `active=INACTIVE`.
- `DELETE /admin/users/{userId}`: erases the user's sign-in credentials and
  identifying profile data, disables the account, and records an audit event.
  Vendor documents and listings are removed; order and financial history is
  retained. The current administrator cannot suspend or erase themself.
- `GET /admin/audit-logs`: paginated audit entries.
- `GET /admin/vendors/applications`: paginated submitted applications.
- `GET /admin/vendors/applications/{applicationId}`: application details.
- `POST /admin/vendors/applications/{applicationId}/approve`: approves and
  audits the decision.
- `POST /admin/vendors/applications/{applicationId}/reject`: rejects with a
  reason and audits the decision.
- `POST /admin/vendors/applications/{applicationId}/request-information`:
  requests changes and audits the decision.
- `POST /admin/vendors/{vendorId}/suspend`: suspends an approved vendor and
  audits the decision.
- `GET /vendor/application-files/{fileId}`: admins may read application files.

There are currently no product, order, payment, notification, or commission
API models in the Prisma schema; the corresponding admin pages therefore must
not be treated as data-backed APIs.

## Session and cookie verification

1. In browser developer tools, inspect the application cookies for the
   current origin. The cookie is `marketplace_session` in development and
   `__Host-marketplace_session` in production.
2. Confirm that the cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and
   `Secure` in production. The `__Host-` production cookie has no Domain
   attribute.
3. Call `GET /api/v1/auth/me` for CUSTOMER/VENDOR or
   `GET /api/v1/admin/auth/me` for ADMIN. These endpoints return only:
   user ID, display name, email, role, email-verification state, and vendor
   status where applicable.
4. Never print or copy the cookie value, JWT, password, reset code, MFA
   secret, recovery code, or any token into logs or issue reports.
5. Test an unauthenticated protected request in a private window: it should
   return `401`. An authenticated request with the wrong role should return
   `403`. Resource ownership failures use `404` where disclosure should be
   avoided.

## Server-side enforcement

`requireUser` verifies the JWT signature, issuer, audience, algorithm,
expiration, subject, account type, persisted session row, revocation state,
active user state, inactivity timeout, and session expiry equality. It also
updates session activity. `requireRole` adds role and email-verification
checks; vendor approval is enforced separately by
`requireApprovedVendorPage` and the corresponding service operations.

Unsafe cookie-authenticated API requests require a same-origin `Origin`
header. API schemas validate query, path, and body inputs before handlers run.
Admin review operations use the authenticated admin identity and create audit
records. Logout revokes the current persisted session before clearing the
cookie.

## Known limitations

- Product, order, payment, commission, notification, and profile-edit APIs are
  not present in the current schema and are not represented as fake endpoints.
- The customer dashboard currently uses `/customer/account` as its existing
  route name.
- Vendor application files use the repository's local development storage;
  durable shared production media storage is still required before deployment.
