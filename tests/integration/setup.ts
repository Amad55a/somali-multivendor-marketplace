import { vi } from "vitest";

vi.mock("server-only", () => ({}));

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL must point to a dedicated test database.");
}

const databaseName = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
if (!/(?:^|_)test$/i.test(databaseName)) {
  throw new Error("Integration tests require a database name ending in _test or test.");
}

process.env.DATABASE_URL = databaseUrl;
process.env.AUTH_SECRET = "integration-only-secret-with-at-least-32-bytes";
process.env.AUTH_ISSUER = "https://marketplace.integration.test";
process.env.AUTH_AUDIENCE = "marketplace-integration-tests";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.ADMIN_MFA_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
