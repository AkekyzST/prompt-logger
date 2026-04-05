/**
 * Typed API error carrying HTTP status + optional server request id for
 * the error-boundary page to surface. Thrown by `apiJson` on non-2xx.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly requestId?: string;

  constructor(message: string, status: number, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.requestId = requestId;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
