# Somsuuq Somali Marketplace

Next.js App Router marketplace with PostgreSQL, Prisma, customer/vendor authentication, vendor onboarding, private admin review, and a versioned REST API.

## Local setup

1. Install Node.js and PostgreSQL, then install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and configure the required values below. Keep `.env` local; never commit secrets.
3. Generate the Prisma client and apply the existing migrations:

   ```bash
   npm run prisma:generate
   npx prisma migrate deploy
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

The local app URL is `http://localhost:3000`. Set `NEXT_PUBLIC_APP_URL` to the exact public base URL used by the browser.

## Google reCAPTCHA v3

The application uses free Google reCAPTCHA v3 (not Enterprise). Create a v3 site at [Google reCAPTCHA Admin](https://www.google.com/recaptcha/admin/create), add `localhost` for local work and your production hostname for deployment, then copy the site key and secret key into `.env`:

```dotenv
NEXT_PUBLIC_RECAPTCHA_SITE_KEY="your-site-key"
RECAPTCHA_SECRET_KEY="your-secret-key"
RECAPTCHA_MIN_SCORE=0.5
```

The site key is public and is used by the browser. The secret key is server-only and must never be exposed in client code or committed. Use separate site keys for local and production if desired. For production, register the domain name without a scheme, port, or path (for example, `shop.example.com`), configure the production `NEXT_PUBLIC_APP_URL` with HTTPS, and use that domain's key pair.

The browser requests tokens for the expected action; the server verifies each token with Google and checks its action, hostname, success status, and score. `RECAPTCHA_MIN_SCORE` is optional and defaults to `0.5` (valid range `0` to `1`). Missing server keys or a failed Google verification block protected requests; there is no production bypass.

## Environment variables

Required for the application and protected authentication:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection URL. |
| `AUTH_SECRET` | At least 32 bytes of strong random secret material for JWT/session security. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Public reCAPTCHA v3 site key. |
| `RECAPTCHA_SECRET_KEY` | Private reCAPTCHA v3 verification key. |

Generate `AUTH_SECRET` locally rather than reusing a checked-in value:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Copy the output into your local `.env` as `AUTH_SECRET`. Do not send it to anyone or commit it.

Required when using email OTP, email verification, password reset, and admin login:

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` | SMTP server hostname. |
| `SMTP_USER` | SMTP username. |
| `SMTP_PASSWORD` | SMTP password or provider app password. |
| `SMTP_FROM` | Sender email address, optionally with a display name (for example, `Somsuuq <you@example.com>`). |

Optional or conditional:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Public base URL; defaults to `http://localhost:3000`. Used to derive JWT issuer and validate the reCAPTCHA hostname. Set to the deployed HTTPS origin in production. |
| `AUTH_ISSUER` | JWT issuer override; defaults to the origin of `NEXT_PUBLIC_APP_URL`. |
| `AUTH_AUDIENCE` | JWT audience; defaults to `somali-marketplace-api`. |
| `RECAPTCHA_MIN_SCORE` | reCAPTCHA score threshold; defaults to `0.5`. |
| `SMTP_PORT` | SMTP server port; defaults to `587`. |
| `AMAZON_CLIENT_ID` | Amazon Login with Amazon OAuth client ID; all three Amazon variables are needed to enable Amazon login. |
| `AMAZON_CLIENT_SECRET` | Amazon OAuth client secret; keep server-side only. |
| `AMAZON_REDIRECT_URI` | Required HTTPS callback URL, exactly `/api/v1/auth/amazon/callback` on the same origin as `NEXT_PUBLIC_APP_URL`. |
| `ADMIN_MFA_ENCRYPTION_KEY` | 32-byte key encoded as 64 hexadecimal characters or 44 canonical Base64 characters; required for admin MFA setup. |
| `ADMIN_EMAIL` | Email for the private `npm run admin:provision` command only. |
| `ADMIN_PASSWORD` | Initial password for private admin provisioning only. |

The app's authentication-protected flows require reCAPTCHA configuration in every environment. Amazon OAuth variables are optional unless Amazon login is used. When enabled, Amazon OAuth requires a public HTTPS origin; the callback origin must exactly match `NEXT_PUBLIC_APP_URL` because OAuth state and PKCE are bound to secure browser cookies. Amazon OAuth is not available on plain localhost.

SMTP is needed to receive and complete email-based flows. Gmail SMTP requires a Google App Password when 2-Step Verification is enabled; put it only in `SMTP_PASSWORD`. If SMTP is incomplete, email-dependent operations return `503 EMAIL_DELIVERY_UNAVAILABLE` before creating an account or issuing an OTP. If sending fails, the undelivered OTP is invalidated and the API returns an error.

`ADMIN_MFA_ENCRYPTION_KEY` must decode to exactly 32 bytes. The application accepts either 64 hexadecimal characters or 44 canonical Base64 characters. Keep the same key material that encrypted any existing administrator TOTP secrets; changing it without re-encrypting those secrets will prevent their decryption.

### Amazon Login with Amazon callback setup

1. Choose the active public HTTPS origin you will use in the browser. For local development through a tunnel, use the current tunnel origin (do not reuse a URL after the tunnel changes).
2. Set `NEXT_PUBLIC_APP_URL` to that origin, such as `https://<current-public-host>`.
3. Set `AMAZON_REDIRECT_URI` to that same origin plus `/api/v1/auth/amazon/callback`.
4. In Amazon Developer Console, open the relevant Login with Amazon security profile, then **Web Settings → Allowed Return URLs**. Add the exact value of `AMAZON_REDIRECT_URI`, including `https://`, hostname, and path. Do not add a trailing slash or query string.
5. Restart the Next.js server after changing environment variables. Open the marketplace using the same origin as `NEXT_PUBLIC_APP_URL`, not localhost, and try Amazon sign-in.

The server checks HTTPS, the exact callback path, absence of query/fragment, and origin equality. It never substitutes localhost or an old tunnel URL. When the check fails, update both `NEXT_PUBLIC_APP_URL` and `AMAZON_REDIRECT_URI` in `.env`, and update **Allowed Return URLs** in the Amazon Developer Console. The app cannot verify the Developer Console registration itself; Amazon validates that during the authorization-code exchange.

## Swagger and manual API testing

- Interactive Swagger UI: [http://localhost:3000/api-docs](http://localhost:3000/api-docs)
- OpenAPI JSON: [http://localhost:3000/api/openapi.json](http://localhost:3000/api/openapi.json)

Swagger supports **Try it out** and is served from the same origin so the browser can retain and send the HttpOnly session cookie after login. It generates a fresh reCAPTCHA token for the protected requests. Configure the site key before testing those flows. Do not copy or expose the cookie value. API contracts are generated from the implemented route schemas; see [docs/api/v1.md](./docs/api/v1.md) for the route overview.

### Suggested manual checks

1. **Register:** In Swagger, execute `POST /api/v1/auth/customer/register` or `POST /api/v1/auth/vendor/register` with an email and a password of at least 12 characters. Swagger adds the correct reCAPTCHA token. Complete email verification using the code delivered through SMTP.
2. **Login:** Execute `POST /api/v1/auth/login` with the matching `accountType`. Swagger adds the correct reCAPTCHA token. The response sets an HttpOnly cookie; then try `GET /api/v1/auth/me`.
3. **Vendor onboarding:** With the vendor cookie, use `GET`, `POST`, or `PATCH /api/v1/vendor/onboarding` to view or save the draft. Execute `POST /api/v1/vendor/onboarding/submit`; Swagger adds a fresh token. Submission remains pending until admin review.
4. **Logout:** Execute `POST /api/v1/auth/logout`; then verify that `GET /api/v1/auth/me` is unauthorized.
5. **Admin:** Provision an admin privately with `npm run admin:provision`, then use the private UI at `/en/admin/login` or the `/api/v1/admin/auth/*` Swagger operations. Admin login uses reCAPTCHA, email OTP, and TOTP/recovery-code flow.

The API rejects missing, expired, wrong-action, wrong-hostname, or below-threshold reCAPTCHA tokens. A token is short-lived and should be generated immediately before each protected request; do not reuse it.

The admin email OTP is sent to the email address on the provisioned ADMIN account. `SMTP_USER` is the sender account, not the OTP recipient. To resend the admin code, use **Resend code** on the email-code step; this repeats credential verification, applies the admin-login rate limit, and supersedes the prior OTP. If no admin account has been provisioned, the login cannot send an OTP.

## Authentication pages

- Customer login and registration: `/en/login`, `/en/register`
- Vendor login and registration: choose Vendor on `/en/login`, or use `/en/vendor/register`
- Email verification and password reset: `/en/verify-email`, `/en/forgot-password`, `/en/reset-password`
- Private admin login: `/en/admin/login` (no public admin registration)

Replace `/en` with `/so` for Somali.
