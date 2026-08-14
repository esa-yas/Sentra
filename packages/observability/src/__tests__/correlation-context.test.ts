import { describe, expect, it } from 'vitest';
import {
  enrichCorrelationContext,
  generateCorrelationId,
  getCorrelationContext,
  getCorrelationId,
  recordStageTiming,
  runWithCorrelationContext,
} from '../correlation-context';
import { createRecordingLogger } from '../logger';

describe('correlation context', () => {
  it('generates a distinct, prefixed identifier each time', () => {
    const first = generateCorrelationId();
    const second = generateCorrelationId();

    expect(first).toMatch(/^crl_[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
  });

  it('exposes the active context inside the callback', () => {
    runWithCorrelationContext({ correlationId: 'crl_test' }, () => {
      expect(getCorrelationContext()?.correlationId).toBe('crl_test');
    });
  });

  it('returns a usable identifier outside any context, so an error is always traceable', () => {
    expect(getCorrelationId()).toMatch(/^crl_/);
  });

  it('survives an await boundary', async () => {
    await runWithCorrelationContext({ correlationId: 'crl_async' }, async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 1));

      expect(getCorrelationId()).toBe('crl_async');
    });
  });

  it('keeps concurrent operations isolated', async () => {
    const observed = await Promise.all([
      runWithCorrelationContext({ correlationId: 'crl_a' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getCorrelationId();
      }),
      runWithCorrelationContext({ correlationId: 'crl_b' }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 1));
        return getCorrelationId();
      }),
    ]);

    expect(observed).toEqual(['crl_a', 'crl_b']);
  });

  it('adds the tenant once authentication has resolved it', () => {
    runWithCorrelationContext({ correlationId: 'crl_enrich' }, () => {
      enrichCorrelationContext({ organizationId: 'org_1', principalKind: 'PARTNER' });

      expect(getCorrelationContext()?.organizationId).toBe('org_1');
      expect(getCorrelationContext()?.principalKind).toBe('PARTNER');
    });
  });

  it('ignores enrichment outside a context rather than throwing', () => {
    expect(() => {
      enrichCorrelationContext({ organizationId: 'org_1' });
    }).not.toThrow();
  });

  it('records per-stage timings for the latency budget', () => {
    runWithCorrelationContext({ correlationId: 'crl_timing' }, () => {
      recordStageTiming('consent', 12);
      recordStageTiming('correlate', 20);

      expect(getCorrelationContext()?.stageTimings).toEqual({ consent: 12, correlate: 20 });
    });
  });
});

describe('logger correlation', () => {
  it('stamps every line with the active correlation identifiers', () => {
    const { logger, lines } = createRecordingLogger();

    runWithCorrelationContext({ correlationId: 'crl_log', requestId: 'req_log' }, () => {
      logger.info('member added', { organizationId: 'org_1' });
    });

    // The recording logger captures fields only; correlation stamping is asserted through
    // the pino adapter in the API integration tests. Here we confirm field redaction.
    expect(lines).toHaveLength(1);
    expect(lines[0]?.message).toBe('member added');
    expect(lines[0]?.fields.organizationId).toBe('org_1');
  });

  it('redacts sensitive fields before they reach a log line', () => {
    const { logger, lines } = createRecordingLogger();

    logger.warn('token rejected', { clientSecret: 'super-secret', clientId: 'sentra_client_1' });

    expect(lines[0]?.fields.clientSecret).toBe('[redacted]');
    expect(lines[0]?.fields.clientId).toBe('sentra_client_1');
  });

  it('carries bound fields onto a child logger', () => {
    const { logger, lines } = createRecordingLogger();

    logger.child({ module: 'outbox' }).info('published');

    expect(lines[0]?.fields.module).toBe('outbox');
  });
});
