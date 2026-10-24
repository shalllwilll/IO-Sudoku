// Typed errors. The UI decides what to show from the type, never from raw server text.

export class ApiError extends Error {
  constructor(message, { status = null, code = null, details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** The browser could not reach the API (offline, DNS, CORS, backend down). */
export class NetworkError extends ApiError {
  constructor(message = "Cannot reach the server. Check your connection and try again.") {
    super(message);
    this.name = "NetworkError";
  }
}

/** Not signed in, or the session expired. */
export class AuthError extends ApiError {
  constructor(message = "Your session has expired. Sign in again.") {
    super(message, { status: 401 });
    this.name = "AuthError";
  }
}

/** The request or the response does not match the contract. */
export class ValidationError extends ApiError {
  constructor(message, { field = null, status = null } = {}) {
    super(message, { status });
    this.name = "ValidationError";
    this.field = field;
  }
}

/** The server failed, or the adapter has not implemented the call. */
export class ServerError extends ApiError {
  constructor(message = "The server could not complete the request.", options = {}) {
    super(message, options);
    this.name = "ServerError";
  }
}
