# Contributing to Somsuuq

Thank you for your interest in contributing to Somsuuq, the premier Somali multi-vendor e-commerce marketplace. Please review this guide before submitting code.

---

## 1. Development Principles & Code Standards

1. **Maintain Safety & Security Boundaries:**
   - Never disable or bypass role checks, same-origin verification, or reCAPTCHA validation.
   - Never commit sensitive secrets, test API keys, or production database strings.
2. **Strict TypeScript & Schema Discipline:**
   - Do not use `any` types; maintain strict typing throughout `src/`.
   - Validate all external input (request body, search params, path parameters) using strict Zod schemas.
3. **Bilingual Parity:**
   - Any new user-facing copy must include translations for both English (`en`) and Somali (`so`) in `src/i18n/dictionaries/`.
4. **Data Integrity:**
   - Database changes must be accompanied by versioned Prisma migrations generated via `npx prisma migrate dev --name <migration_name>`.
   - Do not alter existing migration files or reset migration history.

---

## 2. Local Development Workflow

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/somali-multivendor-marketplace.git
   cd somali-multivendor-marketplace
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your local PostgreSQL credentials and test keys
   ```
4. **Run migrations & seed baseline data:**
   ```bash
   npm run prisma:generate
   npx prisma migrate deploy
   npm run categories:seed
   npm run commissions:seed
   ADMIN_EMAIL="admin@somsuuq.com" ADMIN_PASSWORD="SecureAdminPassword123!" npm run admin:provision
   ```
5. **Start development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## 3. Pre-Commit Validation Checklist

Before opening a pull request, run the standard validation checks locally:

```bash
# 1. Validate Prisma schema
npx prisma validate

# 2. Run TypeScript typecheck
npm run typecheck

# 3. Run ESLint
npm run lint

# 4. Run automated unit tests
npm run test

# 5. Check git diff for whitespace or syntax issues
git diff --check
```

All 5 checks must pass cleanly.
