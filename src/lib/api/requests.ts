import { z } from "zod";
import { getAuthConfig } from "@/config/env";
import {
  AppError,
  type AppErrorDetail,
} from "@/lib/errors/app-error";

const MAX_JSON_BODY_BYTES = 32 * 1024;

export async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", 415, "Content-Type must be application/json.");
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > MAX_JSON_BODY_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", 413, "Request body is too large.");
  }
  const text = await readBoundedBody(request);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AppError("INVALID_JSON", 400, "Request body must contain valid JSON.");
    }
    throw error;
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    throw createValidationError(result.error);
  }

  return result.data;
}

export function createValidationError(error: z.ZodError): AppError {
  const details: AppErrorDetail[] = [];
  for (const issue of error.issues) {
    const prefix = issue.path.map(String).join(".");
    if (issue.code === "unrecognized_keys") {
      details.push(...issue.keys.map((key) => ({
        path: prefix ? `${prefix}.${key}` : key,
        code: issue.code,
      })));
    } else {
      details.push({
        path: prefix || "$",
        code: issue.code,
      });
    }
  }
  return new AppError(
    "VALIDATION_ERROR",
    400,
    "Request validation failed. See error.details for invalid fields.",
    details,
  );
}

async function readBoundedBody(request: Request): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      throw new AppError("PAYLOAD_TOO_LARGE", 413, "Request body is too large.");
    }
    chunks.push(value);
  }

  const buffer = Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    totalBytes,
  );
  return new TextDecoder().decode(buffer);
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const appUrl = getAuthConfig().appUrl;

  if (!origin || origin === "null") {
    throw new AppError("CSRF_VALIDATION_FAILED", 403, "Request origin could not be verified.");
  }

  let requestOrigin: string;
  try {
    requestOrigin = new URL(origin).origin;
  } catch {
    throw new AppError("CSRF_VALIDATION_FAILED", 403, "Request origin could not be verified.");
  }

  if (requestOrigin !== new URL(appUrl).origin) {
    throw new AppError("CSRF_VALIDATION_FAILED", 403, "Request origin could not be verified.");
  }
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim();
  return ip && ip.length <= 45 ? ip : "unknown";
}
