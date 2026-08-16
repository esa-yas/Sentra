import { createHash } from 'node:crypto';
import {
  IdempotencyKeyReusedError,
  IdempotentRequestInProgressError,
  ValidationError,
  HTTP_HEADERS,
  PARTNER_CHECK_RESULTS,
  idempotencyKeySchema,
} from '@sentra/contracts';
import { requestCanonicalPath } from './path';
import type { AppConfig } from '@sentra/config';
import type { Clock, IdGenerator, IdempotencyRepository } from '@sentra/ports';
import type { Request, Response } from 'express';
import type { PartnerRequestContext, PartnerSecurityOutcome } from './authenticator';

export interface IdempotencyDeps {
  readonly config: AppConfig;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly keys: IdempotencyRepository;
}

export type IdempotencyClaimHandle =
  | { readonly kind: 'fresh'; readonly id: string }
  | { readonly kind: 'replay'; readonly status: number; readonly body: Record<string, unknown> };

export class PartnerIdempotency {
  public constructor(private readonly deps: IdempotencyDeps) {}

  public async claim(
    req: Request,
    context: PartnerRequestContext,
    outcome: PartnerSecurityOutcome,
  ): Promise<IdempotencyClaimHandle> {
    const raw = req.header(HTTP_HEADERS.IDEMPOTENCY_KEY);
    const parsed = idempotencyKeySchema.safeParse(raw);
    if (!parsed.success) {
      outcome.idempotency = PARTNER_CHECK_RESULTS.FAILED;
      outcome.errorCode = 'validation_failed';
      throw new ValidationError('Idempotency-Key is required on partner write endpoints.');
    }

    const requestHash = createHash('sha256').update(context.rawBody).digest('hex');
    const scopeName = `${req.method} ${requestCanonicalPath(req)} ${context.connection.id}`;
    const expiresAt = new Date(
      this.deps.clock.now().getTime() + this.deps.config.limits.idempotencyTtlSeconds * 1_000,
    );

    const claim = await this.deps.keys.claim({
      id: this.deps.ids.generate(),
      organizationId: context.connection.organizationId,
      scopeName,
      key: parsed.data,
      requestHash,
      correlationId: String(req.header(HTTP_HEADERS.CORRELATION_ID) ?? context.nonce),
      expiresAt,
    });

    if (claim.outcome === 'MISMATCH') {
      outcome.idempotency = PARTNER_CHECK_RESULTS.FAILED;
      outcome.errorCode = 'idempotency_key_reused';
      throw new IdempotencyKeyReusedError();
    }
    if (claim.outcome === 'IN_PROGRESS') {
      outcome.idempotency = PARTNER_CHECK_RESULTS.FAILED;
      outcome.errorCode = 'idempotent_request_in_progress';
      throw new IdempotentRequestInProgressError();
    }
    if (claim.outcome === 'REPLAY') {
      outcome.idempotency = PARTNER_CHECK_RESULTS.PASSED;
      return {
        kind: 'replay',
        status: claim.record.responseStatus ?? 200,
        body: claim.record.responseBody ?? {},
      };
    }
    outcome.idempotency = PARTNER_CHECK_RESULTS.PASSED;
    return { kind: 'fresh', id: claim.record.id };
  }

  public async complete(
    handle: IdempotencyClaimHandle,
    res: Response,
    body: Record<string, unknown>,
  ): Promise<void> {
    if (handle.kind !== 'fresh') {
      return;
    }
    await this.deps.keys.complete({
      id: handle.id,
      responseStatus: res.statusCode,
      responseBody: body,
      completedAt: this.deps.clock.now(),
    });
  }

  public async release(handle: IdempotencyClaimHandle): Promise<void> {
    if (handle.kind === 'fresh') {
      await this.deps.keys.release(handle.id);
    }
  }
}

export const createPartnerIdempotency = (deps: IdempotencyDeps): PartnerIdempotency =>
  new PartnerIdempotency(deps);
