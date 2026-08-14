import pino, { type Logger as PinoLogger } from 'pino';
import { getCorrelationContext } from './correlation-context';
import { redact } from './redaction';

/**
 * The logging port the application depends on.
 *
 * Declared as an interface so the core can accept a logger without importing pino, and so
 * a later move to Cloud Logging replaces the adapter rather than every call site.
 */
export interface Logger {
  trace(message: string, fields?: Record<string, unknown>): void;
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
  fatal(message: string, fields?: Record<string, unknown>): void;
  /** Returns a logger that adds the given fields to every line. */
  child(fields: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  readonly level: string;
  readonly serviceName: string;
  readonly serviceVersion: string;
  /** Human-readable output locally; newline-delimited JSON everywhere else. */
  readonly pretty?: boolean;
}

class PinoLoggerAdapter implements Logger {
  public constructor(private readonly delegate: PinoLogger) {}

  private emit(
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
    message: string,
    fields?: Record<string, unknown>,
  ): void {
    const context = getCorrelationContext();
    const payload: Record<string, unknown> = {
      ...(context === undefined
        ? {}
        : {
            correlationId: context.correlationId,
            requestId: context.requestId,
            ...(context.organizationId === undefined ? {} : { organizationId: context.organizationId }),
            ...(context.principalId === undefined ? {} : { principalId: context.principalId }),
            ...(context.principalKind === undefined ? {} : { principalKind: context.principalKind }),
            ...(context.purpose === undefined ? {} : { purpose: context.purpose }),
          }),
      ...(fields === undefined ? {} : (redact(fields) as Record<string, unknown>)),
    };

    this.delegate[level](payload, message);
  }

  public trace(message: string, fields?: Record<string, unknown>): void {
    this.emit('trace', message, fields);
  }

  public debug(message: string, fields?: Record<string, unknown>): void {
    this.emit('debug', message, fields);
  }

  public info(message: string, fields?: Record<string, unknown>): void {
    this.emit('info', message, fields);
  }

  public warn(message: string, fields?: Record<string, unknown>): void {
    this.emit('warn', message, fields);
  }

  public error(message: string, fields?: Record<string, unknown>): void {
    this.emit('error', message, fields);
  }

  public fatal(message: string, fields?: Record<string, unknown>): void {
    this.emit('fatal', message, fields);
  }

  public child(fields: Record<string, unknown>): Logger {
    return new PinoLoggerAdapter(this.delegate.child(redact(fields) as Record<string, unknown>));
  }
}

export const createLogger = (options: LoggerOptions): Logger => {
  const delegate = pino({
    level: options.level,
    base: { service: options.serviceName, version: options.serviceVersion },
    // Redaction happens in the adapter so it applies identically to Sentry, but pino's
    // own paths are configured as a second line of defence for anything logged directly.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["proxy-authorization"]',
        'res.headers["set-cookie"]',
        'password',
        'clientSecret',
        'accessToken',
      ],
      censor: '[redacted]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    ...(options.pretty === true
      ? {
          transport: {
            target: 'pino/file',
            options: { destination: 1 },
          },
        }
      : {}),
  });

  return new PinoLoggerAdapter(delegate);
};

/**
 * A logger that discards everything, for unit tests and for code paths that must never
 * fail because logging is unavailable.
 */
export const createNullLogger = (): Logger => {
  const noop = (): void => undefined;
  const logger: Logger = {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => logger,
  };
  return logger;
};

/** Captures emitted lines so a test can assert on what was logged, and what was not. */
export interface RecordedLogLine {
  level: string;
  message: string;
  fields: Record<string, unknown>;
}

export const createRecordingLogger = (): { logger: Logger; lines: RecordedLogLine[] } => {
  const lines: RecordedLogLine[] = [];

  const build = (bound: Record<string, unknown>): Logger => {
    const write =
      (level: string) =>
      (message: string, fields?: Record<string, unknown>): void => {
        lines.push({
          level,
          message,
          fields: { ...bound, ...((redact(fields ?? {}) as Record<string, unknown>) ?? {}) },
        });
      };

    return {
      trace: write('trace'),
      debug: write('debug'),
      info: write('info'),
      warn: write('warn'),
      error: write('error'),
      fatal: write('fatal'),
      child: (fields) => build({ ...bound, ...(redact(fields) as Record<string, unknown>) }),
    };
  };

  return { logger: build({}), lines };
};
