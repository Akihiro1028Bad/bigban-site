import { randomUUID } from "node:crypto";

export interface ExternalApiErrorShape {
  operation: string;
  status: number | null;
  requestId: string;
}

export class ExternalApiError extends Error implements ExternalApiErrorShape {
  readonly operation: string;
  readonly status: number;
  readonly requestId: string;

  constructor(operation: string, status: number, requestId: string) {
    super(`${operation} failed (HTTP ${status}, requestId=${requestId})`);
    this.name = "ExternalApiError";
    this.operation = operation;
    this.status = status;
    this.requestId = requestId;
  }
}

type IdFactory = () => string;

export function externalApiErrorFromResponse(
  operation: string,
  response: Pick<Response, "status"> & { headers?: Pick<Headers, "get"> },
  idFactory: IdFactory = randomUUID
): ExternalApiError {
  const requestId = requestIdFromResponse(response, idFactory);
  return new ExternalApiError(operation, response.status, requestId);
}

export function requestIdFromResponse(
  response: { headers?: Pick<Headers, "get"> },
  idFactory: IdFactory = randomUUID
): string {
  return (
    response.headers?.get("x-request-id") ??
    response.headers?.get("x-microcms-request-id") ??
    idFactory()
  );
}

export function safeExternalError(error: unknown): ExternalApiErrorShape {
  if (error instanceof ExternalApiError) {
    return { operation: error.operation, status: error.status, requestId: error.requestId };
  }
  return { operation: "external.unknown", status: null, requestId: "unknown" };
}

export interface DiagnosticOptions {
  secrets?: readonly string[];
}

export function diagnosticDetail(value: string, options: DiagnosticOptions = {}): string {
  let detail = value;
  for (const secret of options.secrets ?? []) {
    if (secret) detail = detail.split(secret).join("[redacted]");
  }
  detail = detail
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/([?&]token=)[^&#\s"']*/gi, "$1[redacted]")
    .replace(/<[^>]+>/g, "[redacted-html]")
    .replace(/((?:API[_-]?KEY|TOKEN|SECRET)\s*[=:]\s*)[^\s"']+/gi, "$1[redacted]");
  return detail.slice(0, 1_024);
}
