import { AppError } from "@/lib/errors/app-error";

type CodedError = Error & { code?: unknown; errorCode?: unknown };

export function apiSuccessResponse<T>(data: T, status = 200): Response {
  return Response.json(
    { data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function apiErrorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    const errorBody = {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
    return Response.json(
      { error: errorBody },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const mappedError = mapKnownInfrastructureError(error);
  if (mappedError) {
    return Response.json(
      {
        error: {
          code: mappedError.code,
          message: mappedError.message,
        },
      },
      { status: mappedError.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  console.error("[api] Unhandled error", {
    errorName: error instanceof Error ? error.name : "Unknown",
    ...(isCodedError(error) && safeErrorCode(error)
      ? { code: safeErrorCode(error) }
      : {}),
    ...(error instanceof Error && process.env.NODE_ENV === "development"
      ? { stack: error.stack }
      : {}),
  });

  return Response.json(
    {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred.",
      },
    },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

function mapKnownInfrastructureError(error: unknown): AppError | null {
  if (!isCodedError(error)) return null;

  const code = safeErrorCode(error);
  if (
    (error.name === "PrismaClientInitializationError" ||
      error.name === "PrismaClientRustPanicError") ||
    (code &&
      ["P1000", "P1001", "P1002", "P1003", "P1017", "P2024"].includes(code))
  ) {
    return new AppError(
      "DATABASE_UNAVAILABLE",
      503,
      "The database is temporarily unavailable.",
    );
  }

  if (code === "P2002") {
    return new AppError("CONFLICT", 409, "The request conflicts with existing data.");
  }
  if (code === "P2025") {
    return new AppError("NOT_FOUND", 404, "The requested resource was not found.");
  }
  if (code === "P2003") {
    return new AppError("CONFLICT", 409, "The request conflicts with related data.");
  }
  if (code === "P2034") {
    return new AppError(
      "CONCURRENT_MODIFICATION",
      409,
      "The resource changed during this request. Please try again.",
    );
  }

  return null;
}

function isCodedError(error: unknown): error is CodedError {
  return error instanceof Error;
}

function safeErrorCode(error: CodedError): string | undefined {
  const code = error.code ?? error.errorCode;
  return typeof code === "string" && /^[A-Z]\d{4}$/.test(code)
    ? code
    : undefined;
}

export async function handleApiRequest(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return apiErrorResponse(error);
  }
}
