import { z } from "zod";

const errorEnvelopeSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
    details: z.array(z.object({ path: z.string(), code: z.string() })).optional(),
  }),
});

export async function requestApi<T>(
  path: string,
  schema: z.ZodType<T>,
  failureMessage: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(failureMessage);
  }

  if (!response.ok) {
    const parsedError = errorEnvelopeSchema.safeParse(payload);
    if (
      parsedError.success &&
      parsedError.data.error.code === "VALIDATION_ERROR" &&
      parsedError.data.error.details?.length
    ) {
      const fields = parsedError.data.error.details
        .map((detail) => detail.path)
        .filter((path) => path !== "$");
      if (fields.length > 0) {
        throw new Error(
          `${parsedError.data.error.message} Invalid fields: ${[...new Set(fields)].join(", ")}.`,
        );
      }
    }
    throw new Error(
      parsedError.success ? parsedError.data.error.message : failureMessage,
    );
  }

  const parsed = z.object({ data: schema }).safeParse(payload);
  if (!parsed.success) throw new Error(failureMessage);
  return parsed.data.data;
}

export function postJson(body: unknown): Pick<RequestInit, "method" | "body"> {
  return { method: "POST", body: JSON.stringify(body) };
}

export function postFormData(body: FormData): Pick<RequestInit, "method" | "body"> {
  return { method: "POST", body };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
