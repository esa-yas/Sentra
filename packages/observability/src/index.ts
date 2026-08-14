/**
 * @sentra/observability owns correlation, structured logging, and redaction.
 *
 * Redaction lives here rather than in each consumer so that the logger and the error
 * reporter cannot drift apart: whatever is hidden from a log line is hidden from Sentry.
 */
export {
  REDACTED,
  redact,
  redactString,
  maskEmail,
  hashForCorrelation,
  type RedactionOptions,
} from './redaction';
export {
  type CorrelationContext,
  generateCorrelationId,
  generateRequestId,
  getCorrelationContext,
  getCorrelationId,
  runWithCorrelationContext,
  enrichCorrelationContext,
  recordStageTiming,
} from './correlation-context';
export {
  type Logger,
  type LoggerOptions,
  type RecordedLogLine,
  createLogger,
  createNullLogger,
  createRecordingLogger,
} from './logger';
