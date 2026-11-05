export type AppErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 405
  | 409
  | 413
  | 415
  | 422
  | 429
  | 503;

export type AppErrorDetail = {
  path: string;
  code: string;
};

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: AppErrorStatus,
    message: string,
    public readonly details?: AppErrorDetail[],
  ) {
    super(message);
    this.name = "AppError";
  }
}
