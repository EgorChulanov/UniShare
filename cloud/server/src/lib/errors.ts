export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code?: string) => new HttpError(400, message, code);
export const unauthorized = (message = "Authentication required") => new HttpError(401, message, "unauthorized");
export const forbidden = (message = "Forbidden") => new HttpError(403, message, "forbidden");
export const notFound = (message = "Not found") => new HttpError(404, message, "not_found");
export const conflict = (message: string, code?: string) => new HttpError(409, message, code);
export const tooMany = (message: string) => new HttpError(429, message, "rate_limited");
