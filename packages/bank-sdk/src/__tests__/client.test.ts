import { describe, expect, it, vi } from 'vitest';
import {
  SentraApiError,
  SentraUnavailableError,
  createSentraClient,
  openSessionOrProceed,
  shouldHold,
  shouldInterrupt,
} from '../index';

const ok = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json', 'x-correlation-id': 'crl_1' },
  });

const request = { subjectRef: 'sbj_1', amount: 8400, currency: 'GBP' } as never;

describe('Sentra bank SDK', () => {
  it('posts to the session endpoint with the key as a bearer token', async () => {
    const fetchMock = vi.fn(async () => ok({ sessionId: 's1', verdict: 'WARN' }));
    const client = createSentraClient({ apiKey: 'sk_test_x', baseUrl: 'https://api.test/', fetch: fetchMock as never });
    await client.openSession(request);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // The trailing slash on baseUrl must not produce a double slash.
    expect(url).toBe('https://api.test/v1/protection-sessions');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk_test_x');
  });

  it('encodes the session id into the answer and resolve paths', async () => {
    const fetchMock = vi.fn(async () => ok({}));
    const client = createSentraClient({ apiKey: 'k', baseUrl: 'https://api.test', fetch: fetchMock as never });
    await client.submitAnswers('a/b', { answers: [{ questionId: 'q', optionId: 'yes' }] });
    await client.resolveSession('a/b', { outcome: 'SENT' });
    expect(fetchMock.mock.calls[0]![0]).toContain('/v1/protection-sessions/a%2Fb/answers');
    expect(fetchMock.mock.calls[1]![0]).toContain('/v1/protection-sessions/a%2Fb/resolve');
  });

  it('surfaces an API error with its code and correlation id', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'validation_error', message: 'amount must be positive.' } }), {
          status: 400,
          headers: { 'content-type': 'application/json', 'x-correlation-id': 'crl_9' },
        }),
    );
    const client = createSentraClient({ apiKey: 'k', baseUrl: 'https://api.test', fetch: fetchMock as never });
    await expect(client.openSession(request)).rejects.toBeInstanceOf(SentraApiError);
    await expect(client.openSession(request)).rejects.toMatchObject({
      status: 400,
      code: 'validation_error',
      correlationId: 'crl_9',
    });
  });

  it('reports an unreachable API distinctly from a rejected request', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    const client = createSentraClient({ apiKey: 'k', baseUrl: 'https://api.test', fetch: fetchMock as never });
    await expect(client.openSession(request)).rejects.toBeInstanceOf(SentraUnavailableError);
  });

  // A scam check must never stop a legitimate payment from being made.
  it('fails open when Sentra is unreachable', async () => {
    const client = createSentraClient({
      apiKey: 'k',
      baseUrl: 'https://api.test',
      fetch: (async () => {
        throw new Error('down');
      }) as never,
    });
    await expect(openSessionOrProceed(client, request)).resolves.toBeNull();
  });

  // But a real rejection (a bad key, a bad request) must not be silently swallowed.
  it('does not swallow a genuine API error when failing open', async () => {
    const client = createSentraClient({
      apiKey: 'k',
      baseUrl: 'https://api.test',
      fetch: (async () =>
        new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'bad key' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })) as never,
    });
    await expect(openSessionOrProceed(client, request)).rejects.toBeInstanceOf(SentraApiError);
  });

  it('gives the app verdict helpers so it never hard-codes strings', () => {
    expect(shouldInterrupt('PROCEED')).toBe(false);
    expect(shouldInterrupt('WARN')).toBe(true);
    expect(shouldInterrupt('HOLD')).toBe(true);
    expect(shouldHold('WARN')).toBe(false);
    expect(shouldHold('HOLD')).toBe(true);
  });
});
