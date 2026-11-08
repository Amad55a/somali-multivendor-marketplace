# Somsuuq Production Deployment Guide

This document covers infrastructure prerequisites, hosting architecture, environment variables, database migration procedures, and operational readiness for deploying Somsuuq into production.

---

## 1. Hosting Architecture & Runtime Considerations

Somsuuq can be deployed in two primary configurations:

```mermaid
flowchart LR
    subgraph ContainerHosting ["Option A: Persistent Node.js Server (Recommended)"]
        DockerOrVM["Docker / AWS ECS / Railway / VPS"]
        NodeServer["server.ts (Node.js runtime)"]
        PersistentWS["Full Socket.IO WebSockets Support"]
        LocalOrS3["Durable Storage Mount or Object Store"]
        DockerOrVM --> NodeServer
        NodeServer --> PersistentWS
        NodeServer --> LocalOrS3
    end

    subgraph ServerlessHosting ["Option B: Serverless (e.g., Vercel)"]
        VercelEdge["Vercel / AWS Lambda"]
        AppRouterSSR["Next.js App Router (SSR & API)"]
        VercelCron["Vercel Cron (/api/cron/marketplace)"]
        ExternalWS["External Socket Service or Long-Polling"]
        VercelEdge --> AppRouterSSR
        VercelEdge --> VercelCron
        VercelEdge -.-> ExternalWS
    end
```

### Critical Runtime Differences:
1. **Persistent Node Server (`server.ts`):**  
   - Starts via `npm start` (`node --conditions=react-server --import tsx server.ts`).
   - Hosts Next.js alongside the persistent Socket.IO server (`src/features/communications/socket-server.ts`).
   - Provides low-latency real-time chat, typing indicators, and presence updates.
2. **Serverless Hosting (e.g., Vercel):**  
   - All standard HTTP API routes, customer checkout, vendor dashboards, and admin operations work seamlessly.
   - **Persistent WebSockets cannot run in serverless functions.** Chat clients will fall back to HTTP polling or require a dedicated persistent socket worker.
   - Requires external cron triggers (such as Vercel Cron) targeting `/api/cron/marketplace` with a Bearer `CRON_SECRET`.

---

## 2. Infrastructure Prerequisites

1. **Node.js Environment:** Node.js `>= 20.x` (Tested and verified on Node `v24.22.1`).
2. **PostgreSQL Database:** PostgreSQL `15+` or `16+` (e.g., AWS RDS, Supabase, Neon, or managed PostgreSQL). Connection pooling enabled.
3. **File/Object Storage:**  
   - Local storage uses `.data/vendor-files/` by default.
   - For containerized or serverless hosting, configure a persistent volume or mount an S3-compatible object storage provider to prevent file loss across deployments.
4. **Google reCAPTCHA v3:** Active domain registration for your production hostname.
5. **SMTP Mail Service:** Verified transactional mailer (e.g., AWS SES, SendGrid, Postmark).
6. **Amazon Login with Amazon (Optional):** HTTPS callback registered as `https://<your-domain>/api/v1/auth/amazon/callback`.

---

## 3. Production Environment Variables Checklist

Ensure the following variables are configured in your production environment:

| Variable Name | Required? | Purpose & Format |
|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string: `postgresql://user:pass@host:5432/dbname?sslmode=require` |
| `NEXT_PUBLIC_APP_URL` | **Yes** | Canonical public origin: `https://somsuuq.com` (no trailing slash) |
| `AUTH_SECRET` | **Yes** | Minimum 32 characters/bytes for JWT session signing |
| `AUTH_ISSUER` | Optional | Custom JWT issuer claim (defaults to `NEXT_PUBLIC_APP_URL` origin) |
| `AUTH_AUDIENCE` | Optional | Custom JWT audience claim (defaults to `somali-marketplace-api`) |
| `ADMIN_MFA_ENCRYPTION_KEY` | **Yes** | Exactly 32 bytes encoded as 64 hex characters or 44 base64 characters |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | **Yes** | Public reCAPTCHA v3 key injected into the browser |
| `RECAPTCHA_SECRET_KEY` | **Yes** | Server secret key for validating reCAPTCHA tokens |
| `RECAPTCHA_MIN_SCORE` | Optional | Minimum bot threshold (default: `0.5`) |
| `CRON_SECRET` | **Yes (Prod)** | Secret bearer token required to invoke `/api/cron/marketplace` |
| `SMTP_HOST` | **Yes** | Transactional email server hostname |
| `SMTP_PORT` | Optional | Transactional email port (default: `587`) |
| `SMTP_USER` | **Yes** | SMTP username / access key |
| `SMTP_PASSWORD` | **Yes** | SMTP password / secret |
| `SMTP_FROM` | **Yes** | Sender email address: `"Somsuuq" <no-reply@somsuuq.com>` |
| `SIMULATED_PAYMENTS_ENABLED` | **Yes (Dev only)**| Set to `false` in production. Somsuuq will refuse simulated payments in production mode. |
| `SIMULATED_PAYMENT_ADAPTER` | Optional | Defaults to `mock`. |
| `AMAZON_CLIENT_ID` | Optional | Amazon Login with Amazon client ID |
| `AMAZON_CLIENT_SECRET` | Optional | Amazon Login with Amazon client secret |
| `AMAZON_REDIRECT_URI` | Optional | Must match `https://<your-domain>/api/v1/auth/amazon/callback` |
| `ABUUR_AI_PROVIDER` | Optional | LLM provider: `openai`, `gemini`, `anthropic`, `ollama`, etc. |
| `ABUUR_AI_MODEL` | Optional | Model identifier: `gpt-4o`, `gemini-1.5-pro`, etc. |
| `ABUUR_AI_API_KEY` | Optional | API key for the selected AI provider |

---

## 4. Production Deployment Step-by-Step

### Step 1: Install Dependencies & Generate Prisma Client
```bash
npm ci
npm run prisma:generate
```

### Step 2: Apply Database Migrations
```bash
npx prisma migrate deploy
```
*Note: Do not run `prisma db push` or `prisma migrate dev` on production.*

### Step 3: Seed Baseline Data (One-Time Setup)
```bash
# Seed product categories and Somali translations
npm run categories:seed

# Seed category commission hierarchy
npm run commissions:seed

# Provision initial super administrator
ADMIN_EMAIL="admin@somsuuq.com" ADMIN_PASSWORD="SecureAdminPassword123!" npm run admin:provision
```

### Step 4: Build Production Next.js Bundle
```bash
npm run build
```

### Step 5: Start Production Server
```bash
npm start
```
*Listens on `http://0.0.0.0:3000` (or configured `PORT`).*

---

## 5. Scheduled Automation (Cron Jobs)

Configure a cron trigger (e.g., via crontab, AWS EventBridge, or Vercel Cron) to call the marketplace cron endpoint every minute:

```bash
curl -X GET "https://somsuuq.com/api/cron/marketplace" \
     -H "Authorization: Bearer <CRON_SECRET>"
```

### Automated Actions Executed:
1. **`expireReservations()`:** Releases 10-minute stock locks that have expired without payment.
2. **`expireStaleVendorOrders()`:** Cancels vendor sub-orders unconfirmed after 24 hours.
3. **`createWeeklyPayoutBatch()`:** Automatically generates pending payout batches for the active calendar week.
