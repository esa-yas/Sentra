/**
 * The single error vocabulary shared by the core, the adapters, and the HTTP edge.
 *
 * Every error carries a stable machine-readable `code`. The HTTP layer maps codes to
 * status values and never leaks a stack trace, a SQL fragment, or an internal path to a
 * caller — a partner integrating against this API should be able to branch on `code`
 * forever, while we remain free to change the message.
 */

export const ERROR_CODES = {
  VALIDATION_FAILED: 'validation_failed',
  FORBIDDEN_FIELD: 'forbidden_field',
  UNAUTHENTICATED: 'unauthenticated',
  INVALID_TOKEN: 'invalid_token',
  FORBIDDEN: 'forbidden',
  TENANT_MISMATCH: 'tenant_mismatch',
  PURPOSE_NOT_PERMITTED: 'purpose_not_permitted',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  IDEMPOTENCY_KEY_REUSED: 'idempotency_key_reused',
  IDEMPOTENT_REQUEST_IN_PROGRESS: 'idempotent_request_in_progress',
  RATE_LIMITED: 'rate_limited',
  DEADLINE_EXCEEDED: 'deadline_exceeded',
  DEPENDENCY_UNAVAILABLE: 'dependency_unavailable',
  AUDIT_CHAIN_BROKEN: 'audit_chain_broken',
  TRANSACTION_SCOPE_CLOSED: 'transaction_scope_closed',
  NESTED_TRANSACTION_NOT_SUPPORTED: 'nested_transaction_not_supported',
  TRANSACTION_TIMEOUT: 'transaction_timeout',
  INTERNAL_ERROR: 'internal_error',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Structured detail attached to an error. Values must already be safe to return. */
export type ErrorDetails = Record<string, unknown>;

export abstract class AppError extends Error {
  public abstract readonly code: ErrorCode;
  public abstract readonly httpStatus: number;

  /**
   * Whether the message is safe to return verbatim to the caller. Errors that could
   * describe internal state keep `false` and are replaced by a generic message.
   */
  public readonly exposeMessage: boolean = true;
  public readonly details?: ErrorDetails;

  protected constructor(message: string, details?: ErrorDetails) {
    super(message);
    this.name = new.target.name;
    if (details !== undefined) {
      this.details = details;
    }
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  public readonly code = ERROR_CODES.VALIDATION_FAILED;
  public readonly httpStatus = 422;

  public constructor(message = 'The request body or parameters failed validation.', details?: ErrorDetails) {
    super(message, details);
  }
}

/**
 * Raised when a caller sends a field the platform refuses to accept at all, such as a
 * card number or an account credential. This is a product boundary from slide 031, not
 * a schema mismatch, so it is reported separately from ordinary validation.
 */
export class ForbiddenFieldError extends AppError {
  public readonly code = ERROR_CODES.FORBIDDEN_FIELD;
  public readonly httpStatus = 400;

  public constructor(fieldPaths: readonly string[]) {
    super(
      'The request contains fields the platform is not permitted to receive. Remove them and retry.',
      { fieldPaths: [...fieldPaths] },
    );
  }
}

export class UnauthenticatedError extends AppError {
  public readonly code = ERROR_CODES.UNAUTHENTICATED;
  public readonly httpStatus = 401;

  public constructor(message = 'Authentication is required.') {
    super(message);
  }
}

export class InvalidTokenError extends AppError {
  public readonly code = ERROR_CODES.INVALID_TOKEN;
  public readonly httpStatus = 401;
  public override readonly exposeMessage = false;

  public constructor(message = 'The presented token is not valid.') {
    super(message);
  }
}

export class ForbiddenError extends AppError {
  public readonly code = ERROR_CODES.FORBIDDEN;
  public readonly httpStatus = 403;

  public constructor(message = 'The principal is not permitted to perform this action.', details?: ErrorDetails) {
    super(message, details);
  }
}

export class TenantMismatchError extends AppError {
  public readonly code = ERROR_CODES.TENANT_MISMATCH;
  public readonly httpStatus = 403;

  public constructor() {
    super('The principal does not belong to the organization that owns this resource.');
  }
}

export class PurposeNotPermittedError extends AppError {
  public readonly code = ERROR_CODES.PURPOSE_NOT_PERMITTED;
  public readonly httpStatus = 403;

  public constructor(requiredPurpose: string) {
    super('The principal is not authorized for the purpose this action requires.', { requiredPurpose });
  }
}

export class NotFoundError extends AppError {
  public readonly code = ERROR_CODES.NOT_FOUND;
  public readonly httpStatus = 404;

  public constructor(resourceType: string, resourceId?: string) {
    super(`${resourceType} was not found.`, resourceId === undefined ? { resourceType } : { resourceType, resourceId });
  }
}

export class ConflictError extends AppError {
  public readonly code = ERROR_CODES.CONFLICT;
  public readonly httpStatus = 409;

  public constructor(message: string, details?: ErrorDetails) {
    super(message, details);
  }
}

/**
 * The same idempotency key was replayed with a different request body. Returning the
 * stored response would be wrong and processing the new body would break the caller's
 * at-most-once expectation, so the request is refused.
 */
export class IdempotencyKeyReusedError extends AppError {
  public readonly code = ERROR_CODES.IDEMPOTENCY_KEY_REUSED;
  public readonly httpStatus = 409;

  public constructor() {
    super('This idempotency key was already used with a different request payload.');
  }
}

export class IdempotentRequestInProgressError extends AppError {
  public readonly code = ERROR_CODES.IDEMPOTENT_REQUEST_IN_PROGRESS;
  public readonly httpStatus = 409;

  public constructor() {
    super('A request with this idempotency key is still being processed. Retry shortly.');
  }
}

export class RateLimitedError extends AppError {
  public readonly code = ERROR_CODES.RATE_LIMITED;
  public readonly httpStatus = 429;

  public constructor(public readonly retryAfterSeconds: number) {
    super('Too many requests. Slow down and retry after the indicated interval.', { retryAfterSeconds });
  }
}

/**
 * The synchronous decision path ran out of time. Slide 035 requires a fail-neutral
 * answer: the caller learns the assessment did not complete and falls back to its own
 * controls. It must never be read as either an allow or a block.
 */
export class DeadlineExceededError extends AppError {
  public readonly code = ERROR_CODES.DEADLINE_EXCEEDED;
  public readonly httpStatus = 504;

  public constructor(
    public readonly stage: string,
    public readonly elapsedMs: number,
  ) {
    super('The assessment did not complete within the requested deadline.', { stage, elapsedMs });
  }
}

export class DependencyUnavailableError extends AppError {
  public readonly code = ERROR_CODES.DEPENDENCY_UNAVAILABLE;
  public readonly httpStatus = 503;
  public override readonly exposeMessage = false;

  public constructor(dependency: string) {
    super(`The ${dependency} dependency is unavailable.`);
  }
}

export class AuditChainBrokenError extends AppError {
  public readonly code = ERROR_CODES.AUDIT_CHAIN_BROKEN;
  public readonly httpStatus = 500;
  public override readonly exposeMessage = false;

  public constructor(
    public readonly chainKey: string,
    public readonly sequence: string,
  ) {
    super(`The audit chain for ${chainKey} is broken at sequence ${sequence}.`);
  }
}

export class InternalError extends AppError {
  public readonly code = ERROR_CODES.INTERNAL_ERROR;
  public readonly httpStatus = 500;
  public override readonly exposeMessage = false;

  public constructor(message = 'An unexpected error occurred.') {
    super(message);
  }
}

/** Raised when a {@link TransactionScope} is used after its unit of work has finished. */
export class TransactionScopeClosedError extends AppError {
  public readonly code = ERROR_CODES.TRANSACTION_SCOPE_CLOSED;
  public readonly httpStatus = 500;
  public override readonly exposeMessage = false;

  public constructor(scopeId: string) {
    super(`Transaction scope ${scopeId} is no longer active.`);
  }
}

/** Raised when a second {@link UnitOfWork.run} begins before the first completes. */
export class NestedTransactionNotSupportedError extends AppError {
  public readonly code = ERROR_CODES.NESTED_TRANSACTION_NOT_SUPPORTED;
  public readonly httpStatus = 500;
  public override readonly exposeMessage = false;

  public constructor() {
    super('Nested transactions are not supported.');
  }
}

/** Raised when a unit of work exceeds its configured timeout. */
export class TransactionTimeoutError extends AppError {
  public readonly code = ERROR_CODES.TRANSACTION_TIMEOUT;
  public readonly httpStatus = 500;
  public override readonly exposeMessage = false;

  public constructor(timeoutMs: number) {
    super(`The transaction exceeded the ${timeoutMs}ms timeout.`, { timeoutMs });
  }
}

export const isAppError = (error: unknown): error is AppError => error instanceof AppError;

/** The wire shape returned for every failed request. */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode;
    message: string;
    correlationId: string;
    details?: ErrorDetails;
  };
}

const GENERIC_MESSAGE = 'The request could not be completed.';

/** Converts an error into the wire envelope, withholding anything unsafe to expose. */
export const toErrorEnvelope = (error: AppError, correlationId: string): ErrorEnvelope => ({
  error: {
    code: error.code,
    message: error.exposeMessage ? error.message : GENERIC_MESSAGE,
    correlationId,
    ...(error.details === undefined ? {} : { details: error.details }),
  },
});
